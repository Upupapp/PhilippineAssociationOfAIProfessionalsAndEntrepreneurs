/* PAAIPE admin — Contacts.
 *
 * One row per email we already hold. Reads the same collections the other
 * admin pages already read. Does not call an API, and does not invent a
 * contacts collection. The Partner decision band stays on Partner applications.
 */
import {
  currentAgent, isAdminNow, signOutNow, confirmMember, setRegistrationStatus,
  listMembers, listRegistrations, REG_STATUS, firebaseConfig, DATABASE_ID,
} from "/assets/js/paaipe-firebase.js";
import {
  COL, listEvents, listOrganizations, listEventSponsors,
} from "/assets/js/paaipe-events-data.js";
import { renderAdminNav, renderAdminTop, renderCrumbs, setNavBadge } from "/assets/js/paaipe-admin.js";
import { readHash, patchHash, onViewChange } from "/assets/js/paaipe-view-url.js";
import {
  ADMIN_ALLOWLIST, TYPE_ORDER, joinContacts, filterContacts,
} from "/assets/js/paaipe-contacts-join.mjs";

const SDK = "https://www.gstatic.com/firebasejs/12.19.0";
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const CHIPS = [
  ["all",        "All"],
  ["guest",      "Guest"],
  ["agent",      "Agent"],
  ["suspended",  "Suspended"],
  ["registrant", "Registrant"],
  ["applicant",  "Partner applicant"],
  ["partner",    "Partner"],
  ["admin",      "Admin"],
];

/* Existing admin pills. No new colours. */
const TYPE_PILL = {
  guest:      ["pill warn", "Guest"],
  agent:      ["pill ok",   "Agent"],
  suspended:  ["pill err",  "Suspended"],
  registrant: ["pill info", "Registrant"],
  applicant:  ["pill warn", "Partner applicant"],
  partner:    ["pill ok",   "Partner"],
  admin:      ["pill info", "Admin"],
};
const AGENT_PILL = {
  guest:     ["pill warn", "Guest · awaiting confirmation"],
  agent:     ["pill ok",   "Agent"],
  suspended: ["pill err",  "Suspended"],
};
const REG_PILL = {
  [REG_STATUS.REGISTERED]: ["pill info", "Registered"],
  [REG_STATUS.ATTENDED]:   ["pill ok",   "Attended"],
  [REG_STATUS.NO_SHOW]:    ["pill warn", "No-show"],
  [REG_STATUS.CANCELLED]:  ["pill err",  "Cancelled"],
};
const APP_LABEL = {
  new: "New", contacted: "Contacted", in_discussion: "In discussion",
  accepted: "Accepted", declined: "Declined", spam: "Spam",
};
const APP_PILL = {
  new: "warn", contacted: "info", in_discussion: "info",
  accepted: "ok", declined: "", spam: "err",
};

const state = { types: new Set(), q: "", open: "" };
let PEOPLE = [];
let AGENTS = [];
let ME = "";

function when(ms) {
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" });
}
function whenOf(ts) {
  const d = ts?.toDate ? ts.toDate()
    : ts instanceof Date ? ts
    : Number.isFinite(ts?.seconds) ? new Date(ts.seconds * 1000)
    : null;
  if (!d || isNaN(d)) return "";
  return d.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" });
}

function flash(msg, good = false) {
  const el = $("[data-flash]");
  if (!el) return;
  el.textContent = msg || "";
  el.hidden = !msg;
  el.className = `flash${good ? " ok" : ""}`;
}

async function db() {
  const { initializeApp, getApps } = await import(`${SDK}/firebase-app.js`);
  const { getFirestore } = await import(`${SDK}/firebase-firestore.js`);
  const app = getApps().find(a => a.name === "paaipe") || initializeApp(firebaseConfig, "paaipe");
  return getFirestore(app, DATABASE_ID);
}

async function listAll(colName) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const snap = await F.getDocs(F.collection(await db(), colName));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function typesFromHash() {
  const raw = readHash().types || "";
  const set = new Set();
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (TYPE_ORDER.includes(id)) set.add(id);
  }
  return set;
}

function writeView({ push = true } = {}) {
  const types = [...state.types].sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b));
  patchHash({
    types: types.length ? types.join(",") : "",
    id: state.open || "",
  }, { push });
  renderAdminNav("admin-contacts.html");
}

