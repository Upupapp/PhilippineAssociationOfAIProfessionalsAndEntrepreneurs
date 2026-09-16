#!/usr/bin/env node
/* Send the confirmation email to anyone who registered and has not had one.
 *
 *   node scripts/send-registration-emails.mjs [--dry-run]
 *
 * NOT YET RUNNABLE. It needs two things that do not exist yet:
 *   1. Service-account credentials (GOOGLE_APPLICATION_CREDENTIALS) for
 *      postflowit-autos - the same blocker as scripts/confirm-user.mjs.
 *   2. Something that actually sends mail. This writes a document to the `mail`
 *      collection in the shape Firebase's "Trigger Email from Firestore"
 *      extension expects; install that extension with an SMTP provider and it
 *      delivers. Until then the rows queue up VISIBLY rather than an email
 *      silently never being sent.
 *
 * WHY NOT FROM THE BROWSER: a mail collection a client can write to is an open
 * relay - anyone could send mail from paaipe.org to anyone. firestore.rules deny
 * every client write to it; only the Admin SDK, which bypasses rules, may write.
 *
 * IDEMPOTENT: each registration is marked when queued, and the mark is written
 * in the SAME transaction as the mail row, so a re-run cannot send twice.
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { renderRegistrationEmail, OCTOBER_2026 } from "./email/event-registration.mjs";

const PROJECT = "postflowit-autos";
const DATABASE = "paaipe";
const REGISTRATIONS = "paaipe_event_registrations";
const MAIL = "mail";                       // the Trigger Email extension's default

export async function sendPending({ dryRun = false } = {}) {
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT });
  const db = getFirestore(DATABASE);

  const snap = await db.collection(REGISTRATIONS)
    .where("confirmationEmailQueuedAt", "==", null)
    .get()
    .catch(async () => db.collection(REGISTRATIONS).get());   // field may not exist yet

  const pending = snap.docs.filter(d => !d.data().confirmationEmailQueuedAt);
  const results = [];

  for (const doc of pending) {
    const d = doc.data();
    if (!d.email) { results.push({ id: doc.id, skipped: "no email" }); continue; }
    const { subject, html, text } = renderRegistrationEmail({
      fullName: d.full_name, event: OCTOBER_2026,
    });
    if (dryRun) { results.push({ id: doc.id, to: d.email, subject, dryRun: true }); continue; }

    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      // re-check inside the transaction: another run may have queued it
      if (fresh.data().confirmationEmailQueuedAt) throw new Error("already-queued");
      tx.set(db.collection(MAIL).doc(), {
        to: [d.email],
        message: { subject, html, text },
        // so a bounce can be traced back to the registration that caused it
        metadata: { registrationId: doc.id, event: OCTOBER_2026.name, kind: "event-registration" },
      });
      tx.update(doc.ref, { confirmationEmailQueuedAt: FieldValue.serverTimestamp() });
    }).then(
      () => results.push({ id: doc.id, to: d.email, queued: true }),
      (e) => results.push({ id: doc.id, to: d.email, error: e.message })
    );
  }
  return { considered: snap.size, pending: pending.length, results };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  sendPending({ dryRun: process.argv.includes("--dry-run") })
    .then(r => {
      console.log(`${r.pending} of ${r.considered} registration(s) needed an email`);
      for (const x of r.results) console.log("  ", JSON.stringify(x));
    })
    .catch(e => { console.error("FAILED:", e.message); process.exit(1); });
}
