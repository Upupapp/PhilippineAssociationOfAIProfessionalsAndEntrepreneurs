/* PAAIPE admin — registrations.
 *
 * Every row here is a real person who filled in the form on paaipe.org. Nothing
 * on this page is sample data, and nothing is inferred: a field the registrant
 * left blank shows as blank, not as a guess.
 *
 * What the mockup drew and this does NOT do, because PAAIPE has no way to:
 *   - "Resend Zoom details"     there is no mail sender yet (see P-33)
 *   - "Import Zoom attendance"  nothing exports attendance from Zoom to import
 * A button that cannot do its job is worse than no button, so they are absent
 * rather than present and dead.
 */
import {
  currentAgent, isAdminNow, signOutNow,
  listRegistrations, setRegistrationStatus, REG_STATUS, regStatusOf,
} from "/assets/js/paaipe-firebase.js";
import { renderAdminNav, renderAdminTop, renderCrumbs, setNavBadge } from "/assets/js/paaipe-admin.js";
import { readHash, patchHash, onViewChange } from "/assets/js/paaipe-view-url.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const when = ts => {
  const d = ts?.toDate ? ts.toDate() : Number.isFinite(ts?.seconds) ? new Date(ts.seconds * 1000) : null;
  return d && !isNaN(d)
    ? d.toLocaleString("en-PH", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";
};

const PILL = {
  [REG_STATUS.REGISTERED]: ["pill info", "Registered"],
  [REG_STATUS.ATTENDED]:   ["pill ok",   "Attended"],
  [REG_STATUS.NO_SHOW]:    ["pill warn", "No-show"],
  [REG_STATUS.CANCELLED]:  ["pill err",  "Cancelled"],
};

/* The questions the form actually asks, in the order it asks them. The labels
 * are the form's own words - a detail panel that renames a question is a detail
 * panel that misreports what the person was answering. */
const ANSWERS = [
  ["position",         "Role or position"],
  ["organization",     "Organisation"],
  ["profile",          "Which best describes you"],
  ["profile_other",    "Other (their words)"],
  ["learn",            "What they want to get out of it"],
  ["speaker_question", "Their question for the speaker"],
  ["source",           "How they heard about PAAIPE"],
];

let ALL = [];       // every registration, as read
let ME = "";        // the signed-in admin's email

/* ------------------------------------------------------------------ filters */

const state = { event: "", status: "", profile: "", q: "" };

function eventsIn(list) {
  return [...new Set(list.map(r => r.event).filter(Boolean))].sort();
}
function profilesIn(list) {
  return [...new Set(list.map(r => r.profile).filter(Boolean))].sort();
}

function visible() {
  const q = state.q.trim().toLowerCase();
  return ALL.filter(r =>
    (!state.event   || r.event === state.event) &&
    (!state.status  || regStatusOf(r) === state.status) &&
    (!state.profile || r.profile === state.profile) &&
    (!q || [r.full_name, r.email, r.organization, r.position]
            .some(v => String(v || "").toLowerCase().includes(q)))
  );
}

/* -------------------------------------------------------------------- table */

function render() {
  const rows = visible();
  const body = $("[data-rows]");

  $("[data-count]").textContent =
    rows.length === ALL.length
      ? `${ALL.length} ${ALL.length === 1 ? "registration" : "registrations"}`
      : `${rows.length} of ${ALL.length}`;

  // counts describe the FILTERED set, and say so - a tally whose denominator is
  // invisible is a tally nobody can check
  const tally = {};
  for (const r of rows) { const s = regStatusOf(r); tally[s] = (tally[s] || 0) + 1; }
  $("[data-tally]").innerHTML = Object.entries(PILL)
    .filter(([k]) => tally[k])
    .map(([k, [cls, label]]) => `<span class="${cls}">${tally[k]} ${esc(label)}</span>`)
    .join("") || `<span class="muted">nothing to count</span>`;

  if (!ALL.length) {
    body.innerHTML = `<tr><td colspan="5" class="empty">No registration has been submitted yet.</td></tr>`;
    return;
  }
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5" class="empty">No registration matches these filters.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(r => {
    const [cls, label] = PILL[regStatusOf(r)];
    return `<tr data-id="${esc(r.id)}">
      <td><b>${esc(r.full_name || "—")}</b><small>${esc(r.email || "—")}</small></td>
      <td>${esc(r.organization || "")}${r.position ? `<small>${esc(r.position)}</small>` : ""}</td>
      <td>${esc(r.profile || "—")}</td>
      <td class="num">${esc(when(r.createdAt))}</td>
      <td class="act"><span class="${cls}">${esc(label)}</span>
        <button class="btn btn-ghost btn-sm" data-view>View</button></td>
    </tr>`;
  }).join("");
}

