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

    <h3 class="ehead">Zoom link</h3>
    <div class="f"><label>Join link</label>
      <input data-zoom placeholder="${e.hasZoom ? "A link is stored. Type a new one to replace it." : "https://…"}" maxlength="500"></div>
    <p class="note"><b>Stored separately, and never shown back.</b> The link lives in a document no
      client may read, because security rules cannot hide one field of a record. This box can write
      it and cannot display it — showing it would put it in a page, which is exactly what keeping it
      out of the event record prevents. <b>Nothing sends it to registrants yet</b>: that needs a mail
      sender, which PAAIPE does not have.</p>

    <div class="dacts">
      <button class="btn btn-gold btn-sm" data-save-event>Save changes</button>
      <a class="btn btn-ghost btn-sm" href="${esc(e.slug || "#")}.html" target="_blank" rel="noopener">View public page</a>
    </div>`;
  d.hidden = false;
  d.dataset.event = id;
  renderList();
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
  });

  document.documentElement.setAttribute("data-admin-events", String(EVENTS.length));
})();
