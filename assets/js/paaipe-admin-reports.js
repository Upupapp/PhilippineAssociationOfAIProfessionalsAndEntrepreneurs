/* PAAIPE admin — Reports. One row per event, then a fuller dashboard. */
import { currentAgent, isAdminNow, signOutNow } from "/assets/js/paaipe-firebase.js";
import { renderAdminNav, renderAdminTop, renderCrumbs } from "/assets/js/paaipe-admin.js";
import {
  listEvents, eventDateTimeLine, eventStatusShort, EVENT_STATUS,
} from "/assets/js/paaipe-events-data.js";
import { figureText, figureNote } from "/assets/js/paaipe-feedback.js";
import {
  loadReportBundle, fullDashboardHtml, feedbackTabHtml, exportReport,
} from "/assets/js/paaipe-event-reports.js";
import { readHash, writeHash, onViewChange } from "/assets/js/paaipe-view-url.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const PILL_FOR = {
  [EVENT_STATUS.DRAFT]: "warn", [EVENT_STATUS.PUBLISHED]: "info",
  [EVENT_STATUS.REGISTRATION_OPEN]: "ok", [EVENT_STATUS.REGISTRATION_CLOSED]: "info",
  [EVENT_STATUS.HELD]: "info", [EVENT_STATUS.CANCELLED]: "err",
};

let ME = "", EVENTS = [], CURRENT = null, REPORT = null, TAB = "dashboard";

function flash(msg, good = false) {
  const el = $("[data-flash]");
  if (!el) return;
  el.textContent = msg; el.hidden = !msg;
  el.classList.toggle("ok", !!good);
}

function eventFromHash() {
  return readHash().event || null;
}
function tabFromHash() {
  return readHash().tab === "feedback" ? "feedback" : "dashboard";
}

function renderList() {
  const body = $("[data-report-rows]");
  if (!body) return;
  if (!EVENTS.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">No event exists yet.</td></tr>`;
    return;
  }
  body.innerHTML = EVENTS.map(e => {
    const when = eventDateTimeLine(e);
    const status = eventStatusShort(e);
    const pill = PILL_FOR[e.status] || "info";
    return `<tr data-open-event="${esc(e.id)}">
      <td><b>${esc(e.title || "(untitled)")}</b></td>
      <td class="num">${esc(when || "—")}</td>
      <td>${status ? `<span class="pill ${pill}">${esc(status)}</span>` : "—"}</td>
      <td class="num" data-reg-cell="${esc(e.id)}">…</td>
      <td class="num" data-fb-cell="${esc(e.id)}">…</td>
      <td class="act"><button class="btn btn-ghost btn-sm" data-open-event="${esc(e.id)}">Open</button></td>
    </tr>`;
  }).join("");
}

async function fillListCounts() {
  // Counts are filled per event from the same live queries the dashboard uses.
  // A failure stays "—" — never a mock number, never a silent zero.
  for (const e of EVENTS) {
    try {
      const { report } = await loadReportBundle(e);
      const rc = $(`[data-reg-cell="${e.id}"]`);
      const fc = $(`[data-fb-cell="${e.id}"]`);
      if (rc) rc.textContent = report.registrations.live ? figureText(report.registrations) : "—";
      if (rc && !report.registrations.live) rc.title = figureNote(report.registrations);
      if (fc) fc.textContent = report.feedback.live ? figureText(report.feedback) : "—";
      if (fc && !report.feedback.live) fc.title = figureNote(report.feedback);
    } catch (ex) {
      const rc = $(`[data-reg-cell="${e.id}"]`);
      const fc = $(`[data-fb-cell="${e.id}"]`);
      if (rc) { rc.textContent = "—"; rc.title = ex?.message || "could not be read"; }
      if (fc) { fc.textContent = "—"; fc.title = ex?.message || "could not be read"; }
    }
  }
}

function showList({ push = true } = {}) {
  CURRENT = null; REPORT = null;
  $("[data-reports-list]").hidden = false;
  $("[data-reports-event]").hidden = true;
  $("[data-ework-head]").hidden = true;
  $("[data-export-report]").hidden = true;
  renderAdminTop({ title: "Reports", subtitle: "One row per event. Open a row for the full dashboard.", email: ME });
  renderCrumbs([["Dashboard", "admin.html"], "Reports"]);
  writeHash({}, { push });
}

