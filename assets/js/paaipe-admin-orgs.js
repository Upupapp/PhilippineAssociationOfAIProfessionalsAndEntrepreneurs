/* PAAIPE admin — organizations and event sponsorships.
 *
 * This is the other end of the same wire. Everything written here is read by the
 * public event page and the Partners page, live, with no rebuild: change a logo
 * and it changes in both places, because it is stored once.
 *
 * Two rules from the brief are enforced here AND in firestore.rules, because a
 * limit that lives only in a form is a limit the next form forgets:
 *   - at most one PRESENTING and three SUPPORTING sponsors per event
 *   - an organization with sponsorships cannot be deleted, only deactivated
 * The second is absolute: the rules refuse delete outright, for everyone.
 */
import { currentAgent, isAdminNow, signOutNow } from "/assets/js/paaipe-firebase.js";
import { renderAdminNav } from "/assets/js/paaipe-admin.js";
import {
  COL, TIER, SPONSOR_STATUS, TIER_LIMITS,
  listOrganizations, listEvents, listEventSponsors, groupSponsors,
} from "/assets/js/paaipe-events-data.js";
import { firebaseConfig, DATABASE_ID } from "/assets/js/paaipe-firebase.js";

const SDK = "https://www.gstatic.com/firebasejs/12.19.0";
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let ME = "", ORGS = [], EVENTS = [], EVENT_ID = "", SPONSORS = [];

async function db() {
  const { initializeApp, getApps } = await import(`${SDK}/firebase-app.js`);
  const { getFirestore } = await import(`${SDK}/firebase-firestore.js`);
  const app = getApps().find(a => a.name === "paaipe") || initializeApp(firebaseConfig, "paaipe");
  return getFirestore(app, DATABASE_ID);
}

/** Every write that changes what the public sees leaves a trace. The log is
 *  append-only in the rules, so this is a record and not a draft of one. */
async function logActivity(action, details, eventId = null) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  try {
    await F.addDoc(F.collection(await db(), COL.log),
      { action, details, eventId, actor: ME, at: F.serverTimestamp() });
  } catch (e) {
    // The change itself succeeded; say the log did not rather than pretend.
    flash(`Saved, but the activity log was not written: ${e?.message || e}`);
  }
}

function flash(msg, good = false) {
  const el = $("[data-flash]");
  if (!el) return;
  el.textContent = msg;
  el.hidden = !msg;
  el.classList.toggle("ok", !!good);
}

/* ------------------------------------------------------------ organizations */

