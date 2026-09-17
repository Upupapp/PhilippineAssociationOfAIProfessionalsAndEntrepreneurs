/* Seed three SAMPLE partner applications on the October Exchange.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/seed-partner-applications.mjs [--commit]
 *
 * Without --commit it prints what it would write and writes nothing.
 *
 * ---------------------------------------------------------------------------
 * EVERY ROW IS MARKED isSample: true, AND THAT IS NOT DECORATION.
 *
 * paaipe_partner_applications holds companies that really offered to support an
 * event, with a real person's name, email and mobile number on each. An
 * administrator reads that screen in order to ring somebody up.
 *
 * Unmarked sample rows would be indistinguishable from real leads the moment
 * they landed - the marker is exactly the field a real row lacks, so there would
 * be no way to tell them apart afterwards. That is why the events seed writes no
 * registrations at all (see the note at the top of seed-events.mjs).
 *
 * These three are written only because the brief asks for them, and they carry:
 *   - isSample: true, which the admin list renders as a SAMPLE pill on the row
 *   - companies that do not exist, at example.com addresses
 *   - +63 917 000 00NN numbers, which are not allocated to anybody
 *
 * Deleting them is not possible from a client - the rules refuse a delete on
 * this collection, deliberately, because a record of what somebody submitted is
 * not something to make disappear. Mark them spam to get them out of the way, or
 * remove them from the Firebase console.
 *
 * DO NOT RUN THIS AGAINST PRODUCTION unless you actually want three fictional
 * companies in the partner inbox.
 * ---------------------------------------------------------------------------
 *
 * IDEMPOTENT: every document has a chosen id, so running it twice updates rather
 * than duplicates.
 *
 * ---------------------------------------------------------------------------
 * IT WRITES THROUGH THE ORDINARY RULES, WHICH SHAPES WHAT IT CAN SEED.
 *
 * The brief asks for three applications in statuses new / contacted / accepted,
 * and for them to look like they arrived over the past few weeks. The create
 * rule refuses both: an application must arrive as `new`, and consentAt and
 * createdAt must equal request.time, so nothing can be backdated.
 *
 * That rule is not in the way, it is the point. Loosening it so a fixture could
 * post a pre-accepted, backdated application would mean any member of the public
 * could too - and "accepted" is the word that later justifies a logo on the
 * event page. So the seed does what an administrator does: it CREATES each row
 * as new, at the server's clock, and then MOVES it through the admin update path
 * to the status the brief asks for. The dates are today's, because today is when
 * these were actually written, and a fixture that lied about its own age would
 * be the first thing on the screen that was not true.
 * ---------------------------------------------------------------------------
 */
import { readFileSync } from "fs";

const cfgSrc = readFileSync(new URL("../assets/js/paaipe-firebase.js", import.meta.url), "utf8");
const pick = k => cfgSrc.match(new RegExp(`${k}:\\s*"([^"]+)"`))?.[1];
const API_KEY = pick("apiKey"), PROJECT = pick("projectId");
const DATABASE_ID = cfgSrc.match(/DATABASE_ID\s*=\s*"([^"]+)"/)?.[1] || "paaipe";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE_ID}/documents`;

function fsValue(v) {
  if (v === null || v === undefined)   return { nullValue: null };
  if (typeof v === "boolean")          return { booleanValue: v };
  if (typeof v === "number")           return Number.isInteger(v)
                                         ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string")           return { stringValue: v };
  if (v instanceof Date)               return { timestampValue: v.toISOString() };
  if (Array.isArray(v))                return { arrayValue: { values: v.map(fsValue) } };
  if (typeof v === "object")           return { mapValue: { fields: fsFields(v) } };
  throw new Error(`cannot encode ${typeof v}`);
}
const fsFields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fsValue(v)]));

const COMMIT = process.argv.includes("--commit");
const EVENT_ID = "2026-10-ai-exchange";
const EVENT_TITLE = "PAAIPE AI Exchange — October 2026";

/* The reference must end in four characters of the document's own id, which is
 * what the admin console checks before it quotes a reference as fact. Chosen ids
 * here, so the suffixes are chosen to match. */
const ref = id => `PA-2026-${id.replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(0, 4).padEnd(4, "X")}`;

