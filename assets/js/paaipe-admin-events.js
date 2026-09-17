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
  COL, EVENT_STATUS, PARTNER_STATUS, listEvents, listEventSponsors,
  registrationState, eventDateLong,
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
    "Opens registration at the date you set, with nothing running on a schedule",
    "Offers a calendar file generated from this record",
  ];
  const no = [
    ["Creates the public event page and registration page",
     "paaipe.org is static — a new event needs its page added to the repository once"],
    ["Generates the banner and calendar files",
     "no image tooling or storage bucket is wired; the calendar file IS generated"],
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
  if (!live.length && !proposed)
    return `<p class="note" style="margin-top:0">No sponsor has been added to this event.</p>`;
  return `<div class="sponrow">
    ${live.map(r => `<span class="sponchip">
        <img src="${esc(r.organization.logoUrl)}" alt="${esc(r.organization.name)}">
        <span class="tierpill tier-${esc(r.tier)}">${esc(String(r.tier).toUpperCase())}</span>
      </span>`).join("")}
    ${proposed ? `<span class="hiddenpill">${proposed} proposed (hidden)</span>` : ""}
  </div>`;
}

function openEditor(id) {
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

      <h3 class="ehead">Sponsors &amp; partners</h3>
      <div data-sponsor-summary><p class="note" style="margin-top:0">Loading…</p></div>
      <p class="note">Managed on the <a href="admin-organizations.html">Organizations &amp; sponsors</a>
        page: tiers, status, order and logos. Only confirmed sponsors appear publicly — the rules refuse
        to serve a proposed one, so a proposal cannot leak.</p>

      <h3 class="ehead">Partner applications</h3>
      <div data-partner-summary><p class="note" style="margin-top:0">Loading…</p></div>

      <h3 class="ehead">Cover, banner and recording</h3>
      <p class="note" style="margin-top:0"><b>Banners are not generated.</b> The design says the square
        and wide banners are made from templates on publish; that needs image tooling and a storage
        bucket, neither of which is wired. The <b>calendar file IS generated</b>, from this record, by
        the button in the Publish panel. Recordings are not wired either.</p>
    </section>

    <section class="card">
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
      ${field("Page address (slug)", "slug", e.slug, 'maxlength="80"', "lower-case, hyphens")}

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
  loadHistory(id);
  loadSponsorSummary(id);
  loadPartnerSummary(id);
  window.scrollTo({ top: 0, behavior: "smooth" });
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
  const d = $("[data-event-editor]");
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