function renderOrgs() {
  const body = $("[data-orgs]");
  if (!body) return;
  $("[data-org-count]").textContent =
    `${ORGS.length} ${ORGS.length === 1 ? "organization" : "organizations"}`;
  body.innerHTML = ORGS.length ? ORGS.map(o => `
    <tr data-org="${esc(o.id)}">
      <td><img src="${esc(o.logoUrl || "")}" alt="" style="height:26px;width:auto;vertical-align:middle;margin-right:10px">
          <b style="display:inline">${esc(o.name)}</b></td>
      <td>${o.website ? `<a href="${esc(o.website)}" target="_blank" rel="noopener">${esc(o.website.replace(/^https?:\/\//, "").slice(0, 34))}</a>` : '<span class="dash">—</span>'}</td>
      <td>${esc(o.type || "—")}</td>
      <td><span class="pill ${o.status === "active" ? "ok" : "warn"}">${esc(o.status || "—")}</span></td>
      <td class="act"><button class="btn btn-ghost btn-sm" data-edit-org>Edit</button></td>
    </tr>`).join("")
    : `<tr><td colspan="5" class="empty">No organization has been added yet. Run scripts/seed-events.mjs to load the four PAAIPE partners.</td></tr>`;
}

function openOrgEditor(id) {
  const o = ORGS.find(x => x.id === id);
  if (!o) return;
  const d = $("[data-org-editor]");
  d.innerHTML = `
    <div class="dhead"><div><b>${esc(o.name)}</b><small>${esc(o.id)}</small></div>
      <button class="btn btn-ghost btn-sm" data-close>Close</button></div>
    <div class="f"><label>Name</label><input data-o-name value="${esc(o.name || "")}" maxlength="120"></div>
    <div class="f"><label>Website</label><input data-o-web value="${esc(o.website || "")}" maxlength="300"></div>
    <div class="f"><label>Logo path</label><input data-o-logo value="${esc(o.logoUrl || "")}" maxlength="300"></div>
    <div class="f"><label>Status</label><select data-o-status>
      <option value="active"${o.status === "active" ? " selected" : ""}>active</option>
      <option value="inactive"${o.status !== "active" ? " selected" : ""}>inactive</option></select></div>
    <div class="dacts"><button class="btn btn-gold btn-sm" data-save-org>Save</button></div>
    <p class="note">Saving updates every event that credits this organization and the public
      Partners page, because the logo is stored once. Deleting is refused by the rules — an
      organization with sponsorships would leave them orphaned, so deactivate instead.</p>
    <p class="note"><b>Logo upload is not built.</b> There is no storage bucket wired up yet, so
      this takes a path to a file already in the repository rather than pretending to accept one.</p>`;
  d.hidden = false;
  d.dataset.org = id;
}

async function saveOrg(id) {
  const d = $("[data-org-editor]");
  const patch = {
    name:    $("[data-o-name]", d).value.trim(),
    website: $("[data-o-web]", d).value.trim(),
    logoUrl: $("[data-o-logo]", d).value.trim(),
    status:  $("[data-o-status]", d).value,
  };
  if (!patch.name) return flash("An organization needs a name.");
  $$("button", d).forEach(b => b.disabled = true);
  try {
    const F = await import(`${SDK}/firebase-firestore.js`);
    await F.setDoc(F.doc(await db(), COL.organizations, id), patch, { merge: true });
    await logActivity("organization.update", `${patch.name} (${id})`);
    Object.assign(ORGS.find(o => o.id === id), patch);
    renderOrgs();
    if (EVENT_ID) await loadSponsors();
    flash(`Saved. ${patch.name} is updated everywhere it appears.`, true);
    d.hidden = true;
  } catch (ex) {
    $$("button", d).forEach(b => b.disabled = false);
    flash(ex?.code === "permission-denied"
      ? "The rules refused that change."
      : `Could not save: ${ex?.message || ex}`);
  }
}

/* -------------------------------------------------------------- sponsorships */

function renderSponsorAdmin() {
  const body = $("[data-sponsor-rows]");
  if (!body) return;
  const g = groupSponsors(SPONSORS);
  const pub = $("[data-public-count]");
  if (pub) pub.textContent = String(g.presenting.length + g.supporting.length + g.community.length);

  body.innerHTML = SPONSORS.length ? SPONSORS.map(s => {
    const o = s.organization;
    const live = [SPONSOR_STATUS.CONFIRMED, SPONSOR_STATUS.DELIVERED].includes(s.status);
    return `<tr data-sponsor="${esc(s.id)}">
      <td><b>${esc(o ? o.name : "(missing organization)")}</b>
        <small>${live ? "shown publicly" : "not shown publicly — only confirmed sponsors are"}</small></td>
      <td><select data-s-tier>
        ${Object.values(TIER).map(t => `<option value="${t}"${s.tier === t ? " selected" : ""}>${t}</option>`).join("")}
      </select></td>
      <td><select data-s-status>
        ${Object.values(SPONSOR_STATUS).map(v => `<option value="${v}"${s.status === v ? " selected" : ""}>${v}</option>`).join("")}
      </select></td>
      <td class="num"><input data-s-order type="number" min="1" max="99" value="${Number(s.displayOrder) || 1}" style="width:58px"></td>
      <td class="act"><button class="btn btn-gold btn-sm" data-save-sponsor>Save</button></td>
    </tr>`;
  }).join("")
  : `<tr><td colspan="5" class="empty">No sponsor has been added to this event.</td></tr>`;

  const warn = $("[data-tier-warning]");
  if (warn) {
    const over = Object.entries(TIER_LIMITS)
      .filter(([tier, max]) => Number.isFinite(max) &&
        SPONSORS.filter(s => s.tier === tier &&
          [SPONSOR_STATUS.CONFIRMED, SPONSOR_STATUS.DELIVERED].includes(s.status)).length > max)
      .map(([tier, max]) => `${tier} allows ${max}`);
    warn.textContent = over.length ? `Over the limit: ${over.join("; ")}.` : "";
    warn.hidden = !over.length;
  }
}

async function saveSponsor(id) {
  const tr = $(`tr[data-sponsor="${CSS.escape(id)}"]`);
  const patch = {
    tier:         $("[data-s-tier]", tr).value,
    status:       $("[data-s-status]", tr).value,
    displayOrder: Number($("[data-s-order]", tr).value) || 1,
  };
  // the tier limit, checked against what WOULD be public after this change
  const after = SPONSORS.map(s => s.id === id ? { ...s, ...patch } : s)
    .filter(s => [SPONSOR_STATUS.CONFIRMED, SPONSOR_STATUS.DELIVERED].includes(s.status));
  const count = after.filter(s => s.tier === patch.tier).length;
  const max = TIER_LIMITS[patch.tier];
  if (Number.isFinite(max) && count > max)
    return flash(`An event may have at most ${max} ${patch.tier} sponsor${max === 1 ? "" : "s"}. That change would make ${count}.`);

  $$("button", tr).forEach(b => b.disabled = true);
  try {
    const F = await import(`${SDK}/firebase-firestore.js`);
    await F.setDoc(F.doc(await db(), COL.sponsors, id), patch, { merge: true });
    const row = SPONSORS.find(s => s.id === id);
    const org = row?.organization?.name || id;
    Object.assign(row, patch);
    await logActivity("sponsor.update", `${org}: ${patch.tier}/${patch.status}`, EVENT_ID);
    renderSponsorAdmin();
    flash([SPONSOR_STATUS.CONFIRMED, SPONSOR_STATUS.DELIVERED].includes(patch.status)
      ? `Saved. ${org} now appears on the public event page.`
      : `Saved. ${org} is no longer shown publicly.`, true);
  } catch (ex) {
    $$("button", tr).forEach(b => b.disabled = false);
    flash(ex?.code === "permission-denied" ? "The rules refused that change." : `Could not save: ${ex?.message || ex}`);
  }
}

async function loadSponsors() {
  SPONSORS = EVENT_ID ? await listEventSponsors(EVENT_ID) : [];
  renderSponsorAdmin();
}

/* --------------------------------------------------------------------- boot */

(async function () {
  if (!$("[data-admin-orgs]")) return;
  renderAdminNav("admin-organizations.html");

  let me = null;
  try { me = await currentAgent(); } catch { me = null; }
  if (!me) { location.replace("admin.html"); return; }
  let ok = false;
  try { ok = await isAdminNow(); }
  catch { flash("PAAIPE could not be reached. Nothing is shown rather than an empty list.");
          document.documentElement.setAttribute("data-admin-orgs", "offline"); return; }
  if (!ok) { await signOutNow().catch(() => {}); location.replace("admin.html?denied=1"); return; }

  ME = me.email;
  $$("[data-admin-email]").forEach(e => { e.textContent = me.email; });
  $("[data-admin-signout]")?.addEventListener("click", async e => {
    e.preventDefault(); await signOutNow().catch(() => {}); location.replace("admin.html");
  });

  try {
    [ORGS, EVENTS] = await Promise.all([listOrganizations(), listEvents()]);
  } catch (ex) {
    flash(`Could not load: ${ex?.message || ex}`);
    document.documentElement.setAttribute("data-admin-orgs", "error");
    return;
  }
  renderOrgs();

  const sel = $("[data-f-event]");
  if (sel) {
    sel.innerHTML = `<option value="">Choose an event…</option>` +
      EVENTS.map(e => `<option value="${esc(e.id)}">${esc(e.title)}</option>`).join("");
    sel.addEventListener("change", async e => { EVENT_ID = e.target.value; await loadSponsors(); });
    if (EVENTS.length) { EVENT_ID = EVENTS[EVENTS.length - 1].id; sel.value = EVENT_ID; await loadSponsors(); }
  }

  document.addEventListener("click", e => {
    const eo = e.target.closest("[data-edit-org]");
    if (eo) return openOrgEditor(eo.closest("tr").dataset.org);
    if (e.target.closest("[data-close]")) { $("[data-org-editor]").hidden = true; return; }
    if (e.target.closest("[data-save-org]")) return saveOrg($("[data-org-editor]").dataset.org);
    const ss = e.target.closest("[data-save-sponsor]");
    if (ss) return saveSponsor(ss.closest("tr").dataset.sponsor);
  });

  document.documentElement.setAttribute("data-admin-orgs", String(ORGS.length));
})();
