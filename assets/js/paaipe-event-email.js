/* Admin event Email tab — compose, confirm, history, branded preview.
 *
 * THIS EVENT'S REGISTRANTS ONLY. The audience is the same list the Registrations
 * tab shows, filtered by the same statuses (registered / attended / no-show /
 * cancelled). Cancelled people are never in the audience unless that chip is
 * chosen. There is no cross-event send and no custom From.
 *
 * OUTBOUND IS NOT WIRED. scripts/send-registration-emails.mjs still needs a
 * service account and a mail sender, and firestore.rules refuse every client
 * write to a mail queue (a client-writable queue is an open relay). This tab
 * therefore stores drafts in this browser and refuses to pretend a send
 * succeeded. Flip OUTBOUND_WIRED when a real pipeline exists.
 */
import { REG_STATUS, regStatusOf } from "/assets/js/paaipe-firebase.js";
import {
  EMAIL_FROM, EMAIL_TZ, DEFAULT_BODY_HTML,
  wrapEmailHtml, previewEmailHtml, applyPreviewSamples,
  formatManila, toManilaInputValue, parseManilaInput,
} from "/assets/js/paaipe-email-shell.js";

export const OUTBOUND_WIRED = false;

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const STORE = eventId => `paaipe.event-email.v1.${eventId}`;
const STATE = new Map();
const LOCK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const EYE  = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const SEND = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9z"/></svg>';
const CAL  = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
const CLOCK= '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const SAVE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>';
const PEOPLE='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>';

const MODE_LABEL = {
  all_registered: "All registered",
  attended:       "Attended",
  no_show:        "No-show",
};
const STATUS_PILL = {
  draft:     ["pill info", "Draft"],
  scheduled: ["pill warn", "Scheduled"],
  sending:   ["pill info", "Sending"],
  sent:      ["pill ok",   "Sent"],
  failed:    ["pill err",  "Failed"],
};

const PIPELINE_COPY =
  "Outbound mail is not wired. Drafts stay in this browser. Send, Schedule and Send test will not deliver.";

function stateOf(eventId) {
  if (!STATE.has(eventId)) {
    const later = new Date(Date.now() + 24 * 60 * 60 * 1000);
    STATE.set(eventId, {
      view: "compose",
      subject: "",
      bodyHtml: DEFAULT_BODY_HTML,
      mode: "all_registered",
      includeCancelled: false,
      timing: "now",
      scheduleAt: toManilaInputValue(later),
      editingId: null,
      previewOpen: false,
      confirmOpen: false,
      viewItemId: null,
    });
  }
  return STATE.get(eventId);
}

