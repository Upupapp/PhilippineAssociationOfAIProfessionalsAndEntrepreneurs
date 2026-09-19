/* PAAIPE — events, organizations and sponsorships.
 *
 * Organizations, event partners and partner applications are hard-cut to
 * api.paaipe.org. Events, recordings and feedback still read Firestore.
 * Firebase is Auth/users (Bearer) only on the org/partner/application path.
 *
 * WHAT THIS MEANS FOR SECRECY. Anything a browser can fetch is public, so the
 * boundary is firestore.rules, not a render step: a draft event is unreadable, a
 * sponsorship that is only proposed is unreadable, and the Zoom link is a
 * separate document no client may read.
 */
import { firebaseConfig, DATABASE_ID } from "/assets/js/paaipe-firebase.js";
import {
  listApiOrganizations,
  listMeOrganizations,
  postMeOrganization,
  patchMeOrganization,
  listAdminOrganizations,
  listApiEventPartners,
  listAdminEventPartners,
  postPartnerApplication,
  listAdminPartnerApplications,
} from "/assets/js/paaipe-api.js";

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
  registrations: "paaipe_event_registrations",
  // Clarence, locked. Questions are one doc each; responses are one doc per
  // registration. Neither is embedded on the event, and neither is
  // questionsEnabled (that toggle is the registration form).
  feedbackQuestions: "paaipe_event_feedback_questions",
  feedbackResponses: "paaipe_event_feedback_responses",
};

/* LINKING A REGISTRATION TO ITS EVENT.
 *
 * Registrations were built before events were records: each one carries a
 * free-text `event` title typed into the registration page's hidden input, and
 * no id. Measured on the live database: the rows say "PAAIPE AI Exchange —
 * October 2026" while the event record's title is "AI Exchange — October 2026".
 * They are not the same string, so joining on the title returns NOTHING, and a
 * per-event list built that way would quietly show zero registrations for an
 * event that has three.
 *
 * So new registrations carry `eventId`, and this is the fallback for the rows
 * written before that existed. It is deliberately loose - it strips the PAAIPE
 * prefix and compares what is left - because its only job is to catch legacy
 * rows, and a row it cannot place is SHOWN AS UNLINKED rather than dropped. A
 * filtered list that silently loses people is worse than no list at all.
 */
export function registrationMatchesEvent(reg, ev) {
  if (!reg || !ev) return false;
  if (reg.eventId) return reg.eventId === ev.id;          // the reliable way
  const norm = t => String(t || "").toLowerCase()
    .replace(/^paaipe\s+/, "").replace(/[^a-z0-9]+/g, "");
  const a = norm(reg.event), b = norm(ev.title);
  return Boolean(a && b && a === b);
}

/** Registrations this event cannot claim and no other event can either. They are
 *  listed under the event they name, flagged, rather than disappearing. */
export const isUnlinked = reg => !reg?.eventId;

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

/* --------------------------------------------------------------- media */

/* THE EVENT'S PICTURES. Four fields and a gallery, all plain URLs, so anything
 * that can host an image can fill them - the repo, a bucket, a CDN. The admin
 * uploader writes them; the public page only ever reads them.
 *
 * coverUrl falls back to the wide banner, which falls back to whatever the page
 * was built with. A missing picture must never blank a page that already had one.
 */
export const MEDIA_FIELDS = ["bannerSourceUrl", "bannerSquareUrl", "bannerWideUrl", "coverUrl"];
export const GALLERY_MAX = 5;

/** The image at the top of the public event and registration pages. */
export const coverFor = ev => ev?.coverUrl || ev?.bannerWideUrl || "";
/** What a share card should use. Square is the one built for it. */
export const shareImageFor = ev => ev?.bannerSquareUrl || ev?.bannerWideUrl || ev?.coverUrl || "";

/** The gallery, cleaned: at most GALLERY_MAX, in order, and never a photo with
 *  no alt text - a photo nobody using a screen reader can identify is not
 *  published, it is just present. */
