/* PAAIPE admin — the event editor.
 *
 * The record every other surface reads. Change the title here and it changes on
 * the public event page; close registration here and the Register button goes,
 * because the button is derived from this status rather than written twice.
 *
 * TWO THINGS ARE DELIBERATELY AWKWARD, and both are load-bearing:
 *
 *   PUBLISHING IS A SEPARATE ACT from editing. A draft is unreadable to the
 *   public - not unlinked, unreadable - so saving a half-finished event cannot
 *   leak it. The status buttons are what change that, one explicit press each.
 *
 *   THE ZOOM LINK IS NOT A FIELD OF THE EVENT. It lives in its own document that
 *   no client may read, because Firestore rules cannot hide a single field. This
 *   editor can write it and can NEVER show it back: reading it here would put it
 *   in a page, and a page is the thing we are keeping it out of.
 */
import { currentAgent, isAdminNow, signOutNow } from "/assets/js/paaipe-firebase.js";
import {
  renderAdminNav, renderAdminTop, renderCrumbs, renderStateChip, setNavBadge,
} from "/assets/js/paaipe-admin.js";
import { firebaseConfig, DATABASE_ID } from "/assets/js/paaipe-firebase.js";
import {
  COL, EVENT_STATUS, PARTNER_STATUS, SPONSOR_STATUS, TIER, TIER_LIMITS,
  SUPPORT_TYPES, GALLERY_MAX, galleryOf, listEvents, listEventSponsors,
  listOrganizations, matchOrganization, registrationMatchesEvent, isUnlinked,
  listPartnerApplicationsFor, listAllRegistrations,
  registrationState, eventDateLong, groupSponsors,
} from "/assets/js/paaipe-events-data.js";

const SDK = "https://www.gstatic.com/firebasejs/12.19.0";
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let ME = "", EVENTS = [], CURRENT = null;

async function db() {
  const { initializeApp, getApps } = await import(`${SDK}/firebase-app.js`);
  const { getFirestore } = await import(`${SDK}/firebase-firestore.js`);
  const app = getApps().find(a => a.name === "paaipe") || initializeApp(firebaseConfig, "paaipe");
  return getFirestore(app, DATABASE_ID);
}

async function logActivity(action, details, eventId) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  try {
    await F.addDoc(F.collection(await db(), COL.log),
      { action, details, eventId, actor: ME, at: F.serverTimestamp() });
  } catch (e) { flash(`Saved, but the activity log was not written: ${e?.message || e}`); }
}

function flash(msg, good = false) {
  const el = $("[data-flash]");
  if (!el) return;
  el.textContent = msg; el.hidden = !msg;
  el.classList.toggle("ok", !!good);
}

/** What a visitor is told, computed from the record being edited - so the editor
 *  shows the consequence of a status rather than leaving it to be discovered on
 *  the live site. */
function consequence(ev) {
  if (ev.status === EVENT_STATUS.DRAFT)
    return "Not public. The rules refuse to serve a draft, so nobody outside can read it even with the link.";
  const st = registrationState(ev);
  return st.open
    ? "Public, and the Register button is live."
    : `Public. The Register button is replaced by “${st.label}”.`;
}

const STATUS_LABEL = {
  [EVENT_STATUS.DRAFT]:               "Draft — not public",
  [EVENT_STATUS.PUBLISHED]:           "Published — visible, registration not open",
  [EVENT_STATUS.REGISTRATION_OPEN]:   "Registration open",
  [EVENT_STATUS.REGISTRATION_CLOSED]: "Registration closed",
  [EVENT_STATUS.HELD]:                "Held",
  [EVENT_STATUS.CANCELLED]:           "Cancelled",
};

const PILL_FOR = {
  [EVENT_STATUS.DRAFT]: "warn", [EVENT_STATUS.PUBLISHED]: "info",
  [EVENT_STATUS.REGISTRATION_OPEN]: "ok", [EVENT_STATUS.REGISTRATION_CLOSED]: "info",
  [EVENT_STATUS.HELD]: "info", [EVENT_STATUS.CANCELLED]: "err",
};

/* The optional questions the registration form may ask. Name and email are not
 * here because they are never optional, and neither is consent - listing them as
 * togglable would imply PAAIPE could collect an email without asking for one.
 *
 * The KEY is the form field name. It has to match, because the public form reads
 * this list to decide what to render; a typo here silently drops a question. */
export const OPTIONAL_QUESTIONS = [
  ["position",         "Position or professional role"],
  ["organization",     "Company or organization"],
  ["profile",          "Which best describes you?"],
  ["learn",            "What would you most like to learn from this session?"],
  ["speaker_question", "What question would you like to ask our speaker?"],
  ["source",           "How did you hear about this event?"],
];

/** Rows of {time, item} or {name, role, ...}, edited as plain text - one per
 *  line. A repeater with add/remove buttons is more chrome than an association
 *  running one event a month needs, and this is far easier to paste into. */
const linesToRows = (text, keys) =>
  String(text || "").split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => {
      const parts = l.split("|").map(s => s.trim());
      return Object.fromEntries(keys.map((k, i) => [k, parts[i] || ""]));
    });

const rowsToLines = (rows, keys) =>
  (Array.isArray(rows) ? rows : []).map(r => keys.map(k => r?.[k] ?? "").join(" | ")).join("\n");

/* -------------------------------------------------------------------- list */

function renderList() {
  const body = $("[data-events]");
  if (!body) return;
  $("[data-event-count]").textContent =
    `${EVENTS.length} ${EVENTS.length === 1 ? "event" : "events"}`;
  body.innerHTML = EVENTS.length ? EVENTS.map(e => `
    <tr data-event="${esc(e.id)}"${CURRENT?.id === e.id ? ' class="on"' : ""}>
      <td><b>${esc(e.title || "(untitled)")}</b><small>${esc(e.slug || "—")}</small></td>
      <td class="num">${esc(eventDateLong(e) || e.date || "—")}</td>
      <td><span class="pill ${PILL_FOR[e.status] || "warn"}">${esc(STATUS_LABEL[e.status] || e.status || "—")}</span></td>
      <td class="act"><button class="btn btn-ghost btn-sm" data-edit-event>Edit</button></td>
    </tr>`).join("")
    : `<tr><td colspan="4" class="empty">No event exists yet. Run scripts/seed-events.mjs, or add one below.</td></tr>`;
}

/* ------------------------------------------------------------------ editor */

const field = (label, key, value, attrs = "", sub = "") =>
  `<div class="f"><label>${esc(label)}${sub ? ` <span class="sub">${esc(sub)}</span>` : ""}</label>
     <input data-e="${key}" value="${esc(value ?? "")}" ${attrs}></div>`;

const STATUS_CHIPS = [
  [EVENT_STATUS.DRAFT, "Draft"], [EVENT_STATUS.PUBLISHED, "Published"],
  [EVENT_STATUS.REGISTRATION_OPEN, "Registration open"],
  [EVENT_STATUS.REGISTRATION_CLOSED, "Closed"], [EVENT_STATUS.HELD, "Held"],
  [EVENT_STATUS.CANCELLED, "Cancelled"],
];

const TICK  = '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

/** What publishing actually does, and what the design says it does but cannot.
 *  The struck-through lines are kept rather than deleted: they answer "why isn't
 *  this doing that?" in the place the question gets asked. */
function publishList() {
  const yes = [
    "Serves this record on the public event page — title, sponsors and the Register button follow it",
    "Offers a calendar file generated from this record",
    "Opens registration at the date you set - checked when somebody loads the page, since nothing runs on a schedule",
  ];
  const no = [
    ["Creates the public event page and registration page",
     "paaipe.org is static — a new event needs its page added to the repository once"],
    ["Generates the banner images",
     "banners are set on the Media tab, not made at publish - and uploading needs a storage bucket this project does not have"],
    ["Adds the event to the portal Sessions list",
     "the portal still reads its own static data"],
  ];
  return `<ul class="plist">
    ${yes.map(s => `<li class="yes">${TICK}<span>${esc(s)}</span></li>`).join("")}
    ${no.map(([s, why]) => `<li class="no" title="${esc(why)}">${CROSS}<span><span class="sr">Does not: </span>${esc(s)}</span></li>`).join("")}
  </ul>`;
}

function renderRail(e) {
  const rail = $("[data-publish-rail]");
  if (!rail) return;
  rail.innerHTML = `
    <section class="card">
      <div class="hd"><h2>Publish</h2></div>
      <div class="chips">
        ${STATUS_CHIPS.map(([s, label]) => `<button class="chip${s === e.status ? " on" : ""}"
          data-status="${s}"${s === e.status ? " disabled" : ""}>${esc(label)}</button>`).join("")}
      </div>
      <div class="stack">
        <button class="btn btn-gold btn-block" data-save-event>Save changes</button>
        <a class="btn btn-ghost btn-block" href="${esc(e.slug || "#")}.html" target="_blank"
           rel="noopener">Preview public page</a>
        ${e.status === EVENT_STATUS.REGISTRATION_OPEN
          ? `<button class="btn btn-ghost btn-block" data-status="${EVENT_STATUS.REGISTRATION_CLOSED}">Close registration</button>`
          : `<button class="btn btn-ghost btn-block" data-status="${EVENT_STATUS.REGISTRATION_OPEN}">Open registration</button>`}
        ${e.status === EVENT_STATUS.DRAFT
          ? `<button class="btn btn-ghost btn-block" data-status="${EVENT_STATUS.PUBLISHED}">Publish</button>`
          : `<button class="btn btn-ghost btn-block" data-status="${EVENT_STATUS.DRAFT}">Unpublish</button>`}
        <button class="btn btn-ghost btn-block" data-ics>Download calendar file</button>
        <button class="btn btn-ghost btn-block" data-duplicate>Duplicate as a new event</button>
        <button class="btn btn-ghost btn-block" data-back>Back to all events</button>
      </div>
      <h3 class="ehead">What publishing does</h3>
      ${publishList()}
      <p class="note">The crossed-out lines are what the design promises and this stack cannot do.
        Hover each for the reason.</p>
    </section>

    <section class="card">
      <div class="hd"><h2>History</h2></div>
      <div data-history><p class="muted small">Loading…</p></div>
    </section>`;
}