function pills(types, { row = false } = {}) {
  const wrap = row ? "type-row" : "type-stack";
  return `<span class="${wrap}">${types.map(id => {
    const [cls, label] = TYPE_PILL[id] || ["pill", id];
    return `<span class="${cls}">${esc(label)}</span>`;
  }).join("")}</span>`;
}

function stack(lines) {
  if (!lines.length) return "";
  return `<span class="cell-stack">${lines.map(l => `<span>${esc(l)}</span>`).join("")}</span>`;
}

function visible() {
  return filterContacts(PEOPLE, { query: state.q, types: [...state.types] });
}

function renderChips() {
  const host = $("[data-chips]");
  if (!host) return;
  const all = state.types.size === 0;
  host.innerHTML = CHIPS.map(([id, label]) => {
    const on = id === "all" ? all : state.types.has(id);
    return `<button type="button" class="chip${on ? " on" : ""}" data-type="${esc(id)}" aria-pressed="${on ? "true" : "false"}">${esc(label)}</button>`;
  }).join("");
}

function renderRows() {
  const rows = visible();
  const body = $("[data-rows]");
  const count = $("[data-count]");
  if (count) {
    const n = PEOPLE.length;
    const word = n === 1 ? "contact" : "contacts";
    count.textContent = `${rows.length} of ${n} ${word}`;
  }
  renderChips();
  if (!body) return;
  if (!PEOPLE.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">No one is here yet.</td></tr>`;
    return;
  }
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">No one matches these filters.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(p => {
    const on = p.emailKey === state.open ? " on" : "";
    return `<tr class="${on.trim()}" data-email="${esc(p.emailKey)}">
      <td><b>${esc(p.displayName)}</b></td>
      <td>${esc(p.email)}</td>
      <td>${pills(p.types)}</td>
      <td>${stack(p.events)}</td>
      <td>${stack(p.companies)}</td>
      <td class="num">${esc(when(p.addedMs))}</td>
    </tr>`;
  }).join("");
}

function nextAgentNumber() {
  const used = AGENTS.map(m => parseInt(m.agentNumber, 10)).filter(Number.isFinite);
  return String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0");
}

function agentBlock(agent) {
  const status = AGENT_PILL[agent.status] ? agent.status : "";
  const [cls, label] = status ? AGENT_PILL[status] : ["pill", ""];
  const date = whenOf(agent.createdAt);
  const confirm = status === "guest" ? `
    <span class="confirm">
      <input type="text" size="4" value="${esc(nextAgentNumber())}" data-number
             aria-label="Agent number for ${esc(agent.full_name || agent.email || "")}">
      <button type="button" class="btn btn-gold btn-sm" data-confirm data-uid="${esc(agent.uid || "")}">Confirm as Agent</button>
    </span>` : "";
  return `<section class="papp-band" data-band="agent">
    <h3 class="ehead">Agent</h3>
    <p class="dmeta">${status ? `<span class="${cls}">${esc(label)}</span>` : ""}
      ${date ? `<span class="muted">${esc(date)}</span>` : ""}</p>
    ${confirm}
  </section>`;
}

function registrationBlock(r) {
  const [cls, label] = REG_PILL[r.status] || REG_PILL[REG_STATUS.REGISTERED];
  const date = whenOf(r.createdAt);
  return `<section class="papp-band" data-band="registration">
    <h3 class="ehead">Registration</h3>
    <p class="dmeta"><span class="${cls}">${esc(label)}</span>
      ${r.eventLabel ? `<span>${esc(r.eventLabel)}</span>` : ""}
      ${date ? `<span class="muted">${esc(date)}</span>` : ""}</p>
    <div class="dacts">
      <button type="button" class="btn btn-gold btn-sm" data-mark="${REG_STATUS.ATTENDED}" data-reg="${esc(r.id)}">Mark attended</button>
      <button type="button" class="btn btn-ghost btn-sm" data-mark="${REG_STATUS.NO_SHOW}" data-reg="${esc(r.id)}">No-show</button>
      <button type="button" class="btn btn-ghost btn-sm" data-mark="${REG_STATUS.REGISTERED}" data-reg="${esc(r.id)}">Back to registered</button>
      <button type="button" class="btn btn-ghost btn-sm danger" data-mark="${REG_STATUS.CANCELLED}" data-reg="${esc(r.id)}">Cancel</button>
    </div>
    <p class="muted small">Cancelling records a status. It never deletes the registration —
      what someone submitted is not ours to make disappear.</p>
  </section>`;
}