export function galleryOf(ev) {
  const rows = Array.isArray(ev?.gallery) ? ev.gallery : [];
  return rows
    .filter(g => g && g.url && String(g.alt || "").trim())
    .slice(0, GALLERY_MAX)
    .map((g, i) => ({ ...g, order: Number.isFinite(g.order) ? g.order : i }))
    .sort((a, b) => a.order - b.order);
}

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
  "public_event", "events_list", "success_page", "portal_sessions", "portal_events",
  "portal_session", "portal_organization",
];

/** Picker sentinel on Partner apply when this email already has organizations. */
export const OTHER_ORGANIZATION = "__other__";

/** Status pills on My Organization. Derived from data; the member cannot set one. */
export const ORG_PILL = {
  unpublished: { key: "unpublished", label: "Not published", cls: "info" },
  review:      { key: "review",      label: "Under review",  cls: "soon" },
  partner:     { key: "partner",     label: "Partner",       cls: "ok" },
};

const OPEN_APPLICATION = new Set(["new", "contacted", "in_discussion", "accepted"]);

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

/* ORGANIZATION MATCH.
 *
 * Admin still recomputes a guess from the live org list, because an application
 * was written by a member of the public.
 *
 * Signed-in apply is match-then-create, in this order:
 *   1. an org this email already owns (picker, or a typed name that matches)
 *   2. a confirmed Partner (status == active) — unpublished others never appear
 *   3. otherwise create a new unpublished org on this uid
 * Anonymous apply still cannot create an org: there is no uid to own it.
 */
export function matchOrganization(app, orgs) {
  const byName = normaliseCompany(app.companyName);
  const byDomain = domainOf(app.website);
  if (!byName && !byDomain) return null;
  return orgs.find(o => byName && normaliseCompany(o.name) === byName)
      || (byDomain ? orgs.find(o => domainOf(o.website) === byDomain) : null)
      || null;
}

export function confirmedAttachCopy(name) {
  return `We'll attach this to ${name}`;
}

/** Pill on a My Organization card. Partner (active) wins; else an open
 *  application is Under review; else Not published. */
export function organizationPill(org, apps = []) {
  if (org?.status === "active") return ORG_PILL.partner;
  const open = (apps || []).some(a => {
    if (!OPEN_APPLICATION.has(a.status)) return false;
    if (a.organizationId && org?.id && a.organizationId === org.id) return true;
    return Boolean(org?.name) && normaliseCompany(a.companyName) === normaliseCompany(org.name);
  });
  return open ? ORG_PILL.review : ORG_PILL.unpublished;
}

/**
 * Decide which organization an application should use. Does not write.
 *
 * `publicOrgs` must be confirmed (active) Partners only — unpublished matches
 * never appear. `myOrgs` are this email's, including unpublished.
 *
 * @returns {{organization: object|null, how: 'own'|'confirmed'|'new', create: boolean}}
 */