const ROLES = ["Speaker", "Host", "Opening remarks", "Closing remarks"];

/** One speaker row. The avatar shows the stored photo, or the word "photo" when
 *  there is none - a blank circle looks like a failed image. */
function speakerRow(s = {}) {
  const img = s.photoUrl
    ? `<img class="avatar" src="${esc(s.photoUrl)}" alt="">`
    : `<span class="avatar ph">photo</span>`;
  return `<div class="row2" data-sp>
    ${img}
    <input data-sp-name  value="${esc(s.name || "")}"  placeholder="Speaker to be announced" maxlength="120">
    <input data-sp-title value="${esc(s.title || "")}" placeholder="Title, organization" maxlength="160">
    <select data-sp-role>${ROLES.map(r =>
      `<option${(s.role || "Speaker") === r ? " selected" : ""}>${r}</option>`).join("")}</select>
    <button type="button" class="xbtn" data-rm-sp title="Remove">×</button>
  </div>`;
}

function programRow(r = {}) {
  return `<div class="rowp" data-pr>
    <input data-pr-time value="${esc(r.time || "")}" placeholder="8:00 PM" maxlength="20">
    <input data-pr-item value="${esc(r.item || "")}" placeholder="What happens" maxlength="200">
    <button type="button" class="xbtn" data-rm-pr title="Remove">×</button>
  </div>`;
}

/** The sponsor summary. Read-only here: tiers, order and logos are edited on the
 *  Organizations & sponsors page, and two screens that both write the same rows
 *  are two screens that can disagree. The proposed count is shown but the names
 *  are not - saying WHO is only proposed would leak the conversation. */

function sponsorSummary(rows) {
  const live = rows.filter(r => ["confirmed", "delivered"].includes(r.status) && r.organization);
  const proposed = rows.filter(r => r.status === "proposed").length;
  const broken = rows.filter(r =>
    ["confirmed", "delivered"].includes(r.status) && !r.organization).length;
  if (!live.length && !proposed && !broken)
    return `<p class="note" style="margin-top:0">No sponsor has been added to this event.</p>`;
  return `<div class="sponrow">
    ${live.map(r => `<span class="sponchip">
        ${r.organization.logoUrl
          ? `<img src="${esc(r.organization.logoUrl)}" alt="${esc(r.organization.name)}">`
          : `<span class="sponname">${esc(r.organization.name)}</span>`}
        <span class="tierpill tier-${esc(r.tier)}">${esc(String(r.tier).toUpperCase())}</span>
      </span>`).join("")}
    ${proposed ? `<span class="hiddenpill">${proposed} proposed (hidden)</span>` : ""}
    ${broken ? `<span class="brokenpill">${broken} confirmed with missing organization</span>` : ""}
  </div>`;
}


