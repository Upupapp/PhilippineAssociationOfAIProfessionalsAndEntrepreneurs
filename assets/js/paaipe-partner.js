/* PAAIPE — "Partner with us on this event".
 *
 * One module serves every surface that offers it: the public event pages, the
 * events list, the registration success page, and the member portal's session
 * rows. They differ only in the `source` recorded on the application, so there
 * is one form, one validator and one write - not five that drift apart.
 *
 * WHERE IT APPEARS
 *   <span data-partner-cta
 *         data-event-id="..."          the Firestore document id (required)
 *         data-event-title="..."       shown in the dialog heading
 *         data-partner-source="..."    one of PARTNER_SOURCES
 *         data-event-status="..."></span>
 * The button is rendered by this module, never by the page, so a page cannot
 * offer partnership on an event that has already been held.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO, and why each is absent rather than faked:
 *
 *   - IT DOES NOT SEND AN EMAIL. The brief asks for an acknowledgement to the
 *     applicant and a notification to admins, immediately. PAAIPE has no mail
 *     sender wired - no SMTP provider, no service account - so there is nothing
 *     to send with. The success panel therefore says the application is
 *     recorded and gives the reference; it does not say "check your email",
 *     which is the sentence that would be a lie. Wire a sender and the two
 *     messages are the smallest change in this file.
 *
 *   - IT DOES NOT UPLOAD A LOGO. No storage bucket is enabled on the project,
 *     and a 2 MB file cannot live in a Firestore document (the limit is 1 MiB).
 *     A file input that silently discarded the file would be worse than no file
 *     input, so the dialog asks for the website and says PAAIPE will ask for the
 *     logo if the application is accepted - which is when a logo is needed, and
 *     is already how every other partner logo on the site gets set.
 *
 *   - IT CREATES AN UNPUBLISHED ORGANIZATION only for a signed-in member, on
 *     their uid, when the name does not match one of their own orgs or a
 *     confirmed Partner. Unpublished orgs of other people never appear. The
 *     org stays inactive until PAAIPE confirms the partnership. Anonymous
 *     apply still writes only the application.
 *
 *   - THE RATE LIMIT IS NOT A RATE LIMIT. There is no server, so what this can
 *     do is a honeypot and a per-browser cooldown: both stop accidents and a
 *     casual script, and neither stops anybody who means it. The real controls
 *     are in firestore.rules - the collection is create-only, unreadable, and
 *     every field is length-checked.
 */
import {
  SUPPORT_TYPES, acceptsPartners, normalisePhone, listEvents,
  submitPartnerApplication, myApplications, partnerReference,
  listMyOrganizations, listOrganizations, resolveOrganizationMatch,
  confirmedAttachCopy, OTHER_ORGANIZATION,
} from "/assets/js/paaipe-events-data.js";
import { currentAgent } from "/assets/js/paaipe-firebase.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* One submission per browser per event per hour. A convenience guard against a
 * double-click and a refresh, and it is stored where the user can clear it -
 * which is the honest description of what it is worth. */
const COOLDOWN_MS = 60 * 60 * 1000;
const cooldownKey = eventId => `paaipe.partner.${eventId}`;
function recentlySubmitted(eventId) {
  try {
    const t = Number(localStorage.getItem(cooldownKey(eventId)) || 0);
    return t > 0 && Date.now() - t < COOLDOWN_MS;
  } catch { return false; }
}
function markSubmitted(eventId) {
  try { localStorage.setItem(cooldownKey(eventId), String(Date.now())); } catch { /* private mode */ }
}

/* ------------------------------------------------------------------ styles */

