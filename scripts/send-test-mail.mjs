#!/usr/bin/env node
/* send-test-mail.mjs — enqueue ONE generic mail row to prove the mail pipe works
 * end to end (paaipe_mail_queue -> onMailQueued -> SendGrid).
 *
 *   node scripts/send-test-mail.mjs --to you@example.com
 *
 * It writes a row that carries its own subject/html, so renderMail sends it via
 * the generic branch — no fabricated registration or agent is created. The
 * deployed onMailQueued function stamps the row sent:true (with the SendGrid
 * message id) on success, or leaves it pending with a lastError breadcrumb if
 * SendGrid rejects it (e.g. the sender is not yet verified).
 *
 * Credentials: needs Application Default Credentials for postflowit-autos. Run
 *   gcloud auth application-default login
 * once, or set GOOGLE_APPLICATION_CREDENTIALS to a service-account key.
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const PROJECT = "postflowit-autos";
const DATABASE = "paaipe";

export async function sendTestMail(to) {
  if (!to) throw new Error("send-test-mail: --to <email> is required");
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT });
  const db = getFirestore(DATABASE);
  const stamp = new Date().toISOString();
  const ref = await db.collection("paaipe_mail_queue").add({
    to,
    subject: "PAAIPE mail test",
    html: `<p>This is a test email from the PAAIPE mail pipeline.</p>
<p>If you received it, paaipe_mail_queue → onMailQueued → SendGrid is working.</p>
<p>Sent at ${stamp}.</p>
<p>— PAAIPE</p>`,
    createdAt: FieldValue.serverTimestamp(),
    sent: false,
  });
  return ref.id;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const toIdx = process.argv.indexOf("--to");
  const to = toIdx > -1 ? process.argv[toIdx + 1] : "";
  sendTestMail(to)
    .then((id) => {
      console.log(`queued test mail row ${id} to ${to}`);
      console.log("onMailQueued will send it via SendGrid; check the doc for sent:true.");
      process.exit(0);
    })
    .catch((e) => {
      console.error("FAILED:", e.message);
      process.exit(1);
    });
}
