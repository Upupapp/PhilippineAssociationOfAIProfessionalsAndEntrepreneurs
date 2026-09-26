/**
 * PAAIPE Cloud Functions — database `paaipe` (asia-southeast1), project
 * postflowit-autos.
 *
 * Three server-side pieces the static site and mobile app cannot do themselves,
 * because each needs to bypass Firestore rules or hold a secret:
 *
 *   1. onRegistrationCreated — when a member registers for an event, enqueue a
 *      confirmation email. The rules note "mail is not wired yet"; this wires it.
 *      It writes a row to paaipe_mail_queue (the exact pattern confirm-user.mjs
 *      already uses for the agent-confirmed email) rather than sending inline, so
 *      an unsent email is a visible pending row, and (2) does the actual sending.
 *
 *   2. onMailQueued — send any paaipe_mail_queue row via Brevo's transactional
 *      API and stamp it sent, so mail leaves the server exactly once. The
 *      Brevo key is a secret (BREVO_API_KEY); with no key set, the row is left
 *      pending and logged rather than dropped.
 *
 *   3. eventRegistrationCounts — return per-event registered COUNTS only. The
 *      rules (correctly) forbid a member from reading other people's
 *      registrations, so a client can never total them. This runs with the Admin
 *      SDK, reads only eventId + status, and returns aggregate numbers — never a
 *      single registrant's row — so the app can show real "N registered" figures
 *      without leaking anyone's personal data (RA 10173).
 *
 * Deploy:  firebase deploy --only functions --project postflowit-autos
 * Secret:  firebase functions:secrets:set BREVO_API_KEY --project postflowit-autos
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";

const DATABASE = "paaipe";
const REGION = "asia-southeast1";
const REGISTRATIONS = "paaipe_event_registrations";
const MAIL_QUEUE = "paaipe_mail_queue";

const BREVO_API_KEY = defineSecret("BREVO_API_KEY");
const MAIL_SENDER_EMAIL = defineString("MAIL_SENDER_EMAIL", { default: "noreply@paaipe.org" });
const MAIL_SENDER_NAME = defineString("MAIL_SENDER_NAME", { default: "PAAIPE" });

initializeApp();
const db = () => getFirestore(DATABASE);

// --- 1. Enqueue a confirmation email when a registration is created ---------
export const onRegistrationCreated = onDocumentCreated(
  { document: `${REGISTRATIONS}/{id}`, database: DATABASE, region: REGION },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const reg = snap.data() || {};
    // A cancelled row should never trigger a "you're registered" mail. New
    // registrations have no status yet (or status:'registered').
    if (reg.status && reg.status !== "registered") return;
    if (!reg.email) {
      logger.warn("registration without email; no confirmation queued", { id: event.params.id });
      return;
    }
    await db()
      .collection(MAIL_QUEUE)
      .add({
        to: reg.email,
        template: "event-registered",
        data: {
          name: reg.full_name || "there",
          event: reg.event || "the event",
          eventId: reg.eventId || "",
          registrationId: event.params.id,
        },
        createdAt: FieldValue.serverTimestamp(),
        sent: false,
      });
    logger.info("queued event-registered email", { id: event.params.id });
  },
);

// --- 2. Send a queued mail row via Brevo and mark it sent -------------------
export const onMailQueued = onDocumentCreated(
  { document: `${MAIL_QUEUE}/{id}`, database: DATABASE, region: REGION, secrets: [BREVO_API_KEY] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const row = snap.data() || {};
    if (row.sent === true) return; // idempotent: never send twice

    const apiKey = BREVO_API_KEY.value();
    if (!apiKey) {
      logger.warn("BREVO_API_KEY not set; leaving mail row pending", { id: event.params.id });
      return; // stays visible as an unsent row rather than being dropped
    }

    const message = renderMail(row);
    if (!message) {
      logger.warn("no renderer for mail template; leaving pending", {
        id: event.params.id,
        template: row.template,
      });
      return;
    }

    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { email: MAIL_SENDER_EMAIL.value(), name: MAIL_SENDER_NAME.value() },
          to: [{ email: row.to }],
          subject: message.subject,
          htmlContent: message.html,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Brevo ${res.status}: ${body.slice(0, 300)}`);
      }
      const json = await res.json().catch(() => ({}));
      await snap.ref.update({
        sent: true,
        sentAt: FieldValue.serverTimestamp(),
        providerMessageId: json.messageId || null,
      });
      logger.info("sent queued mail", { id: event.params.id, template: row.template });
    } catch (err) {
      // Leave the row pending (sent:false) with an error breadcrumb so it is
      // visible and can be retried, rather than silently lost.
      await snap.ref.update({
        lastError: String(err).slice(0, 500),
        lastAttemptAt: FieldValue.serverTimestamp(),
      });
      logger.error("failed to send queued mail", { id: event.params.id, error: String(err) });
      throw err; // let Cloud Functions retry policy handle transient failures
    }
  },
);

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/** Render a queued row into { subject, html }, or null if unknown template. */
function renderMail(row) {
  const data = row.data || {};
  if (row.template === "event-registered") {
    const name = escapeHtml(data.name || "there");
    const eventName = escapeHtml(data.event || "the event");
    return {
      subject: `You're registered for ${data.event || "a PAAIPE event"}`,
      html: `<p>Hi ${name},</p>
<p>You're registered for <strong>${eventName}</strong>. Your ticket and QR code are in the PAAIPE app under Events.</p>
<p>We'll email you again with joining details closer to the date.</p>
<p>— PAAIPE</p>`,
    };
  }
  if (row.template === "agent-confirmed") {
    const name = escapeHtml(data.name || "there");
    const agentNumber = escapeHtml(data.agentNumber || "");
    return {
      subject: "Welcome — you're a confirmed PAAIPE Agent",
      html: `<p>Hi ${name},</p>
<p>Your PAAIPE membership is confirmed. Your Agent number is <strong>${agentNumber}</strong>.</p>
<p>— PAAIPE</p>`,
    };
  }
  // A row that carries its own subject/html can still be sent generically.
  if (typeof row.subject === "string" && typeof row.html === "string") {
    return { subject: row.subject, html: row.html };
  }
  return null;
}

// --- 3. Per-event registered counts (aggregate only, never a row) -----------
export const eventRegistrationCounts = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    try {
      // Read only what we need to tally; never return a registrant's details.
      const snap = await db().collection(REGISTRATIONS).select("eventId", "status").get();
      const counts = {};
      let total = 0;
      snap.forEach((doc) => {
        const d = doc.data();
        if (d.status === "cancelled") return; // cancelled rows don't count
        const eventId = typeof d.eventId === "string" ? d.eventId : "";
        if (!eventId) return;
        counts[eventId] = (counts[eventId] || 0) + 1;
        total += 1;
      });
      res.set("Cache-Control", "public, max-age=60");
      res.json({ counts, total, generatedAt: Date.now() });
    } catch (err) {
      logger.error("eventRegistrationCounts failed", { error: String(err) });
      res.status(500).json({ error: "counts_unavailable" });
    }
  },
);