function openEditor(id) {
  // Per-event caches. Without this, opening October after September shows
  // September's sponsors under October's name until the fetch returns - the
  // worst kind of wrong, because it looks like data.
  if (CURRENT && CURRENT.id !== id) { SPONSORS = []; APPS = []; REGS = []; }
  CURRENT = EVENTS.find(e => e.id === id) || null;
  const cols = $("[data-editor-cols]");
  const d = $("[data-event-editor]");
  if (!CURRENT) { if (cols) cols.hidden = true; return; }
  const e = CURRENT;
  cols.hidden = false;
  $("[data-event-list]").hidden = true;

  renderAdminTop({ title: "Edit event", subtitle: e.title || "(untitled)", email: ME });
  renderCrumbs([["Events", "admin-events.html"], e.title || "(untitled)", "Edit"]);
  const st = registrationState(e);
  renderStateChip(
    e.status === EVENT_STATUS.DRAFT
      ? `Draft · ${consequence(e)}`
      : `${STATUS_LABEL[e.status]} · ${consequence(e)}`,
    e.status === EVENT_STATUS.DRAFT ? "warn"
      : e.status === EVENT_STATUS.CANCELLED ? "err"
      : st.open ? "ok" : "info");

  const speakers = Array.isArray(e.speakers) && e.speakers.length ? e.speakers : [{}];
  const program  = Array.isArray(e.program)  && e.program.length  ? e.program  : [{}];

  d.innerHTML = `
    <section class="card">
      <div class="hd"><h2>Basics</h2></div>
      ${field("Title", "title", e.title, 'maxlength="200"')}
      ${field("Page address (slug)", "slug", e.slug, 'maxlength="80"', "lower-case, hyphens")}
      <div class="frow">
        ${field("Series", "series", e.series, 'maxlength="80"')}
        <div class="f"><label>Format</label><select data-e="format">
          ${[["zoom","Online · Zoom"],["in_person","In person"],["hybrid","Hybrid"]]
            .map(([v,l]) => `<option value="${v}"${e.format === v ? " selected" : ""}>${l}</option>`).join("")}
        </select></div>
      </div>
      <div class="frow">
        ${field("Date", "date", e.date, 'type="date"')}
        <div class="f"><label>Time (PHT)</label><div class="frow">
          <input data-e="startTime" type="time" value="${esc(e.startTime || "")}">
          <input data-e="endTime" type="time" value="${esc(e.endTime || "")}"></div></div>
      </div>
      <div class="frow">
        <div class="f"><label>Zoom link <span class="sub">(sent only to registrants)</span></label>
          <input data-zoom placeholder="${e.hasZoom ? "https://zoom.us/j/•••••••••" : "https://…"}" maxlength="500"></div>
        ${field("Capacity", "capacity", e.capacity ?? "", 'type="number" min="1"', "blank = no limit")}
      </div>
      <p class="note"><b>The link is stored separately and never shown back.</b> It lives in a record no
        client may read, because rules cannot hide one field of a document — so this box can write it
        and cannot display it. The dots mean one is stored. <b>Nothing sends it to registrants yet</b>:
        that needs a mail sender.</p>
    </section>

    <section class="card">
      <div class="hd"><h2>Content</h2>
        <span class="hint">Shown on the public event page and the registration page</span></div>
      ${field("Topic", "topic", e.topic, 'maxlength="160" placeholder="Topic to be announced"')}
      <div class="f"><label>Description</label>
        <textarea data-e="description" rows="3" maxlength="1200">${esc(e.description || "")}</textarea></div>
      <div class="f"><label>What to expect <span class="sub">one per line</span></label>
        <textarea data-e="whatToExpect" rows="3">${esc((e.whatToExpect || []).join("\n"))}</textarea></div>

      <h3 class="ehead">Speakers and program team</h3>
      <div class="rep" data-speakers>${speakers.map(speakerRow).join("")}</div>
      <button type="button" class="btn btn-ghost btn-sm addrow" data-add-sp>+ Add person</button>
      <p class="note"><b>Type a name, or paste an Agent's photo path.</b> The design offers an Agent
        picker that fills the photo and title in; that is not wired, so this takes the values directly
        rather than pretending to look anybody up.</p>

      <h3 class="ehead">Program</h3>
      <div class="rep" data-program>${program.map(programRow).join("")}</div>
      <button type="button" class="btn btn-ghost btn-sm addrow" data-add-pr>+ Add row</button>

      <p class="note">Sponsors, partner applications, registrations and the event's pictures each
        have their own tab above. They are this event's data and they are edited here, not on a
        cross-event page that happens to be filtered to it.</p>
    </section>`;

  $('[data-tabpanel="settings"]').innerHTML = `<section class="card">
      <div class="hd"><h2>Registration settings</h2></div>
      <div class="frow">
        ${field("Opens", "registrationOpensAt", e.registrationOpensAt || "", 'type="datetime-local"')}
        ${field("Closes", "registrationClosesAt", e.registrationClosesAt || "", 'type="datetime-local"')}
      </div>
      <div class="frow">
        <div class="f"><label>Who can register</label><select data-e="whoCanRegister">
          ${[["members_and_guests","Members and guests"],["members_only","Members only"]]
            .map(([v,l]) => `<option value="${v}"${e.whoCanRegister === v ? " selected" : ""}>${l}</option>`).join("")}
        </select></div>
        <div class="f"><label>Waitlist when full</label><select data-e="waitlistEnabled">
          <option value="off"${e.waitlistEnabled !== true ? " selected" : ""}>Off</option>
          <option value="on"${e.waitlistEnabled === true ? " selected" : ""}>On</option>
        </select></div>
      </div>

      <h3 class="ehead">Questions to ask</h3>
      <div class="qlist">
        <label class="fixed"><input type="checkbox" checked disabled> Full name, email — always asked</label>
        ${OPTIONAL_QUESTIONS.map(([k, label]) => `<label><input type="checkbox" data-q="${k}"
          ${(e.questionsEnabled || []).includes(k) ? "checked" : ""}> ${esc(label)}</label>`).join("")}
        <label class="fixed"><input type="checkbox" checked disabled> Updates opt-in · Zoom consent — always asked</label>
      </div>
      <p class="note">The greyed rows are not optional, so they are not offered as choices. The public
        form renders exactly the ticked list — unticking one removes the question; it does not delete
        answers people have already given.</p>

      <h3 class="ehead">Confirmation email</h3>
      <div class="f"><textarea data-e="confirmationEmailText" rows="3" maxlength="2000"
        placeholder="You're registered for the PAAIPE AI Exchange…">${esc(e.confirmationEmailText || "")}</textarea></div>
      <p class="note"><b>Stored, not sent.</b> PAAIPE has no mail sender wired, so nothing goes out when
        somebody registers. Keeping the wording here means it is decided once.</p>
    </section>`;


  d.dataset.event = id;
  renderRail(e);
  renderMediaTab(e);
  renderTabs();
  selectTab(tabFromHash() || "details", { push: false });
  loadTabCounts(id);
  loadHistory(id);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ===================================================================== tabs
 *
 * One event, one workspace. Each tab is a panel that is already in the page;
 * switching shows one and hides the others, so nothing is re-fetched to go back
 * and forth and - the part that matters - EVERY FIELD STAYS IN THE DOM. Save
 * reads the whole workspace, not the visible tab, so a change made on Settings
 * is not lost by clicking Details before pressing Save.
 *
 * The tab lives in the hash, so a link to a particular tab of a particular event
 * is a link somebody can send.
 */
const TABS = [
  ["details",       "Details",       null],
  ["media",         "Media",         null],
  ["sponsors",      "Sponsors",      "sponsors"],
  ["applications",  "Applications",  "applications"],
  ["registrations", "Registrations", "registrations"],
  ["settings",      "Settings",      null],
];
const TAB_COUNTS = { sponsors: null, applications: null, registrations: null };
/* Applications is the only count that means "somebody is waiting for a reply",
 * so it is the only one drawn as hot. The others are just how many there are. */
const HOT = new Set(["applications"]);
let TAB = "details";
const LOADED = new Set();

const panel = k => $(`[data-tabpanel="${k}"]`);

function tabFromHash() {
  const m = /[#&]tab=([a-z]+)/.exec(location.hash || "");
  return m && TABS.some(([k]) => k === m[1]) ? m[1] : null;
}

function renderTabs() {
  const host = $("[data-event-tabs]");
  if (!host) return;
  host.innerHTML = TABS.map(([key, label, countKey]) => {
    const n = countKey ? TAB_COUNTS[countKey] : null;
    // null is "not counted yet", and must not render as a zero badge - "no
    // applications" and "we have not looked" are different facts.
    const badge = n === null || n === undefined || n === 0 ? ""
      : `<span class="tb${HOT.has(key) ? " hot" : ""}">${n}</span>`;
    return `<button type="button" role="tab" data-tab="${key}"
      aria-selected="${key === TAB ? "true" : "false"}">${esc(label)}${badge}</button>`;
  }).join("");
}

function setTabCount(key, n) {
  TAB_COUNTS[key] = n;
  renderTabs();
}

function selectTab(key, { push = true } = {}) {
  if (!TABS.some(([k]) => k === key)) key = "details";
  TAB = key;
  TABS.forEach(([k]) => { const el = panel(k); if (el) el.hidden = k !== key; });
  renderTabs();
  if (push && CURRENT) {
    const h = `#event=${encodeURIComponent(CURRENT.id)}&tab=${key}`;
    if (location.hash !== h) history.replaceState(null, "", h);
  }
  loadTab(key);
}

/* Each tab fetches once, the first time it is opened. Loading all six up front
 * would make opening an event five requests slower for the five tabs nobody
 * looked at. */
function loadTab(key) {
  if (!CURRENT) return;
  const id = CURRENT.id;
  const once = k => { const t = `${id}:${k}`; if (LOADED.has(t)) return false; LOADED.add(t); return true; };
  if (key === "sponsors"      && once("sponsors"))      loadSponsorsTab(id);
  if (key === "applications"  && once("applications"))  loadApplicationsTab(id);
  if (key === "registrations" && once("registrations")) loadRegistrationsTab(id);
}

/** The counts the tab strip shows, fetched when an event opens rather than when
 *  its tab is first clicked - a badge that only appears after you click the tab
 *  is a badge that never told you anything. */
async function loadTabCounts(id) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const database = await db();
  const countOf = async (col, ...clauses) => {
    try {
      return (await F.getCountFromServer(F.query(F.collection(database, col), ...clauses))).data().count;
    } catch { return null; }   // null renders as no badge, never as zero
  };
  setTabCount("sponsors", await countOf(COL.sponsors, F.where("eventId", "==", id)));
  setTabCount("applications", await countOf(COL.partners,
    F.where("eventId", "==", id), F.where("status", "==", PARTNER_STATUS.NEW)));
  setTabCount("registrations", await countOf(COL.registrations, F.where("event_id", "==", id)));
}

/* Who has offered to support THIS event, and how many are still unanswered.
 *
 * A count and a link, not a second inbox. Two screens that both list and act on
 * the same rows are two screens that can disagree about what was done, so the
 * work happens on admin-partners.html and this says what is waiting there.
 *
 * Counted with count queries: the editor has no business holding applicants'
 * contact details in memory to render a number.
 */
async function loadPartnerSummary(eventId) {
  const host = $("[data-partner-summary]");
  if (!host) return;
  const link = `admin-partners.html?event=${encodeURIComponent(eventId)}`;
  try {
    const F = await import(`${SDK}/firebase-firestore.js`);
    const col = F.collection(await db(), COL.partners);
    const countOf = async (...clauses) =>
      (await F.getCountFromServer(F.query(col, ...clauses))).data().count;
    const [total, fresh] = await Promise.all([
      countOf(F.where("eventId", "==", eventId)),
      countOf(F.where("eventId", "==", eventId), F.where("status", "==", PARTNER_STATUS.NEW)),
    ]);
    host.innerHTML = total === 0
      ? `<p class="note" style="margin-top:0">No company has applied to partner on this event.
           The button is on the public event page, the events list, the page people see after
           registering, and in the member portal.</p>`
      : `<div class="chips"><span class="chip">${total} application${total === 1 ? "" : "s"}</span>
           ${fresh ? `<span class="chip on">${fresh} waiting for a reply</span>` : ""}</div>
         <p class="note" style="margin-top:0"><a href="${esc(link)}">Open them on Partner
           applications</a> — that is where they are read, replied to and accepted.</p>`;
  } catch (ex) {
    // A count that could not be taken must not render as zero.
    host.innerHTML = `<p class="note" style="margin-top:0">Partner applications could not be
      counted: ${esc(ex?.message || ex)}. This is not a count of zero —
      <a href="${esc(link)}">open them</a> to see.</p>`;
  }
}

async function loadSponsorSummary(eventId) {
  const host = $("[data-sponsor-summary]");
  if (!host) return;
  try { host.innerHTML = sponsorSummary(await listEventSponsors(eventId, { asAdmin: true })); }
  catch (ex) { host.innerHTML = `<p class="note" style="margin-top:0">Sponsors could not be read: ${esc(ex?.message || ex)}</p>`; }
}

function readForm() {
  // The whole workspace, not the visible tab. Settings, Media and Details each
  // own some of the record, and a change made on one tab must survive clicking
  // another before Save - which it does, because every panel stays in the DOM.
  const d = $("[data-editor-cols]") || $("[data-event-editor]");
  const val = k => $(`[data-e="${k}"]`, d)?.value?.trim() ?? "";
  const patch = {
    title: val("title"), slug: val("slug"), series: val("series"),
    topic: val("topic"), description: val("description"),
    date: val("date"), startTime: val("startTime"), endTime: val("endTime"),
    registrationOpensAt: val("registrationOpensAt") || null,
    registrationClosesAt: val("registrationClosesAt") || null,
    format: $('[data-e="format"]', d)?.value || "zoom",
    waitlistEnabled: $('[data-e="waitlistEnabled"]', d)?.value === "on",
  };
  const cap = val("capacity");
  patch.capacity = cap === "" ? null : Number(cap);
  patch.whatToExpect = String(val("whatToExpect")).split("\n").map(s => s.trim()).filter(Boolean);
  patch.whoCanRegister = $('[data-e="whoCanRegister"]', d)?.value || "members_and_guests";
  patch.speakers = $$("[data-sp]", d).map(r => ({
    name:  $("[data-sp-name]",  r).value.trim(),
    title: $("[data-sp-title]", r).value.trim(),
    role:  $("[data-sp-role]",  r).value,
    photoUrl: r.querySelector("img.avatar")?.getAttribute("src") || "",
  })).filter(s => s.name);
  patch.program = $$("[data-pr]", d).map(r => ({
    time: $("[data-pr-time]", r).value.trim(),
    item: $("[data-pr-item]", r).value.trim(),
  })).filter(x => x.time || x.item);
  patch.confirmationEmailText = val("confirmationEmailText");
  for (const k of ["bannerSquareUrl", "bannerWideUrl", "coverUrl"]) patch[k] = val(k);
  patch.gallery = $$("[data-ph]", d).map((c, i) => ({
    url:     c.dataset.phUrl || c.querySelector("img")?.getAttribute("src") || "",
    thumbUrl: c.dataset.phThumb || "",
    alt:     $("[data-ph-alt]", c).value.trim(),
    caption: $("[data-ph-cap]", c).value.trim(),
    order:   i,
  })).filter(g => g.url);
  patch.questionsEnabled = $$("[data-q]", d).filter(c => c.checked).map(c => c.dataset.q);
  return patch;
}

async function writeEvent(id, patch, action, details) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  await F.setDoc(F.doc(await db(), COL.events, id), patch, { merge: true });
  Object.assign(EVENTS.find(e => e.id === id), patch);
  await logActivity(action, details, id);
}