function applicationBlock(a) {
  const st = a.status || "";
  const known = APP_LABEL[st];
  const pill = known
    ? `<span class="pill ${APP_PILL[st] || ""}">${esc(known)}</span>`
    : (textish(st) ? `<span class="pill">${esc(st)}</span>` : "");
  return `<section class="papp-band" data-band="application">
    <h3 class="ehead">Partner application</h3>
    <p class="dmeta">${pill}
      ${a.eventLabel ? `<span>${esc(a.eventLabel)}</span>` : ""}</p>
    ${a.companyName ? `<p>${esc(a.companyName)}</p>` : ""}
    ${a.reference ? `<p class="muted">${esc(a.reference)}</p>` : ""}
    <p><a href="admin-partners.html?id=${esc(a.id)}">Open this Partner application</a></p>
  </section>`;
}

function textish(s) { return String(s || "").trim(); }

function renderDetail() {
  const d = $("[data-detail]");
  if (!d) return;
  const person = PEOPLE.find(p => p.emailKey === state.open);
  if (!person) {
    d.hidden = true;
    d.innerHTML = "";
    return;
  }
  const added = when(person.addedMs);
  const phone = person.phones.length
    ? `<p class="dmeta">${person.phones.map(p => esc(p)).join("<br>")}</p>` : "";
  const sources = [
    ...person.agents.map(agentBlock),
    ...person.registrations.map(registrationBlock),
    ...person.applications.map(applicationBlock),
    person.types.includes("partner") ? `<section class="papp-band" data-band="partner">
      <h3 class="ehead">Partner</h3>
      ${person.partnerOrgs.map(o => `<p>${esc(o.name)}</p>`).join("")}
    </section>` : "",
    person.admin ? `<section class="papp-band" data-band="admin">
      <p>Allow-listed administrator</p>
    </section>` : "",
  ].join("");
  d.innerHTML = `
    <div class="dhead">
      <div class="papp-title"><b>${esc(person.displayName)}</b>${pills(person.types, { row: true })}</div>
      <button type="button" class="btn btn-ghost btn-sm" data-close>Close</button>
    </div>
    <p class="dmeta">${esc(person.email)}${added ? ` · ${esc(added)}` : ""}</p>
    ${phone}
    ${sources}`;
  d.hidden = false;
  d.dataset.email = person.emailKey;
}

function render() {
  renderRows();
  renderDetail();
}

function rebuild(open) {
  PEOPLE = joinContacts({
    agents: AGENTS,
    registrations: REGS,
    applications: APPS,
    organizations: ORGS,
    sponsors: SPONSORS,
    events: EVENTS,
    adminEmails: ADMIN_ALLOWLIST,
  });
  if (open) state.open = open;
  const guests = AGENTS.filter(a => a.status === "guest").length;
  setNavBadge("pending", guests);
  setNavBadge("registrations", REGS.length);
  render();
  writeView({ push: false });
}

let REGS = [], APPS = [], ORGS = [], SPONSORS = [], EVENTS = [];

async function confirm(uid, number) {
  const n = String(number || "").trim();
  if (!n) return flash("Give the Agent a number before confirming.");
  const buttons = $$("button", $("[data-detail]"));
  buttons.forEach(b => b.disabled = true);
  try {
    await confirmMember(uid, n, ME);
    const agent = AGENTS.find(a => a.uid === uid);
    if (agent) {
      agent.status = "agent";
      agent.agentNumber = n;
    }
    flash("Confirmed.", true);
    rebuild(state.open);
  } catch (ex) {
    buttons.forEach(b => b.disabled = false);
    flash(ex?.code === "permission-denied"
      ? "The rules refused to confirm this member. Your account may no longer be an administrator."
      : `Could not confirm this member: ${ex?.message || ex}`);
  }
}

async function mark(id, status) {
  const buttons = $$("button", $("[data-detail]"));
  buttons.forEach(b => b.disabled = true);
  try {
    await setRegistrationStatus(id, status, ME);
    const r = REGS.find(x => x.id === id);
    if (r) r.status = status;
    flash("Saved.", true);
    rebuild(state.open);
  } catch (ex) {
    buttons.forEach(b => b.disabled = false);
    flash(ex?.code === "permission-denied"
      ? "The rules refused that change. Your account may no longer be an administrator."
      : `Could not update this registration: ${ex?.message || ex}`);
  }
}