function loadStore(eventId) {
  try {
    const raw = localStorage.getItem(STORE(eventId));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch { return []; }
}
function saveStore(eventId, items) {
  localStorage.setItem(STORE(eventId), JSON.stringify({ items }));
}

export function audienceOf(registrations, { mode = "all_registered", includeCancelled = false } = {}) {
  const list = Array.isArray(registrations) ? registrations : [];
  const st = r => regStatusOf(r);
  let picked;
  if (mode === "attended")      picked = list.filter(r => st(r) === REG_STATUS.ATTENDED);
  else if (mode === "no_show")  picked = list.filter(r => st(r) === REG_STATUS.NO_SHOW);
  else                          picked = list.filter(r => st(r) !== REG_STATUS.CANCELLED);
  if (includeCancelled) {
    const extra = list.filter(r => st(r) === REG_STATUS.CANCELLED);
    const ids = new Set(picked.map(r => r.id));
    for (const r of extra) if (!ids.has(r.id)) picked.push(r);
  }
  return picked;
}

function countsOf(registrations) {
  const list = Array.isArray(registrations) ? registrations : [];
  const n = s => list.filter(r => regStatusOf(r) === s).length;
  return {
    total: list.length,
    registered: n(REG_STATUS.REGISTERED),
    attended:   n(REG_STATUS.ATTENDED),
    no_show:    n(REG_STATUS.NO_SHOW),
    cancelled:  n(REG_STATUS.CANCELLED),
  };
}

function uniqueEmails(rows) {
  return [...new Set(rows.map(r => String(r.email || "").trim().toLowerCase()).filter(Boolean))];
}

function audienceSummary(st, n) {
  const bits = [MODE_LABEL[st.mode] || "All registered"];
  if (st.includeCancelled) bits.push("Cancelled");
  return `${bits.join(" · ")} · ${n} ${n === 1 ? "recipient" : "recipients"}`;
}

function captureCompose(host, st) {
  const sub = $("[data-email-subject]", host);
  const body = $("[data-email-body]", host);
  const when = $("[data-email-when]", host);
  if (sub) st.subject = sub.value;
  if (body) st.bodyHtml = body.innerHTML;
  if (when) st.scheduleAt = when.value;
}

function newId() {
  return (crypto.randomUUID && crypto.randomUUID())
    || `em-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ----------------------------------------------------------------- mount */

export function mountEventEmail(host, ctx) {
  if (!host) return;
  host._emailCtx = ctx;
  if (!host._emailBound) {
    host._emailBound = true;
    host.addEventListener("click", onClick);
    host.addEventListener("input", onInput);
    host.addEventListener("change", onChange);
    host.addEventListener("keydown", onKey);
  }
  render(host);
}

function render(host) {
  const ctx = host._emailCtx;
  if (!ctx?.event) return;
  const st = stateOf(ctx.event.id);
  const items = loadStore(ctx.event.id)
    .slice()
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  host.innerHTML = st.view === "history"
    ? historyView(ctx, st, items)
    : composeView(ctx, st, items);
  if (st.previewOpen) host.insertAdjacentHTML("beforeend", previewModal(st, ctx));
  if (st.confirmOpen) host.insertAdjacentHTML("beforeend", confirmModal(st, ctx));
  if (st.viewItemId) {
    const item = items.find(x => x.id === st.viewItemId);
    if (item) host.insertAdjacentHTML("beforeend", previewModal(st, ctx, item));
  }
}

/* -------------------------------------------------------------- compose */

function composeView(ctx, st, items) {
  const regs = ctx.registrations || [];
  const tally = countsOf(regs);
  const picked = audienceOf(regs, st);
  const emails = uniqueEmails(picked);
  const n = emails.length;
  const empty = tally.total === 0;
  const recent = items.slice(0, 4);
  const sendLabel = st.timing === "schedule" ? "Schedule" : "Send now";

  return `
    ${subnav("compose")}
    <div class="email-layout">
      <div class="email-main">
        <section class="card">
          <div class="hd"><h2>Email registrants</h2></div>
          <div class="frow">
            <div class="f">
              <label>From</label>
              <div class="email-locked">${LOCK}
                <input value="${esc(EMAIL_FROM)}" readonly tabindex="-1"
                  title="Locked. Event mail is sent as branded PAAIPE HTML from this address.">
              </div>
            </div>
            <div class="f">
              <label>To <span class="sub">this session only</span></label>
              <div class="email-to">${PEOPLE}
                <span>${empty ? "No registrants yet" : `${esc(MODE_LABEL[st.mode])}${st.includeCancelled ? " + Cancelled" : ""} · ${n}`}</span>
              </div>
            </div>
          </div>

          <div class="f">
            <label>Audience</label>
            <div class="chips email-aud" role="group" aria-label="Audience">
              ${[["all_registered","All registered", tally.total - tally.cancelled],
                 ["attended","Attended", tally.attended],
                 ["no_show","No-show", tally.no_show]]
                .map(([key, label, c]) => `<button type="button" class="chip${st.mode === key ? " on" : ""}"
                  data-email-mode="${key}">${esc(label)} <span class="email-n">${c}</span></button>`).join("")}
              <button type="button" class="chip${st.includeCancelled ? " on" : ""}"
                data-email-cancelled title="Cancelled registrants are left out unless you choose this.">
                Cancelled <span class="email-n">${tally.cancelled}</span></button>
            </div>
            <p class="note">Cancelled is opt-in — they are never included unless that chip is on.</p>
          </div>

          ${empty ? `<div class="banner" data-email-empty>
              <span>No registrants yet for this session.
                <button type="button" class="linkish" data-email-goto-regs>Open Registrations</button>
                to see who has signed up.</span>
            </div>` : ""}

          <div class="f">
            <label>Subject</label>
            <input data-email-subject maxlength="180" placeholder="Enter email subject…"
              value="${esc(st.subject)}">
          </div>

          <div class="f">
            <label>Body</label>
            <div class="email-ed">
              <div class="email-tb" role="toolbar" aria-label="Formatting">
                <button type="button" data-email-cmd="bold" title="Bold"><b>B</b></button>
                <button type="button" data-email-cmd="italic" title="Italic"><i>I</i></button>
                <button type="button" data-email-cmd="underline" title="Underline"><u>U</u></button>
                <span class="email-tb-gap"></span>
                <button type="button" data-email-cmd="formatBlock:p" title="Paragraph">Paragraph</button>
                <button type="button" data-email-cmd="insertUnorderedList" title="Bulleted list">• List</button>
                <button type="button" data-email-cmd="insertOrderedList" title="Numbered list">1. List</button>
                <button type="button" data-email-cmd="createLink" title="Link">Link</button>
                <button type="button" data-email-placeholder title="Insert {{first_name}}">{ }</button>
              </div>
              <div class="email-body" data-email-body contenteditable="true" role="textbox"
                aria-label="Email body">${st.bodyHtml || DEFAULT_BODY_HTML}</div>
            </div>
            <p class="note">Placeholders: <code>{{first_name}}</code> <code>{{last_name}}</code>
              <code>{{registration_id}}</code> — or write [Name]. Preview fills a sample.</p>
          </div>

          <div class="dacts email-actions">
            <button type="button" class="btn btn-ghost" data-email-preview>${EYE} Preview email</button>
            <span style="flex:1"></span>
            <button type="button" class="btn btn-ghost" data-email-save>${SAVE} Save draft</button>
            <button type="button" class="btn btn-gold" data-email-confirm
              ${n === 0 ? "disabled" : ""}>${SEND} ${esc(sendLabel)}</button>
          </div>
        </section>
      </div>

      <aside class="email-rail">
        <section class="card">
          <div class="hd"><h2>Audience</h2></div>
          <div class="email-count">
            <b data-email-count>${n}</b>
            <span>recipient${n === 1 ? "" : "s"}</span>
            ${PEOPLE}
          </div>
          <p class="note" style="margin-top:8px">${empty
            ? "Nobody is on this session yet, so there is nobody to write to."
            : st.includeCancelled
              ? `Matching the selected filters, including cancelled. Unique addresses from this session.`
              : `All registrants matching the selected filters will receive this email. Cancelled are excluded.`}</p>
        </section>

        <section class="card">
          <div class="hd"><h2>Schedule</h2></div>
          <div class="stack">
            <button type="button" class="email-timing${st.timing === "now" ? " on" : ""}"
              data-email-timing="now">${SEND} Send now</button>
            <button type="button" class="email-timing${st.timing === "schedule" ? " on" : ""}"
              data-email-timing="schedule">${CAL} Schedule for</button>
          </div>
          <div class="email-when"${st.timing === "schedule" ? "" : " hidden"}>
            <label class="sub">Date and time · ${esc(EMAIL_TZ)}</label>
            <input type="datetime-local" data-email-when value="${esc(st.scheduleAt)}">
          </div>
          <button type="button" class="btn btn-ghost btn-block" data-email-test
            title="${esc(PIPELINE_COPY)}">Send test to me</button>
          <p class="note">${esc(PIPELINE_COPY)}</p>
        </section>

        <section class="card">
          <div class="hd"><h2>Sent &amp; scheduled</h2>
            <button type="button" class="btn btn-ghost btn-sm" data-email-view="history">History</button></div>
          ${recent.length ? `<ul class="email-recent">${recent.map(itemRow).join("")}</ul>`
            : `<p class="note" style="margin-top:0">Nothing saved for this session yet. Save a draft to see it here.</p>`}
        </section>
      </aside>
    </div>`;
}

function itemRow(item) {
  const [cls, label] = STATUS_PILL[item.status] || STATUS_PILL.draft;
  const when = item.status === "scheduled" && item.scheduledAt
    ? `Scheduled for ${formatManila(item.scheduledAt)}`
    : `Saved ${formatManila(item.updatedAt || item.createdAt)}`;
  return `<li>
    <span class="${cls}">${esc(label)}</span>
    <div>
      <b>${esc(item.subject || "(no subject)")}</b>
      <small>${esc(item.audienceSummary || "")} · ${esc(when)}</small>
    </div>
  </li>`;
}

function subnav(view) {
  return `<nav class="email-sub" role="tablist">
    <button type="button" role="tab" data-email-view="compose"
      aria-selected="${view === "compose" ? "true" : "false"}">Compose</button>
    <button type="button" role="tab" data-email-view="history"
      aria-selected="${view === "history" ? "true" : "false"}">History</button>
  </nav>`;
}

/* -------------------------------------------------------------- history */

function historyView(ctx, st, items) {
  return `
    ${subnav("history")}
    <section class="card">
      <div class="hd"><h2>Email history</h2>
        <span class="count">${items.length} ${items.length === 1 ? "item" : "items"}</span></div>
      <p class="note" style="margin-top:0">${esc(PIPELINE_COPY)} Statuses other than Draft are kept for
        the UI; this tab will not mark anything Sent.</p>
      ${items.length ? `<div class="tbl"><table>
        <thead><tr><th>Subject</th><th>Audience</th><th>Time</th><th>Status</th><th></th></tr></thead>
        <tbody>${items.map(item => {
          const [cls, label] = STATUS_PILL[item.status] || STATUS_PILL.draft;
          const when = formatManila(item.scheduledAt || item.updatedAt || item.createdAt);
          return `<tr data-email-item="${esc(item.id)}">
            <td><b>${esc(item.subject || "(no subject)")}</b></td>
            <td>${esc(item.audienceSummary || "—")}</td>
            <td class="num">${esc(when)} <small>${esc(EMAIL_TZ)}</small></td>
            <td><span class="${cls}">${esc(label)}</span></td>
            <td class="act">
              <button type="button" class="btn btn-ghost btn-sm" data-email-open="${esc(item.id)}">View</button>
              <button type="button" class="btn btn-ghost btn-sm" data-email-dup="${esc(item.id)}">Duplicate</button>
              ${item.status === "scheduled"
                ? `<button type="button" class="btn btn-ghost btn-sm" data-email-cancel="${esc(item.id)}">Cancel schedule</button>`
                : ""}
              ${item.status === "failed"
                ? `<button type="button" class="btn btn-ghost btn-sm" data-email-resend="${esc(item.id)}">Resend failed</button>`
                : ""}
            </td>
          </tr>`;
        }).join("")}</tbody></table></div>`
        : `<p class="empty">No drafts or sends for this session yet.</p>`}
    </section>`;
}

/* ------------------------------------------------------- preview / confirm */

function letterHtml(st, item) {
  const subject = item?.subject ?? st.subject;
  const body = applyPreviewSamples(item?.bodyHtml ?? st.bodyHtml);
  return previewEmailHtml(body, { subject });
}

function previewModal(st, ctx, item) {
  const subject = item?.subject || st.subject || "(no subject)";
  const html = letterHtml(st, item);
  return `<div class="email-modal" data-email-modal="preview" role="dialog" aria-modal="true"
      aria-labelledby="email-preview-title">
    <div class="email-modal-card email-modal-wide">
      <div class="hd">
        <h2 id="email-preview-title">Preview · ${esc(subject)}</h2>
        <button type="button" class="xbtn" data-email-close title="Close">×</button>
      </div>
      <p class="note" style="margin:0 0 12px">Branded PAAIPE HTML from ${esc(EMAIL_FROM)}. This is the
        letter that would be sent — not a plain-text preview.</p>
      <iframe class="email-frame" title="Branded email preview" sandbox="allow-same-origin"
        srcdoc="${esc(html)}"></iframe>
    </div>
  </div>`;
}

function confirmModal(st, ctx) {
  const picked = audienceOf(ctx.registrations || [], st);
  const n = uniqueEmails(picked).length;
  const when = st.timing === "schedule"
    ? `Schedule for ${formatManila(parseManilaInput(st.scheduleAt) || st.scheduleAt)} (${EMAIL_TZ})`
    : "Send now";
  const action = st.timing === "schedule" ? "Schedule" : "Send now";
  return `<div class="email-modal" data-email-modal="confirm" role="dialog" aria-modal="true"
      aria-labelledby="email-confirm-title">
    <div class="email-modal-card">
      <div class="hd">
        <h2 id="email-confirm-title">Send to ${n} registrant${n === 1 ? "" : "s"}?</h2>
        <button type="button" class="xbtn" data-email-close title="Close">×</button>
      </div>
      <dl class="email-dl">
        <div><dt>From</dt><dd>${esc(EMAIL_FROM)}</dd></div>
        <div><dt>Subject</dt><dd>${esc(st.subject || "(no subject)")}</dd></div>
        <div><dt>Audience</dt><dd>${esc(audienceSummary(st, n))}</dd></div>
        <div><dt>Timing</dt><dd>${esc(when)}</dd></div>
      </dl>
      <div class="banner">Emails send as branded PAAIPE HTML from ${esc(EMAIL_FROM)}.
        Cannot undo after send.</div>
      <div class="banner" style="margin-top:10px">${esc(PIPELINE_COPY)}</div>
      <div class="dacts" style="justify-content:flex-end">
        <button type="button" class="btn btn-ghost" data-email-close>Cancel</button>
        <button type="button" class="btn btn-gold" data-email-do-send disabled
          title="${esc(PIPELINE_COPY)}">${esc(action)}</button>
      </div>
    </div>
  </div>`;
}

/* -------------------------------------------------------------- events */

function onClick(e) {
  const host = e.currentTarget;
  const ctx = host._emailCtx;
  if (!ctx?.event) return;
  const st = stateOf(ctx.event.id);

  const view = e.target.closest("[data-email-view]");
  if (view) {
    captureCompose(host, st);
    st.view = view.dataset.emailView;
    st.previewOpen = st.confirmOpen = false;
    st.viewItemId = null;
    render(host); return;
  }

  if (e.target.closest("[data-email-goto-regs]")) {
    ctx.goToRegistrations?.(); return;
  }

  const mode = e.target.closest("[data-email-mode]");
  if (mode) {
    captureCompose(host, st);
    st.mode = mode.dataset.emailMode;
    render(host); return;
  }
  if (e.target.closest("[data-email-cancelled]")) {
    captureCompose(host, st);
    st.includeCancelled = !st.includeCancelled;
    render(host); return;
  }

  const timing = e.target.closest("[data-email-timing]");
  if (timing) {
    captureCompose(host, st);
    st.timing = timing.dataset.emailTiming;
    render(host); return;
  }

  const cmd = e.target.closest("[data-email-cmd]");
  if (cmd) { runCmd(host, cmd.dataset.emailCmd); return; }
  if (e.target.closest("[data-email-placeholder]")) {
    insertPlaceholder(host); return;
  }

  if (e.target.closest("[data-email-preview]")) {
    captureCompose(host, st);
    if (!st.subject.trim()) return ctx.flash("Add a subject before previewing.");
    st.previewOpen = true; st.viewItemId = null;
    render(host); return;
  }
  if (e.target.closest("[data-email-save]")) {
    captureCompose(host, st);
    saveDraft(ctx, st);
    render(host); return;
  }
  if (e.target.closest("[data-email-confirm]")) {
    captureCompose(host, st);
    if (!st.subject.trim()) return ctx.flash("Add a subject before sending.");
    const n = uniqueEmails(audienceOf(ctx.registrations || [], st)).length;
    if (!n) return ctx.flash("Nobody matches the selected audience.");
    st.confirmOpen = true;
    render(host); return;
  }
  if (e.target.closest("[data-email-test]")) {
    ctx.flash(PIPELINE_COPY);
    return;
  }
  if (e.target.closest("[data-email-do-send]")) {
    ctx.flash(PIPELINE_COPY);
    st.confirmOpen = false;
    render(host); return;
  }

  if (e.target.closest("[data-email-close]") || e.target.matches("[data-email-modal]")) {
    st.previewOpen = st.confirmOpen = false;
    st.viewItemId = null;
    render(host); return;
  }

  const open = e.target.closest("[data-email-open]");
  if (open) { st.viewItemId = open.dataset.emailOpen; render(host); return; }
  const dup = e.target.closest("[data-email-dup]");
  if (dup) { duplicateItem(ctx, st, dup.dataset.emailDup); render(host); return; }
  const cancel = e.target.closest("[data-email-cancel]");
  if (cancel) { cancelSchedule(ctx, st, cancel.dataset.emailCancel); render(host); return; }
  const resend = e.target.closest("[data-email-resend]");
  if (resend) { ctx.flash("Resend is not available until the mail pipeline is wired."); return; }
}

function onInput(e) {
  const host = e.currentTarget;
  const ctx = host._emailCtx;
  if (!ctx?.event) return;
  const st = stateOf(ctx.event.id);
  if (e.target.matches("[data-email-subject]")) st.subject = e.target.value;
  if (e.target.matches("[data-email-body]")) st.bodyHtml = e.target.innerHTML;
  if (e.target.matches("[data-email-when]")) st.scheduleAt = e.target.value;
}

function onChange(e) {
  onInput(e);
}

function onKey(e) {
  if (e.key !== "Escape") return;
  const host = e.currentTarget;
  const ctx = host._emailCtx;
  if (!ctx?.event) return;
  const st = stateOf(ctx.event.id);
  if (st.previewOpen || st.confirmOpen || st.viewItemId) {
    st.previewOpen = st.confirmOpen = false;
    st.viewItemId = null;
    render(host);
  }
}

function runCmd(host, spec) {
  const body = $("[data-email-body]", host);
  if (!body) return;
  body.focus();
  const [cmd, arg] = spec.split(":");
  if (cmd === "createLink") {
    const url = prompt("Link URL");
    if (!url) return;
    document.execCommand("createLink", false, url.trim());
    return;
  }
  if (cmd === "formatBlock") {
    document.execCommand("formatBlock", false, arg || "p");
    return;
  }
  document.execCommand(cmd, false, arg || null);
}

function insertPlaceholder(host) {
  const body = $("[data-email-body]", host);
  if (!body) return;
  body.focus();
  document.execCommand("insertText", false, "{{first_name}}");
}

function saveDraft(ctx, st) {
  const eventId = ctx.event.id;
  const items = loadStore(eventId);
  const picked = audienceOf(ctx.registrations || [], st);
  const n = uniqueEmails(picked).length;
  const now = new Date().toISOString();
  const row = {
    id: st.editingId || newId(),
    eventId,
    from: EMAIL_FROM,
    subject: st.subject.trim(),
    bodyHtml: st.bodyHtml,
    mode: st.mode,
    includeCancelled: st.includeCancelled,
    audienceSummary: audienceSummary(st, n),
    audienceCount: n,
    timing: st.timing,
    scheduledAt: st.timing === "schedule" ? (parseManilaInput(st.scheduleAt) || new Date()).toISOString() : null,
    status: "draft",
    createdAt: items.find(x => x.id === st.editingId)?.createdAt || now,
    updatedAt: now,
    actor: ctx.actor || "",
  };
  const i = items.findIndex(x => x.id === row.id);
  if (i >= 0) items[i] = row; else items.unshift(row);
  saveStore(eventId, items);
  st.editingId = row.id;
  ctx.flash("Draft saved in this browser. Nothing was sent.", true);
}

function duplicateItem(ctx, st, id) {
  const item = loadStore(ctx.event.id).find(x => x.id === id);
  if (!item) return;
  st.view = "compose";
  st.subject = item.subject || "";
  st.bodyHtml = item.bodyHtml || DEFAULT_BODY_HTML;
  st.mode = item.mode || "all_registered";
  st.includeCancelled = !!item.includeCancelled;
  st.timing = "now";
  st.editingId = null;
  st.previewOpen = st.confirmOpen = false;
  st.viewItemId = null;
  ctx.flash("Duplicated into compose. This is a new draft.", true);
}

function cancelSchedule(ctx, st, id) {
  const items = loadStore(ctx.event.id);
  const item = items.find(x => x.id === id);
  if (!item || item.status !== "scheduled") {
    ctx.flash("Nothing is scheduled. Outbound is not wired, so this tab does not queue a send.");
    return;
  }
  item.status = "draft";
  item.scheduledAt = null;
  item.updatedAt = new Date().toISOString();
  saveStore(ctx.event.id, items);
  ctx.flash("Schedule cancelled. It is a draft again.", true);
}

export const _test = { audienceOf, countsOf, uniqueEmails, audienceSummary, PIPELINE_COPY, OUTBOUND_WIRED };