async function saveEvent(id) {
  const d = $("[data-event-editor]");
  const patch = readForm();
  if (!patch.title)  return flash("An event needs a title.");
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(patch.slug))
    return flash("The slug must be lower-case letters, numbers and hyphens — it is part of the page address.");
  if (patch.capacity !== null && !(patch.capacity > 0))
    return flash("Capacity must be a positive number, or blank for no limit.");

  $$("button", d).forEach(b => b.disabled = true);
  try {
    await writeEvent(id, patch, "event.update", patch.title);

    // the Zoom link, if one was typed, into its own document
    const zoom = $("[data-zoom]", d)?.value?.trim();
    if (zoom) {
      const F = await import(`${SDK}/firebase-firestore.js`);
      await F.setDoc(F.doc(await db(), "paaipe_event_private", id),
        { zoomLink: zoom, updatedBy: ME }, { merge: true });
      EVENTS.find(e => e.id === id).hasZoom = true;
      await logActivity("event.zoom_link_set", "(the link itself is not logged)", id);
    }
    openEditor(id);
    flash("Saved. The public page reads this record, so it is already showing the change.", true);
  } catch (ex) {
    $$("button", d).forEach(b => b.disabled = false);
    flash(ex?.code === "permission-denied"
      ? "The rules refused that change. Check the title, slug and status."
      : `Could not save: ${ex?.message || ex}`);
  }
}

async function setStatus(id, status) {
  const ev = EVENTS.find(e => e.id === id);
  if (!ev) return;
  const d = $("[data-event-editor]");
  $$("button", d).forEach(b => b.disabled = true);
  try {
    await writeEvent(id, { status }, "event.status", `${ev.title}: ${status}`);
    openEditor(id);
    flash(status === EVENT_STATUS.DRAFT
      ? "Unpublished. The public page can no longer read this event."
      : `Saved. ${consequence(EVENTS.find(e => e.id === id))}`, true);
  } catch (ex) {
    $$("button", d).forEach(b => b.disabled = false);
    flash(ex?.code === "permission-denied" ? "The rules refused that change." : `Could not save: ${ex?.message || ex}`);
  }
}

/** The event's own history, from the append-only log. Read at open time rather
 *  than kept in memory, so it shows what actually landed. */
async function loadHistory(eventId) {
  const host = $("[data-history]");
  if (!host) return;
  try {
    const F = await import(`${SDK}/firebase-firestore.js`);
    const q = F.query(F.collection(await db(), COL.log), F.where("eventId", "==", eventId));
    const rows = (await F.getDocs(q)).docs.map(d => d.data())
      .sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0));
    host.innerHTML = rows.length
      ? `<ul class="hist">${rows.slice(0, 20).map(r => {
          const when = r.at?.toDate ? r.at.toDate().toLocaleString("en-PH",
            { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";
          return `<li><b>${esc(r.action || "")}</b> ${esc(r.details || "")}
            <span class="muted">${esc(when)} · ${esc(r.actor || "")}</span></li>`;
        }).join("")}</ul>`
      : `<p class="muted small">Nothing has been changed through this console yet. The seed wrote
         these records directly, and the log only records what the console does.</p>`;
  } catch (ex) {
    host.innerHTML = `<p class="muted small">The history could not be read: ${esc(ex?.message || ex)}</p>`;
  }
}

/** A calendar file built from THIS record, so it cannot drift from the event.
 *  The .ics files in the repository are hand-written and already disagree with
 *  nothing only because nobody has moved an event yet. */
function icsFor(ev) {
  const pad = n => String(n).padStart(2, "0");
  // Asia/Manila is UTC+8 all year - the Philippines has no daylight saving - so
  // the conversion is a subtraction rather than a timezone database.
  const stamp = (date, time) => {
    const [Y, M, D] = String(date || "").split("-").map(Number);
    const [h, m]    = String(time || "00:00").split(":").map(Number);
    if (!Y || !M || !D) return null;
    const utc = new Date(Date.UTC(Y, M - 1, D, h - 8, m));
    return `${utc.getUTCFullYear()}${pad(utc.getUTCMonth() + 1)}${pad(utc.getUTCDate())}T${pad(utc.getUTCHours())}${pad(utc.getUTCMinutes())}00Z`;
  };
  const start = stamp(ev.date, ev.startTime), end = stamp(ev.date, ev.endTime);
  if (!start) return null;
  const fold = s => String(s).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PAAIPE//Events//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${ev.id}@paaipe.org`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "")}`,
    `DTSTART:${start}`, end ? `DTEND:${end}` : "",
    `SUMMARY:${fold(ev.title || "PAAIPE event")}`,
    `DESCRIPTION:${fold(ev.description || "")}`,
    "LOCATION:Online", "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n") + "\r\n";
}