const CSS = `
.pdlg{border:0;padding:0;border-radius:22px;width:min(640px,calc(100vw - 32px));max-width:none;
  background:#fff;color:var(--ink,#0B1B3B);box-shadow:0 30px 80px rgba(0,16,51,.35),0 0 0 1px rgba(21,187,234,.25);overflow:hidden}
.pdlg::backdrop{background:rgba(3,15,45,.62);backdrop-filter:blur(4px)}
.pdlg[open]{animation:pdlgIn .22s cubic-bezier(.2,.7,.2,1)}
@keyframes pdlgIn{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}
.pdlg .band{position:relative;background:linear-gradient(120deg,var(--navy,#061A4A),#031b52 55%,var(--royal,#1C46B4));
  color:#fff;padding:24px 28px 20px}
.pdlg .band h2{color:#fff;font-size:21px;margin:0;line-height:1.3}
.pdlg .band p{color:#BFE3FA;font-size:13.5px;margin:8px 0 0;line-height:1.55}
.pdlg .rule{width:44px;height:4px;border-radius:4px;background:linear-gradient(90deg,var(--gold,#F2A71B),var(--lgold,#FFD37A));margin-top:12px}
.pdlg .body{padding:22px 28px 24px;max-height:min(70vh,620px);overflow:auto}
.pdlg .f{margin-bottom:14px}
.pdlg .f label{display:block;font-size:13px;font-weight:600;color:var(--navy,#061A4A);margin-bottom:6px}
.pdlg .f label small{font-weight:400;color:var(--muted,#5A6B8C)}
.pdlg input[type=text],.pdlg input[type=email],.pdlg input[type=tel],.pdlg input[type=url],.pdlg textarea,.pdlg select{
  width:100%;padding:11px 12px;border:1px solid #D7DEEC;border-radius:10px;font:inherit;font-size:14px;
  color:var(--ink,#0B1B3B);background:#fff}
.pdlg textarea{min-height:78px;resize:vertical}
.pdlg input:focus,.pdlg textarea:focus,.pdlg select:focus{outline:2px solid var(--royal,#1C46B4);outline-offset:1px;border-color:transparent}
.pdlg .frow{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pdlg .err{display:none;color:#B3261E;font-size:12.5px;margin-top:5px}
.pdlg .f.bad .err{display:block}
.pdlg .f.bad input,.pdlg .f.bad textarea{border-color:#B3261E}
.pdlg .help{display:block;color:var(--muted,#5A6B8C);font-size:12.5px;margin-top:5px;line-height:1.5}
.pdlg .opts{display:flex;flex-wrap:wrap;gap:8px}
.pdlg .opt{display:inline-flex;align-items:center;gap:7px;padding:8px 12px;border:1px solid #D7DEEC;
  border-radius:999px;font-size:13px;cursor:pointer;background:#fff}
.pdlg .opt:has(input:checked){border-color:var(--royal,#1C46B4);background:#EEF3FF;color:var(--royal,#1C46B4);font-weight:600}
.pdlg .opt input{margin:0}
.pdlg .check{display:flex;gap:9px;align-items:flex-start;font-size:13px;line-height:1.55;cursor:pointer}
.pdlg .check input{margin-top:3px;flex:none}
.pdlg .acts{display:flex;gap:10px;align-items:center;justify-content:flex-end;margin-top:18px;
  padding-top:16px;border-top:1px solid #E9EEF7}
.pdlg .acts .grow{flex:1}
.pdlg .note{color:var(--muted,#5A6B8C);font-size:12.5px;line-height:1.6;margin:12px 0 0}
.pdlg .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.pdlg .ok{text-align:center;padding:12px 0 4px}
.pdlg .ok .tick{width:56px;height:56px;border-radius:50%;background:#E8F6EC;display:grid;place-items:center;margin:0 auto 14px}
.pdlg .ok .tick svg{width:28px;height:28px;stroke:#1E7B45;fill:none;stroke-width:2.8;stroke-linecap:round;stroke-linejoin:round}
.pdlg .ok h3{font-size:19px;color:var(--navy,#061A4A);margin:0 0 8px}
.pdlg .ok p{color:var(--muted,#5A6B8C);font-size:13.5px;line-height:1.6;margin:0 auto;max-width:44ch}
.pdlg .ref{display:inline-block;margin:16px 0 4px;padding:10px 18px;border-radius:12px;background:#F6F8FC;
  border:1px dashed #C6D2E8;font-size:18px;font-weight:700;letter-spacing:.06em;color:var(--navy,#061A4A)}
.pdlg .reflab{display:block;font-size:11px;letter-spacing:.12em;font-weight:700;color:var(--muted,#5A6B8C);margin-bottom:2px}
.pdlg .xbtn{position:absolute;top:16px;right:16px;width:32px;height:32px;border-radius:9px;border:1px solid rgba(191,227,250,.35);
  background:rgba(255,255,255,.1);color:#fff;font-size:18px;line-height:1;cursor:pointer}
.pdlg .xbtn:hover{background:rgba(255,255,255,.2)}
.pdlg [disabled]{opacity:.55;cursor:not-allowed}
[data-partner-cta-state^="hidden"]{display:none!important}
.pmine{display:inline-flex;align-items:center;gap:0;font-size:13px;color:var(--navy,#061A4A);
  background:#F6F8FC;border:1px solid #DCE5F3;border-radius:999px;padding:7px 14px}
.pmine b{margin:0 4px;letter-spacing:.04em}
.pcta-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--gold,#F2A71B);margin-right:8px;flex:none}
a.btn.pcta,span.btn.pcta{display:inline-flex;align-items:center}
@media (max-width:520px){.pdlg .frow{grid-template-columns:1fr}.pdlg .body{padding:18px 18px 20px}.pdlg .band{padding:20px 18px 16px}}
`;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const el = document.createElement("style");
  el.setAttribute("data-partner-styles", "");
  el.textContent = CSS;
  document.head.appendChild(el);
}

