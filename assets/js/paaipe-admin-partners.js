/* PAAIPE admin — partner applications.
 *
 * Companies that offered to support an event, what they offered, and what PAAIPE
 * did about it. Nothing here is public: firestore.rules refuses this collection
 * to everyone but an administrator and the applicant themselves.
 *
 * THE ORGANIZATION MATCH IS RECOMPUTED HERE, EVERY TIME.
 * An application carries only what the applicant typed. The link to a PAAIPE
 * organization is derived on this screen, from the live organization list, and
 * is never read from the application document - because the application document
 * was written by a member of the public. See matchOrganization() in
 * paaipe-events-data.js for why the alternative is a logo on paaipe.org for
 * anyone who asks.
 *
 * WHAT ACCEPTING DOES, and what it deliberately leaves to a human:
 * Accept creates the organization if there is no match, links it if there is,
 * creates the sponsorship as PROPOSED, and marks the application accepted. It
 * does NOT confirm the sponsorship: confirmed is what puts a logo on the public
 * event page, and that is a decision about a signed agreement, not a side effect
 * of tidying an inbox. Confirming stays on the Organizations screen where the
 * tier limits are enforced.
 *
 * Gaps this stack cannot honour (kept here, not drawn in the admin UI):
 * - Acknowledgement / notification emails on submit: no mail sender — no SMTP
 *   provider and no service account. The applicant gets a reference on screen.
 * - Communications composer with logged sends: same missing sender; templates
 *   open the administrator's mail app.
 * - Logo upload from the application form: no storage bucket, and a 2 MB file
 *   does not fit in a Firestore document.
 * - Per-role access (event_manager, content_editor, viewer): one administrator,
 *   named in firestore.rules. Everyone who can open this page can do everything
 *   on it.
 */
import {
  COL, PARTNER_STATUS, SUPPORT_TYPES, TIER, SPONSOR_STATUS,
  listEvents, listOrganizations, listEventSponsors,
  matchOrganization, referenceMatchesId, normaliseCompany,
} from "/assets/js/paaipe-events-data.js";
import { firebaseConfig, DATABASE_ID, currentAgent, isAdminNow, signOutNow } from "/assets/js/paaipe-firebase.js";
import { renderAdminNav, renderAdminTop, setNavBadge } from "/assets/js/paaipe-admin.js";

const SDK = "https://www.gstatic.com/firebasejs/12.19.0";
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let APPS = [], EVENTS = [], ORGS = [], ME = "";

const SUPPORT_LABEL = Object.fromEntries(SUPPORT_TYPES);
const STATUS_LABEL = {
  new: "New", contacted: "Contacted", in_discussion: "In discussion",
  accepted: "Accepted", declined: "Declined", spam: "Spam",
};
const STATUS_PILL = {
  new: "warn", contacted: "info", in_discussion: "info",
  accepted: "ok", declined: "", spam: "err",
};
const SOURCE_LABEL = {
  public_event: "Event page", events_list: "Events list", success_page: "After registering",
  portal_sessions: "Portal · Sessions", portal_events: "Portal · Events", portal_session: "Portal · Session",
};

const toDate = v =>
  v?.toDate ? v.toDate() : v instanceof Date ? v : Number.isFinite(v?.seconds) ? new Date(v.seconds * 1000) : null;
const dateShort = v => {
  const d = toDate(v);
  return d ? d.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" }) : "—";
};
const dateLong = v => {
  const d = toDate(v);
  return d ? d.toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" }) : "—";
};

async function db() {
  const { initializeApp, getApps } = await import(`${SDK}/firebase-app.js`);
  const { getFirestore } = await import(`${SDK}/firebase-firestore.js`);
  const app = getApps().find(a => a.name === "paaipe") || initializeApp(firebaseConfig, "paaipe");
  return getFirestore(app, DATABASE_ID);
}

async function logActivity(action, details, eventId = null) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  try {
    await F.addDoc(F.collection(await db(), COL.log),
      { action, details, eventId, actor: ME, at: F.serverTimestamp() });
  } catch (e) {
    flash(`The change was saved, but the activity log was not written: ${e?.message || e}`);
  }
}

function flash(msg, good = false) {
  const el = $("[data-flash]");
  if (!el) return;
  el.textContent = msg;
  el.className = `flash${good ? " ok" : ""}`;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 6000);
}

/* ------------------------------------------------------------------- reads */

