/* Seed the events / organizations / sponsorships model.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/seed-events.mjs [--commit]
 *
 * Without --commit it prints what it would write and writes nothing.
 *
 * It signs in as a PAAIPE administrator and writes through the ordinary rules,
 * which means the seed is held to exactly the same constraints as the console.
 * It asks for the password through the environment because nobody should paste a
 * credential into a file that lives in a public repository.
 *
 * IDEMPOTENT: every document has a chosen id, so running it twice updates rather
 * than duplicates. It never clears anything.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DELIBERATELY DOES NOT SEED
 *
 * The brief asks for "145 registrations sample, 92 attended" for September and
 * "38 sample registrations" for October. This writes NONE of them.
 *
 * paaipe_event_registrations is a live collection holding real people who filled
 * in the form on paaipe.org. The admin console reads it, the speaker brief
 * quotes it to a speaker, and the dashboard counts it. Inserting 183 invented
 * people would put invented questions, attributed to invented names, in front of
 * a real speaker, and would make every count on the console a lie that nobody
 * could later tell apart from the truth - the fake rows have no marker, because
 * a marker is exactly the field a real row lacks.
 *
 * If a populated console is wanted for a demo, the right way is a separate
 * Firebase project seeded to the brim, not fiction in the production database.
 * ---------------------------------------------------------------------------
 */
import { readFileSync } from "fs";

/* No dependencies. The repo root is what Netlify publishes, so a node_modules
 * tree here would be served to the world; this talks to Firebase over plain
 * HTTPS instead. */
const cfgSrc = readFileSync(new URL("../assets/js/paaipe-firebase.js", import.meta.url), "utf8");
const pick = k => cfgSrc.match(new RegExp(`${k}:\\s*"([^"]+)"`))?.[1];
const API_KEY = pick("apiKey"), PROJECT = pick("projectId");
const DATABASE_ID = cfgSrc.match(/DATABASE_ID\s*=\s*"([^"]+)"/)?.[1] || "paaipe";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE_ID}/documents`;

/** JS value -> Firestore typed JSON. Explicit, because guessing a type is how a
 *  number ends up stored as a string and a query silently matches nothing. */
function fsValue(v) {
  if (v === null || v === undefined)   return { nullValue: null };
  if (typeof v === "boolean")          return { booleanValue: v };
  if (typeof v === "number")           return Number.isInteger(v)
                                         ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string")           return { stringValue: v };
  if (Array.isArray(v))                return { arrayValue: { values: v.map(fsValue) } };
  if (typeof v === "object")           return { mapValue: { fields: fsFields(v) } };
  throw new Error(`cannot encode ${typeof v}`);
}
const fsFields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fsValue(v)]));

const COMMIT = process.argv.includes("--commit");

/* The four partner organizations PAAIPE already publishes, with the logos and
 * links that are already on the Partners page. Nothing here is new information -
 * it is the same facts, moved somewhere every surface can read them. */
const ORGANIZATIONS = [
  { id: "gethired", name: "GetHired Online", shortName: "GetHired",
    logoUrl: "assets/img/partners/logo-gethired.png",
    website: "https://www.facebook.com/gethiredonline.com.ph/",
    type: "both", categories: ["recruitment", "hr"], status: "active" },
  { id: "servana", name: "Servana", shortName: "Servana",
    logoUrl: "assets/img/partners/logo-servana.png",
    website: "https://client.servana.com.ph/",
    type: "both", categories: ["home services", "marketplace"], status: "active" },
  { id: "mvj", name: "MVJ Training Consultancy Services", shortName: "MVJ",
    logoUrl: "assets/img/partners/logo-mvj.png",
    website: "https://www.facebook.com/mvjconsultancy/",
    type: "partner", categories: ["training", "consultancy"], status: "active" },
  { id: "dpdigital", name: "DP Digital Solutions", shortName: "DP Digital",
    logoUrl: "assets/img/partners/logo-dpdigital.png",
    website: "https://www.facebook.com/DPDigitalSolutions/",
    type: "partner", categories: ["digital marketing"], status: "active" },
];

