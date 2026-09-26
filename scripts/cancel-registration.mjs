#!/usr/bin/env node
/* cancelRegistration(id) — mark a PAAIPE event registration as cancelled.
 *
 * THIS RUNS WITH THE ADMIN SDK, WHICH BYPASSES RULES. A client can cancel only
 * its OWN registration (see ownsRegistration in firestore.rules); an
 * administrator can cancel any of them, and a registration is never deleted -
 * cancelling sets status:'cancelled' and leaves the record intact
 * (allow delete: if false).
 *
 *   node scripts/cancel-registration.mjs <registrationId> [--by you@paaipe.org]
 *
 * NOT YET RUNNABLE WITHOUT CREDENTIALS: like confirm-user.mjs it needs
 * service-account credentials for postflowit-autos. Set
 * GOOGLE_APPLICATION_CREDENTIALS to a service-account key, or run it somewhere
 * with Application Default Credentials.
 *
 * The end-to-end write test left one clearly-labeled row that should be
 * cancelled once credentials exist:
 *   node scripts/cancel-registration.mjs 84msmZx4AHQ60sV1tYJp --by admin@upupapp.asia
 */
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const PROJECT = "postflowit-autos";
const DATABASE = "paaipe"; // PAAIPE's own database, asia-southeast1
const REGISTRATIONS = "paaipe_event_registrations";

export async function cancelRegistration(id, cancelledBy = "admin") {
  if (!id) throw new Error("cancelRegistration: registrationId is required");
  if (!getApps().length)
    initializeApp({ credential: applicationDefault(), projectId: PROJECT });
  const db = getFirestore(DATABASE);
  const ref = db.collection(REGISTRATIONS).doc(id);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error(`cancelRegistration: no registration ${id}`);
    const data = snap.data();
    if (data.status === "cancelled") {
      return { alreadyCancelled: true, id, event: data.event }; // idempotent
    }
    tx.update(ref, {
      status: "cancelled",
      cancelled_at: FieldValue.serverTimestamp(),
      updated_by: cancelledBy,
    });
    return { alreadyCancelled: false, id, event: data.event, email: data.email };
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2];
  const byIdx = process.argv.indexOf("--by");
  const by = byIdx > -1 ? process.argv[byIdx + 1] : "admin";
  cancelRegistration(id, by)
    .then((r) =>
      console.log(
        r.alreadyCancelled
          ? `already cancelled: ${r.id} (${r.event})`
          : `cancelled: ${r.id} (${r.event})`,
      ),
    )
    .catch((e) => {
      console.error("FAILED:", e.message);
      process.exit(1);
    });
}
