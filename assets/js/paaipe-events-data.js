/* PAAIPE — events, organizations and sponsorships. ONE source of truth.
 *
 * The public event pages, the registration page, the member portal and the admin
 * console all read these same documents. There is no build step and no server:
 * paaipe.org is static, so "change it in admin and it shows up everywhere" works
 * because every surface reads the record at runtime. No revalidation, no
 * redeploy, no cache to bust - and no Netlify build minute either.
 *
 * WHAT THIS MEANS FOR SECRECY. Anything a browser can fetch is public, so the
 * boundary is firestore.rules, not a render step: a draft event is unreadable, a
 * sponsorship that is only proposed is unreadable, and the Zoom link is a
 * separate document no client may read.
 */
import { firebaseConfig, DATABASE_ID, DOC_VERSIONS } from "/assets/js/paaipe-firebase.js";

const SDK = "https://www.gstatic.com/firebasejs/12.19.0";
let _db = null;

async function db() {
  if (_db) return _db;
  const { initializeApp, getApps } = await import(`${SDK}/firebase-app.js`);
  const { getFirestore } = await import(`${SDK}/firebase-firestore.js`);
  const app = getApps().find(a => a.name === "paaipe") || initializeApp(firebaseConfig, "paaipe");
  _db = getFirestore(app, DATABASE_ID);
  return _db;
}

export const COL = {
  events:        "paaipe_events",
  organizations: "paaipe_organizations",
  sponsors:      "paaipe_event_sponsors",
  recordings:    "paaipe_recordings",
  log:           "paaipe_activity_log",
  partners:      "paaipe_partner_applications",
};

/** Event lifecycle. The status is the single thing that decides what a visitor
 *  can do - there is no second flag saying whether registration is open, because
 *  two flags are two things that can disagree. */
export const EVENT_STATUS = {
  DRAFT:                "draft",
  PUBLISHED:            "published",
  REGISTRATION_OPEN:    "registration_open",
  REGISTRATION_CLOSED:  "registration_closed",
  HELD:                 "held",
  CANCELLED:            "cancelled",
};

export const TIER = { PRESENTING: "presenting", SUPPORTING: "supporting", COMMUNITY: "community" };
export const SPONSOR_STATUS = { PROPOSED: "proposed", CONFIRMED: "confirmed", DELIVERED: "delivered" };

/** The brief's rule: at most one presenting and three supporting sponsors per
 *  event. Enforced here AND checked before every write, because a limit that
 *  lives only in a form is a limit the next form forgets. */
export const TIER_LIMITS = { [TIER.PRESENTING]: 1, [TIER.SUPPORTING]: 3, [TIER.COMMUNITY]: Infinity };

/* ------------------------------------------------- partner applications */

export const PARTNER_STATUS = {
  NEW: "new", CONTACTED: "contacted", IN_DISCUSSION: "in_discussion",
  ACCEPTED: "accepted", DECLINED: "declined", SPAM: "spam",
};

/** What the applicant offered. The list is closed because it is a filter in the
 *  admin console, and a free-text "other" would make the filter meaningless -
 *  the detail goes in the message instead. */
export const SUPPORT_TYPES = [
  ["speaker",  "A speaker or session"],
  ["vouchers", "Vouchers or credits for attendees"],
  ["venue",    "A venue"],
  ["media",    "Media or promotion"],
  ["other",    "Something else"],
];

export const PARTNER_SOURCES = [
  "public_event", "events_list", "success_page", "portal_sessions", "portal_session",
];

/** An event that can still gain a partner. Held and cancelled cannot - offering
 *  to sponsor last month's session is a form nobody should be shown. */
export function acceptsPartners(ev) {
  return Boolean(ev) && ev.status !== EVENT_STATUS.HELD
                     && ev.status !== EVENT_STATUS.CANCELLED
                     && ev.status !== EVENT_STATUS.DRAFT;
}