const EVENTS = [
  {
    id: "2026-09-ai-exchange", slug: "event-2026-09-ai-exchange",
    title: "From Signals to Strategy: Using AI to Turn Data into Real Insight",
    series: "AI Exchange", topic: "Turning data into decisions",
    description: "Marketing strategist Sven Bally on how teams turn raw data signals into decisions that create real commercial impact.",
    whatToExpect: [
      "How to separate signal from noise in marketing and business data",
      "Where AI genuinely helps analysis, and where human judgment stays essential",
      "Turning insight into strategy that moves commercial results",
    ],
    date: "2026-09-15", startTime: "20:00", endTime: "21:30", timezone: "Asia/Manila",
    format: "zoom", capacity: null, waitlistEnabled: false,
    status: "held",
    whoCanRegister: "members_and_guests",
    questionsEnabled: ["position","organization","profile","learn","speaker_question","source"],
    speakers: [{ name: "Sven Bally", title: "Founder, Neap & Spring", org: "Neap & Spring",
                 photoUrl: "assets/img/sven-bally.jpg", bio: "" }],
    program: [], coverUrl: "assets/img/ai-exchange-session.jpg",
  },
  {
    id: "2026-10-ai-exchange", slug: "event-2026-10-ai-exchange",
    title: "AI Exchange — October 2026",
    series: "AI Exchange", topic: "To be announced",
    description: "The monthly PAAIPE AI Exchange: a practical, members-first session on putting AI to work in Philippine businesses.",
    whatToExpect: [
      "A practical session you can act on the next morning",
      "Questions answered live by the speaker",
      "Time with other Filipino AI professionals and entrepreneurs",
    ],
    date: "2026-10-13", startTime: "20:00", endTime: "21:30", timezone: "Asia/Manila",
    format: "zoom", capacity: 500, waitlistEnabled: false,
    status: "registration_open",
    whoCanRegister: "members_and_guests",
    questionsEnabled: ["position","organization","profile","learn","speaker_question","source"],
    speakers: [], program: [], coverUrl: "assets/img/ai-exchange-session.jpg",
  },
  {
    id: "2026-11-ai-exchange", slug: "event-2026-11-ai-exchange",
    title: "AI Exchange — November 2026",
    series: "AI Exchange", topic: "To be announced",
    description: "The monthly PAAIPE AI Exchange: a practical, members-first session on putting AI to work in Philippine businesses.",
    whatToExpect: [
      "A featured talk from a practitioner or partner",
      "Open Q&A with the PAAIPE community",
      "Updates on programs, benefits and partners",
    ],
    date: "2026-11-10", startTime: "20:00", endTime: "21:30", timezone: "Asia/Manila",
    format: "zoom", capacity: 500, waitlistEnabled: false,
    // PUBLISHED, not registration_open: the page says "Registration opens soon"
    // and there is no registration page for November yet. The status is what the
    // button reads, so a status the page cannot honour would be a lie.
    status: "published",
    whoCanRegister: "members_and_guests",
    questionsEnabled: ["position","organization","profile","learn","speaker_question","source"],
    speakers: [], program: [], coverUrl: "assets/img/ai-exchange-session.jpg",
  },
  {
    id: "2026-12-ai-exchange", slug: "event-2026-12-ai-exchange",
    title: "AI Exchange — December 2026",
    series: "AI Exchange", topic: "To be announced",
    description: "The monthly PAAIPE AI Exchange: a practical, members-first session on putting AI to work in Philippine businesses.",
    whatToExpect: [
      "A featured talk from a practitioner or partner",
      "Open Q&A with the PAAIPE community",
      "Updates on programs, benefits and partners",
    ],
    date: "2026-12-08", startTime: "20:00", endTime: "21:30", timezone: "Asia/Manila",
    format: "zoom", capacity: 500, waitlistEnabled: false,
    status: "published",
    whoCanRegister: "members_and_guests",
    questionsEnabled: ["position","organization","profile","learn","speaker_question","source"],
    speakers: [], program: [], coverUrl: "assets/img/ai-exchange-session.jpg",
  },
];

/* As in the admin reference. MVJ and DP Digital are PROPOSED, which is why the
 * rules refuse to serve them publicly: a proposal is a conversation PAAIPE is
 * having, not a partner it may announce. */
const SPONSORS = [
  { id: "2026-10-gethired",  eventId: "2026-10-ai-exchange", organizationId: "gethired",
    tier: "presenting", status: "confirmed", contributionType: "in_kind", displayOrder: 1, deliverables: [] },
  { id: "2026-10-servana",   eventId: "2026-10-ai-exchange", organizationId: "servana",
    tier: "supporting", status: "confirmed", contributionType: "in_kind", displayOrder: 2, deliverables: [] },
  { id: "2026-10-mvj",       eventId: "2026-10-ai-exchange", organizationId: "mvj",
    tier: "community",  status: "proposed",  contributionType: "in_kind", displayOrder: 3, deliverables: [] },
  { id: "2026-10-dpdigital", eventId: "2026-10-ai-exchange", organizationId: "dpdigital",
    tier: "community",  status: "proposed",  contributionType: "in_kind", displayOrder: 4, deliverables: [] },
];

/* September, November and December credit all four partners as "In partnership
 * with" - which is exactly what the community tier renders. These rows are not
 * new claims: they are the credit those pages already carry, moved somewhere the
 * admin can change it per event instead of it being pasted into the HTML.
 *
 * October deliberately differs (GetHired presenting, Servana supporting, the
 * other two proposed) because the admin reference says so. */
for (const ev of ["2026-09-ai-exchange", "2026-11-ai-exchange", "2026-12-ai-exchange"]) {
  ORGANIZATIONS.forEach((o, i) => SPONSORS.push({
    id: `${ev.slice(0, 7)}-${o.id}`, eventId: ev, organizationId: o.id,
    tier: "community", status: "confirmed", contributionType: "in_kind",
    displayOrder: i + 1, deliverables: [],
  }));
}

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

async function put(col, id, data) {
  const fields = fsFields(data);
  // updateMask keeps this a merge: fields not listed are left alone, so running
  // the seed again does not wipe anything the console has since edited.
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  console.log(`  ${COMMIT ? "write" : "would write"}  ${col}/${id}`);
  if (!COMMIT) return;
  const r = await fetch(`${BASE}/${col}/${id}?${mask}`,
    { method: "PATCH", headers: AUTH, body: JSON.stringify({ fields }) });
  if (!r.ok) { console.error(`    FAILED ${r.status}: ${(await r.text()).slice(0, 300)}`); process.exitCode = 1; }
}

console.log("\norganizations");
for (const o of ORGANIZATIONS) await put("paaipe_organizations", o.id, o);
console.log("\nevents");
for (const e of EVENTS) await put("paaipe_events", e.id, e);
console.log("\nsponsorships");
for (const s of SPONSORS) await put("paaipe_event_sponsors", s.id, s);

console.log(COMMIT
  ? "\nDone. Registrations were NOT seeded - see the note at the top of this file."
  : "\nDry run. Nothing was written. Re-run with --commit to apply.");
