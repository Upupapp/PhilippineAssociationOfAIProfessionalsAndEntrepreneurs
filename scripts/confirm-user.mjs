#!/usr/bin/env node
/* confirmUser(userId) — promote a PAAIPE Guest to a confirmed Agent.
 *
 * THIS CANNOT RUN IN A BROWSER, BY DESIGN. firestore.rules forbid any client
 * from writing `status`, `agentNumber`, `confirmed_at` or `confirmed_by` — if a
 * client could, anyone could promote themselves. Confirmation therefore runs
 * with the Admin SDK, which bypasses rules.
 *
 *   node scripts/confirm-user.mjs <uid> [--by you@paaipe.org]
 *
 * NOT YET RUNNABLE: it needs service-account credentials that do not exist on
 * this machine. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key for
 * postflowit-autos, or run it somewhere with Application Default Credentials.
 * The admin UI that will call this is a later piece of work.
 *
 * Agent numbers: founding Agents are 001–005 and were assigned by hand. New
 * numbers continue after them, zero-padded to 4 digits (0006, 0007, …). The next
 * number is taken inside a TRANSACTION against paaipe_counters/agents so two
 * confirmations happening at once cannot be given the same number.
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const PROJECT = "postflowit-autos";
const DATABASE = "paaipe";                 // PAAIPE's own database, asia-southeast1
const AGENTS = "paaipe_agents";
const COUNTERS = "paaipe_counters";
const FIRST_NEW_NUMBER = 6;                // 001–005 are the founding Agents

export async function confirmUser(uid, confirmedBy = "admin") {
  if (!uid) throw new Error("confirmUser: uid is required");
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT });
  const db = getFirestore(DATABASE);

  const userRef = db.collection(AGENTS).doc(uid);
  const counterRef = db.collection(COUNTERS).doc("agents");

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new Error(`confirmUser: no profile for ${uid}`);
    const data = snap.data();
    if (data.status === "agent") {
      return { alreadyAgent: true, agentNumber: data.agentNumber };   // idempotent
    }
    const cSnap = await tx.get(counterRef);
    const next = cSnap.exists ? (cSnap.data().next || FIRST_NEW_NUMBER) : FIRST_NEW_NUMBER;
    const agentNumber = String(next).padStart(4, "0");

    tx.set(counterRef, { next: next + 1 }, { merge: true });
    tx.update(userRef, {
      status: "agent",
      agentNumber,
      confirmed_at: FieldValue.serverTimestamp(),
      confirmed_by: confirmedBy,
      confirmation_seen: false,            // so the portal shows the celebration once
    });
    return { alreadyAgent: false, agentNumber, email: data.email, name: data.full_name };
  });

  if (!result.alreadyAgent) await queueConfirmationEmail(result);
  return result;
}

/* The confirmation email. Nothing sends mail yet — the success page already
 * promises a Zoom link nobody sends, and adding a second silent promise would
 * repeat that. This writes an explicit queue row for whatever sends mail
 * (a Firebase extension, or the Linode service) to pick up, so an unsent email
 * is visible as a pending row rather than invisible. */
async function queueConfirmationEmail({ email, name, agentNumber }) {
  const db = getFirestore(DATABASE);
  await db.collection("paaipe_mail_queue").add({
    to: email,
    template: "agent-confirmed",
    data: { name, agentNumber },
    createdAt: FieldValue.serverTimestamp(),
    sent: false,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const uid = process.argv[2];
  const byIdx = process.argv.indexOf("--by");
  const by = byIdx > -1 ? process.argv[byIdx + 1] : "admin";
  confirmUser(uid, by)
    .then((r) => console.log(r.alreadyAgent
      ? `already an Agent (${r.agentNumber})`
      : `confirmed: Agent ${r.agentNumber}`))
    .catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
}