const APPLICATIONS = [
  {
    // one new company, with a logo to come - the brief's "with a logo" case, and
    // the reason it is phrased that way here: the form cannot take a file, so a
    // logo is something PAAIPE asks for after accepting.
    id: "northwind-sample",
    companyName: "Northwind Analytics",
    contactName: "Rosa Villanueva",
    email: "rosa.villanueva@example.com",
    phone: "+639170000001",
    website: "northwind-analytics.example.com",
    supportTypes: ["speaker", "vouchers"],
    message: "We run a small data team in Cebu and would happily put up a speaker on "
           + "practical forecasting, plus credits for attendees.",
    source: "public_event",
    status: "new",
  },
  {
    // one that MATCHES an existing organization: "GetHired, Inc." normalises to
    // the same key as the seeded "GetHired Online", so the console shows it as
    // an existing partner rather than offering to create a second record.
    id: "gethired-sample",
    companyName: "GetHired, Inc.",
    contactName: "Mark Trinidad",
    email: "mark.trinidad@example.com",
    phone: "+639170000002",
    website: "gethired.ph",
    supportTypes: ["media", "vouchers"],
    message: "Happy to run this one across our channels again, same as September.",
    source: "portal_sessions",
    status: "contacted",
    adminNote: "Rang Mark on the 8th — keen, wants to know the audience size first.",
  },
  {
    // one without a logo or a website at all, and already accepted, so the
    // screen has a row in each of the three states the brief names.
    id: "tala-sample",
    companyName: "Tala Learning Collective",
    contactName: "Amihan Reyes",
    email: "amihan@example.com",
    phone: "+639170000003",
    website: "",
    supportTypes: ["venue"],
    message: "",
    source: "events_list",
    status: "accepted",
    adminNote: "Offered their Makati space for a hybrid edition. Agreed in principle.",
  },
];

const email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD;
if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (a PAAIPE administrator).");
  process.exit(1);
}

const signIn = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
  { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }) }).then(r => r.json());
if (signIn.error) { console.error("sign-in failed:", signIn.error.message); process.exit(1); }
console.log(`signed in as ${email}`);
const AUTH = { Authorization: `Bearer ${signIn.idToken}`, "content-type": "application/json" };

const COMMIT_URL =
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE_ID}/documents:commit`;
const DOC = id => `projects/${PROJECT}/databases/${DATABASE_ID}/documents/paaipe_partner_applications/${id}`;

/* consentAt and createdAt must EQUAL request.time, so they cannot be sent as a
 * value - the seed would have to guess the server's clock. updateTransforms with
 * REQUEST_TIME is how the REST API says "the server fills this in", and it is
 * the same thing serverTimestamp() does from the browser. A field named in a
 * transform must NOT also appear in fields/updateMask. */
async function commitWrite(label, write) {
  console.log(`  ${COMMIT ? "write " : "dry   "} ${label}`);
  if (!COMMIT) return true;
  const r = await fetch(COMMIT_URL,
    { method: "POST", headers: AUTH, body: JSON.stringify({ writes: [write] }) });
  if (!r.ok) {
    console.error(`    FAILED ${r.status}: ${(await r.text()).slice(0, 400)}`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

/** Phase 1 - create it exactly as the public form would: status new, server
 *  clock, and not one field an applicant could not have sent. */
function createWrite(a) {
  const fields = fsFields({
    eventId: EVENT_ID,
    eventTitle: EVENT_TITLE,
    reference: ref(a.id),
    companyName: a.companyName,
    contactName: a.contactName,
    email: a.email,
    phone: a.phone,
    website: a.website,
    message: a.message,
    supportTypes: a.supportTypes,
    source: a.source,
    submittedByUserId: "",
    status: "new",
    privacyVersion: "1.0",
    isSample: true,
  });
  return {
    update: { name: DOC(a.id), fields },
    updateMask: { fieldPaths: Object.keys(fields) },
    updateTransforms: [
      { fieldPath: "consentAt", setToServerValue: "REQUEST_TIME" },
      { fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" },
    ],
  };
}

/** Phase 2 - move it to the status the brief asks for, through the same update
 *  path the console uses. Only the keys that rule allows are touched. */
function statusWrite(a) {
  const patch = { status: a.status, updated_by: email };
  if (a.adminNote) patch.adminNote = a.adminNote;
  const fields = fsFields(patch);
  return {
    update: { name: DOC(a.id), fields },
    updateMask: { fieldPaths: Object.keys(fields) },
    updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }],
  };
}

console.log("\nSAMPLE partner applications - every row is marked isSample: true");
console.log("phase 1: create as `new`, through the same rule the public form uses");
const created = [];
for (const a of APPLICATIONS)
  if (await commitWrite(`${ref(a.id)}  ${a.companyName}`, createWrite(a))) created.push(a);

console.log("\nphase 2: move to the brief's statuses, through the admin update rule");
for (const a of created) {
  if (a.status === "new") { console.log(`  skip   ${ref(a.id)}  already new`); continue; }
  await commitWrite(`${ref(a.id)}  new -> ${a.status}`, statusWrite(a));
}

console.log(COMMIT
  ? "\nDone. Every row carries isSample: true and shows a SAMPLE pill in the console.\n" +
    "They cannot be deleted from a client - mark them spam, or remove them in the Firebase console."
  : "\nDry run. Nothing was written. Re-run with --commit to apply.");
