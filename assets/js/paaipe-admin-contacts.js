/* PAAIPE admin — Contacts.
 *
 * Read-only against Clarence's live API:
 *   GET /v1/admin/contacts
 *   GET /v1/admin/contacts/{id}
 * POST/PATCH/DELETE contacts 404 — do not invent writes. Agent confirmation
 * and registration status stay on those screens.
 */
import { currentAgent, isAdminNow, signOutNow, idTokenForRequest } from "/assets/js/paaipe-firebase.js";
import { listAdminContacts, getAdminContact, normalizeContact } from "/assets/js/paaipe-api.js";
import { renderAdminNav, renderAdminTop, renderCrumbs } from "/assets/js/paaipe-admin.js";
import { readHash, patchHash, onViewChange } from "/assets/js/paaipe-view-url.js";
import { TYPE_ORDER } from "/assets/js/paaipe-contacts-join.mjs";

const $  = (s, r = document) => r.querySelector(s);
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

const TYPE_PILL = {
  guest:      ["pill warn", "Guest"],
  agent:      ["pill ok",   "Agent"],
  suspended:  ["pill err",  "Suspended"],
  registrant: ["pill info", "Registrant"],
  applicant:  ["pill warn", "Partner applicant"],
  partner:    ["pill ok",   "Partner"],
  admin:      ["pill info", "Admin"],
};

const state = { types: new Set(), q: "", open: "" };
let PEOPLE = [];

function when(ms) {
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" });
}

function flash(msg, good = false) {
  const el = $("[data-flash]");
  if (!el) return;
  el.textContent = msg || "";
  el.hidden = !msg;
  el.className = `flash${good ? " ok" : ""}`;
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
  const list = Array.isArray(types) ? types : [];
  if (!list.length) return "";
  return `<span class="${wrap}">${list.map(id => {
    const [cls, label] = TYPE_PILL[id] || ["pill", id];
    return `<span class="${cls}">${esc(label)}</span>`;
  }).join("")}</span>`;
}

function stack(lines) {
  if (!lines.length) return "";
  return `<span class="cell-stack">${lines.map(l => `<span>${esc(l)}</span>`).join("")}</span>`;
}

function visible() {
  const q = state.q.trim().toLowerCase();
  return PEOPLE.filter(p => {
    if (state.types.size && !(p.types || []).some(t => state.types.has(t))) return false;
    if (!q) return true;
    const hay = [p.displayName, p.email, ...(p.companies || []), ...(p.events || []), ...(p.phones || [])]
      .join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function renderChips() {
  const host = $("[data-chips]");
  if (!host) return;
  const known = new Set(PEOPLE.flatMap(p => p.types || []));
  const all = state.types.size === 0;
  host.innerHTML = CHIPS.filter(([id]) => id === "all" || known.has(id) || state.types.has(id))
    .map(([id, label]) => {
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
    const on = p.emailKey === state.open || p.id === state.open ? " on" : "";
    return `<tr class="${on.trim()}" data-email="${esc(p.emailKey || p.id)}">
      <td><b>${esc(p.displayName)}</b></td>
      <td>${esc(p.email)}</td>
      <td>${pills(p.types)}</td>
      <td>${stack(p.events)}</td>
      <td>${stack(p.companies)}</td>
      <td class="num">${esc(when(p.addedMs))}</td>
    </tr>`;
  }).join("");
}

function fieldRow(label, value, { href } = {}) {
  const text = String(value || "").trim();
  if (!text) return "";
  const dd = href
    ? `<a href="${esc(href)}">${esc(text)}</a>`
    : esc(text);
  return `<div class="ans"><dt>${esc(label)}</dt><dd>${dd}</dd></div>`;
}

function renderDetail() {
  const d = $("[data-detail]");
  if (!d) return;
  const person = PEOPLE.find(p => p.emailKey === state.open || p.id === state.open);
  if (!person) {
    d.hidden = true;
    d.innerHTML = "";
    return;
  }
  const added = when(person.addedMs);
  d.innerHTML = `
    <div class="dhead">
      <div class="papp-title"><b>${esc(person.displayName)}</b>${pills(person.types, { row: true })}</div>
      <button type="button" class="btn btn-ghost btn-sm" data-close>Close</button>
    </div>
    <p class="dmeta">${esc(person.email)}${added ? ` · ${esc(added)}` : ""}</p>
    <dl class="answers">
      ${fieldRow("Email", person.email, person.email ? { href: `mailto:${person.email}` } : {})}
      ${person.phones.map(p => fieldRow("Phone", p, { href: `tel:${p}` })).join("")}
      ${person.companies.map(c => fieldRow("Company", c)).join("")}
      ${person.events.map(e => fieldRow("Event", e)).join("")}
    </dl>
    <p class="muted small">Contacts are read-only on the API. Edits, deletes, Agent confirmation and registration status are not on this screen.</p>`;
  d.hidden = false;
  d.dataset.email = person.emailKey || person.id;
}

function render() {
  renderRows();
  renderDetail();
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
    const still = visible().some(p => p.emailKey === state.open || p.id === state.open);
    if (!still) state.open = "";
    render();
    writeView({ push: true });
  });
  $("[data-f-q]")?.addEventListener("input", e => {
    state.q = e.target.value;
    const still = visible().some(p => p.emailKey === state.open || p.id === state.open);
    if (!still) state.open = "";
    render();
  });
  $("[data-rows]")?.addEventListener("click", async e => {
    const tr = e.target.closest("tr[data-email]");
    if (!tr) return;
    state.open = tr.dataset.email;
    render();
    writeView({ push: true });
    $("[data-detail]")?.scrollIntoView({ block: "nearest" });
    const person = PEOPLE.find(p => p.emailKey === state.open || p.id === state.open);
    if (!person?.id) return;
    try {
      const token = await idTokenForRequest();
      const one = await getAdminContact(person.id, { token });
      const idx = PEOPLE.findIndex(p => p.id === person.id);
      if (idx >= 0) PEOPLE[idx] = { ...PEOPLE[idx], ...one };
      render();
    } catch {
      /* list row is enough; a failed detail fetch must not blank the list */
    }
  });
  $("[data-detail]")?.addEventListener("click", e => {
    if (e.target.closest("[data-close]")) {
      state.open = "";
      render();
      writeView({ push: true });
    }
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
    const token = await idTokenForRequest();
    PEOPLE = (await listAdminContacts({ token })).map(normalizeContact).filter(Boolean);
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
  state.types = typesFromHash();
  const id = (readHash().id || "").trim().toLowerCase();
  state.open = PEOPLE.some(p => p.emailKey === id || String(p.id).toLowerCase() === id) ? id : "";
  render();
  renderAdminNav("admin-contacts.html");
  onViewChange(() => {
    state.types = typesFromHash();
    const next = (readHash().id || "").trim().toLowerCase();
    state.open = PEOPLE.some(p => p.emailKey === next || String(p.id).toLowerCase() === next) ? next : "";
    render();
    renderAdminNav("admin-contacts.html");
  });
  document.documentElement.setAttribute("data-admin-contacts-state", String(PEOPLE.length));
})();