async function listApplications() {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const snap = await F.getDocs(F.collection(await db(), COL.partners));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0));
}

/* ------------------------------------------------------------------ filters */

function filtered() {
  const ev = $("[data-f-event]")?.value || "";
  const st = $("[data-f-status]")?.value || "";
  const src = $("[data-f-source]")?.value || "";
  const q = ($("[data-f-q]")?.value || "").trim().toLowerCase();
  return APPS.filter(a => {
    if (ev && a.eventId !== ev) return false;
    if (st && a.status !== st) return false;
    if (src && a.source !== src) return false;
    if (q) {
      const hay = [a.companyName, a.contactName, a.email, a.reference, a.phone, a.website]
        .join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------------ render */

const pill = s =>
  `<span class="pill ${STATUS_PILL[s] || ""}">${esc(STATUS_LABEL[s] || s || "—")}</span>`;

function offeringChips(a) {
  const t = Array.isArray(a.supportTypes) ? a.supportTypes : [];
  if (!t.length) return `<span class="muted small">Not said</span>`;
  return `<div class="tags">${t.map(k =>
    `<span class="tag">${esc(SUPPORT_LABEL[k] || k)}</span>`).join("")}</div>`;
}

function renderTally() {
  const host = $("[data-tally]");
  if (!host) return;
  const rows = filtered();
  const n = s => rows.filter(r => r.status === s).length;
  host.innerHTML = Object.keys(STATUS_LABEL)
    .map(s => `<span><b>${n(s)}</b> ${esc(STATUS_LABEL[s].toLowerCase())}</span>`).join("");
}

function renderRows() {
  const body = $("[data-rows]");
  if (!body) return;
  const rows = filtered();
  $("[data-count]").textContent =
    `${rows.length} of ${APPS.length} application${APPS.length === 1 ? "" : "s"}`;
  renderTally();

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" class="empty">${
      APPS.length ? "No application matches these filters."
                  : "No company has applied to partner on an event yet."}</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(a => {
    const org = matchOrganization(a, ORGS);
    // A reference that does not belong to its own document was not written by
    // this site's form. Say so on the row rather than quoting it as fact.
    const forged = a.reference && !referenceMatchesId(a);
    return `<tr data-app="${esc(a.id)}">
      <td><b>${esc(a.reference || "—")}</b>${
        forged ? ` <span class="pill err" title="This reference does not match the document it is stored on, so it was not issued by the site's own form.">CHECK</span>` : ""}${
        a.isSample ? ` <span class="pill info" title="Seeded sample data, not a real company.">SAMPLE</span>` : ""}
        <small class="muted">${esc(SOURCE_LABEL[a.source] || a.source || "—")}</small></td>
      <td><b>${esc(a.companyName || "—")}</b>${
        org ? `<small class="muted">Matches ${esc(org.name)}</small>`
            : `<small class="muted">New to PAAIPE</small>`}</td>
      <td>${esc(a.contactName || "—")}<small class="muted">${esc(a.email || "")}</small></td>
      <td>${offeringChips(a)}</td>
      <td>${esc(dateShort(a.createdAt))}<small class="muted">${esc(eventTitle(a))}</small></td>
      <td>${pill(a.status)}</td>
      <td><button class="btn btn-ghost btn-sm" data-open="${esc(a.id)}">Open</button></td>
    </tr>`;
  }).join("");
}

const eventTitle = a =>
  EVENTS.find(e => e.id === a.eventId)?.title || a.eventTitle || a.eventId || "—";

/* ------------------------------------------------------------------ detail */

/** Other applications from what looks like the same company. The brief asked for
 *  "also applied to September 2026" - this is that, computed rather than stored,
 *  so it stays right when a company applies again tomorrow. */
function duplicatesOf(a) {
  const key = normaliseCompany(a.companyName);
  if (!key) return [];
  return APPS.filter(x => x.id !== a.id && normaliseCompany(x.companyName) === key);
}

const MAIL_TEMPLATES = {
  thanks: {
    label: "Thanks — next steps",
    subject: a => `PAAIPE — your partner application ${a.reference}`,
    body: a =>
`Hi ${a.contactName || "there"},

Thank you for offering to support ${eventTitle(a)}. We have your application (reference ${a.reference}).

Here is what happens next: we'll look at how ${a.companyName || "your company"} could help, and come back to you with what we have in mind and what it would involve.

If there's anything you'd like to add in the meantime, just reply to this message.

Best regards,
PAAIPE
Philippine Association of AI Professionals and Entrepreneurs`,
  },
  talk: {
    label: "Let's talk",
    subject: a => `PAAIPE — a quick call about ${eventTitle(a)}?`,
    body: a =>
`Hi ${a.contactName || "there"},

Thanks for your application to partner on ${eventTitle(a)} (reference ${a.reference}).

We'd like to talk it through. Could you let us know a couple of times that suit you this week or next?

Best regards,
PAAIPE`,
  },
  decline: {
    label: "Not this time",
    subject: a => `PAAIPE — about your application ${a.reference}`,
    body: a =>
`Hi ${a.contactName || "there"},

Thank you for offering to support ${eventTitle(a)}, and for taking the time to tell us about ${a.companyName || "your company"}.

We aren't able to take this one forward for this event. That isn't a reflection on ${a.companyName || "your company"} — we keep partner slots deliberately few so each one gets real attention.

We'd genuinely welcome an application for a future Exchange.

Best regards,
PAAIPE`,
  },
};

function mailtoFor(a, key) {
  const t = MAIL_TEMPLATES[key];
  return `mailto:${encodeURIComponent(a.email || "")}` +
    `?subject=${encodeURIComponent(t.subject(a))}` +
    `&body=${encodeURIComponent(t.body(a))}`;
}

/* The open row is the `id` query param, next to the existing `event` filter.
 * pushState on open so Back returns to the list; replaceState on close so a
 * shared ?id= link does not send Close off the page. Never a full reload. */
function appIdFromUrl() {
  return new URLSearchParams(location.search).get("id") || "";
}

function hrefForApp(id) {
  const q = new URLSearchParams(location.search);
  if (id) q.set("id", id);
  else q.delete("id");
  const search = q.toString();
  return search ? `${location.pathname}?${search}` : location.pathname;
}

function syncUrl(id, mode = "replace") {
  const next = hrefForApp(id);
  const now = `${location.pathname}${location.search}`;
  if (next === now) return;
  if (mode === "push") history.pushState(null, "", next);
  else history.replaceState(null, "", next);
}

function hideDetail() {
  const d = $("[data-detail]");
  if (!d) return;
  d.hidden = true;
  delete d.dataset.app;
}

function closeDetail() {
  hideDetail();
  syncUrl("", "replace");
}

function showMissing(id) {
  const d = $("[data-detail]");
  if (!d) return;
  d.innerHTML = `
    <div class="dhead">
      <div><b>Application not found</b>
        <small>${esc(id)}</small></div>
      <button class="btn btn-ghost btn-sm" data-close>Close</button>
    </div>
    <p class="muted">That application is not in the loaded list.</p>`;
  d.hidden = false;
  delete d.dataset.app;
}

function applyUrl() {
  const id = appIdFromUrl();
  if (!id) { hideDetail(); return; }
  openDetail(id, { fromUrl: true });
}

function openDetail(id, { fromUrl = false } = {}) {
  const a = APPS.find(x => x.id === id);
  if (!a) {
    showMissing(id);
    if (!fromUrl) syncUrl(id, "push");
    return;
  }
  const d = $("[data-detail]");
  const org = matchOrganization(a, ORGS);
  const dupes = duplicatesOf(a);

  d.innerHTML = `
    <div class="dhead">
      <div><b>${esc(a.companyName || "—")}</b>
        <small>${esc(a.reference || "")} · ${esc(eventTitle(a))}</small></div>
      <button class="btn btn-ghost btn-sm" data-close>Close</button>
    </div>

    <p class="dmeta">${pill(a.status)}
      <span class="muted">submitted ${esc(dateShort(a.createdAt))}</span></p>

    <dl class="answers">
      <div class="ans"><dt>Contact</dt><dd>${esc(a.contactName || "—")}</dd></div>
      <div class="ans"><dt>Email</dt><dd><a href="mailto:${esc(a.email || "")}">${esc(a.email || "—")}</a></dd></div>
      <div class="ans"><dt>Mobile</dt><dd class="phone-inline"><a href="tel:${esc(a.phone || "")}">${esc(a.phone || "—")}</a><button type="button" class="btn btn-ghost btn-sm" data-copy="${esc(a.phone || "")}">Copy</button></dd></div>
      <div class="ans"><dt>Website</dt><dd>${a.website
        ? `<a href="${esc(/^https?:\/\//i.test(a.website) ? a.website : `https://${a.website}`)}"
              target="_blank" rel="noopener">${esc(a.website)}</a>`
        : "—"}</dd></div>
    </dl>
    <p class="muted small">Consent ${esc(dateLong(a.consentAt))} · Privacy Notice v${esc(a.privacyVersion || "—")}</p>

    <h3 class="ehead">Offering</h3>
    ${offeringChips(a)}
    ${a.message ? `<p>${esc(a.message)}</p>` : ""}

    <h3 class="ehead">Organization</h3>
    <div class="f"><label>Accept will use</label>
      <select data-link-org>
        <option value="">Create a new organization — "${esc(a.companyName || "")}"</option>
        ${ORGS.map(o => `<option value="${esc(o.id)}"${o.id === org?.id ? " selected" : ""}
          >${esc(o.name)}${o.website ? ` — ${esc(o.website)}` : ""}</option>`).join("")}
      </select></div>
    <p class="muted small">Check the match before accepting — guessed from name and website, not stored on the application.</p>
    ${a.organizationId
      ? `<p class="muted small">Linked to organization ${esc(a.organizationId)}.</p>` : ""}

    ${dupes.length ? `<h3 class="ehead">Also applied</h3>
      <ul class="plist">${dupes.map(x => `<li class="yes"><span>${esc(eventTitle(x))} —
        ${esc(STATUS_LABEL[x.status] || x.status)}, ${esc(dateShort(x.createdAt))}
        (${esc(x.reference || "")})</span></li>`).join("")}</ul>` : ""}

    <h3 class="ehead">Internal note</h3>
    <div class="f"><textarea data-note rows="2" maxlength="2000"
      placeholder="What was agreed, who is handling it, anything the next person needs.">${esc(a.adminNote || "")}</textarea></div>
    <div class="note-tools">
      <div class="f"><label>Assigned to</label>
        <input data-assign maxlength="254" placeholder="an administrator's email"
               value="${esc(a.assignedTo || "")}"></div>
      <button type="button" class="btn btn-gold btn-sm" data-save-note>Save note</button>
    </div>

    <h3 class="ehead">Email</h3>
    <div class="dacts">
      ${Object.entries(MAIL_TEMPLATES).map(([k, t]) =>
        `<a class="btn btn-ghost btn-sm" data-mail="${esc(k)}"
            href="${esc(mailtoFor(a, k))}">${esc(t.label)}</a>`).join("")}
    </div>
    <p class="muted small">Opens your mail app</p>

    <h3 class="ehead">Decision</h3>
    <div class="dacts">
      <button class="btn btn-gold btn-sm" data-accept ${a.status === "accepted" ? "disabled" : ""}>
        Accept — add as Partner (proposed)</button>
      <button class="btn btn-ghost btn-sm" data-status="contacted" ${a.status === "contacted" ? "disabled" : ""}>Mark contacted</button>
      <button class="btn btn-ghost btn-sm" data-status="in_discussion" ${a.status === "in_discussion" ? "disabled" : ""}>In discussion</button>
      <button class="btn btn-ghost btn-sm" data-status="declined" ${a.status === "declined" ? "disabled" : ""}>Decline</button>
      <button class="btn btn-ghost btn-sm danger" data-status="spam" ${a.status === "spam" ? "disabled" : ""}>Mark spam</button>
    </div>
    <p class="muted small">Accept creates a proposed Partner — confirm on Organizations to publish.</p>`;
  d.hidden = false;
  d.dataset.app = id;
  if (!fromUrl) syncUrl(id, "push");
  d.scrollIntoView({ block: "start" });
}

/* ------------------------------------------------------------------ writes */

async function patchApp(id, patch, action, details) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const a = APPS.find(x => x.id === id);
  await F.setDoc(F.doc(await db(), COL.partners, id),
    { ...patch, updated_by: ME, updatedAt: F.serverTimestamp() }, { merge: true });
  Object.assign(a, patch);
  await logActivity(action, details, a.eventId);
  renderRows();
  refreshBadge();
}

async function setStatus(id, status) {
  const a = APPS.find(x => x.id === id);
  try {
    await patchApp(id, { status },
      "partner_application.status", `${a.reference} ${a.companyName} → ${status}`);
    flash(`${a.reference} is now ${STATUS_LABEL[status].toLowerCase()}.`, true);
    openDetail(id);
  } catch (ex) {
    flash(ex?.code === "permission-denied"
      ? "The rules refused that change. Your account may no longer be an administrator."
      : `Could not save: ${ex?.message || ex}`);
  }
}

async function saveNote(id) {
  const d = $("[data-detail]");
  const adminNote = $("[data-note]", d).value.trim();
  const assignedTo = $("[data-assign]", d).value.trim();
  if (adminNote.length > 2000) return flash("The note is longer than 2000 characters.");
  try {
    await patchApp(id, { adminNote, assignedTo },
      "partner_application.note", `${APPS.find(x => x.id === id)?.reference}`);
    flash("Saved.", true);
  } catch (ex) {
    flash(ex?.code === "permission-denied" ? "The rules refused that change."
                                           : `Could not save: ${ex?.message || ex}`);
  }
}

/**
 * Accept: link or create the organization, propose the sponsorship, mark accepted.
 *
 * Deliberately three writes and not a transaction, because Firestore batches
 * cannot span the reads this needs and a half-done accept is recoverable: the
 * organization and the sponsorship are both idempotent to re-create, and the
 * application keeps its old status until the last write lands. Failing halfway
 * leaves a prospect organization and no false "accepted".
 */
async function acceptApplication(id) {
  const a = APPS.find(x => x.id === id);
  if (!a) return;
  const F = await import(`${SDK}/firebase-firestore.js`);
  const d = $("[data-detail]");
  $$("button", d).forEach(b => b.disabled = true);

  try {
    // 1. the organization - the administrator's choice wins over the guess.
    const chosen = $("[data-link-org]", d)?.value || "";
    let org = chosen ? ORGS.find(o => o.id === chosen) || null : null;
    if (!chosen) {
      const ref = F.doc(F.collection(await db(), COL.organizations));
      const doc = {
        name: a.companyName,
        website: a.website || "",
        logoUrl: "",
        // A prospect is not a partner. It is inactive so nothing on the public
        // Partners page picks it up: that page renders active organizations.
        status: "inactive",
        type: "sponsor",
        relationshipStatus: "prospect",
        primaryContactName: a.contactName || "",
        primaryContactEmail: a.email || "",
        primaryContactPhone: a.phone || "",
        createdFromApplication: a.reference || "",
      };
      await F.setDoc(ref, doc);
      org = { id: ref.id, ...doc };
      ORGS.push(org);
      await logActivity("organization.create",
        `${a.companyName} (prospect, from ${a.reference})`, a.eventId);
    }

    // 2. the sponsorship, PROPOSED - unreadable to the public by rule
    const already = (await listEventSponsors(a.eventId, { asAdmin: true }))
      .find(s => s.organizationId === org.id);
    if (!already) {
      await F.addDoc(F.collection(await db(), COL.sponsors), {
        eventId: a.eventId,
        organizationId: org.id,
        tier: TIER.COMMUNITY,
        status: SPONSOR_STATUS.PROPOSED,
        order: 100,
        note: `From partner application ${a.reference}`,
      });
      await logActivity("sponsor.create",
        `${org.name}: community/proposed from ${a.reference}`, a.eventId);
    }

    // 3. the application, last, so a failure above leaves no false "accepted"
    await patchApp(id, { status: PARTNER_STATUS.ACCEPTED, organizationId: org.id },
      "partner_application.accept", `${a.reference} ${a.companyName} → ${org.name}`);

    flash(`Accepted. ${org.name} now has a PROPOSED community Partner on this event (${eventTitle(a)}) — set the tier and confirm it on Organizations to put the logo ` +
          `on the public page.`, true);
    openDetail(id);
  } catch (ex) {
    $$("button", d).forEach(b => b.disabled = false);
    flash(ex?.code === "permission-denied"
      ? "The rules refused that. Your account may no longer be an administrator."
      : `Could not accept: ${ex?.message || ex}`);
  }
}

/* ------------------------------------------------------------------- export */

function exportCsv() {
  const rows = filtered();
  const head = ["Reference", "Status", "Event", "Company", "Matched organization", "Contact",
                "Email", "Phone", "Website", "Offering", "Message", "Source", "Submitted",
                "Consent given", "Assigned to", "Internal note"];
  const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = rows.map(a => [
    a.reference, STATUS_LABEL[a.status] || a.status, eventTitle(a), a.companyName,
    matchOrganization(a, ORGS)?.name || "", a.contactName, a.email, a.phone, a.website,
    (a.supportTypes || []).map(k => SUPPORT_LABEL[k] || k).join("; "),
    a.message, SOURCE_LABEL[a.source] || a.source, dateLong(a.createdAt), dateLong(a.consentAt),
    a.assignedTo, a.adminNote,
  ].map(cell).join(","));

  // A BOM, so Excel opens it as UTF-8 and does not mangle a company's name.
  const blob = new Blob(["﻿" + [head.map(cell).join(","), ...body].join("\r\n")],
                        { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paaipe-partner-applications-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  logActivity("partner_application.export", `${rows.length} row(s)`);
}

/* --------------------------------------------------------------------- boot */

function refreshBadge() {
  setNavBadge("partners", APPS.filter(a => a.status === PARTNER_STATUS.NEW).length);
}

function fillEventFilter() {
  const sel = $("[data-f-event]");
  if (!sel) return;
  const ids = [...new Set(APPS.map(a => a.eventId))];
  sel.innerHTML = `<option value="">All events</option>` +
    EVENTS.filter(e => ids.includes(e.id))
      .map(e => `<option value="${esc(e.id)}">${esc(e.title)}</option>`).join("");
  // An application whose event is gone must still be reachable.
  const orphans = ids.filter(i => !EVENTS.some(e => e.id === i));
  sel.innerHTML += orphans
    .map(i => `<option value="${esc(i)}">${esc(i)} (event not found)</option>`).join("");
  const wanted = new URLSearchParams(location.search).get("event");
  if (wanted && ids.includes(wanted)) sel.value = wanted;
}

async function boot() {
  const me = await currentAgent().catch(() => null);
  if (!me) { location.replace("admin.html?next=admin-partners.html"); return; }
  // "Could not ask" is NOT "not an administrator". Collapsing the two with
  // .catch(() => false) signs a real administrator out over a network blip and
  // then tells them their account was refused. The other console pages already
  // draw this distinction; this one did not.
  let allowed = false;
  try { allowed = await isAdminNow(); }
  catch {
    flash("PAAIPE could not be reached, so nothing is shown — an empty list here would " +
          "read as 'nobody has applied'. Your account is fine; reload to try again.");
    document.documentElement.setAttribute("data-admin-partners", "offline");
    return;
  }
  if (!allowed) {
    await signOutNow().catch(() => {});
    location.replace("admin.html?denied=1");
    return;
  }
  ME = me.email || "";
  renderAdminNav("admin-partners.html");
  renderAdminTop({ title: "Partner applications",
                   subtitle: "Companies offering to support an event", email: ME });

  try {
    [APPS, EVENTS, ORGS] = await Promise.all([
      listApplications(), listEvents({ asAdmin: true }), listOrganizations({ asAdmin: true }),
    ]);
  } catch (ex) {
    $("[data-rows]").innerHTML =
      `<tr><td colspan="7" class="empty">Could not load applications: ${esc(ex?.message || ex)}</td></tr>`;
    return;
  }
  fillEventFilter();
  renderRows();
  refreshBadge();
  applyUrl();
  window.addEventListener("popstate", applyUrl);

  $$("[data-f-event],[data-f-status],[data-f-source]").forEach(el =>
    el.addEventListener("change", renderRows));
  $("[data-f-q]")?.addEventListener("input", renderRows);
  $("[data-export]")?.addEventListener("click", exportCsv);

  document.addEventListener("click", e => {
    const open = e.target.closest("[data-open]");
    if (open) return openDetail(open.dataset.open);
    if (e.target.closest("[data-close]")) { closeDetail(); return; }

    const d = $("[data-detail]");
    const id = d?.dataset.app;
    if (!id) return;

    const copy = e.target.closest("[data-copy]");
    if (copy) {
      navigator.clipboard?.writeText(copy.dataset.copy)
        .then(() => flash("Copied.", true))
        .catch(() => flash("Could not copy — select the number and copy it by hand."));
      return;
    }
    const mail = e.target.closest("[data-mail]");
    if (mail) {
      // The link navigates on its own. All this records is that a draft opened,
      // which is the only part of "email the applicant" this page can witness.
      logActivity("partner_application.reply_drafted",
        `${APPS.find(x => x.id === id)?.reference} (${mail.dataset.mail})`);
      return;
    }
    if (e.target.closest("[data-save-note]")) return saveNote(id);
    if (e.target.closest("[data-accept]"))    return acceptApplication(id);
    const st = e.target.closest("[data-status]");
    if (st) return setStatus(id, st.dataset.status);
  });
}

if (document.body.hasAttribute("data-admin-partners")) boot();
