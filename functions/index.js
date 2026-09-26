/**
 * PAAIPE Cloud Functions — database `paaipe` (asia-southeast1), project
 * postflowit-autos.
 *
 * Server-side pieces the static site and mobile app cannot do themselves,
 * because each needs to bypass Firestore rules or hold a secret:
 *
 *   1. onRegistrationCreated — when a member registers for an event, enqueue a
 *      confirmation email. The rules note "mail is not wired yet"; this wires it.
 *      It writes a row to paaipe_mail_queue (the exact pattern confirm-user.mjs
 *      already uses for the agent-confirmed email) rather than sending inline, so
 *      an unsent email is a visible pending row, and (2) does the actual sending.
 *
 *   2. onMailQueued — send any paaipe_mail_queue row via SendGrid's mail-send
 *      API and stamp it sent, so mail leaves the server exactly once. The
 *      SendGrid key is a secret (SENDGRID_API_KEY); with no key set, the row is
 *      left pending and logged rather than dropped.
 *
 *   3. eventRegistrationCounts — return per-event registered COUNTS only. The
 *      rules (correctly) forbid a member from reading other people's
 *      registrations, so a client can never total them. This runs with the Admin
 *      SDK, reads only eventId + status, and returns aggregate numbers — never a
 *      single registrant's row — so the app can show real "N registered" figures
 *      without leaking anyone's personal data (RA 10173).
 *
 *   4. telemetryIngest — accept anonymous, aggregate offline-write counters from
 *      the app and fold them into a per-day rollup (paaipe_telemetry_daily), so
 *      the fleet-wide offline rate is visible without storing anything that
 *      identifies a member.
 *
 *   5. telemetryReport — read that rollup back (Admin SDK, aggregate only) so a
 *      dashboard can chart the fleet-wide offline rate. Returns summed counters
 *      and derived rates per day and overall — never a device id.
 *
 * Deploy:  firebase deploy --only functions --project postflowit-autos
 * Secret:  firebase functions:secrets:set SENDGRID_API_KEY --project postflowit-autos
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { logger } from "firebase-functions";
import {
  shouldQueueRegistrationEmail,
  buildRegistrationMail,
  shouldSendMailRow,
  renderMail,
  tallyRegistrationCounts,
  buildTelemetryReport,
} from "./lib/logic.js";

const DATABASE = "paaipe";
const REGION = "asia-southeast1";
const REGISTRATIONS = "paaipe_event_registrations";
const MAIL_QUEUE = "paaipe_mail_queue";
const TELEMETRY_DAILY = "paaipe_telemetry_daily";

const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");
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
    if (!shouldQueueRegistrationEmail(reg)) {
      if (reg.status && reg.status !== "registered") return;
      logger.warn("registration without email; no confirmation queued", { id: event.params.id });
      return;
    }
    await db()
      .collection(MAIL_QUEUE)
      .add({
        ...buildRegistrationMail(reg, event.params.id),
        createdAt: FieldValue.serverTimestamp(),
      });
    logger.info("queued event-registered email", { id: event.params.id });
  },
);

// --- 2. Send a queued mail row via SendGrid and mark it sent ----------------
export const onMailQueued = onDocumentCreated(
  { document: `${MAIL_QUEUE}/{id}`, database: DATABASE, region: REGION, secrets: [SENDGRID_API_KEY] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const row = snap.data() || {};
    if (!shouldSendMailRow(row)) return; // idempotent: never send twice

    const apiKey = SENDGRID_API_KEY.value();
    if (!apiKey) {
      logger.warn("SENDGRID_API_KEY not set; leaving mail row pending", { id: event.params.id });
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
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: row.to }] }],
          from: { email: MAIL_SENDER_EMAIL.value(), name: MAIL_SENDER_NAME.value() },
          subject: message.subject,
          content: [{ type: "text/html", value: message.html }],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`SendGrid ${res.status}: ${body.slice(0, 300)}`);
      }
      await snap.ref.update({
        sent: true,
        sentAt: FieldValue.serverTimestamp(),
        providerMessageId: res.headers.get("x-message-id") || null,
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

// --- 3. Per-event registered counts (aggregate only, never a row) -----------
export const eventRegistrationCounts = onRequest(
  { region: REGION, cors: true },
  async (req, res) => {
    try {
      // Read only what we need to tally; never return a registrant's details.
      const snap = await db().collection(REGISTRATIONS).select("eventId", "status").get();
      const { counts, total } = tallyRegistrationCounts(snap.docs.map((doc) => doc.data()));
      res.set("Cache-Control", "public, max-age=60");
      res.json({ counts, total, generatedAt: Date.now() });
    } catch (err) {
      logger.error("eventRegistrationCounts failed", { error: String(err) });
      res.status(500).json({ error: "counts_unavailable" });
    }
  },
);

// --- 4. Ingest anonymous offline-write telemetry (aggregate only) -----------
// The mobile app posts privacy-safe counters (no personal data, only an
// anonymous install id and offline-write counts). We fold each post into a
// per-day rollup so the fleet-wide offline rate is visible server-side without
// storing anything that identifies a member. Writes go through the Admin SDK;
// the collection is server-only (denied to all clients by the rules catch-all).
export const telemetryIngest = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  try {
    const body = req.body || {};
    const counts = body.counts && typeof body.counts === "object" ? body.counts : {};
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    const ref = db().collection(TELEMETRY_DAILY).doc(day);
    const increments = { devices: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() };
    for (const key of [
      "write_success",
      "write_failure",
      "write_queued",
      "queue_flush_settled",
      "cancel_success",
      "cancel_failure",
    ]) {
      const value = Number(counts[key]);
      if (Number.isFinite(value) && value >= 0) increments[key] = FieldValue.increment(value);
    }
    await ref.set(increments, { merge: true });
    res.json({ ok: true });
  } catch (err) {
    logger.error("telemetryIngest failed", { error: String(err) });
    res.status(500).json({ error: "ingest_failed" });
  }
});

// --- 5. Read back the fleet-wide telemetry rollup (aggregate only) ----------
// A read companion to telemetryIngest: the daily rollup collection is server-
// only, so this Admin-SDK endpoint is the one place a dashboard can total it.
// It returns summed counters and the derived offline rate per day and overall —
// never a device id or any per-member data (RA 10173). GET, cached briefly.
export const telemetryReport = onRequest({ region: REGION, cors: true }, async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  try {
    const limit = Math.min(Math.max(Number(req.query.days) || 30, 1), 180);
    // The daily rollup holds one small doc per day, so we read the collection and
    // sort/slice in memory. This avoids requiring a Firestore index for an
    // ordered query on the named `paaipe` database (which would otherwise fail
    // with FAILED_PRECONDITION until the index is built).
    const snap = await db().collection(TELEMETRY_DAILY).get();
    const rows = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
      .slice(0, limit);
    const report = buildTelemetryReport(rows);
    res.set("Cache-Control", "public, max-age=300");
    res.json({ ...report, generatedAt: Date.now() });
  } catch (err) {
    logger.error("telemetryReport failed", { error: String(err) });
    res.status(500).json({ error: "report_unavailable" });
  }
});