/* ------------------------------------------------------------ detail drawer */

function openDetail(id, { push = true } = {}) {
  const r = ALL.find(x => x.id === id);
  if (!r) return;
  const d = $("[data-detail]");
  const [cls, label] = PILL[regStatusOf(r)];

  const answered = ANSWERS
    .filter(([k]) => String(r[k] || "").trim() !== "")
    .map(([k, lbl]) => `<div class="ans"><dt>${esc(lbl)}</dt><dd>${esc(r[k])}</dd></div>`)
    .join("");
  const blank = ANSWERS
    .filter(([k]) => String(r[k] || "").trim() === "")
    .map(([, lbl]) => esc(lbl));

  d.innerHTML = `
    <div class="dhead">
      <div><b>${esc(r.full_name || "—")}</b><small>${esc(r.email || "—")}</small></div>
      <button class="btn btn-ghost btn-sm" data-close>Close</button>
    </div>
    <p class="dmeta"><span class="${cls}">${esc(label)}</span>
      <span class="muted">${esc(r.event || "—")} · registered ${esc(when(r.createdAt))}</span></p>
    <dl class="answers">${answered || '<p class="muted">They answered none of the optional questions.</p>'}</dl>
    ${blank.length ? `<p class="muted small">Left blank: ${blank.join(", ")}.</p>` : ""}
    <p class="muted small">Wants PAAIPE updates: <b>${r.updates === true ? "yes" : "no"}</b>.
      Consent recorded against Privacy Notice v${esc(r.privacyVersion || "—")}.</p>
    <div class="dacts">
      <button class="btn btn-gold btn-sm" data-mark="${REG_STATUS.ATTENDED}">Mark attended</button>
      <button class="btn btn-ghost btn-sm" data-mark="${REG_STATUS.NO_SHOW}">No-show</button>
      <button class="btn btn-ghost btn-sm" data-mark="${REG_STATUS.REGISTERED}">Back to registered</button>
      <button class="btn btn-ghost btn-sm danger" data-mark="${REG_STATUS.CANCELLED}">Cancel</button>
    </div>
    <p class="muted small">Cancelling records a status. It never deletes the registration —
      what someone submitted is not ours to make disappear.</p>`;
  d.hidden = false;
  d.dataset.id = id;
  d.scrollIntoView({ block: "nearest" });
  patchHash({ id }, { push });
}

async function mark(id, status) {
  const d = $("[data-detail]");
  $$("button", d).forEach(b => b.disabled = true);
  try {
    await setRegistrationStatus(id, status, ME);
    const r = ALL.find(x => x.id === id);
    if (r) r.status = status;
    render();
    openDetail(id);
  } catch (ex) {
    $$("button", d).forEach(b => b.disabled = false);
    flash(ex?.code === "permission-denied"
      ? "The rules refused that change. Your account may no longer be an administrator."
      : `Could not update this registration: ${ex?.message || ex}`);
  }
}

/* ---------------------------------------------------------------- CSV export */

/** RFC 4180: quote everything, double the quotes inside. A name with a comma in
 *  it is not exotic, and a spreadsheet that silently splits one person into two
 *  columns is worse than no export. */