async function openEvent(id, tab = "dashboard", { push = true } = {}) {
  CURRENT = EVENTS.find(e => e.id === id) || null;
  if (!CURRENT) return showList();
  $("[data-reports-list]").hidden = true;
  $("[data-reports-event]").hidden = false;
  const head = $("[data-ework-head]");
  if (head) head.hidden = false;
  const t = $("[data-ework-title]"); if (t) t.textContent = CURRENT.title || "(untitled)";
  const d = $("[data-ework-date]");
  if (d) d.textContent = "Reports / this event · fuller than the event-detail tab";
  $("[data-export-report]").hidden = false;
  renderAdminTop({ title: CURRENT.title || "Reports", subtitle: "Reports / this event", email: ME });
  renderCrumbs([["Reports", "admin-reports.html"], CURRENT.title || "(untitled)"]);
  const dash = $('[data-rpanel="dashboard"]');
  const fb = $('[data-rpanel="feedback"]');
  if (dash) dash.innerHTML = `<p class="note">Loading live counts…</p>`;
  try {
    const bundle = await loadReportBundle(CURRENT);
    REPORT = bundle.report;
    if (dash) dash.innerHTML = fullDashboardHtml(REPORT);
    if (fb) fb.innerHTML = feedbackTabHtml(REPORT);
  } catch (ex) {
    const msg = `Counts could not be loaded: ${ex?.message || ex}`;
    if (dash) dash.innerHTML = `<div class="banner">${esc(msg)}</div>`;
    if (fb) fb.innerHTML = `<div class="banner">${esc(msg)}</div>`;
  }
  selectRtab(tab, { push });
}

function selectRtab(key, { push = true } = {}) {
  TAB = key === "feedback" ? "feedback" : "dashboard";
  $$("[data-rtab]").forEach(b => b.setAttribute("aria-selected", b.dataset.rtab === TAB ? "true" : "false"));
  $$("[data-rpanel]").forEach(p => { p.hidden = p.dataset.rpanel !== TAB; });
  if (push && CURRENT) {
    writeHash({ event: CURRENT.id, tab: TAB }, { push: true });
  }
}

(async function () {
  if (!$("[data-admin-reports]")) return;
  renderAdminNav("admin-reports.html");
  let me = null;
  try { me = await currentAgent(); } catch { me = null; }
  if (!me) { location.replace("admin.html"); return; }
  let ok = false;
  try { ok = await isAdminNow(); }
  catch {
    flash("PAAIPE could not be reached. Nothing is shown rather than an empty list.");
    document.documentElement.setAttribute("data-admin-reports", "offline");
    return;
  }
  if (!ok) { await signOutNow().catch(() => {}); location.replace("admin.html?denied=1"); return; }
  ME = me.email;
  renderAdminTop({ title: "Reports", subtitle: "One row per event. Open a row for the full dashboard.", email: ME });
  renderCrumbs([["Dashboard", "admin.html"], "Reports"]);
  document.addEventListener("click", e => {
    if (e.target.closest("[data-admin-signout]")) {
      e.preventDefault(); signOutNow().catch(() => {}).then(() => location.replace("admin.html"));
    }
    const open = e.target.closest("[data-open-event]");
    if (open) return openEvent(open.dataset.openEvent || open.closest("[data-open-event]")?.dataset.openEvent);
    const rtab = e.target.closest("[data-rtab]");
    if (rtab) return selectRtab(rtab.dataset.rtab);
    if (e.target.closest("[data-export-report]") && CURRENT && REPORT)
      return exportReport(CURRENT, REPORT, "Event report");
    if (e.target.closest('a[href="#tab=feedback"]')) {
      e.preventDefault();
      selectRtab("feedback");
    }
  });

  try {
    EVENTS = await listEvents({ asAdmin: true });
  } catch (ex) {
    flash(`Could not load events: ${ex?.message || ex}`);
    const b = $("[data-report-rows]");
    if (b) b.innerHTML = `<tr><td colspan="6" class="empty">Events could not be loaded. This is not "no events".</td></tr>`;
    document.documentElement.setAttribute("data-admin-reports", "error");
    return;
  }
  renderList();
  document.documentElement.setAttribute("data-admin-reports", String(EVENTS.length));
  const want = eventFromHash();
  if (want) await openEvent(want, tabFromHash(), { push: false });
  else await fillListCounts();
  onViewChange(() => {
    const id = eventFromHash();
    if (!id) {
      if (CURRENT) showList({ push: false });
      return;
    }
    if (!CURRENT || CURRENT.id !== id) openEvent(id, tabFromHash(), { push: false });
    else selectRtab(tabFromHash(), { push: false });
  });
})();