/* ------------------------------------------------------------------ dialog */

const TICK = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';

function companyFieldsHtml(prefill, myOrgs) {
  const hasMine = myOrgs.length > 0;
  const selected = prefill.organizationId || (hasMine ? myOrgs[0].id : "");
  const pick = hasMine ? `
    <div class="f">
      <label for="pa-company-pick">Company or organization name</label>
      <select id="pa-company-pick" name="companyPick">
        ${myOrgs.map(o => `<option value="${esc(o.id)}"${o.id === selected ? " selected" : ""}>${esc(o.name)}</option>`).join("")}
        <option value="${OTHER_ORGANIZATION}">A different organization.</option>
      </select>
    </div>` : "";
  const showTyped = !hasMine;
  const initialName = hasMine
    ? (myOrgs.find(o => o.id === selected)?.name || "")
    : (prefill.companyName || "");
  return `
    ${pick}
    <div class="f" data-company-typed${showTyped ? "" : " hidden"}>
      <label for="pa-company">${hasMine ? "Company or organization name" : "Company or organization name"}</label>
      <input id="pa-company" name="companyName" type="text" maxlength="160"
             autocomplete="organization" placeholder="e.g., GetHired Philippines"
             value="${esc(initialName)}">
      <span class="err">Please tell us which company you're writing on behalf of.</span>
      <span class="help" data-confirmed-match hidden></span>
    </div>`;
}

