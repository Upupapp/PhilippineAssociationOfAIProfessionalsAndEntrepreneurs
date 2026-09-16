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
import { firebaseConfig, DATABASE_ID } from "/assets/js/paaipe-firebase.js";

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

const toDate = v =>
  v?.toDate ? v.toDate() : v instanceof Date ? v : Number.isFinite(v?.seconds) ? new Date(v.seconds * 1000) : null;

/* ------------------------------------------------------------------- reads */

export async function listEvents() {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const snap = await F.getDocs(F.collection(await db(), COL.events));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
}

/** One event by its slug. Returns null when there is none the caller may read -
 *  which is also what a draft looks like from outside, deliberately. */
export async function getEventBySlug(slug) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const q = F.query(F.collection(await db(), COL.events), F.where("slug", "==", String(slug || "")));
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
export async function listEventSponsors(eventId) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const q = F.query(F.collection(await db(), COL.sponsors), F.where("eventId", "==", eventId));
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