function downloadIcs(ev) {
  const ics = icsFor(ev);
  if (!ics) return flash("This event needs a date before a calendar file can be made.");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${ev.slug || ev.id}.ics` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Duplicate an event as a DRAFT. Never as anything else: a copy that arrived
 *  published would announce an event with last month's details still in it. */
async function duplicateEvent(id) {
  const src = EVENTS.find(e => e.id === id);
  if (!src) return;
  const suggested = `${(src.id || "").replace(/^\d{4}-\d{2}-/, "")}-copy`;
  const newId = prompt(
    "Id for the new event (lower-case, letters, numbers and hyphens).\n\n" +
    "It also needs an HTML page in the repository before the public can see it — " +
    "publishing cannot create one on a static site.", suggested);
  if (!newId) return;
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(newId)) return flash("That id is not a valid slug.");
  if (EVENTS.some(e => e.id === newId)) return flash("An event with that id already exists.");

  const copy = { ...src };
  delete copy.id;
  Object.assign(copy, {
    slug: newId, status: EVENT_STATUS.DRAFT,
    title: `${src.title} (copy)`,
    registrationOpensAt: null, registrationClosesAt: null,
  });
  try {
    const F = await import(`${SDK}/firebase-firestore.js`);
    await F.setDoc(F.doc(await db(), COL.events, newId), copy);
    await logActivity("event.duplicate", `from ${src.title}`, newId);
    EVENTS.push({ id: newId, ...copy });
    EVENTS.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    openEditor(newId);
    flash("Duplicated as a DRAFT — not public until you publish it, and it needs its own page first.", true);
  } catch (ex) {
    flash(ex?.code === "permission-denied" ? "The rules refused that." : `Could not duplicate: ${ex?.message || ex}`);
  }
}

/* --------------------------------------------------------------------- boot */

(async function () {
  if (!$("[data-admin-events]")) return;
  renderAdminNav("admin-events.html");

  let me = null;
  try { me = await currentAgent(); } catch { me = null; }
  if (!me) { location.replace("admin.html"); return; }
  let ok = false;
  try { ok = await isAdminNow(); }
  catch { flash("PAAIPE could not be reached. Nothing is shown rather than an empty list.");
          // and the table must not sit on "Loading…" for ever, which reads as
          // "still working on it" when nothing is working on it
          { const b = $("[data-events]"); if (b) b.innerHTML =
              `<tr><td colspan="5" class="empty">Events could not be loaded. This is not "no events".</td></tr>`; }
          document.documentElement.setAttribute("data-admin-events", "offline"); return; }
  if (!ok) { await signOutNow().catch(() => {}); location.replace("admin.html?denied=1"); return; }

  ME = me.email;
  renderAdminTop({ title: "Events", subtitle: "Every AI Exchange, and what the public sees of it",
                   email: me.email });
  renderCrumbs([["Dashboard", "admin.html"], "Events"]);
  document.addEventListener("click", e => {
    if (e.target.closest("[data-admin-signout]")) {
      e.preventDefault(); signOutNow().catch(() => {}).then(() => location.replace("admin.html"));
    }
  });

  try {
    // asAdmin: the console is the one caller that must see drafts
    EVENTS = await listEvents({ asAdmin: true });
    // Whether a Zoom link EXISTS, so the field can show a masked placeholder.
    // The value itself is never kept or rendered - knowing one is stored is a
    // different fact from knowing what it is.
    const F = await import(`${SDK}/firebase-firestore.js`);
    await Promise.all(EVENTS.map(async ev => {
      try {
        const s = await F.getDoc(F.doc(await db(), "paaipe_event_private", ev.id));
        ev.hasZoom = s.exists() && Boolean(s.data()?.zoomLink);
      } catch { ev.hasZoom = false; }
    }));
  } catch (ex) {
    flash(`Could not load events: ${ex?.message || ex}`);
    document.documentElement.setAttribute("data-admin-events", "error");
    return;
  }
  renderList();

  document.addEventListener("click", e => {
    const ed = e.target.closest("[data-edit-event]");
    if (ed) return openEditor(ed.closest("tr").dataset.event);
    if (e.target.closest("[data-add-sp]")) {
      $("[data-speakers]").insertAdjacentHTML("beforeend", speakerRow()); return;
    }
    if (e.target.closest("[data-add-pr]")) {
      $("[data-program]").insertAdjacentHTML("beforeend", programRow()); return;
    }
    const rs = e.target.closest("[data-rm-sp]");
    if (rs) { rs.closest("[data-sp]").remove(); return; }
    const rp = e.target.closest("[data-rm-pr]");
    if (rp) { rp.closest("[data-pr]").remove(); return; }
    // ---- tab strip
    const tab = e.target.closest("[data-tab]");
    if (tab) { selectTab(tab.dataset.tab); return; }

    // ---- media: gallery rows
    if (e.target.closest("[data-ph-add]")) return addPhotoByUrl();
    const phUp = e.target.closest("[data-ph-up]"), phDn = e.target.closest("[data-ph-dn]");
    const phRm = e.target.closest("[data-ph-rm]");
    if (phUp || phDn || phRm) {
      const card = (phUp || phDn || phRm).closest("[data-ph]");
      const wrap = $("[data-gallery]");
      if (phRm) card.remove();
      else if (phUp && card.previousElementSibling) wrap.insertBefore(card, card.previousElementSibling);
      else if (phDn && card.nextElementSibling) wrap.insertBefore(card.nextElementSibling, card);
      renumberGallery();
      return;
    }

    // ---- sponsors
    if (e.target.closest("[data-new-org-toggle]")) {
      const box = $("[data-new-org]"); if (box) box.hidden = !box.hidden; return;
    }
    if (e.target.closest("[data-add-sponsor]"))  return addExistingSponsor();
    if (e.target.closest("[data-create-org]"))   return createOrgAndSponsor();
    const spSave = e.target.closest("[data-sp-save]");
    if (spSave) return saveSponsorRow(spSave.closest("[data-sp-row]").dataset.spRow);
    const spDel = e.target.closest("[data-sp-del]");
    if (spDel) return removeSponsorRow(spDel.closest("[data-sp-row]").dataset.spRow);

    // ---- registrations
    const linkReg = e.target.closest("[data-link-reg]");
    if (linkReg) return linkRegistration(linkReg.dataset.linkReg);
    if (e.target.closest("[data-reg-csv]")) return exportEventRegistrations();

    if (e.target.closest("[data-back]")) {
      $("[data-editor-cols]").hidden = true;
      $("[data-event-list]").hidden = false;
      CURRENT = null; renderList();
      renderAdminTop({ title: "Events", subtitle: "Every AI Exchange, and what the public sees of it", email: ME });
      renderCrumbs([["Dashboard", "admin.html"], "Events"]);
      const chip = $("[data-state-chip]"); if (chip) chip.hidden = true;
      return;
    }
    if (e.target.closest("[data-save-event]")) return saveEvent($("[data-event-editor]").dataset.event);
    const st = e.target.closest("[data-status]");
    if (st) return setStatus($("[data-event-editor]").dataset.event, st.dataset.status);
    if (e.target.closest("[data-ics]"))
      return downloadIcs(EVENTS.find(x => x.id === $("[data-event-editor]").dataset.event));
    if (e.target.closest("[data-duplicate]"))
      return duplicateEvent($("[data-event-editor]").dataset.event);
  });

  document.documentElement.setAttribute("data-admin-events", String(EVENTS.length));
})();

/* =========================================================== the MEDIA tab
 *
 * WHAT IS BUILT AND WHAT IS NOT, and the difference is a fact about the
 * project, not a decision taken here.
 *
 * The brief asks for banner upload with generated 1080x1080 and 1600x900
 * variants, and up to five photos resized client-side. Every part of that is
 * written and works - the cropping, the resizing, the gallery model, the public
 * rendering - EXCEPT the one step that puts bytes somewhere a browser can fetch
 * them from.
 *
 * There is no bucket. Measured, not assumed:
 *   GET https://storage.googleapis.com/storage/v1/b/postflowit-autos.firebasestorage.app
 *   -> 404 "The specified bucket does not exist."
 * `storageBucket` is in firebaseConfig because Firebase writes that string by
 * default, not because Storage was ever turned on.
 *
 * So this tab checks for the bucket at runtime and, when it is missing, says
 * exactly what is needed instead of offering a file input that would throw on
 * pick. The URL fields stay editable, because a URL is all the public page ever
 * reads - anything that can host an image can fill them today.
 */
const BUCKET = (firebaseConfig.storageBucket || "").trim();
let STORAGE_OK = null;   // null = not yet checked

async function storageAvailable() {
  if (STORAGE_OK !== null) return STORAGE_OK;
  if (!BUCKET) return (STORAGE_OK = false);
  try {
    const r = await fetch(`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?maxResults=1`);
    // 404 = no such bucket. 401/403 = a bucket that exists and is protected,
    // which is exactly what a working private bucket looks like from here.
    STORAGE_OK = r.status !== 404;
  } catch { STORAGE_OK = false; }
  return STORAGE_OK;
}

const imgBox = (cls, label, dim, url) => `
  <div class="mbox ${cls}">
    <h4>${esc(label)}</h4><span class="dim">${esc(dim)}</span>
    <div class="ph">${url ? `<img src="${esc(url)}" alt="">` : "no image yet"}</div>
  </div>`;

function galleryCard(g, i, total) {
  return `<div class="gcard" data-ph="${i}">
    <div class="im">${g.url ? `<img src="${esc(g.url)}" alt="${esc(g.alt || "")}">` : ""}</div>
    <div class="gb">
      <input data-ph-alt value="${esc(g.alt || "")}" maxlength="120"
             placeholder="Alt text (required)" aria-label="Alt text">
      <input data-ph-cap value="${esc(g.caption || "")}" maxlength="120"
             placeholder="Caption (optional)" aria-label="Caption">
      <div class="grow2">
        <button type="button" class="btn btn-ghost btn-sm" data-ph-up ${i === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="btn btn-ghost btn-sm" data-ph-dn ${i === total - 1 ? "disabled" : ""}>↓</button>
        <span class="grow"></span>
        <button type="button" class="xbtn" data-ph-rm title="Remove">×</button>
      </div>
    </div>
  </div>`;
}

function renderMediaTab(e) {
  const host = panel("media");
  if (!host) return;
  const g = galleryOf(e);
  host.innerHTML = `
    <section class="card">
      <div class="hd"><h2>Banner</h2>
        <span class="hint">Square is the share card; wide is the page header</span></div>
      <div class="mgrid">
        ${imgBox("sq", "Square", "1080 × 1080 · og:image", e.bannerSquareUrl)}
        ${imgBox("wide", "Wide", "1600 × 900 · page header and list card", e.bannerWideUrl)}
      </div>
      <div data-media-upload></div>
      ${field("Square banner URL", "bannerSquareUrl", e.bannerSquareUrl, 'maxlength="300"')}
      ${field("Wide banner URL", "bannerWideUrl", e.bannerWideUrl, 'maxlength="300"')}
      ${field("Cover URL", "coverUrl", e.coverUrl, 'maxlength="300"',
              "top of the public event and registration pages; falls back to the wide banner")}
      <p class="note">These are what the public pages read. A URL is a URL — the repository, a
        bucket or a CDN all work, so these fields are useful with or without an uploader.</p>
      <h3 class="ehead">The share card</h3>
      <div class="helpbox">
        <p class="note" style="margin:0"><b>The square banner is not the share card yet, and this
          screen cannot make it one.</b> <code>og:image</code> is read by crawlers — Facebook,
          LinkedIn, Messenger — and they do not run JavaScript, so a value written from here would
          change nothing a sharer ever sees while looking, in a browser, exactly as though it had
          worked. It has to be in the page's HTML. Paste this into
          <code>${esc(e.slug || "the event page")}.html</code> and deploy:</p>
        <p class="note" style="margin:8px 0 0"><code>&lt;meta property="og:image"
          content="https://paaipe.org/${esc(e.bannerSquareUrl || "assets/img/…")}"&gt;</code></p>
      </div>
    </section>

    <section class="card">
      <div class="hd"><h2>Photos</h2>
        <span class="count gcount"><b data-ph-count>${g.length}</b> of ${GALLERY_MAX}</span></div>
      <div class="gal" data-gallery>${g.map((x, i) => galleryCard(x, i, g.length)).join("")}</div>
      ${g.length ? "" : `<p class="note" style="margin-top:0">No photos yet. The public page hides the
        Photos section entirely when there are none — an empty gallery is not a thing to show.</p>`}
      <div class="dacts" style="margin-top:12px">
        <button type="button" class="btn btn-ghost btn-sm" data-ph-add>+ Add a photo by URL</button>
      </div>
      <p class="note"><b>Alt text is required, and that is not bureaucracy.</b> A photo nobody using a
        screen reader can identify is not published, it is just present — so a photo without it is
        left out of the public gallery rather than shown with an empty label.</p>
    </section>`;
  paintUploadBox();
}

/** The upload control is drawn only once we know whether it can work. */
async function paintUploadBox() {
  const host = $("[data-media-upload]");
  if (!host) return;
  if (await storageAvailable()) {
    host.innerHTML = `
      <div class="f"><label>Upload a banner source image</label>
        <input type="file" data-banner-file accept="image/png,image/jpeg,image/webp">
        <p class="note" style="margin-top:6px">PNG, JPG or WebP, up to 5 MB. The square and wide
          variants are generated in your browser on upload — centre-cropped — so publishing does not
          have to do it later.</p></div>`;
    return;
  }
  host.innerHTML = `
    <div class="flash" style="position:static;margin:0 0 14px">
      <b>There is no upload box, because this project has no storage bucket.</b>
      Checked just now — <code>${esc(BUCKET || "no bucket configured")}</code> returns
      “The specified bucket does not exist”. <code>storageBucket</code> is in the Firebase config
      because Firebase writes that string by default, not because Storage was ever switched on.
    </div>
    <div class="helpbox" style="margin:0 0 14px">
      <b>How to set a picture today</b>
      <ol class="note" style="margin:8px 0 0;padding-left:20px;line-height:1.8">
        <li>Put the file in the repository under <code>assets/img/</code> — that is where every
            picture on paaipe.org lives now.</li>
        <li>Paste its path below, exactly as <code>assets/img/your-file.png</code>.</li>
        <li>Save here, then deploy the repository once. The path is stored in the event record, so
            changing which picture an event uses afterwards needs no deploy at all — only adding a
            new file does.</li>
      </ol>
    </div>`;
}

/* ======================================================== the SPONSORS tab
 *
 * This event's sponsorships, edited here. Tier, status, order, contribution and
 * the deliverables checklist, plus adding one - either an organization PAAIPE
 * already knows or a new one created inline.
 *
 * REMOVING HERE REMOVES THE SPONSORSHIP, NEVER THE ORGANIZATION. An organization
 * is shared: it is credited on other events and on the public Partners page, so
 * deleting it from inside one event would be one event reaching into all the
 * others. The rules refuse an organization delete outright for the same reason.
 */
let SPONSORS = [], ORGS = [];

const DELIVERABLES = {
  [TIER.PRESENTING]: ["Logo on the event page", "Named in the opening", "Logo on the share card",
                      "Mentioned in the recap"],
  [TIER.SUPPORTING]: ["Logo on the event page", "Named in the opening"],
  [TIER.COMMUNITY]:  ["Logo strip on the event page"],
};

function tierCount(tier, exceptId) {
  return SPONSORS.filter(s => s.tier === tier && s.id !== exceptId).length;
}


function sponsorRow(s) {
  const o = ORGS.find(x => x.id === s.organizationId);
  const done = Array.isArray(s.deliverablesDone) ? s.deliverablesDone : [];
  const full = t => t !== TIER.COMMUNITY && tierCount(t, s.id) >= TIER_LIMITS[t];
  const live = [SPONSOR_STATUS.CONFIRMED, SPONSOR_STATUS.DELIVERED].includes(s.status);
  const broken = live && !o;
  const statusClass = s.status === SPONSOR_STATUS.PROPOSED ? "st-proposed"
    : live ? "st-live" : "st-other";
  return `<div class="sprow${broken ? " sprow-broken" : ""}" data-sp-row="${esc(s.id)}">
    <span class="slogo">${o?.logoUrl ? `<img src="${esc(o.logoUrl)}" alt="">`
      : `<span class="slogo-fallback">${esc((o?.name || "?").slice(0, 2))}</span>`}</span>
    <div class="sprow-main"><b>${esc(o?.name || s.organizationId)}</b>
      <small>${broken
        ? `Organization id <code>${esc(s.organizationId)}</code> not found - credit cannot resolve`
        : esc(o?.website || "no website on record")}</small>
      ${broken ? `<div class="join-warn">Broken join - fix the organization link or recreate the row.</div>` : ""}
      <div class="deliv">${(DELIVERABLES[s.tier] || []).map((d, i) =>
        `<label><input type="checkbox" data-dv="${i}"${done.includes(i) ? " checked" : ""}>${esc(d)}</label>`).join("")}</div>
    </div>
    <div class="sprow-meta">
      <span class="stchip ${statusClass}">${esc(s.status)}</span>
      <select data-sp-tier aria-label="Tier">
      ${Object.values(TIER).map(t => `<option value="${t}"${s.tier === t ? " selected" : ""}
        ${full(t) && s.tier !== t ? " disabled" : ""}>${t}${
        full(t) && s.tier !== t ? ` (max ${TIER_LIMITS[t]} reached)` : ""}</option>`).join("")}
      </select>
      <select data-sp-status aria-label="Status">
      ${Object.values(SPONSOR_STATUS).map(v =>
        `<option value="${v}"${s.status === v ? " selected" : ""}>${v}</option>`).join("")}
      </select>
    </div>
    <div class="sprow-extra"><input data-sp-contrib value="${esc(s.contributionType || "")}" placeholder="cash / in-kind"
        maxlength="60">
      <input data-sp-order type="number" value="${Number(s.order ?? s.displayOrder ?? 100)}"
        aria-label="Display order"></div>
    <div class="sprow-acts"><button type="button" class="btn btn-gold btn-sm" data-sp-save>Save</button>
      <button type="button" class="btn btn-ghost btn-sm" data-sp-del>Remove</button></div>
  </div>`;
}


/** The public blocks, rendered from the same rows and the same grouping helper
 *  the public page uses - so this is a preview, not a drawing of one. */

function placementPreview() {
  const publicStatus = s =>
    [SPONSOR_STATUS.CONFIRMED, SPONSOR_STATUS.DELIVERED].includes(s.status);
  const joined = SPONSORS.map(s => ({
    ...s,
    organization: ORGS.find(o => o.id === s.organizationId) || null,
  }));
  const live = joined.filter(s => publicStatus(s) && s.organization);
  const broken = joined.filter(s => publicStatus(s) && !s.organization);
  const pending = joined.filter(s => !publicStatus(s));
  const g = groupSponsors(live);
  const logos = (list) => list.map(r => r.organization.logoUrl
    ? `<img src="${esc(r.organization.logoUrl)}" alt="${esc(r.organization.name)}">`
    : `<span class="plogos-name">${esc(r.organization.name)}</span>`).join("");
  return `<div class="ppreview">
    ${g.presenting.length ? `<h4>PRESENTED WITH</h4><div class="plogos big">${logos(g.presenting)}</div>` : ""}
    ${g.supporting.length ? `<h4 style="margin-top:14px">WITH SUPPORT FROM</h4><div class="plogos">${logos(g.supporting)}</div>` : ""}
    ${g.community.length ? `<h4 style="margin-top:14px">IN PARTNERSHIP WITH</h4><div class="plogos">${logos(g.community)}</div>` : ""}
    ${g.any ? "" : `<p class="muted small" style="margin:0">Nothing appears publicly yet.</p>`}
    ${live.length ? `<p class="muted small" style="margin:10px 0 0">${live.length} live on the public page.</p>` : ""}
    ${pending.length ? `<p class="muted small" style="margin:8px 0 0">${pending.length}
      ${pending.length === 1 ? "sponsorship is" : "sponsorships are"} hidden until confirmed - the rules
      refuse to serve a proposed one, so it cannot leak.</p>` : ""}
    ${broken.length ? `<p class="join-warn" style="margin:8px 0 0">${broken.length}
      confirmed/delivered ${broken.length === 1 ? "row has" : "rows have"} no matching organization
      (${broken.map(s => esc(s.organizationId || s.id)).join(", ")}). Fix the join - these are not
      "proposed".</p>` : ""}
  </div>`;
}


function renderSponsorsTab() {
  const host = panel("sponsors");
  if (!host) return;
  host.innerHTML = `
    <section class="card">
      <div class="hd"><h2>Sponsors &amp; partners</h2>
        <span class="count">${SPONSORS.length} on this event</span></div>
      <div data-sp-rows>${SPONSORS.length
        ? SPONSORS.slice().sort((a, b) => (a.order ?? 100) - (b.order ?? 100)).map(sponsorRow).join("")
        : `<p class="note" style="margin-top:0">No organization sponsors this event yet.</p>`}</div>

      <h3 class="ehead">Add a sponsor</h3>
      <div class="frow">
        <div class="f"><label>An organization PAAIPE already knows</label>
          <select data-add-org>
            <option value="">Choose…</option>
            ${ORGS.filter(o => !SPONSORS.some(s => s.organizationId === o.id))
                 .map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join("")}
          </select></div>
        <div class="f"><label>Tier</label><select data-add-tier>
          ${Object.values(TIER).map(t => `<option value="${t}">${t}</option>`).join("")}
        </select></div>
      </div>
      <div class="dacts"><button type="button" class="btn btn-gold btn-sm" data-add-sponsor>Add to this event</button>
        <button type="button" class="btn btn-ghost btn-sm" data-new-org-toggle>Or create a new organization</button></div>

      <div data-new-org hidden style="margin-top:14px">
        <div class="frow">
          <div class="f"><label>Company name</label><input data-no-name maxlength="120"></div>
          <div class="f"><label>Website</label><input data-no-web maxlength="300" placeholder="company.com"></div>
        </div>
        <div class="frow">
          <div class="f"><label>Contact name</label><input data-no-cname maxlength="120"></div>
          <div class="f"><label>Contact email</label><input data-no-cemail maxlength="254"></div>
        </div>
        <div class="f"><label>Logo URL <small>(a path in the repository, or any URL)</small></label>
          <input data-no-logo maxlength="300"></div>
        <div class="dacts"><button type="button" class="btn btn-gold btn-sm" data-create-org>Create and add</button></div>
        <p class="note">This writes the shared organization record as well as the sponsorship, because
          an organization is one thing PAAIPE knows about a company, not a per-event note. It is
          created <b>inactive</b> and <b>proposed</b>: nothing appears on the public Partners page
          until somebody makes it active.</p>
      </div>

      <h3 class="ehead">Placement preview</h3>
      ${placementPreview()}
      <p class="note quiet">Same grouping as the public page. Only <b>confirmed</b> and <b>delivered</b>
        with a resolved organization appear here.</p>
    </section>`;
}

async function loadSponsorsTab(eventId) {
  const host = panel("sponsors");
  host.innerHTML = `<section class="card"><p class="note" style="margin-top:0">Loading…</p></section>`;
  try {
    [SPONSORS, ORGS] = await Promise.all([
      listEventSponsors(eventId, { asAdmin: true }), listOrganizations(),
    ]);
    SPONSORS = SPONSORS.map(s => ({ ...s, order: s.order ?? s.displayOrder ?? 100 }));
    renderSponsorsTab();
    setTabCount("sponsors", SPONSORS.length);
  } catch (ex) {
    host.innerHTML = `<section class="card"><p class="note" style="margin-top:0">Sponsors could not be
      read: ${esc(ex?.message || ex)}. This is not "no sponsors".</p></section>`;
  }
}

/* ==================================================== the APPLICATIONS tab
 *
 * The companies that offered to support THIS event. The cross-event inbox at
 * admin-partners.html still exists for the questions that span events; this is
 * the same rows, scoped, so the answer to "who wants to sponsor October" is
 * inside October.
 *
 * Accepting is deliberately NOT duplicated here. It creates an organization and
 * a sponsorship and has to enforce the tier limits; two screens that both do it
 * are two screens that can disagree about what happened. This one hands over,
 * pre-filtered, and says so.
 */
let APPS = [];

const APP_STATUS_LABEL = {
  new: "New", contacted: "Contacted", in_discussion: "In discussion",
  accepted: "Accepted", declined: "Declined", spam: "Spam",
};
const APP_PILL = { new: "warn", contacted: "info", in_discussion: "info",
                   accepted: "ok", declined: "", spam: "err" };
const SUPPORT_LABEL = Object.fromEntries(SUPPORT_TYPES);

function renderApplicationsTab(eventId) {
  const host = panel("applications");
  if (!host) return;
  const fresh = APPS.filter(a => a.status === PARTNER_STATUS.NEW).length;
  host.innerHTML = `
    <section class="card">
      <div class="hd"><h2>Partner applications</h2>
        <span class="count">${APPS.length} for this event${fresh ? ` · ${fresh} waiting` : ""}</span></div>
      ${APPS.length ? `<div class="tbl"><table>
        <thead><tr><th>Reference</th><th>Company</th><th>Contact</th><th>Offering</th><th>Status</th><th></th></tr></thead>
        <tbody>${APPS.map(a => {
          const org = matchOrganization(a, ORGS);
          return `<tr>
            <td><b>${esc(a.reference || "—")}</b>${a.isSample
              ? ` <span class="pill info" title="Seeded sample data, not a real company.">SAMPLE</span>` : ""}
              <small class="muted">${esc(a.source || "")}</small></td>
            <td><b>${esc(a.companyName || "—")}</b>
              <small class="muted">${org ? `Matches ${esc(org.name)}` : "New to PAAIPE"}</small></td>
            <td>${esc(a.contactName || "—")}<small class="muted">${esc(a.email || "")}</small></td>
            <td>${(a.supportTypes || []).length
              ? `<div class="tags">${(a.supportTypes || []).map(k =>
                  `<span class="tag">${esc(SUPPORT_LABEL[k] || k)}</span>`).join("")}</div>`
              : `<span class="muted small">Not said</span>`}</td>
            <td><span class="pill ${APP_PILL[a.status] || ""}">${esc(APP_STATUS_LABEL[a.status] || a.status)}</span></td>
            <td><a class="btn btn-ghost btn-sm"
                 href="admin-partners.html?event=${encodeURIComponent(eventId)}">Open</a></td>
          </tr>`;
        }).join("")}</tbody></table></div>`
        : `<p class="note" style="margin-top:0">No company has applied to partner on this event. The
             button is on the public event page, the events list, the page people see after
             registering, and in the member portal.</p>`}
      <div class="dacts" style="margin-top:12px">
        <a class="btn btn-ghost btn-sm" href="admin-partners.html?event=${encodeURIComponent(eventId)}">
          Read, reply and accept →</a>
      </div>
      <p class="note">Replying and accepting happen on the applications screen. Accepting creates an
        organization and a sponsorship and has to enforce the tier limits — two screens that both did
        it would be two screens that can disagree about what happened, so this one hands over rather
        than repeating it.</p>
    </section>`;
}

async function loadApplicationsTab(eventId) {
  const host = panel("applications");
  host.innerHTML = `<section class="card"><p class="note" style="margin-top:0">Loading…</p></section>`;
  try {
    APPS = await listPartnerApplicationsFor(eventId);
    if (!ORGS.length) { try { ORGS = await listOrganizations(); } catch { /* names only */ } }
    renderApplicationsTab(eventId);
    setTabCount("applications", APPS.filter(a => a.status === PARTNER_STATUS.NEW).length);
  } catch (ex) {
    host.innerHTML = `<section class="card"><p class="note" style="margin-top:0">Applications could
      not be read: ${esc(ex?.message || ex)}. This is not "no applications".</p></section>`;
  }
}

/* =================================================== the REGISTRATIONS tab
 *
 * Who has signed up for THIS event.
 *
 * THE JOIN IS THE INTERESTING PART. Registrations predate events being records:
 * each carries a free-text title typed into the registration page and, until
 * now, no id. On the live database the rows say "PAAIPE AI Exchange — October
 * 2026" while the event record is titled "AI Exchange — October 2026", so an
 * exact join returns nothing and this tab would have shown zero for an event
 * with three.
 *
 * New registrations carry eventId. Older ones are matched loosely and SHOWN AS
 * UNLINKED rather than dropped, because a filtered list that silently loses
 * people is worse than no list.
 */
let REGS = [];

function renderRegistrationsTab(ev) {
  const host = panel("registrations");
  if (!host) return;
  const mine = REGS.filter(r => registrationMatchesEvent(r, ev));
  const n = s => mine.filter(r => (r.status || "registered") === s).length;
  const unlinked = mine.filter(isUnlinked).length;
  const cap = Number(ev.capacity) || 0;

  host.innerHTML = `
    <section class="card">
      <div class="hd"><h2>Registrations</h2>
        <span class="count">${mine.length}${cap ? ` of ${cap} places` : ""}</span></div>
      <div class="tally">
        <span><b>${n("registered")}</b> registered</span>
        <span><b>${n("attended")}</b> attended</span>
        <span><b>${n("no_show")}</b> no-show</span>
        <span><b>${n("cancelled")}</b> cancelled</span>
        ${cap ? `<span><b>${Math.max(0, cap - mine.length)}</b> places left</span>` : ""}
      </div>
      ${unlinked ? `<p class="note"><b>${unlinked} of these predate event ids</b> and were matched on
        the title they were submitted with. They are shown so nobody is lost; use
        <b>Link to this event</b> to record the connection properly.</p>` : ""}
      ${mine.length ? `<div class="tbl" style="margin-top:12px"><table>
        <thead><tr><th>Registrant</th><th>Organisation</th><th>Registered</th><th>Status</th><th></th></tr></thead>
        <tbody>${mine.map(r => `<tr>
          <td><b>${esc(r.full_name || "—")}</b><small class="muted">${esc(r.email || "")}</small></td>
          <td>${esc(r.organization || "—")}</td>
          <td>${esc(regWhen(r.createdAt))}</td>
          <td><span class="pill ${r.status === "attended" ? "ok" : r.status === "cancelled" ? "err" : "info"}"
            >${esc(r.status || "registered")}</span>${isUnlinked(r)
            ? ` <span class="pill warn" title="Matched on the title it was submitted with, not an event id.">UNLINKED</span>` : ""}</td>
          <td>${isUnlinked(r)
            ? `<button type="button" class="btn btn-ghost btn-sm" data-link-reg="${esc(r.id)}">Link to this event</button>`
            : ""}</td>
        </tr>`).join("")}</tbody></table></div>`
        : `<p class="note" style="margin-top:0">Nobody has registered for this event yet.</p>`}
      <div class="dacts" style="margin-top:12px">
        <a class="btn btn-ghost btn-sm" href="admin-registrations.html">Open the full registrations screen →</a>
        <a class="btn btn-ghost btn-sm" href="admin-speaker-brief.html">Speaker brief</a>
        <button type="button" class="btn btn-ghost btn-sm" data-reg-csv ${mine.length ? "" : "disabled"}>Export CSV</button>
      </div>
      <p class="note"><b>Not built:</b> resending Zoom details needs a mail sender and importing Zoom
        attendance needs something to import. Neither exists, so neither is offered as a button that
        would do nothing.</p>
    </section>`;
}

const regWhen = v => {
  const d = v?.toDate ? v.toDate() : Number.isFinite(v?.seconds) ? new Date(v.seconds * 1000) : null;
  return d ? d.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" }) : "—";
};

async function loadRegistrationsTab(eventId) {
  const host = panel("registrations");
  host.innerHTML = `<section class="card"><p class="note" style="margin-top:0">Loading…</p></section>`;
  try {
    REGS = await listAllRegistrations();
    const ev = EVENTS.find(e => e.id === eventId) || CURRENT;
    renderRegistrationsTab(ev);
    setTabCount("registrations", REGS.filter(r => registrationMatchesEvent(r, ev)).length);
  } catch (ex) {
    host.innerHTML = `<section class="card"><p class="note" style="margin-top:0">Registrations could
      not be read: ${esc(ex?.message || ex)}. This is not "nobody registered".</p></section>`;
  }
}

/* ================================================= the actions behind those */

function renumberGallery() {
  const cards = $$("[data-ph]");
  cards.forEach((c, i) => {
    c.dataset.ph = String(i);
    const up = $("[data-ph-up]", c), dn = $("[data-ph-dn]", c);
    if (up) up.disabled = i === 0;
    if (dn) dn.disabled = i === cards.length - 1;
  });
  const n = $("[data-ph-count]"); if (n) n.textContent = String(cards.length);
}

/** Add a photo by URL. The five-photo limit is enforced HERE and again when the
 *  public page renders, because a limit that lives only in one form is a limit
 *  the next form forgets. */
function addPhotoByUrl() {
  const cards = $$("[data-ph]");
  if (cards.length >= GALLERY_MAX)
    return flash(`This event already has ${GALLERY_MAX} photos, which is the limit. ` +
                 `Remove one before adding another.`);
  const url = prompt("Image URL (a path in the repository, or any URL)");
  if (!url || !url.trim()) return;
  const wrap = $("[data-gallery]");
  if (!wrap) return;
  wrap.insertAdjacentHTML("beforeend",
    galleryCard({ url: url.trim(), alt: "", caption: "" }, cards.length, cards.length + 1));
  renumberGallery();
  flash("Added. Give it alt text, then Save — a photo without alt text is left out of the public gallery.", true);
}

async function addExistingSponsor() {
  const orgId = $("[data-add-org]")?.value;
  const tier = $("[data-add-tier]")?.value || TIER.COMMUNITY;
  if (!orgId) return flash("Choose an organization first.");
  if (tier !== TIER.COMMUNITY && tierCount(tier) >= TIER_LIMITS[tier])
    return flash(`This event already has the maximum of ${TIER_LIMITS[tier]} ${tier} sponsor(s).`);
  await writeSponsor({ organizationId: orgId, tier });
}

async function createOrgAndSponsor() {
  const name = $("[data-no-name]")?.value.trim();
  if (!name) return flash("A new organization needs a name.");
  const tier = $("[data-add-tier]")?.value || TIER.COMMUNITY;
  const F = await import(`${SDK}/firebase-firestore.js`);
  try {
    const ref = F.doc(F.collection(await db(), COL.organizations));
    const doc = {
      name,
      website: $("[data-no-web]")?.value.trim() || "",
      logoUrl: $("[data-no-logo]")?.value.trim() || "",
      // Inactive and proposed: created here, published nowhere until somebody says so.
      status: "inactive",
      type: "sponsor",
      relationshipStatus: "proposed",
      primaryContactName: $("[data-no-cname]")?.value.trim() || "",
      primaryContactEmail: $("[data-no-cemail]")?.value.trim() || "",
      createdFromEvent: CURRENT?.id || "",
    };
    await F.setDoc(ref, doc);
    ORGS.push({ id: ref.id, ...doc });
    await logActivity("organization.create", `${name} (from ${CURRENT?.title || CURRENT?.id})`, CURRENT?.id);
    await writeSponsor({ organizationId: ref.id, tier });
  } catch (ex) {
    flash(ex?.code === "permission-denied" ? "The rules refused that." : `Could not create: ${ex?.message || ex}`);
  }
}

async function writeSponsor({ organizationId, tier }) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  try {
    const row = {
      eventId: CURRENT.id, organizationId, tier,
      status: SPONSOR_STATUS.PROPOSED, order: (SPONSORS.length + 1) * 10,
      contributionType: "", deliverablesDone: [],
    };
    const ref = await F.addDoc(F.collection(await db(), COL.sponsors), row);
    SPONSORS.push({ id: ref.id, ...row });
    await logActivity("sponsor.create",
      `${ORGS.find(o => o.id === organizationId)?.name || organizationId}: ${tier}/proposed`, CURRENT.id);
    renderSponsorsTab();
    setTabCount("sponsors", SPONSORS.length);
    flash("Added as PROPOSED — the rules refuse to serve a proposed sponsorship, so nothing is " +
          "public until you set it to confirmed.", true);
  } catch (ex) {
    flash(ex?.code === "permission-denied" ? "The rules refused that." : `Could not add: ${ex?.message || ex}`);
  }
}

async function saveSponsorRow(id) {
  const row = $(`[data-sp-row="${id}"]`);
  const s = SPONSORS.find(x => x.id === id);
  if (!row || !s) return;
  const tier = $("[data-sp-tier]", row).value;
  if (tier !== TIER.COMMUNITY && tierCount(tier, id) >= TIER_LIMITS[tier])
    return flash(`This event already has the maximum of ${TIER_LIMITS[tier]} ${tier} sponsor(s).`);
  const patch = {
    tier,
    status: $("[data-sp-status]", row).value,
    contributionType: $("[data-sp-contrib]", row).value.trim(),
    order: Number($("[data-sp-order]", row).value) || 100,
    deliverablesDone: $$("[data-dv]", row).filter(c => c.checked).map(c => Number(c.dataset.dv)),
  };
  const F = await import(`${SDK}/firebase-firestore.js`);
  try {
    await F.setDoc(F.doc(await db(), COL.sponsors, id), patch, { merge: true });
    Object.assign(s, patch);
    await logActivity("sponsor.update",
      `${ORGS.find(o => o.id === s.organizationId)?.name || s.organizationId}: ${patch.tier}/${patch.status}`,
      CURRENT.id);
    renderSponsorsTab();
    flash(patch.status === SPONSOR_STATUS.PROPOSED
      ? "Saved. Still proposed, so it stays off the public page."
      : "Saved. This sponsor now appears on the public event page.", true);
  } catch (ex) {
    flash(ex?.code === "permission-denied" ? "The rules refused that." : `Could not save: ${ex?.message || ex}`);
  }
}

/** Remove the SPONSORSHIP. The organization is shared - other events credit it
 *  and the public Partners page lists it - so nothing here touches it. */
async function removeSponsorRow(id) {
  const s = SPONSORS.find(x => x.id === id);
  const name = ORGS.find(o => o.id === s?.organizationId)?.name || "this organization";
  if (!confirm(`Remove ${name} from ${CURRENT?.title || "this event"}?\n\n` +
               `The organization itself is kept — it is credited on other events and on the ` +
               `public Partners page.`)) return;
  const F = await import(`${SDK}/firebase-firestore.js`);
  try {
    await F.deleteDoc(F.doc(await db(), COL.sponsors, id));
    SPONSORS = SPONSORS.filter(x => x.id !== id);
    await logActivity("sponsor.remove", `${name} from ${CURRENT.id}`, CURRENT.id);
    renderSponsorsTab();
    setTabCount("sponsors", SPONSORS.length);
    flash(`${name} no longer sponsors this event. The organization is untouched.`, true);
  } catch (ex) {
    flash(ex?.code === "permission-denied" ? "The rules refused that." : `Could not remove: ${ex?.message || ex}`);
  }
}

/** Record which event an old registration belongs to. An administrative fact,
 *  which is why the rules let an administrator write it and nothing else. */
async function linkRegistration(id) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  try {
    await F.setDoc(F.doc(await db(), COL.registrations, id),
      { eventId: CURRENT.id, updated_by: ME }, { merge: true });
    const r = REGS.find(x => x.id === id);
    if (r) r.eventId = CURRENT.id;
    await logActivity("registration.link", `${r?.email || id} → ${CURRENT.id}`, CURRENT.id);
    renderRegistrationsTab(CURRENT);
    flash("Linked. It now belongs to this event by id, not by the title it was typed with.", true);
  } catch (ex) {
    flash(ex?.code === "permission-denied" ? "The rules refused that." : `Could not link: ${ex?.message || ex}`);
  }
}

function exportEventRegistrations() {
  const mine = REGS.filter(r => registrationMatchesEvent(r, CURRENT));
  const head = ["Name", "Email", "Organisation", "Position", "Profile", "Status", "Registered", "Linked by id"];
  const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = mine.map(r => [r.full_name, r.email, r.organization, r.position, r.profile,
    r.status || "registered", regWhen(r.createdAt), isUnlinked(r) ? "no" : "yes"].map(cell).join(","));
  const blob = new Blob(["﻿" + [head.map(cell).join(","), ...body].join("\r\n")],
                        { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paaipe-${CURRENT.id}-registrations.csv`;
  a.click();
  URL.revokeObjectURL(url);
  logActivity("registration.export", `${mine.length} row(s)`, CURRENT.id);
}