function formHtml(ev, prefill, myOrgs) {
  return `
  <form class="pform" novalidate>
    ${companyFieldsHtml(prefill, myOrgs)}

    <div class="frow">
      <div class="f">
        <label for="pa-name">Your name</label>
        <input id="pa-name" name="contactName" type="text" maxlength="120" required
               autocomplete="name" placeholder="Juan Dela Cruz" value="${esc(prefill.contactName || "")}">
        <span class="err">Please enter your name.</span>
      </div>
      <div class="f">
        <label for="pa-email">Email</label>
        <input id="pa-email" name="email" type="email" maxlength="254" required
               autocomplete="email" placeholder="you@company.com" value="${esc(prefill.email || "")}">
        <span class="err">Please enter a valid email address.</span>
      </div>
    </div>

    <div class="frow">
      <div class="f">
        <label for="pa-phone">Mobile number</label>
        <input id="pa-phone" name="phone" type="tel" maxlength="24" required
               autocomplete="tel" placeholder="0917 123 4567">
        <span class="err">Please enter a Philippine mobile number, starting 09 or +639.</span>
      </div>
      <div class="f">
        <label for="pa-web">Website <small>(optional)</small></label>
        <input id="pa-web" name="website" type="url" maxlength="300" placeholder="company.com">
        <span class="err">That doesn't look like a web address.</span>
      </div>
    </div>

    <div class="f">
      <label>What would you like to support? <small>(optional — choose any)</small></label>
      <div class="opts">
        ${SUPPORT_TYPES.map(([v, l]) => `<label class="opt">
          <input type="checkbox" name="supportTypes" value="${esc(v)}"><span>${esc(l)}</span></label>`).join("")}
      </div>
    </div>

    <div class="f">
      <label for="pa-msg">Anything you'd like to add? <small>(optional)</small></label>
      <textarea id="pa-msg" name="message" maxlength="500"
        placeholder="What you have in mind, who to talk to, timing…"></textarea>
      <span class="help"><span data-count>0</span>/500</span>
    </div>

    <div class="f">
      <label class="check">
        <input type="checkbox" name="consent" required>
        <span>I agree PAAIPE may contact me about this application, and I have read the
          <a href="privacy-notice.html" target="_blank" rel="noopener"
             style="color:var(--royal,#1C46B4);font-weight:600">Privacy Notice</a>.</span>
      </label>
      <span class="err">We need your agreement before we can get in touch.</span>
    </div>

    <p class="hp" aria-hidden="true"><label>Do not fill this in
      <input type="text" name="pa_hp_confirm" tabindex="-1" autocomplete="off"></label></p>

    <p class="err" data-submit-error role="alert" style="margin:0"></p>

    <div class="acts">
      <span class="note grow" style="margin:0">PAAIPE reviews every application.</span>
      <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
      <button type="submit" class="btn btn-gold" data-submit>Send application</button>
    </div>

    <p class="note"><b>About your logo.</b> We don't collect it here — there is no file storage
      wired up, and a box that quietly dropped your file would be worse than none. If your
      application is accepted we'll ask you for it then, which is when we'd use it.</p>
  </form>`;
}

function successHtml(reference, ev) {
  return `
  <div class="ok">
    <div class="tick">${TICK}</div>
    <h3>Application received.</h3>
    <p>Thank you for offering to support ${esc(ev.title || "this event")}. PAAIPE reviews every
       application and will get back to you within 5 working days.</p>
    <span class="ref"><span class="reflab">YOUR REFERENCE</span>${esc(reference)}</span>
    <p class="note" style="max-width:46ch;margin:14px auto 0">
      <b>Please keep this reference.</b> PAAIPE has no automatic mail sender yet, so there is no
      confirmation email on its way — this screen is your receipt. Quote the reference if you
      follow up.</p>
  </div>
  <div class="acts"><span class="grow"></span>
    <button type="button" class="btn btn-gold" data-cancel>Done</button></div>`;
}

let DIALOG = null;

function dialog() {
  if (DIALOG) return DIALOG;
  injectStyles();
  DIALOG = document.createElement("dialog");
  DIALOG.className = "pdlg";
  DIALOG.setAttribute("data-partner-dialog", "");
  document.body.appendChild(DIALOG);

  // Esc and a click on the backdrop both close, like the leave dialog.
  DIALOG.addEventListener("click", e => { if (e.target === DIALOG) DIALOG.close(); });
  DIALOG.addEventListener("click", e => {
    if (e.target.closest("[data-cancel]")) DIALOG.close();
  });
  return DIALOG;
}

function markBad(field, bad) {
  const f = field.closest(".f");
  if (f) f.classList.toggle("bad", bad);
  field.setAttribute("aria-invalid", bad ? "true" : "false");
}

/** Every rule the write must satisfy, checked here so the applicant is told
 *  which box is wrong rather than "the rules refused that". The rules remain the
 *  authority - this only avoids a round trip that ends in a shrug. */
