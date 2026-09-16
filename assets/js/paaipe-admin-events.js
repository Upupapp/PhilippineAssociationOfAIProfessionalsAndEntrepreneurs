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
import { renderAdminNav } from "/assets/js/paaipe-admin.js";
import { firebaseConfig, DATABASE_ID } from "/assets/js/paaipe-firebase.js";
import {
  COL, EVENT_STATUS, listEvents, registrationState, eventDateLong,
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

const field = (label, key, value, attrs = "") =>
  `<div class="f"><label>${esc(label)}</label>
     <input data-e="${key}" value="${esc(value ?? "")}" ${attrs}></div>`;

function openEditor(id) {
  CURRENT = EVENTS.find(e => e.id === id) || null;
  const d = $("[data-event-editor]");
  if (!CURRENT) { d.hidden = true; return; }
  const e = CURRENT;

  d.innerHTML = `
    <div class="dhead">
      <div><b>${esc(e.title || "(untitled)")}</b><small>${esc(e.id)}</small></div>
      <button class="btn btn-ghost btn-sm" data-close>Close</button>
    </div>

    <p class="dmeta"><span class="pill ${PILL_FOR[e.status] || "warn"}">${esc(STATUS_LABEL[e.status] || e.status)}</span>
      <span class="muted" data-consequence>${esc(consequence(e))}</span></p>

    <h3 class="ehead">Status</h3>
    <div class="dacts">
      ${[[EVENT_STATUS.DRAFT,"Unpublish"],[EVENT_STATUS.PUBLISHED,"Publish"],
         [EVENT_STATUS.REGISTRATION_OPEN,"Open registration"],[EVENT_STATUS.REGISTRATION_CLOSED,"Close registration"],
         [EVENT_STATUS.HELD,"Mark as held"],[EVENT_STATUS.CANCELLED,"Cancel event"]]
        .map(([s, label]) => `<button class="btn ${s === e.status ? "btn-gold" : "btn-ghost"} btn-sm"
              data-status="${s}"${s === e.status ? " disabled" : ""}>${label}</button>`).join("")}
    </div>
    <p class="note">Each of these changes what a visitor sees the moment it is saved. Unpublishing
      makes the event unreadable to the public — the rules refuse it, so the link stops working too.</p>

    <h3 class="ehead">Basics</h3>
    ${field("Title", "title", e.title, 'maxlength="200"')}
    ${field("Slug (the page it belongs to)", "slug", e.slug, 'maxlength="80" pattern="[a-z0-9-]+"')}
    ${field("Series", "series", e.series, 'maxlength="80"')}
    ${field("Topic", "topic", e.topic, 'maxlength="160"')}
    <div class="f"><label>Description</label>
      <textarea data-e="description" rows="3" maxlength="1200">${esc(e.description || "")}</textarea></div>

    <h3 class="ehead">When</h3>
    <div class="frow">
      ${field("Date", "date", e.date, 'type="date"')}
      ${field("Start", "startTime", e.startTime, 'type="time"')}
      ${field("End", "endTime", e.endTime, 'type="time"')}
    </div>
    <p class="note">Times are ${esc(e.timezone || "Asia/Manila")}.</p>

    <h3 class="ehead">Registration</h3>
    <div class="frow">
      ${field("Capacity (blank = no limit)", "capacity", e.capacity ?? "", 'type="number" min="1"')}
      ${field("Opens at", "registrationOpensAt", e.registrationOpensAt || "", 'type="datetime-local"')}
      ${field("Closes at", "registrationClosesAt", e.registrationClosesAt || "", 'type="datetime-local"')}
    </div>
    <div class="f"><label><input type="checkbox" data-e="waitlistEnabled"
      ${e.waitlistEnabled === true ? "checked" : ""}> Offer a waitlist once capacity is reached</label></div>

    <h3 class="ehead">Content</h3>
    <div class="f"><label>What to expect — one per line</label>
      <textarea data-e="whatToExpect" rows="3">${esc((e.whatToExpect || []).join("\n"))}</textarea></div>

    <h3 class="ehead">Program</h3>
    <div class="f"><label>One per line: <code>time | what happens</code></label>
      <textarea data-e="program" rows="4" placeholder="8:00 PM | Welcome and opening remarks">${esc(rowsToLines(e.program, ["time","item"]))}</textarea></div>

    <h3 class="ehead">Speakers and program team</h3>
    <div class="f"><label>One per line: <code>name | title | organisation | photo path</code></label>
      <textarea data-e="speakers" rows="3" placeholder="Sven Bally | Founder | Neap &amp; Spring | assets/img/sven-bally.jpg">${esc(rowsToLines(e.speakers, ["name","title","org","photoUrl"]))}</textarea></div>

    <h3 class="ehead">Questions to ask</h3>
    <p class="note">Full name, email, the updates opt-in and the Zoom consent are always asked — they
      are not optional, so they are not listed as if they were.</p>
    <div class="qlist">
      ${OPTIONAL_QUESTIONS.map(([k, label]) => `<label><input type="checkbox" data-q="${k}"
        ${(e.questionsEnabled || []).includes(k) ? "checked" : ""}> ${esc(label)}</label>`).join("")}
    </div>
    <p class="note">The public registration form renders exactly this list. Unticking one removes the
      question from the form; it does not delete answers people have already given.</p>

    <h3 class="ehead">Confirmation email</h3>
    <div class="f"><label>Body</label>
      <textarea data-e="confirmationEmailText" rows="3" maxlength="2000">${esc(e.confirmationEmailText || "")}</textarea></div>
    <p class="note"><b>Stored, not sent.</b> PAAIPE has no mail sender wired, so nothing goes out when
      somebody registers. This text is kept so it is ready, and so the wording is decided once rather
      than retyped into whatever eventually does the sending.</p>

    <h3 class="ehead">Zoom link</h3>
    <div class="f"><label>Join link</label>
      <input data-zoom placeholder="${e.hasZoom ? "A link is stored. Type a new one to replace it." : "https://…"}" maxlength="500"></div>
    <p class="note"><b>Stored separately, and never shown back.</b> The link lives in a document no
      client may read, because security rules cannot hide one field of a record. This box can write
      it and cannot display it — showing it would put it in a page, which is exactly what keeping it
      out of the event record prevents. <b>Nothing sends it to registrants yet</b>: that needs a mail
      sender, which PAAIPE does not have.</p>

    <h3 class="ehead">What publishing does</h3>
    <ul class="plist">
      <li><b>Yes:</b> the public event page starts serving this record — title, sponsors and the
        Register button all follow it, with no rebuild.</li>
      <li><b>Yes:</b> registration opens by itself at the date you set. Nothing has to run on a
        schedule: the button is worked out from the window each time somebody loads the page.</li>
      <li><b>Yes:</b> a calendar file is offered, generated from this record.</li>
      <li><b>No:</b> it does not CREATE a page. paaipe.org is static — a new event needs its HTML
        page added to the repository once. Publishing decides what an existing page shows.</li>
      <li><b>No:</b> no banner is generated. That needs image tooling and a storage bucket, neither
        of which is wired.</li>
      <li><b>No:</b> the portal Sessions list is still its own static data, not this record.</li>
    </ul>

    <h3 class="ehead">History</h3>
    <div data-history><p class="muted small">Loading…</p></div>

    <div class="dacts">
      <button class="btn btn-gold btn-sm" data-save-event>Save changes</button>
      <a class="btn btn-ghost btn-sm" href="${esc(e.slug || "#")}.html" target="_blank" rel="noopener">View public page</a>
      <button class="btn btn-ghost btn-sm" data-ics>Download calendar file</button>
      <button class="btn btn-ghost btn-sm" data-duplicate>Duplicate as a new event</button>
    </div>`;
  d.hidden = false;
  d.dataset.event = id;
  renderList();
  loadHistory(id);
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
    waitlistEnabled: $('[data-e="waitlistEnabled"]', d)?.checked === true,
  };
  const cap = val("capacity");
  patch.capacity = cap === "" ? null : Number(cap);
  patch.whatToExpect = String(val("whatToExpect")).split("\n").map(s => s.trim()).filter(Boolean);
  patch.program  = linesToRows(val("program"),  ["time", "item"]);
  patch.speakers = linesToRows(val("speakers"), ["name", "title", "org", "photoUrl"]);
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
  $$("[data-admin-email]").forEach(e => { e.textContent = me.email; });
  $("[data-admin-signout]")?.addEventListener("click", async e => {
    e.preventDefault(); await signOutNow().catch(() => {}); location.replace("admin.html");
  });

  try {
    // asAdmin: the console is the one caller that must see drafts
    EVENTS = await listEvents({ asAdmin: true });
  } catch (ex) {
    flash(`Could not load events: ${ex?.message || ex}`);
    document.documentElement.setAttribute("data-admin-events", "error");
    return;
  }
  renderList();

  document.addEventListener("click", e => {
    const ed = e.target.closest("[data-edit-event]");
    if (ed) return openEditor(ed.closest("tr").dataset.event);
    if (e.target.closest("[data-close]")) { $("[data-event-editor]").hidden = true; CURRENT = null; renderList(); return; }
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