export function resolveOrganizationMatch({
  companyName, website, selectedOrgId, myOrgs = [], publicOrgs = [],
} = {}) {
  const own = Array.isArray(myOrgs) ? myOrgs : [];
  const pub = (Array.isArray(publicOrgs) ? publicOrgs : [])
    .filter(o => o && o.status === "active");

  if (selectedOrgId && selectedOrgId !== OTHER_ORGANIZATION) {
    const picked = own.find(o => o.id === selectedOrgId);
    if (picked) return { organization: picked, how: "own", create: false };
  }

  const probe = { companyName, website };
  const ownHit = matchOrganization(probe, own);
  if (ownHit) return { organization: ownHit, how: "own", create: false };

  const confirmed = matchOrganization(probe, pub);
  if (confirmed) return { organization: confirmed, how: "confirmed", create: false };

  return { organization: null, how: "new", create: true };
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

async function bearerToken(opts = {}) {
  if (opts.token) return opts.token;
  const { idTokenForRequest } = await import("/assets/js/paaipe-firebase.js");
  const token = await idTokenForRequest();
  if (!token) {
    throw Object.assign(new Error("You need to be signed in."), { code: "not-signed-in" });
  }
  return token;
}

/** Public GET /v1/organizations (active only). Admin GET /v1/admin/organizations. */
export async function listOrganizations({ asAdmin = false, token, fetchImpl } = {}) {
  if (asAdmin) {
    return listAdminOrganizations({ token: await bearerToken({ token }), fetchImpl });
  }
  return listApiOrganizations({ fetchImpl });
}

/** GET /v1/me/organizations. The Bearer token is the owner — uid is only a
 *  guard so an unsigned-in visitor does not prompt for a token. */
export async function listMyOrganizations(uid, { token, fetchImpl } = {}) {
  if (!uid && !token) return [];
  return listMeOrganizations({ token: await bearerToken({ token }), fetchImpl });
}

/** Create or update via /v1/me/organizations. The member cannot set status. */
export async function saveMyOrganization({ id, name, website, token, fetchImpl } = {}) {
  const n = String(name || "").trim().slice(0, 120);
  const w = String(website || "").trim().slice(0, 300);
  if (!n) throw new Error("An organization needs a name.");
  const tok = await bearerToken({ token });
  const opts = { token: tok, fetchImpl };
  if (id) {
    await patchMeOrganization(id, { name: n, website: w }, opts);
    return { id, name: n, website: w };
  }
  const created = await postMeOrganization({ name: n, website: w }, opts);
  return { id: created, name: n, website: w, status: "inactive" };
}

/** Event partners from the API, each joined to its organization.
 *  Public: GET /v1/events/{eventId}/partners.
 *  Admin:  GET /v1/admin/events/{eventId}/partners.
 *  Writes are PUT /v1/admin/partners — not this helper. */
export async function listEventSponsors(eventId, { asAdmin = false, token, fetchImpl } = {}) {
  const partners = asAdmin
    ? await listAdminEventPartners(eventId, { token: await bearerToken({ token }), fetchImpl })
    : await listApiEventPartners(eventId, { fetchImpl });
  const visible = asAdmin
    ? partners
    : partners.filter(r => PUBLIC_SPONSOR_STATUSES.includes(String(r.status || "").toLowerCase()));
  if (!visible.length) return [];
  const orgs = new Map((await listOrganizations({ asAdmin, token, fetchImpl })).map(o => [o.id, o]));
  return visible
    .map(r => ({
      ...r,
      order: r.displayOrder,
      organization: orgs.get(r.organizationId) || null,
    }))
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
    ? d.toLocaleDateString("en-PH", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
        timeZone: "Asia/Manila",
      })
    : "";
};

/** "8:00 PM" from a stored "20:00". Empty when the event has no time — never
 *  filled in from a neighbouring edition. */