export function validatePartnerForm(form) {
  const errors = [];
  const v = n => (form.elements[n]?.value || "").trim();

  const company = form.elements.companyName;
  const okCompany = v("companyName").length > 0 && v("companyName").length <= 160;
  markBad(company, !okCompany);
  if (!okCompany) errors.push("companyName");

  const name = form.elements.contactName;
  const okName = v("contactName").length > 0 && v("contactName").length <= 120;
  markBad(name, !okName);
  if (!okName) errors.push("contactName");

  const email = form.elements.email;
  const okEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v("email")) && v("email").length <= 254;
  markBad(email, !okEmail);
  if (!okEmail) errors.push("email");

  const phone = form.elements.phone;
  const okPhone = Boolean(normalisePhone(v("phone")));
  markBad(phone, !okPhone);
  if (!okPhone) errors.push("phone");

  const web = form.elements.website;
  const okWeb = !v("website") || /^[^\s.]+\.[^\s]{2,}$/.test(v("website").replace(/^https?:\/\//i, ""));
  markBad(web, !okWeb);
  if (!okWeb) errors.push("website");

  const consent = form.elements.consent;
  const okConsent = consent.checked;
  markBad(consent, !okConsent);
  if (!okConsent) errors.push("consent");

  return errors;
}

/* --------------------------------------------------------------- the button */

async function prefillFor() {
  try {
    const me = await currentAgent();
    return me ? { contactName: me.full_name || "", email: me.email || "", uid: me.uid } : {};
  } catch { return {}; }
}

function syncCompanyFields(form, myOrgs, publicOrgs) {
  const typed = form.querySelector("[data-company-typed]");
  const pick = form.elements.companyPick?.value;
  const name = form.elements.companyName;
  const web = form.elements.website;
  const matchEl = form.querySelector("[data-confirmed-match]");
  const usingPick = Boolean(form.elements.companyPick) && pick && pick !== OTHER_ORGANIZATION;
  if (typed) typed.hidden = usingPick;
  if (usingPick) {
    const o = myOrgs.find(x => x.id === pick);
    if (o) {
      name.value = o.name;
      if (web && web.dataset.touched !== "1") web.value = o.website || "";
    }
    if (matchEl) { matchEl.hidden = true; matchEl.textContent = ""; }
    return;
  }
  const hit = resolveOrganizationMatch({
    companyName: (name?.value || "").trim(),
    website: (web?.value || "").trim(),
    selectedOrgId: OTHER_ORGANIZATION,
    myOrgs,
    publicOrgs,
  });
  if (matchEl) {
    if (hit.how === "confirmed" && hit.organization) {
      matchEl.hidden = false;
      matchEl.textContent = confirmedAttachCopy(hit.organization.name);
    } else {
      matchEl.hidden = true;
      matchEl.textContent = "";
    }
  }
}

async function openDialog(ev, source, extras = {}) {
  const d = dialog();
  const prefill = await prefillFor();
  if (extras.organizationId) prefill.organizationId = extras.organizationId;
  if (extras.companyName && !prefill.organizationId) prefill.companyName = extras.companyName;
  const wanted = extras.organizationId
    || new URLSearchParams(location.search).get("applyOrg")
    || "";
  let myOrgs = [];
  let publicOrgs = [];
  try { publicOrgs = await listOrganizations(); } catch { publicOrgs = []; }
  if (prefill.uid) {
    try { myOrgs = await listMyOrganizations(prefill.uid); } catch { myOrgs = []; }
  }
  if (wanted && myOrgs.some(o => o.id === wanted)) prefill.organizationId = wanted;

  d.innerHTML = `
    <div class="band">
      <button class="xbtn" type="button" data-cancel aria-label="Close">&times;</button>
      <h2>Partner with PAAIPE on ${esc(ev.title || "this event")}</h2>
      <div class="rule"></div>
      <p>Tell us about your company. PAAIPE reviews every application; nothing is published
         until it's confirmed.</p>
    </div>
    <div class="body" data-body>${formHtml(ev, prefill, myOrgs)}</div>`;
  d.showModal();

  const body = $("[data-body]", d);
  const form = $("form", d);

  syncCompanyFields(form, myOrgs, publicOrgs);
  if (form.elements.companyPick && prefill.organizationId) {
    form.elements.companyPick.value = prefill.organizationId;
    syncCompanyFields(form, myOrgs, publicOrgs);
  }

  // Focus SYNCHRONOUSLY. A deferred focus() once let a form submit empty under
  // load, because the handler ran before the field it was meant to fill.
  (form.elements.companyPick || form.elements.companyName).focus();

  const counter = $("[data-count]", form);
  form.elements.message.addEventListener("input", e => {
    if (counter) counter.textContent = String(e.target.value.length);
  });

  form.elements.companyPick?.addEventListener("change", () => {
    if (form.elements.companyPick.value === OTHER_ORGANIZATION) {
      form.elements.companyName.value = "";
    }
    syncCompanyFields(form, myOrgs, publicOrgs);
  });
  form.elements.companyName?.addEventListener("input", () => {
    syncCompanyFields(form, myOrgs, publicOrgs);
  });
  form.elements.website?.addEventListener("input", () => {
    form.elements.website.dataset.touched = "1";
    syncCompanyFields(form, myOrgs, publicOrgs);
  });

  $$("input,textarea,select", form).forEach(el =>
    el.addEventListener("input", () => {
      if (el.closest(".f")?.classList.contains("bad")) markBad(el, false);
    }));

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const errBox = $("[data-submit-error]", form);
    errBox.textContent = "";

    const pick = form.elements.companyPick?.value || "";
    if (pick && pick !== OTHER_ORGANIZATION) {
      const o = myOrgs.find(x => x.id === pick);
      if (o) form.elements.companyName.value = o.name;
    }

    const bad = validatePartnerForm(form);
    if (bad.length) {
      const el = form.elements[bad[0]];
      if (el) el.focus();
      return;
    }

    // The honeypot is a field no person sees. Anything in it is a script, and a
    // script gets the same screen a person gets - telling it that it failed only
    // teaches it what to change.
    if ((form.elements.pa_hp_confirm?.value || "").trim()) {
      body.innerHTML = successHtml(partnerReference("XXXXXXXX"), ev);
      return;
    }

    if (recentlySubmitted(ev.id)) {
      errBox.textContent =
        "You've already sent an application for this event from this browser in the last hour. " +
        "If that wasn't you, or you need to change something, email hello@paaipe.org.";
      return;
    }

    const btn = $("[data-submit]", form);
    btn.disabled = true;
    btn.textContent = "Sending…";

    let me = null;
    try { me = await currentAgent(); } catch { /* anonymous is fine */ }

    try {
      const { reference } = await submitPartnerApplication({
        eventId:      ev.id,
        eventTitle:   ev.title || "",
        companyName:  form.elements.companyName.value.trim(),
        contactName:  form.elements.contactName.value.trim(),
        email:        form.elements.email.value.trim(),
        phone:        normalisePhone(form.elements.phone.value),
        website:      form.elements.website.value.trim(),
        message:      form.elements.message.value.trim(),
        supportTypes: $$('input[name="supportTypes"]:checked', form).map(i => i.value),
        source,
        submittedByUserId: me?.uid || "",
        selectedOrgId: (pick && pick !== OTHER_ORGANIZATION) ? pick : "",
      });
      markSubmitted(ev.id);
      body.innerHTML = successHtml(reference, ev);
      document.documentElement.setAttribute("data-partner-submitted", reference);
    } catch (ex) {
      btn.disabled = false;
      btn.textContent = "Send application";
      errBox.textContent = ex?.code === "permission-denied"
        ? "That was refused. Please check the phone number and email and try again."
        : `Could not send your application: ${ex?.message || ex}. Nothing was saved.`;
    }
  });
}