function wire() {
  $("[data-chips]")?.addEventListener("click", e => {
    const btn = e.target.closest("[data-type]");
    if (!btn) return;
    const id = btn.dataset.type;
    if (id === "all") state.types.clear();
    else {
      if (state.types.has(id)) state.types.delete(id);
      else state.types.add(id);
    }
    const still = visible().some(p => p.emailKey === state.open);
    if (!still) state.open = "";
    render();
    writeView({ push: true });
  });
  $("[data-f-q]")?.addEventListener("input", e => {
    state.q = e.target.value;
    const still = visible().some(p => p.emailKey === state.open);
    if (!still) state.open = "";
    render();
  });
  $("[data-rows]")?.addEventListener("click", e => {
    const tr = e.target.closest("tr[data-email]");
    if (!tr) return;
    state.open = tr.dataset.email;
    render();
    writeView({ push: true });
    $("[data-detail]")?.scrollIntoView({ block: "nearest" });
  });
  $("[data-detail]")?.addEventListener("click", e => {
    if (e.target.closest("[data-close]")) {
      state.open = "";
      render();
      writeView({ push: true });
      return;
    }
    const c = e.target.closest("[data-confirm]");
    if (c) {
      const input = $("[data-number]", c.parentElement);
      return confirm(c.dataset.uid, input?.value);
    }
    const m = e.target.closest("[data-mark]");
    if (m) mark(m.dataset.reg, m.dataset.mark);
  });
}

(async function boot() {
  if (!$("[data-admin-contacts]")) return;
  renderAdminNav("admin-contacts.html");

  let me = null;
  try { me = await currentAgent(); } catch { me = null; }
  if (!me) { location.replace("admin.html"); return; }
  let ok = false;
  try { ok = await isAdminNow(); } catch {
    flash("PAAIPE could not be reached. Nothing is shown rather than an empty list that would read as no one.");
    document.documentElement.setAttribute("data-admin-contacts-state", "offline");
    return;
  }
  if (!ok) { await signOutNow().catch(() => {}); location.replace("admin.html?denied=1"); return; }

  ME = me.email;
  renderAdminTop({
    title: "Contacts",
    subtitle: "Everyone we already have, one row per email.",
    email: me.email,
  });
  renderCrumbs([["Dashboard", "admin.html"], "Contacts"]);
  document.addEventListener("click", e => {
    if (e.target.closest("[data-admin-signout]")) {
      e.preventDefault();
      signOutNow().catch(() => {}).then(() => location.replace("admin.html"));
    }
  });

  try {
    [AGENTS, REGS, APPS, ORGS, EVENTS] = await Promise.all([
      listMembers(),
      listRegistrations(),
      listAll(COL.partners),
      listOrganizations({ asAdmin: true }),
      listEvents({ asAdmin: true }),
    ]);
    const sponsorLists = await Promise.all(EVENTS.map(ev =>
      ev?.id ? listEventSponsors(ev.id, { asAdmin: true }) : []));
    SPONSORS = sponsorLists.flat();
  } catch (ex) {
    const msg = ex?.message || String(ex);
    flash(`Could not load Contacts: ${msg}`);
    const body = $("[data-rows]");
    if (body) body.innerHTML = `<tr><td colspan="6" class="empty">Could not load contacts: ${esc(msg)}</td></tr>`;
    const count = $("[data-count]");
    if (count) count.textContent = "";
    document.documentElement.setAttribute("data-admin-contacts-state", "error");
    return;
  }

  wire();
  PEOPLE = joinContacts({
    agents: AGENTS, registrations: REGS, applications: APPS,
    organizations: ORGS, sponsors: SPONSORS, events: EVENTS,
    adminEmails: ADMIN_ALLOWLIST,
  });
  state.types = typesFromHash();
  const id = (readHash().id || "").trim().toLowerCase();
  state.open = PEOPLE.some(p => p.emailKey === id) ? id : "";
  setNavBadge("pending", AGENTS.filter(a => a.status === "guest").length);
  setNavBadge("registrations", REGS.length);
  render();
  renderAdminNav("admin-contacts.html");
  onViewChange(() => {
    state.types = typesFromHash();
    const next = (readHash().id || "").trim().toLowerCase();
    state.open = PEOPLE.some(p => p.emailKey === next) ? next : "";
    render();
    renderAdminNav("admin-contacts.html");
  });
  document.documentElement.setAttribute("data-admin-contacts-state", String(PEOPLE.length));
})();