/* THE REFERENCE NUMBER IS DERIVED FROM THE DOCUMENT ID, NOT COUNTED.
 *
 * The brief asked for PA-YYYY-#### - a sequence. A sequence needs a counter
 * document every client may increment, and `paaipe_counters` is read/write false
 * for exactly that reason: a client-incremented counter is a client-controlled
 * counter. It would also publish a fact PAAIPE may not want published, since
 * PA-2026-0004 tells the fourth applicant they are the fourth.
 *
 * So the reference is four characters of the document's own id, which Firestore
 * already guarantees unique. It reads like a reference, it is unique by
 * construction, and it is not enumerable. The admin console re-derives it from
 * the id rather than trusting the stored field, so a forged one is visible.
 */
export function referenceSuffix(docId) {
  return String(docId || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(0, 4).padEnd(4, "X");
}
export function partnerReference(docId, year = new Date().getFullYear()) {
  return `PA-${year}-${referenceSuffix(docId)}`;
}
/** True when the stored reference really belongs to this document. */
export function referenceMatchesId(row) {
  return String(row.reference || "").endsWith(referenceSuffix(row.id));
}

/** A Philippine mobile number, normalised to +639XXXXXXXXX, or null.
 *  Accepts 09XXXXXXXXX, +639XXXXXXXXX, 639XXXXXXXXX and spaced or dashed forms,
 *  because people type their own number the way they say it. */
export function normalisePhone(raw) {
  const d = String(raw || "").replace(/[\s()\-.]/g, "");
  let m;
  if ((m = /^\+?63(9\d{9})$/.exec(d))) return `+63${m[1]}`;
  if ((m = /^0(9\d{9})$/.exec(d)))      return `+63${m[1]}`;
  if ((m = /^(9\d{9})$/.exec(d)))       return `+63${m[1]}`;
  return null;
}

/** A company name reduced to something two spellings of the same company share.
 *  "GetHired, Inc." and "gethired inc" both become "gethired". */
export function normaliseCompany(name) {
  return String(name || "").toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(inc|incorporated|corp|corporation|co|company|ltd|limited|llc|plc|ph|philippines)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** The registrable part of a URL's host, for matching by domain. */
export function domainOf(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch { return ""; }
}

/* THE ORGANIZATION MATCH RUNS IN THE ADMIN CONSOLE, NOT AT SUBMIT TIME.
 *
 * The brief asked that submitting create or link an Organization. It must not:
 * paaipe_organizations is what the public Partners page and every event credit
 * render from, so a public write there is a name and a logo on paaipe.org for
 * anyone who asks. The rules keep that collection admin-only, an application
 * carries only what the applicant typed, and the match is recomputed HERE from
 * the live org list every time it is displayed. Nothing the applicant sends is
 * trusted to name an organization.
 */
export function matchOrganization(app, orgs) {
  const byName = normaliseCompany(app.companyName);
  const byDomain = domainOf(app.website);
  if (!byName && !byDomain) return null;
  return orgs.find(o => byName && normaliseCompany(o.name) === byName)
      || (byDomain ? orgs.find(o => domainOf(o.website) === byDomain) : null)
      || null;
}

const toDate = v =>
  v?.toDate ? v.toDate() : v instanceof Date ? v : Number.isFinite(v?.seconds) ? new Date(v.seconds * 1000) : null;

/* ------------------------------------------------------------------- reads */

/* FIRESTORE RULES DO NOT FILTER A LIST. THEY ALLOW OR DENY THE WHOLE QUERY.
 *
 * This cost a bug, and it is worth writing down. The rule on events is
 * conditional - readable unless it is a draft - so Firestore cannot prove an
 * UNCONSTRAINED list is allowed and refuses the entire request with
 * permission-denied. It does not quietly hand back the readable subset.
 *
 * The fix is to ask a question the rule can answer: constrain the query by the
 * same field the rule tests. Then the query provably matches only readable
 * documents and it is allowed.
 *
 * Verified against the live database: an unconstrained list of events or
 * sponsorships returns 403 to a visitor; the constrained one returns exactly the
 * rows they may see. A stubbed test cannot catch this - only a real query
 * against real rules can.
 */
const PUBLIC_EVENT_STATUSES = [
  EVENT_STATUS.PUBLISHED, EVENT_STATUS.REGISTRATION_OPEN,
  EVENT_STATUS.REGISTRATION_CLOSED, EVENT_STATUS.HELD, EVENT_STATUS.CANCELLED,
];
const PUBLIC_SPONSOR_STATUSES = ["confirmed", "delivered"];

/** @param asAdmin pass true only from the admin console, where drafts must show.
 *  An ordinary visitor must NOT ask for them: the request would be refused
 *  outright and they would see nothing at all rather than the published ones. */
export async function listEvents({ asAdmin = false } = {}) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const col = F.collection(await db(), COL.events);
  const snap = await F.getDocs(asAdmin ? col
    : F.query(col, F.where("status", "in", PUBLIC_EVENT_STATUSES)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
}

/** One event by its slug. Returns null when there is none the caller may read -
 *  which is also what a draft looks like from outside, deliberately. */
export async function getEventBySlug(slug, { asAdmin = false } = {}) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const col = F.collection(await db(), COL.events);
  const q = asAdmin
    ? F.query(col, F.where("slug", "==", String(slug || "")))
    : F.query(col, F.where("slug", "==", String(slug || "")),
                   F.where("status", "in", PUBLIC_EVENT_STATUSES));
  const snap = await F.getDocs(q);
  const d = snap.docs[0];
  return d ? { id: d.id, ...d.data() } : null;
}

export async function getEvent(id) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const s = await F.getDoc(F.doc(await db(), COL.events, id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

export async function listOrganizations() {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const snap = await F.getDocs(F.collection(await db(), COL.organizations));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

/** Sponsorships for an event, each joined to its organization so a caller never
 *  has to know the join. Rules already hide anything not confirmed from the
 *  public, so a visitor simply receives fewer rows - not a filtered list they
 *  could unfilter. */
export async function listEventSponsors(eventId, { asAdmin = false } = {}) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const col = F.collection(await db(), COL.sponsors);
  // Same trap as events: without the status constraint the whole query is
  // refused, and the page shows NO sponsors rather than the confirmed ones.
  const q = asAdmin
    ? F.query(col, F.where("eventId", "==", eventId))
    : F.query(col, F.where("eventId", "==", eventId),
                   F.where("status", "in", PUBLIC_SPONSOR_STATUSES));
  const rows = (await F.getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
  if (!rows.length) return [];
  const orgs = new Map((await listOrganizations()).map(o => [o.id, o]));
  return rows
    .map(r => ({ ...r, organization: orgs.get(r.organizationId) || null }))
    .sort((a, b) => (a.displayOrder ?? 99) - (b.displayOrder ?? 99));
}

export async function getRecording(eventId) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  try {
    const s = await F.getDoc(F.doc(await db(), COL.recordings, eventId));
    return s.exists() ? { id: s.id, ...s.data() } : null;
  } catch (e) {
    // not readable is not the same as broken: an unpublished recording, or one
    // for members while nobody is signed in, is simply absent
    if (e?.code === "permission-denied") return null;
    throw e;
  }
}

/* ------------------------------------------------------- derived, not stored */

/** Can somebody register right now, and if not, what should the page say?
 *
 *  Derived from the event in ONE place so the public page, the registration page
 *  and the portal cannot disagree. The reason is returned alongside the answer
 *  because a disabled button with no explanation is its own defect. */
export function registrationState(ev, now = new Date()) {
  if (!ev) return { open: false, label: "Registration closed", reason: "no such event" };
  if (ev.status === EVENT_STATUS.CANCELLED)
    return { open: false, label: "This event was cancelled", reason: "cancelled" };
  if (ev.status === EVENT_STATUS.HELD)
    return { open: false, label: "This event has taken place", reason: "held" };
  if (ev.status === EVENT_STATUS.REGISTRATION_CLOSED)
    return { open: false, label: "Registration closed", reason: "closed" };
  if (ev.status !== EVENT_STATUS.REGISTRATION_OPEN)
    return { open: false, label: "Registration opens soon", reason: "not open yet" };

  const opens = toDate(ev.registrationOpensAt), closes = toDate(ev.registrationClosesAt);
  if (opens && now < opens)
    return { open: false, label: "Registration opens soon", reason: "before the window" };
  if (closes && now > closes)
    return { open: false, label: "Registration closed", reason: "after the window" };
  return { open: true, label: "Register", reason: "open" };
}

/** Whether the room is full, given a live count. Capacity is only meaningful
 *  next to a real number of registrations, so the count is passed in rather
 *  than guessed at. */
export function capacityState(ev, registeredCount) {
  const cap = Number(ev?.capacity);
  if (!Number.isFinite(cap) || cap <= 0) return { full: false, waitlist: false, cap: null };
  const full = registeredCount >= cap;
  return { full, waitlist: full && ev.waitlistEnabled === true, cap };
}

/** Sponsors grouped for display. The placement rules are the brief's: presenting
 *  gets its own block, supporting a logo row, community a strip. Order within a
 *  tier is displayOrder. */
export function groupSponsors(rows) {
  const live = rows.filter(r =>
    r.organization && [SPONSOR_STATUS.CONFIRMED, SPONSOR_STATUS.DELIVERED].includes(r.status));
  return {
    presenting: live.filter(r => r.tier === TIER.PRESENTING),
    supporting: live.filter(r => r.tier === TIER.SUPPORTING),
    community:  live.filter(r => r.tier === TIER.COMMUNITY),
    any: live.length > 0,
  };
}

export const eventDateLong = ev => {
  const d = toDate(ev?.date) || (ev?.date ? new Date(`${ev.date}T00:00:00+08:00`) : null);
  return d && !isNaN(d)
    ? d.toLocaleDateString("en-PH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "";
};

export { toDate };

/* ------------------------------------------------ partner applications: writes */

/* What a signed-in member has already sent, for the portal's status line.
 *
 * CONSTRAINED BY submittedByUserId, and it has to be. The read rule on this
 * collection is conditional - an administrator, or the person who submitted it -
 * and a conditional rule does not filter a list, it refuses the whole query. An
 * unconstrained getDocs() here returns permission-denied and the member sees
 * nothing at all rather than their own application. Asking the question the rule
 * can answer is what makes it allowed. It is the same trap as the events list
 * above, and it bites here for the same reason.
 *
 * Returns a Map of eventId -> application. Never throws: a member who cannot be
 * told the status of their application should still get the button.
 */
export async function myApplications(uid) {
  if (!uid) return new Map();
  try {
    const F = await import(`${SDK}/firebase-firestore.js`);
    const snap = await F.getDocs(F.query(
      F.collection(await db(), COL.partners),
      F.where("submittedByUserId", "==", uid)));
    const m = new Map();
    for (const d of snap.docs) {
      const a = { id: d.id, ...d.data() };
      const prev = m.get(a.eventId);
      // Keep the most recent, so applying twice shows the live one.
      if (!prev || (a.createdAt?.seconds || 0) > (prev.createdAt?.seconds || 0)) m.set(a.eventId, a);
    }
    return m;
  } catch { return new Map(); }
}


/**
 * Write one partner application.
 *
 * The document id is generated FIRST so the reference can be derived from it and
 * stored in the same write - see partnerReference() above for why it is derived
 * rather than counted.
 * Throws on failure: the caller must not show the success panel unless this
 * resolves, or the applicant walks away with a reference to nothing.
 *
 * @returns {{id:string, reference:string}}
 */
export async function submitPartnerApplication(fields) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const ref = F.doc(F.collection(await db(), COL.partners));
  const reference = partnerReference(ref.id);
  const doc = {
    eventId:           fields.eventId,
    eventTitle:        String(fields.eventTitle || "").slice(0, 200),
    reference,
    companyName:       fields.companyName,
    contactName:       fields.contactName,
    email:             fields.email,
    phone:             fields.phone,
    website:           fields.website || "",
    message:           fields.message || "",
    supportTypes:      Array.isArray(fields.supportTypes) ? fields.supportTypes.slice(0, 5) : [],
    source:            fields.source,
    submittedByUserId: fields.submittedByUserId || "",
    status:            PARTNER_STATUS.NEW,
    privacyVersion:    DOC_VERSIONS.privacy,
    userAgent:         String(navigator.userAgent || "").slice(0, 300),
    consentAt:         F.serverTimestamp(),
    createdAt:         F.serverTimestamp(),
  };
  await F.setDoc(ref, doc);
  return { id: ref.id, reference };
}