/** Open the apply dialog from My Organization, with an org already chosen. */
export function openPartnerApply(ev, source, extras = {}) {
  return openDialog(ev, source, extras);
}

const MY_STATUS_LABEL = {
  new: "received, waiting for PAAIPE to review it",
  contacted: "PAAIPE has been in touch",
  in_discussion: "in discussion",
  accepted: "accepted",
  declined: "not taken forward this time",
  // Somebody's own application marked spam is not told back to them as "spam".
  spam: "closed",
};

/** The line the portal shows a member about their own application. It replaces
 *  the button, because offering to apply again to somebody who already has an
 *  application open is how you get two records for one conversation. */
function renderMyStatus(host, app) {
  host.innerHTML =
    `<span class="pmine"><span class="pcta-dot"></span>Your partner application
       <b>${esc(app.reference || "")}</b> — ${esc(MY_STATUS_LABEL[app.status] || app.status)}</span>`;
  host.setAttribute("data-partner-cta-state", `mine:${app.status}`);
  host.closest("[data-partner-strip]")?.removeAttribute("hidden");
}

const LABEL = "Partner with us on this event";

/** Render the button into one mount point, or leave the mount empty when the
 *  event cannot take a partner. Held and cancelled events get nothing - not a
 *  disabled button, which is still an invitation. */