export function formatTime12(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return "";
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || h < 0 || h > 23 || !Number.isFinite(min)) return "";
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(min).padStart(2, "0")} ${ampm}`;
}

/** "8:00–9:30 PM" when both ends share AM/PM; otherwise both meridians.
 *  Empty when neither time is on the record. */
export function eventTimeRange(ev) {
  const a = formatTime12(ev?.startTime), b = formatTime12(ev?.endTime);
  if (a && b) {
    const [aClock, aMer] = a.split(" ");
    const [bClock, bMer] = b.split(" ");
    if (aMer && aMer === bMer) return `${aClock}–${bClock} ${aMer}`;
    return `${a}–${b}`;
  }
  return a || b || "";
}

/** "Tuesday, October 13, 2026 · 8:00–9:30 PM PHT" from the event record.
 *  Drops any part the record does not have. Returns "" rather than a stand-in. */
export function eventDateTimeLine(ev) {
  const day = eventDateLong(ev);
  const time = eventTimeRange(ev);
  if (day && time) return `${day} · ${time} PHT`;
  if (day) return `${day} PHT`;
  if (time) return `${time} PHT`;
  return "";
}

/** Instant the feedback form opens: that event's date (YYYY-MM-DD) plus
 *  startTime (HH:mm) in PHT. Compared client-side; rules cannot parse those
 *  strings. Null when the record has no date, so a missing date cannot look
 *  like "now". */
export function eventStartAt(ev) {
  const date = String(ev?.date || "").trim();
  const time = String(ev?.startTime || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{1,2}:\d{2}/.test(time)) return null;
  const clock = time.length >= 5 ? time.slice(0, 5) : time;
  const d = new Date(`${date}T${clock}:00+08:00`);
  return isNaN(d) ? null : d;
}

export const EVENT_STATUS_SHORT = {
  [EVENT_STATUS.DRAFT]:               "Draft",
  [EVENT_STATUS.PUBLISHED]:           "Published",
  [EVENT_STATUS.REGISTRATION_OPEN]:   "Registration open",
  [EVENT_STATUS.REGISTRATION_CLOSED]: "Registration closed",
  [EVENT_STATUS.HELD]:                "Held",
  [EVENT_STATUS.CANCELLED]:           "Cancelled",
};

export function eventStatusShort(ev) {
  return EVENT_STATUS_SHORT[ev?.status] || (ev?.status ? String(ev.status) : "");
}

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
 * HOLD: there is no GET /v1/me/partner-applications (404). New public submits
 * go to POST /v1/partner-applications and will not appear here.
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
export async function submitPartnerApplication(fields, { token, fetchImpl } = {}) {
  const myOrgs = fields.submittedByUserId
    ? await listMyOrganizations(fields.submittedByUserId, { token, fetchImpl }).catch(() => [])
    : [];
  const publicOrgs = await listOrganizations({ fetchImpl }).catch(() => []);
  const resolved = resolveOrganizationMatch({
    companyName: fields.companyName,
    website: fields.website,
    selectedOrgId: fields.selectedOrgId || "",
    myOrgs,
    publicOrgs,
  });
  let organization = resolved.organization;
  if (resolved.create && fields.submittedByUserId) {
    try {
      organization = await saveMyOrganization({
        name: fields.companyName,
        website: fields.website || "",
        token,
        fetchImpl,
      });
    } catch {
      // The application is the record of the offer. An unpublished org is the
      // extra write; failing it must not swallow the application.
      organization = null;
    }
  }

  const posted = await postPartnerApplication({
    eventId: fields.eventId,
    eventTitle: fields.eventTitle,
    companyName: fields.companyName,
    contactName: fields.contactName,
    email: fields.email,
    phone: fields.phone,
    website: fields.website || "",
    message: fields.message || "",
    supportTypes: Array.isArray(fields.supportTypes) ? fields.supportTypes.slice(0, 5) : [],
    source: fields.source,
    organizationId: organization?.id || "",
  }, { fetchImpl });
  return {
    id: posted.id,
    reference: posted.reference || partnerReference(posted.id),
    organizationId: posted.organizationId || organization?.id || "",
  };
}

/** Admin GET /v1/admin/partner-applications, scoped to one event in the client.
 *  There is no /v1/admin/events/{id}/partner-applications route (404). */
export async function listPartnerApplicationsFor(eventId, { token, fetchImpl } = {}) {
  const rows = await listAdminPartnerApplications({
    token: await bearerToken({ token }),
    fetchImpl,
  });
  return rows.filter(a => a.eventId === eventId);
}

/** Every registration, for an administrator. NOT constrained by event, because
 *  the rows written before eventId existed cannot be found that way - they are
 *  matched with registrationMatchesEvent() and flagged rather than lost. */
export async function listAllRegistrations() {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const snap = await F.getDocs(F.collection(await db(), COL.registrations));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
