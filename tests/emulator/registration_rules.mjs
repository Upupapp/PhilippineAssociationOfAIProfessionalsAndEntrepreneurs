/* Firestore rules test for member-facing registration access.
 *
 * Proves the additive rules on paaipe_event_registrations:
 *   - an administrator still reads everything;
 *   - a signed-in member with a VERIFIED email reads ONLY their own rows,
 *     queried by email, and never anyone else's;
 *   - an UNVERIFIED member reads nothing;
 *   - a member may CANCEL their own registration (status:'cancelled') and may
 *     change nothing else - not a submitted field, not to 'attended', not
 *     another person's row;
 *   - create still works for a well-formed row; nobody may delete.
 *
 * Run it against the Firestore emulator:
 *   sh tests/emulator/run.sh
 * A stubbed test cannot catch a rules mistake - only a real request against the
 * real ruleset can, which is why this drives the emulator.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import assert from "node:assert/strict";
import { buildTelemetryReport } from "../../functions/lib/logic.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES = resolve(HERE, "../../firestore.rules");

let pass = 0;
let fail = 0;
async function T(name, promise) {
  try {
    await promise;
    console.log(`  PASS  ${name}`);
    pass++;
  } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err && err.message ? err.message : err}`);
    fail++;
  }
}

const testEnv = await initializeTestEnvironment({
  projectId: "paaipe-rules-test",
  firestore: {
    rules: readFileSync(RULES, "utf8"),
    host: "127.0.0.1",
    port: Number(process.env.FIRESTORE_EMULATOR_PORT || 8080),
  },
});

const COL = "paaipe_event_registrations";
const wellFormed = (email, extra = {}) => ({
  event: "AI Exchange",
  full_name: "A Member",
  email,
  consent: true,
  eventId: "e1",
  source: "paaipe-mobile",
  source_site: "paaipe-mobile",
  privacyVersion: "1.0",
  createdAt: serverTimestamp(),
  ...extra,
});

// Seed two registrations with rules bypassed.
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, COL, "r-alice"), {
    event: "AI Exchange",
    full_name: "Alice Guest",
    email: "alice@example.com",
    consent: true,
    eventId: "e1",
    status: "registered",
    createdAt: Timestamp.now(),
  });
  await setDoc(doc(db, COL, "r-bob"), {
    event: "AI Exchange",
    full_name: "Bob Guest",
    email: "bob@example.com",
    consent: true,
    eventId: "e1",
    status: "registered",
    createdAt: Timestamp.now(),
  });
});

const admin = testEnv
  .authenticatedContext("uid-admin", { email: "admin@upupapp.asia", email_verified: true })
  .firestore();
const alice = testEnv
  .authenticatedContext("uid-alice", { email: "alice@example.com", email_verified: true })
  .firestore();
const aliceCase = testEnv
  .authenticatedContext("uid-alice", { email: "Alice@Example.com", email_verified: true })
  .firestore();
const aliceUnverified = testEnv
  .authenticatedContext("uid-alice-u", { email: "alice@example.com", email_verified: false })
  .firestore();
const bob = testEnv
  .authenticatedContext("uid-bob", { email: "bob@example.com", email_verified: true })
  .firestore();
const anon = testEnv.unauthenticatedContext().firestore();

// --- reads ---------------------------------------------------------------
await T(
  "admin lists every registration",
  assertSucceeds(getDocs(collection(admin, COL))),
);
await T(
  "verified member reads own row by id",
  assertSucceeds(getDoc(doc(alice, COL, "r-alice"))),
);
await T(
  "verified member lists own rows filtered by their email",
  assertSucceeds(getDocs(query(collection(alice, COL), where("email", "==", "alice@example.com")))),
);
await T(
  "email match is case-insensitive",
  assertSucceeds(getDocs(query(collection(aliceCase, COL), where("email", "==", "alice@example.com")))),
);
await T(
  "member cannot read another member's row by id",
  assertFails(getDoc(doc(alice, COL, "r-bob"))),
);
await T(
  "member cannot list another member's rows",
  assertFails(getDocs(query(collection(alice, COL), where("email", "==", "bob@example.com")))),
);
await T(
  "member cannot list the whole collection unfiltered",
  assertFails(getDocs(collection(alice, COL))),
);
await T(
  "unverified member cannot read own row",
  assertFails(getDoc(doc(aliceUnverified, COL, "r-alice"))),
);
await T(
  "anonymous visitor cannot read a registration",
  assertFails(getDoc(doc(anon, COL, "r-alice"))),
);

// --- cancel (member update) ---------------------------------------------
await T(
  "member cancels own registration (status:cancelled + cancelled_at)",
  assertSucceeds(
    updateDoc(doc(alice, COL, "r-alice"), {
      status: "cancelled",
      cancelled_at: serverTimestamp(),
    }),
  ),
);
await T(
  "member cannot edit a field they submitted while cancelling",
  assertFails(
    updateDoc(doc(alice, COL, "r-alice"), { status: "cancelled", full_name: "Renamed" }),
  ),
);
await T(
  "member cannot mark themselves attended",
  assertFails(updateDoc(doc(alice, COL, "r-alice"), { status: "attended" })),
);
await T(
  "member cannot cancel another member's registration",
  assertFails(updateDoc(doc(alice, COL, "r-bob"), { status: "cancelled" })),
);
await T(
  "unverified member cannot cancel own registration",
  assertFails(updateDoc(doc(aliceUnverified, COL, "r-alice"), { status: "cancelled" })),
);

// --- create / delete -----------------------------------------------------
await T(
  "anyone may create a well-formed registration",
  assertSucceeds(addDoc(collection(anon, COL), wellFormed("carol@example.com"))),
);
await T(
  "create with consent:false is rejected",
  assertFails(addDoc(collection(anon, COL), wellFormed("carol@example.com", { consent: false }))),
);
await T(
  "nobody may delete a registration",
  assertFails(deleteDoc(doc(alice, COL, "r-alice"))),
);

// --- mail queue is server-only (Admin SDK); counts come from a function ----
// The confirmation-email queue and the raw registrations are never client-
// readable, so a client can neither send mail itself nor total registrations —
// aggregate counts must come from the eventRegistrationCounts function.
const MAIL = "paaipe_mail_queue";
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), MAIL, "m1"), {
    to: "alice@example.com",
    template: "event-registered",
    sent: false,
  });
});
await T(
  "admin cannot read the mail queue from a client",
  assertFails(getDoc(doc(admin, MAIL, "m1"))),
);
await T(
  "member cannot read the mail queue",
  assertFails(getDoc(doc(alice, MAIL, "m1"))),
);
await T(
  "member cannot write to the mail queue",
  assertFails(setDoc(doc(alice, MAIL, "m2"), { to: "x@y.co", template: "event-registered" })),
);
await T(
  "anonymous visitor cannot read the mail queue",
  assertFails(getDoc(doc(anon, MAIL, "m1"))),
);

// --- telemetry rollup is server-only; report shape is aggregate-only --------
// paaipe_telemetry_daily is written by telemetryIngest and read by
// telemetryReport, both Admin SDK. No client may touch it (catch-all deny), and
// the report the endpoint returns must be pure aggregate — no device id, ever.
const TELEMETRY = "paaipe_telemetry_daily";
await testEnv.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, TELEMETRY, "2026-09-24"), {
    devices: 4,
    write_success: 10,
    write_queued: 0,
    write_failure: 0,
  });
  await setDoc(doc(db, TELEMETRY, "2026-09-25"), {
    devices: 6,
    write_success: 6,
    write_queued: 3,
    write_failure: 1,
    cancel_success: 2,
    cancel_failure: 0,
  });
});
await T(
  "member cannot read the telemetry rollup",
  assertFails(getDoc(doc(alice, TELEMETRY, "2026-09-25"))),
);
await T(
  "admin cannot read the telemetry rollup from a client",
  assertFails(getDoc(doc(admin, TELEMETRY, "2026-09-25"))),
);
await T(
  "member cannot write the telemetry rollup",
  assertFails(setDoc(doc(alice, TELEMETRY, "2026-09-25"), { devices: 999 })),
);
await T(
  "anonymous visitor cannot read the telemetry rollup",
  assertFails(getDoc(doc(anon, TELEMETRY, "2026-09-25"))),
);

// Read the seeded rollup with the Admin path (rules disabled, exactly as the
// telemetryReport function does) and assert buildTelemetryReport's exact shape:
// days sorted newest-first, summed totals, derived offline rate, and NO field
// that could identify a device or member.
await T(
  "telemetryReport builds an aggregate-only report from the emulator rollup",
  (async () => {
    let docs = [];
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDocs(collection(ctx.firestore(), TELEMETRY));
      docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    });
    const report = buildTelemetryReport(docs);
    // newest day first
    assert.deepEqual(
      report.days.map((d) => d.date),
      ["2026-09-25", "2026-09-24"],
    );
    // per-day and overall offline rate
    assert.equal(report.days[0].offlineRate, 0.4); // (3+1)/(6+3+1)
    assert.equal(report.days[1].offlineRate, 0); // all immediate
    assert.equal(report.offlineRate, 0.2); // 4 / 20 across both days
    // summed totals
    assert.equal(report.totals.devices, 10);
    assert.equal(report.totals.write_success, 16);
    assert.equal(report.totals.write_queued, 3);
    assert.equal(report.totals.write_failure, 1);
    // aggregate only: no per-device identity leaks through
    const serialized = JSON.stringify(report);
    for (const banned of ["deviceId", "device_id", "uid", "email", "installId"]) {
      assert.ok(!serialized.includes(banned), `report must not include ${banned}`);
    }
  })(),
);

await testEnv.cleanup();
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail === 0 ? 0 : 1);