export function mountPartnerCta(host, ev, source) {
  if (!host) return false;
  const strip = host.closest("[data-partner-strip]");
  if (!acceptsPartners(ev)) {
    host.innerHTML = "";
    host.setAttribute("data-partner-cta-state", ev ? `hidden:${ev.status}` : "hidden:unknown");
    // The invitation usually sits in a bordered strip with a line of copy beside
    // it. Emptying the mount alone would leave the box and the question with no
    // way to answer them, so the whole strip goes.
    if (strip) strip.hidden = true;
    return false;
  }
  if (strip) strip.hidden = false;
  injectStyles();
  host.innerHTML =
    `<button type="button" class="btn btn-ghost btn-sm pcta" data-partner-open>
       <span class="pcta-dot"></span>${esc(LABEL)}</button>`;
  host.setAttribute("data-partner-cta-state", "shown");
  $("[data-partner-open]", host).addEventListener("click", () => openDialog(ev, source));
  return true;
}

/* Mount every hook on the page. Each carries its own event id and source, so one
 * page can offer it on several events - which is what the events list is.
 *
 * THE STATUS COMES FROM THE RECORD, NOT FROM THE MARKUP. A page's HTML is
 * written once and then sits on a static host for months; the event it describes
 * can be cancelled this afternoon. If the button read data-event-status it would
 * go on inviting sponsorship of a cancelled event until somebody redeployed -
 * which is the same defect as an unpublished event still showing "Register now".
 * So one public listEvents() resolves every mount on the page against the live
 * record, and the markup attribute is only a fallback for when the network is
 * down and the page is showing what it already said.
 */
async function boot() {
  const hosts = $$("[data-partner-cta]");
  if (!hosts.length) return;

  let live = null;
  try { live = await listEvents(); }
  catch { /* offline: fall back to what the page was built with */ }

  // What this member has already sent, so the portal shows a status rather than
  // inviting them to apply a second time. Anonymous visitors get an empty map.
  const me = await currentAgent().catch(() => null);
  const mine = await myApplications(me?.uid);

  for (const host of hosts) {
    const id = host.dataset.eventId || "";
    if (!id) { host.setAttribute("data-partner-cta-state", "hidden:no-event"); continue; }

    let ev;
    if (live) {
      // Absent from the public list means draft, deleted or unreadable. From out
      // here those are the same thing, and none of them takes a partner.
      ev = live.find(e => e.id === id) || null;
      if (ev) ev = { ...ev, title: ev.title || host.dataset.eventTitle || "" };
    } else {
      ev = { id, title: host.dataset.eventTitle || "", status: host.dataset.eventStatus || "" };
    }
    if (mine.has(id)) { renderMyStatus(host, mine.get(id)); continue; }
    mountPartnerCta(host, ev, host.dataset.partnerSource || "public_event");
  }
  // NOT data-partner-cta: that is the mount marker, and a document-level
  // attribute of the same name makes <html> itself match [data-partner-cta] -
  // so every count is one too many and .first() is the document, not a button.
  document.documentElement.setAttribute("data-partner-mounts", String(hosts.length));
}

boot();
