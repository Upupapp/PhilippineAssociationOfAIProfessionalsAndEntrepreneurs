/* PAAIPE portal — My Organization.
 *
 * One list for zero, one, or many orgs on this signed-in uid. Stacked cards;
 * no switcher, no second layout for a single org. Status pills are derived
 * (Not published / Under review / Partner). The member cannot set the pill
 * and cannot delete in v1.
 *
 * Guest and Agent see the same editor: Name required, Website optional.
 * The "Company or organization" line on My Profile is a personal line and
 * is not bound here.
 */
import { currentAgent } from "/assets/js/paaipe-firebase.js";
import {
  listMyOrganizations, saveMyOrganization, myApplications, organizationPill,
  listEvents, acceptsPartners,
} from "/assets/js/paaipe-events-data.js";
import { openPartnerApply } from "/assets/js/paaipe-partner.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const NOTE = "This is not public until PAAIPE confirms you as a Partner.";
const EMPTY_HEAD = "No organization yet.";
const EMPTY_BTN = "Add an organization.";
const EMPTY_SUB = "Add the company you speak for, then use it when you apply as a Partner. It stays unpublished until PAAIPE confirms the partnership.";

let ME = null;
let ORGS = [];
let APPS = [];

function hrefWeb(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function emptyHtml() {
  return `
    <div class="card org-empty" data-org-empty>
      <h2>${EMPTY_HEAD}</h2>
      <p>${esc(EMPTY_SUB)}</p>
      <button type="button" class="btn btn-gold" data-org-add>${EMPTY_BTN}</button>
    </div>`;
}

function cardHtml(o) {
  const pill = organizationPill(o, APPS);
  const web = String(o.website || "").trim();
  const isPartner = pill.key === "partner";
  return `
    <div class="card org-card" data-org-card data-org-id="${esc(o.id)}" data-org-pill="${esc(pill.key)}">
      <div class="hd" style="margin-bottom:8px">
        <h2 class="nm">${esc(o.name)}</h2>
        <span class="pill ${pill.cls}">${esc(pill.label)}</span>
      </div>
      ${web ? `<a class="web" href="${esc(hrefWeb(web))}" target="_blank" rel="noopener">${esc(web.replace(/^https?:\/\//i, ""))}</a>` : ""}
      <div class="ft">
        <div class="acts">
          <button type="button" class="btn btn-ghost btn-sm" data-org-edit>Edit</button>
          ${isPartner ? "" : `<button type="button" class="btn btn-gold btn-sm" data-org-apply>Apply as Partner</button>`}
        </div>
      </div>
    </div>`;
}

function listHtml() {
  return `
    <div data-org-list>
      <div class="hd">
        <h2>Your organizations</h2>
        <button type="button" class="btn btn-gold btn-sm" data-org-add>${EMPTY_BTN}</button>
      </div>
      <div class="org-stack">${ORGS.map(cardHtml).join("")}</div>
    </div>`;
}

function editorHtml(org) {
  const editing = Boolean(org);
  return `
    <div class="card org-editor" data-org-editor data-org-id="${esc(org?.id || "")}">
      <div class="hd"><h2>${editing ? "Edit organization" : "Add an organization"}</h2>
        <button type="button" class="btn btn-ghost btn-sm" data-org-cancel>Back</button></div>
      <form class="fields" novalidate data-org-form style="grid-template-columns:1fr">
        <div class="f full">
          <label for="org-name">Name</label>
          <input id="org-name" name="name" type="text" maxlength="120" required
                 autocomplete="organization" value="${esc(org?.name || "")}">
          <span class="org-err" data-name-err hidden>Please enter the organization name.</span>
        </div>
        <div class="f full">
          <label for="org-web">Website <small style="font-weight:500;color:var(--muted)">(optional)</small></label>
          <input id="org-web" name="website" type="url" maxlength="300"
                 placeholder="company.com" value="${esc(org?.website || "")}">
          <span class="org-err" data-web-err hidden>That doesn't look like a web address.</span>
        </div>
        <p class="org-note">${NOTE}</p>
        <p class="org-err" data-org-save-err hidden></p>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button type="submit" class="btn btn-gold" data-org-save>Save</button>
        </div>
      </form>
    </div>`;
}

function render(view, org) {
  const host = $("[data-org-panel]");
  if (!host) return;
  if (view === "editor") host.innerHTML = editorHtml(org);
  else if (!ORGS.length) host.innerHTML = emptyHtml();
  else host.innerHTML = listHtml();
  document.documentElement.setAttribute("data-org-view", view === "editor" ? "editor" : (ORGS.length ? "list" : "empty"));
  document.documentElement.setAttribute("data-org-count", String(ORGS.length));
}

function validWebsite(raw) {
  const s = String(raw || "").trim();
  if (!s) return true;
  return /^[^\s.]+\.[^\s]{2,}$/.test(s.replace(/^https?:\/\//i, ""));
}

async function onSave(form) {
  const name = form.elements.name.value.trim();
  const website = form.elements.website.value.trim();
  const nameErr = $("[data-name-err]", form);
  const webErr = $("[data-web-err]", form);
  const saveErr = $("[data-org-save-err]");
  nameErr.hidden = Boolean(name);
  webErr.hidden = validWebsite(website);
  if (saveErr) { saveErr.hidden = true; saveErr.textContent = ""; }
  if (!name || !validWebsite(website)) {
    if (!name) form.elements.name.focus();
    else form.elements.website.focus();
    return;
  }
  const id = $("[data-org-editor]")?.dataset.orgId || "";
  const btn = $("[data-org-save]", form);
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const saved = await saveMyOrganization({ id: id || undefined, name, website });
    if (id) {
      const row = ORGS.find(o => o.id === id);
      if (row) Object.assign(row, { name: saved.name, website: saved.website });
    } else {
      ORGS.push({ ...saved, status: saved.status || "inactive" });
      ORGS.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    }
    render("list");
  } catch (ex) {
    btn.disabled = false;
    btn.textContent = "Save";
    if (saveErr) {
      saveErr.hidden = false;
      saveErr.textContent = ex?.code === "permission-denied"
        ? "PAAIPE could not save this yet. The organization rules may not be deployed. Nothing was published."
        : `Could not save: ${ex?.message || ex}. Nothing was changed.`;
    }
  }
}

async function onApply(org) {
  let events = [];
  try { events = (await listEvents()).filter(acceptsPartners); } catch { events = []; }
  if (!events.length) {
    alert("No event is taking partners right now.");
    return;
  }
  if (events.length === 1) {
    openPartnerApply(events[0], "portal_organization", { organizationId: org.id });
    return;
  }
  const d = document.createElement("dialog");
  d.className = "org-events";
  d.setAttribute("data-org-events", "");
  d.innerHTML = `
    <div class="card" style="margin:0;border:0;box-shadow:none">
      <div class="hd"><h2>Apply as Partner</h2>
        <button type="button" class="btn btn-ghost btn-sm" data-cancel>Cancel</button></div>
      <p class="org-note" style="margin:0 0 12px">Choose an event to partner on with ${esc(org.name)}.</p>
      <div class="org-stack">${events.map(e => `
        <button type="button" class="btn btn-ghost" style="justify-content:flex-start;white-space:normal"
                data-pick-event="${esc(e.id)}">${esc(e.title || e.id)}</button>`).join("")}</div>
    </div>`;
  document.body.appendChild(d);
  d.showModal();
  d.addEventListener("click", e => {
    if (e.target === d || e.target.closest("[data-cancel]")) { d.close(); d.remove(); }
    const pick = e.target.closest("[data-pick-event]");
    if (!pick) return;
    const ev = events.find(x => x.id === pick.dataset.pickEvent);
    d.close(); d.remove();
    if (ev) openPartnerApply(ev, "portal_organization", { organizationId: org.id });
  });
}

function bind() {
  const root = $("[data-org-root]") || document;
  root.addEventListener("click", e => {
    if (e.target.closest("[data-org-add]")) { render("editor", null); return; }
    if (e.target.closest("[data-org-cancel]")) { render("list"); return; }
    const edit = e.target.closest("[data-org-edit]");
    if (edit) {
      const id = edit.closest("[data-org-card]")?.dataset.orgId;
      render("editor", ORGS.find(o => o.id === id) || null);
      return;
    }
    const apply = e.target.closest("[data-org-apply]");
    if (apply) {
      const id = apply.closest("[data-org-card]")?.dataset.orgId;
      const org = ORGS.find(o => o.id === id);
      if (org) onApply(org);
    }
  });
  root.addEventListener("submit", e => {
    const form = e.target.closest("[data-org-form]");
    if (!form) return;
    e.preventDefault();
    onSave(form);
  });
}

(async function boot() {
  if (!$("[data-org-panel]")) return;
  bind();
  let agent = null;
  try { agent = await currentAgent(); } catch { agent = null; }
  if (!agent) return; // paaipe-portal.js bounces unsigned-in visitors
  ME = agent;
  try {
    ORGS = await listMyOrganizations(agent.uid);
  } catch {
    $("[data-org-panel]").innerHTML =
      `<div class="card"><p>Organizations could not be loaded. This is not “none”.</p></div>`;
    document.documentElement.setAttribute("data-org-view", "error");
    return;
  }
  try {
    const mine = await myApplications(agent.uid);
    APPS = [...mine.values()];
  } catch { APPS = []; }
  const q = new URLSearchParams(location.search);
  if (q.get("new") === "1") render("editor", null);
  else if (q.get("id")) render("editor", ORGS.find(o => o.id === q.get("id")) || null);
  else render("list");
  document.documentElement.setAttribute("data-org-ready", "1");
})();