const csvCell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function toCSV(rows) {
  const cols = [
    ["full_name", "Name"], ["email", "Email"], ["event", "Event"],
    ["position", "Role"], ["organization", "Organisation"], ["profile", "Profile"],
    ["profile_other", "Profile (other)"], ["learn", "Wants to learn"],
    ["speaker_question", "Question for speaker"], ["source", "Heard via"],
    ["updates", "Wants updates"], ["status", "Status"], ["registered", "Registered"],
  ];
  const head = cols.map(c => csvCell(c[1])).join(",");
  const body = rows.map(r => cols.map(([k]) => {
    if (k === "status")     return csvCell(regStatusOf(r));
    if (k === "registered") return csvCell(when(r.createdAt));
    if (k === "updates")    return csvCell(r.updates === true ? "yes" : "no");
    return csvCell(r[k]);
  }).join(",")).join("\r\n");
  // A BOM, so Excel opens Filipino names and em dashes as UTF-8 instead of mojibake.
  return "﻿" + head + "\r\n" + body + "\r\n";
}

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function flash(msg) {
  const el = $("[data-flash]");
  if (!el) return;
  el.textContent = msg; el.hidden = !msg;
}

/* --------------------------------------------------------------------- boot */

function wireFilters() {
  const sync = () => {
    render();
    $("[data-detail]").hidden = true;
    patchHash({ id: "" }, { push: true });
  };
  $("[data-f-event]")  ?.addEventListener("change", e => { state.event   = e.target.value; sync(); });
  $("[data-f-status]") ?.addEventListener("change", e => { state.status  = e.target.value; sync(); });
  $("[data-f-profile]")?.addEventListener("change", e => { state.profile = e.target.value; sync(); });
  $("[data-f-q]")      ?.addEventListener("input",  e => { state.q       = e.target.value; render(); });

  $("[data-export]")?.addEventListener("click", () => {
    const rows = visible();
    if (!rows.length) return flash("There is nothing to export with these filters.");
    flash("");
    const tag = (state.event || "all-events").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    download(`paaipe-registrations-${tag}.csv`, toCSV(rows));
  });

  $("[data-rows]")?.addEventListener("click", e => {
    const tr = e.target.closest("tr[data-id]");
    if (tr && e.target.closest("[data-view]")) openDetail(tr.dataset.id);
  });

  $("[data-detail]")?.addEventListener("click", e => {
    if (e.target.closest("[data-close]")) {
      $("[data-detail]").hidden = true;
      patchHash({ id: "" }, { push: true });
      return;
    }
    const m = e.target.closest("[data-mark]");
    if (m) mark($("[data-detail]").dataset.id, m.dataset.mark);
  });
}

function fillSelect(sel, values, allLabel) {
  if (!sel) return;
  sel.innerHTML = `<option value="">${esc(allLabel)}</option>` +
    values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
}

(async function () {
  if (!$("[data-admin-registrations]")) return;
  renderAdminNav("admin-registrations.html");

  let me = null;
  try { me = await currentAgent(); } catch { me = null; }
  if (!me) { location.replace("admin.html"); return; }
  let ok = false;
  try { ok = await isAdminNow(); } catch {
    flash("PAAIPE could not be reached. Nothing is shown rather than an empty list that would read as 'no registrations'.");
    document.documentElement.setAttribute("data-admin-regs", "offline");
    return;
  }
  if (!ok) { await signOutNow().catch(() => {}); location.replace("admin.html?denied=1"); return; }

  ME = me.email;
  renderAdminTop({ title: 'Registrations', subtitle: 'Everyone who filled in the form on paaipe.org', email: me.email });
  renderCrumbs([["Dashboard","admin.html"],"Registrations"]);
  document.addEventListener("click", e => {
    if (e.target.closest("[data-admin-signout]")) {
      e.preventDefault(); signOutNow().catch(() => {}).then(() => location.replace("admin.html"));
    }
  });

  try {
    ALL = await listRegistrations();
  } catch (ex) {
    flash(`Could not load registrations: ${ex?.message || ex}`);
    document.documentElement.setAttribute("data-admin-regs", "error");
    return;
  }

  setNavBadge("registrations", ALL.length);
  fillSelect($("[data-f-event]"),   eventsIn(ALL),   "All events");
  fillSelect($("[data-f-profile]"), profilesIn(ALL), "All profiles");
  wireFilters();
  render();
  const applyRegLoc = () => {
    const id = readHash().id;
    const d = $("[data-detail]");
    if (!id) {
      if (d) d.hidden = true;
      return;
    }
    if (d && !d.hidden && d.dataset.id === id) return;
    openDetail(id, { push: false });
  };
  applyRegLoc();
  onViewChange(applyRegLoc);
  document.documentElement.setAttribute("data-admin-regs", String(ALL.length));
})();
