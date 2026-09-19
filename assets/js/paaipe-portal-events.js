/* PAAIPE — Agent Portal Event Details (Overview / Feedback / Certificate).
 *
 * URL scheme lives in paaipe-portal-event-url.js. Ericson UI bar is unlocked
 * on the live #37 form (dedicated portal-event.html only if that page ships):
 *   portal-events.html#event=<id>
 *   portal-events.html#event=<id>&tab=feedback
 *   portal-events.html#event=<id>&tab=certificate
 * Overview omits tab= so the canonical address is #event=<id>.
 * Back and refresh restore the same event. Past list deep-links here.
 * Register from this view uses register-….html?from=portal&event=<id> so
 * “Back to the event” returns here (see paaipe-register-from-portal.js).
 * Overview ports public event fields (about, expect, program, share, calendar).
 *
 * Feedback talks to Clarence's live Slice 3 routes in paaipe-api.js.
 * Window + certificate GET/email are LIVE (certificates-20260919T051814Z).
 * Probe still treats only 200/401 as deployed. Inbox delivery is not wired —
 * send failures stay honest. No POST issue, no invented download API.
 * Downloads use certificate.pdfUrl/pngUrl on media.paaipe.org when issued.
 * Feedback 201 opens a thank-you dialog whose primary CTA writes
 * #event=<id>&tab=certificate. A secondary file link appears only when that
 * POST body already has certificate.pdfUrl/pngUrl on media.paaipe.org.
 * certificate:null still gets the thank-you + Certificate tab CTA.
 *
 * Partner apply reuses mountPartnerCta / data-partner-cta. No second flow.
 */
import {
  eventStartAt, eventTimeRange, eventDateLong, getEvent, myApplications,
  acceptsPartners, listEventSponsors, groupSponsors,
} from "/assets/js/paaipe-events-data.js";
import { currentAgent, idTokenForRequest } from "/assets/js/paaipe-firebase.js";
import { registrationReceiptFor, Q_TYPE, Q_TYPE_LABEL } from "/assets/js/paaipe-feedback.js";
import {
  listEventFeedbackQuestions,
  getEventFeedbackResponse,
  postEventFeedbackResponse,
  getEventFeedbackWindow,
  getMeEventCertificate,
  postMeEventCertificateEmail,
  certificateDownloadUrl,
  mediaFileUrl,
} from "/assets/js/paaipe-api.js";
import { mountPartnerCta } from "/assets/js/paaipe-partner.js";
import { readView, writeHash, onViewChange } from "/assets/js/paaipe-view-url.js";
import { portalEventDetailHref } from "/assets/js/paaipe-portal-event-url.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const PORTAL_EVENT_TABS = ["overview", "feedback", "certificate"];
/** Clarence certificate enum (no `ready`). Map Ericson B4 UI onto these. */
export const CERT_STATES = {
  NOT_REGISTERED: "not_registered",
  AWAITING_FEEDBACK_OPEN: "awaiting_feedback_open",
  FEEDBACK_OPEN: "feedback_open",
  ISSUING: "issuing",
  ISSUED: "issued",
  CLOSED_NO_CERT: "closed_no_cert",
};
const CERT_STATE_SET = new Set(Object.values(CERT_STATES));

const CERT_PREVIEW = "assets/img/paaipe-certificate-of-participation.png";

const ICO = {
  check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
  clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  play: '<svg viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 5h11a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>',
  award: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="5"/><path d="m8.5 13.5-1.5 7 5-2.5 5 2.5-1.5-7"/></svg>',
};

const TBA_EXPECT = [
  "A featured talk from a practitioner or partner",
  "Open Q&A with the PAAIPE community",
  "Updates on programs, benefits and partners",
];
const TBA_PROGRAM = [
  { time: "8:00 PM", item: "Welcome and opening remarks" },
  { time: "8:10 PM", item: "Featured session — topic and speaker to be announced" },
  { time: "8:55 PM", item: "Open Q&A with members" },
  { time: "9:20 PM", item: "Community updates and closing" },
];

/** Catalog matches the static Events list + public event page fields.
 *  Live getEvent() overlays it; empty live fields do not wipe catalog copy. */
export const PORTAL_EVENT_CATALOG = [
  {
    id: "2026-10-ai-exchange",
    title: "AI Exchange — October 2026",
    date: "2026-10-13",
    startTime: "20:00",
    endTime: "21:30",
    topic: "Topic to be announced",
    venue: "Online via Zoom",
    description: "The October edition of the monthly PAAIPE AI Exchange. The featured topic and speaker will be announced here and to registered members by email.",
    whatToExpect: TBA_EXPECT,
    program: TBA_PROGRAM,
    bannerSquareUrl: "assets/img/ai-exchange-2026-10-banner-square.png",
    bannerWideUrl: "assets/img/ai-exchange-2026-10-banner-wide.png",
    ics: "assets/2026-10-ai-exchange.ics",
    registerHref: "register-2026-10-ai-exchange.html",
    listedRegistered: true,
    when: "upcoming",
    joinCopy: "Join link on Oct 13",
  },
  {
    id: "2026-11-ai-exchange",
    title: "AI Exchange — November 2026",
    date: "2026-11-10",
    startTime: "20:00",
    endTime: "21:30",
    topic: "Topic to be announced",
    venue: "Online via Zoom",
    description: "The November edition of the monthly PAAIPE AI Exchange. Topic and speaker to be announced.",
    whatToExpect: TBA_EXPECT,
    program: TBA_PROGRAM,
    ics: "assets/2026-11-ai-exchange.ics",
    registerHref: "register-2026-11-ai-exchange.html",
    listedRegistered: false,
    when: "upcoming",
  },
  {
    id: "2026-12-ai-exchange",
    title: "AI Exchange — December 2026",
    date: "2026-12-08",
    startTime: "20:00",
    endTime: "21:30",
    topic: "Topic to be announced",
    venue: "Online via Zoom",
    description: "The December edition of the monthly PAAIPE AI Exchange — the last session of 2026. Topic and speaker to be announced.",
    whatToExpect: [
      "A featured talk from a practitioner or partner",
      "Open Q&A with the PAAIPE community",
      "A look back at 2026 and what is next",
    ],
    program: [
      { time: "8:00 PM", item: "Welcome and opening remarks" },
      { time: "8:10 PM", item: "Featured session — topic and speaker to be announced" },
      { time: "8:55 PM", item: "Open Q&A with members" },
      { time: "9:20 PM", item: "Year-end community updates and closing" },
    ],
    ics: "assets/2026-12-ai-exchange.ics",
    registerHref: "register-2026-12-ai-exchange.html",
    listedRegistered: false,
    when: "upcoming",
  },
  {
    id: "2026-09-ai-exchange",
    title: "AI Exchange — September 2026",
    date: "2026-09-15",
    startTime: "20:00",
    endTime: "21:30",
    topic: "From Signals to Strategy: Using AI to Turn Data into Real Insight",
    venue: "Online via Zoom",
    description: "Marketing strategist Sven Bally — former Global Media Lead for Cathay Pacific at Publicis Groupe Hong Kong and founder of Neap & Spring — on how teams turn raw data signals into decisions that create real commercial impact.",
    whatToExpect: [
      "How to separate signal from noise in marketing and business data",
      "Where AI genuinely helps analysis — and where human judgment stays essential",
      "Turning insight into strategy that moves commercial results",
    ],
    program: [
      { time: "8:00 PM", item: "Opening remarks — Paul Espinas, Founder & CEO, UpUp Technologies" },
      { time: "8:10 PM", item: "Host welcome — MJ Soriano" },
      { time: "8:15 PM", item: "From Signals to Strategy: Using AI to Turn Data into Real Insight — Sven Bally" },
      { time: "8:55 PM", item: "Open Q&A" },
      { time: "9:20 PM", item: "Closing remarks — Dennis Paguio" },
    ],
    speaker: "Sven Bally",
    host: "MJ Soriano",
    ics: "assets/2026-09-ai-exchange.ics",
    listedRegistered: true,
    listedAttended: true,
    when: "past",
    status: "held",
    watchHref: "portal-sessions.html",
    slidesHref: "portal-session-slides.html?session=2026-09",
  },
];

export function catalogEvent(id) {
  return PORTAL_EVENT_CATALOG.find(e => e.id === id) || null;
}

export function portalEventHref(id, tab) {
  const safe = tab && tab !== "overview" && PORTAL_EVENT_TABS.includes(tab) ? tab : "";
  return portalEventDetailHref(id, safe);
}

/** Pass through POST `certificate` only when it is a real object. Never invent. */
export function feedbackCertificateFromResponse(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const raw = data.certificate;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw;
}

const THANKS_COPY = "Thank you — you can now check your event certificate here.";

let thanksDlg = null;

/** Thank-you after feedback 201. Primary → Certificate tab. File CTA only if BE sent URLs. */
export function openFeedbackThanks(eventId, certificate) {
  const eid = String(eventId || "").trim();
  if (!eid || typeof document === "undefined") return null;
  const fileUrl = certificateDownloadUrl(certificate);
  const href = portalEventHref(eid, "certificate");
  if (!thanksDlg) {
    thanksDlg = document.createElement("dialog");
    thanksDlg.className = "ed-thanks";
    thanksDlg.setAttribute("data-ed-thanks", "");
    thanksDlg.setAttribute("aria-labelledby", "ed-thanks-title");
    thanksDlg.setAttribute("aria-describedby", "ed-thanks-copy");
    document.body.appendChild(thanksDlg);
    thanksDlg.addEventListener("click", e => {
      if (e.target === thanksDlg) thanksDlg.close();
      const go = e.target.closest("[data-ed-thanks-cert]");
      if (!go) return;
      e.preventDefault();
      const id = thanksDlg.dataset.eventId;
      const dest = go.getAttribute("href");
      thanksDlg.close();
      if (id && $("[data-event-details]")) {
        showDetails(id, "certificate", { push: true });
        return;
      }
      if (dest) location.assign(dest);
    });
  }
  thanksDlg.dataset.eventId = eid;
  const file = fileUrl
    ? `<a class="btn btn-ghost" data-ed-thanks-file href="${esc(fileUrl)}" target="_blank" rel="noopener">Open certificate</a>`
    : "";
  thanksDlg.innerHTML = `<div class="ed-thanks-body">
    <h2 id="ed-thanks-title">Thank you</h2>
    <p id="ed-thanks-copy">${esc(THANKS_COPY)}</p>
    <div class="ed-acts">
      <a class="btn btn-gold" data-ed-thanks-cert href="${esc(href)}">View certificate</a>
      ${file}
    </div>
  </div>`;
  if (typeof thanksDlg.showModal === "function") thanksDlg.showModal();
  $("[data-ed-thanks-cert]", thanksDlg)?.focus();
  return thanksDlg;
}

/** Register form URL that can send the Agent back to Event Details.
 *  ?from=portal is the hint the form trusts; ?event= names the #event= hash.
 *  Same helper as register-from-portal — keep the query contract identical. */
export function registerFromPortalHref(href, eventId) {
  const path = String(href || "").trim();
  if (!path) return "";
  const id = String(eventId || "").trim();
  try {
    const u = new URL(path, "https://paaipe.org/");
    u.searchParams.set("from", "portal");
    if (id) u.searchParams.set("event", id);
    return `${u.pathname.replace(/^\//, "")}${u.search}`;
  } catch {
    const q = id ? `from=portal&event=${encodeURIComponent(id)}` : "from=portal";
    return path.includes("?") ? `${path}&${q}` : `${path}?${q}`;
  }
}

function nonemptyField(v) {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** Instant the session ends (date + endTime in PHT). Null when missing. */
export function eventEndAt(ev) {
  const date = String(ev?.date || "").trim();
  const time = String(ev?.endTime || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{1,2}:\d{2}/.test(time)) return null;
  const clock = time.length >= 5 ? time.slice(0, 5) : time;
  const d = new Date(`${date}T${clock}:00+08:00`);
  return isNaN(d) ? null : d;
}

export function isEventLive(ev, now = portalNow()) {
  if (ev?.when === "past" || ev?.listedAttended || ev?.status === "held"
      || ev?.status === "cancelled") return false;
  const start = eventStartAt(ev);
  if (!start) return false;
  const end = eventEndAt(ev) || new Date(start.getTime() + 90 * 60 * 1000);
  const t = now.getTime();
  return t >= start.getTime() && t < end.getTime();
}

/** upcoming | registered | live | past — drives the header action table. */
export function detailPhase(ev, { registered } = {}, now = portalNow()) {
  if (ev?.when === "past" || ev?.listedAttended || ev?.status === "held") return "past";
  if (isEventLive(ev, now)) return "live";
  if (registered) return "registered";
  return "upcoming";
}

export function joinCopyFor(ev) {
  if (ev?.joinCopy) return ev.joinCopy;
  if (!ev?.date) return "Join link by email";
  const d = new Date(`${ev.date}T12:00:00+08:00`);
  if (isNaN(d)) return "Join link by email";
  const label = phtParts(d, { month: "short", day: "numeric" });
  return `Join link on ${label}`;
}

/** Google Calendar template — same dates/details as the public event aside. */
export function googleCalendarHref(ev) {
  const start = eventStartAt(ev);
  const end = eventEndAt(ev);
  if (!start || !end) return "";
  const compact = d => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const title = `PAAIPE ${ev.title || "AI Exchange"}`;
  const topic = ev.topic || "Topic to be announced";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    details: `${topic} — Online. Join link is sent to registered participants by email.`,
    location: "Online",
    ctz: "Asia/Manila",
  });
  // Public event pages keep a literal slash in dates=; encode the rest.
  return `https://calendar.google.com/calendar/render?${params}&dates=${compact(start)}/${compact(end)}`;
}

/** Square / wide banner downloads only when a URL is on the record. */
export function shareAssets(ev) {
  const square = String(ev?.bannerSquareUrl || "").trim();
  const wide = String(ev?.bannerWideUrl || "").trim();
  return { square, wide, any: Boolean(square || wide) };
}

export function expectList(ev) {
  return Array.isArray(ev?.whatToExpect) ? ev.whatToExpect.filter(s => String(s || "").trim()) : [];
}

export function programRows(ev) {
  return Array.isArray(ev?.program)
    ? ev.program.filter(r => r && (r.time || r.item))
    : [];
}

/** Test hook: ?paaipe_now=ISO or window.PAAIPE_NOW. Production uses the clock. */
export function portalNow() {
  try {
    const q = new URL(globalThis.location.href).searchParams.get("paaipe_now");
    if (q) {
      const d = new Date(q);
      if (!isNaN(d)) return d;
    }
  } catch { /* */ }
  if (globalThis.PAAIPE_NOW instanceof Date && !isNaN(globalThis.PAAIPE_NOW)) {
    return globalThis.PAAIPE_NOW;
  }
  return new Date();
}

/** Opens +1 hour after event start (Asia/Manila instant from date + startTime). */
export function feedbackWindowOpensAt(ev) {
  const start = eventStartAt(ev);
  if (!start) return null;
  return new Date(start.getTime() + 60 * 60 * 1000);
}

/** Closes 12:00 noon PHT the next calendar day after the event date. */
export function feedbackWindowClosesAt(ev) {
  const date = String(ev?.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const noonEventDay = new Date(`${date}T12:00:00+08:00`);
  if (isNaN(noonEventDay)) return null;
  return new Date(noonEventDay.getTime() + 24 * 60 * 60 * 1000);
}

export function feedbackWindowState(ev, now = portalNow()) {
  const opens = feedbackWindowOpensAt(ev);
  const closes = feedbackWindowClosesAt(ev);
  if (!opens || !closes) return { state: "unknown", opens, closes };
  const t = now.getTime();
  if (t < opens.getTime()) return { state: "locked", opens, closes };
  if (t >= closes.getTime()) return { state: "closed", opens, closes };
  return { state: "open", opens, closes };
}

export function certificateUiState({
  registered = false,
  submitted = false,
  windowState = "unknown",
  issued = false,
  apiState = "",
} = {}) {
  let mapped = String(apiState || "").trim();
  if (mapped === "ready") mapped = issued ? CERT_STATES.ISSUED : CERT_STATES.ISSUING;
  if (CERT_STATE_SET.has(mapped)) return mapped;
  if (issued) return CERT_STATES.ISSUED;
  if (submitted) return CERT_STATES.ISSUING;
  if (!registered) return CERT_STATES.NOT_REGISTERED;
  if (windowState === "open") return CERT_STATES.FEEDBACK_OPEN;
  if (windowState === "closed") return CERT_STATES.CLOSED_NO_CERT;
  return CERT_STATES.AWAITING_FEEDBACK_OPEN;
}

function datesFromWindow(win, ev) {
  const opens = win?.opensAt ? new Date(win.opensAt) : feedbackWindowOpensAt(ev);
  const closes = win?.closesAt ? new Date(win.closesAt) : feedbackWindowClosesAt(ev);
  return {
    opens: opens && !isNaN(opens) ? opens : null,
    closes: closes && !isNaN(closes) ? closes : null,
  };
}

/** Prefer GET /feedback/window when live; else cert.feedbackWindow; else client math. */
export async function resolveFeedbackWindow(ev, now = portalNow(), opts) {
  const client = { ...feedbackWindowState(ev, now), source: "client", live: false, timezone: "Asia/Manila" };
  if (!ev?.id) return client;
  try {
    const probe = await getEventFeedbackWindow(ev.id, opts);
    if (probe.live && probe.window) {
      const { opens, closes } = datesFromWindow(probe.window, ev);
      return {
        state: probe.window.state,
        opens: opens || client.opens,
        closes: closes || client.closes,
        source: "api",
        live: true,
        timezone: probe.window.timezone || "Asia/Manila",
      };
    }
  } catch { /* network / unreadable — keep client math, do not invent */ }
  return client;
}

function windowFromCertificate(api, ev, fallback) {
  if (!api?.feedbackWindow) return fallback;
  const { opens, closes } = datesFromWindow(api.feedbackWindow, ev);
  return {
    state: api.feedbackWindow.state,
    opens: opens || fallback.opens,
    closes: closes || fallback.closes,
    source: fallback.live ? fallback.source : "certificate",
    live: true,
    timezone: api.feedbackWindow.timezone || "Asia/Manila",
  };
}

export function normalizeApiQuestion(q, i = 0) {
  if (!q || typeof q !== "object") return null;
  const questionKey = String(q.questionKey || q.key || q.id || "").trim();
  const prompt = String(q.prompt || q.question || "").trim();
  if (!questionKey || !prompt) return null;
  let type = String(q.type || "").trim();
  if (type === "scale" || type === "rating") type = Q_TYPE.SCALE;
  if (type === "yesno" || type === "yes_no" || type === "boolean") type = Q_TYPE.YESNO;
  if (type === "text" || type === "long" || type === "string") type = Q_TYPE.SHORT;
  if (!Q_TYPE_LABEL[type]) type = Q_TYPE.SHORT;
  return {
    id: String(q.id || questionKey),
    questionKey,
    prompt,
    type,
    required: q.required !== false,
    active: q.active !== false,
    order: Number.isFinite(Number(q.order)) ? Number(q.order) : i,
  };
}

function phtParts(d, opts) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", ...opts }).format(d);
}

export function formatPhtDay(d) {
  if (!d || isNaN(d)) return "";
  return phtParts(d, { weekday: "long", month: "short", day: "numeric" }).replace(",", "");
}

export function formatCloseCopy(closes) {
  if (!closes) return "12:00 noon PHT the next calendar day";
  return `${formatPhtDay(closes)}, 12:00 noon PHT`;
}

export function formatSubmittedAt(row) {
  const raw = row?.submittedAt || row?.createdAt;
  const d = raw ? new Date(typeof raw === "object" && raw.seconds
    ? raw.seconds * 1000
    : raw) : null;
  if (!d || isNaN(d)) return "";
  return phtParts(d, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " PHT";
}

export function headerStatus(ev, { registered } = {}, now = portalNow()) {
  if (ev?.when === "past" || ev?.listedAttended || ev?.status === "held") return "Past";
  if (isEventLive(ev, now)) return "Live";
  if (registered) return "Registered";
  return "Upcoming";
}

function takeField(catalog, live, key) {
  if (nonemptyField(live?.[key])) return live[key];
  if (nonemptyField(catalog?.[key])) return catalog[key];
  return live?.[key] ?? catalog?.[key];
}

function mergeEvent(catalog, live) {
  if (!catalog && !live) return null;
  const ev = { ...(catalog || {}), ...(live || {}) };
  if (catalog?.id) ev.id = catalog.id;
  if (live?.id && !catalog) ev.id = live.id;
  if (catalog?.listedRegistered != null) ev.listedRegistered = catalog.listedRegistered;
  if (catalog?.listedAttended != null) ev.listedAttended = catalog.listedAttended;
  if (catalog?.when) ev.when = catalog.when;
  for (const key of [
    "title", "topic", "description", "whatToExpect", "program", "speakers",
    "ics", "registerHref", "joinCopy", "watchHref", "slidesHref",
    "bannerSquareUrl", "bannerWideUrl", "speaker", "host", "venue",
  ]) ev[key] = takeField(catalog, live, key);
  return ev;
}

export function isListedRegistered(ev) {
  return ev?.listedRegistered === true || ev?.listedAttended === true;
}

export function hasRegistrationReceipt(eventId) {
  const row = registrationReceiptFor(eventId);
  return Boolean(row?.registrationId);
}

export function isPortalRegistered(ev) {
  return hasRegistrationReceipt(ev?.id) || isListedRegistered(ev);
}

function pill(kind, icon, label) {
  return `<span class="pill ${kind}">${icon}${esc(label)}</span>`;
}

function tabBtn(id, tab, current) {
  const on = tab === current;
  return `<button type="button" class="ed-tab${on ? " on" : ""}" data-ed-tab="${tab}"
    aria-selected="${on ? "true" : "false"}">${esc({
      overview: "Overview", feedback: "Feedback", certificate: "Certificate",
    }[tab] || tab)}</button>`;
}

function metaLine(ev) {
  const day = ev.date ? phtParts(new Date(`${ev.date}T12:00:00+08:00`), {
    weekday: "short", month: "short", day: "numeric",
  }) : "";
  const time = eventTimeRange(ev);
  const bits = [day, time ? `${time} PHT` : "", "Online"].filter(Boolean);
  return bits.join(" · ");
}

function headerPills(ev) {
  const day = ev.date ? phtParts(new Date(`${ev.date}T12:00:00+08:00`), {
    month: "short", day: "numeric", year: "numeric",
  }) : "";
  const time = eventTimeRange(ev);
  const chips = [];
  if (day) chips.push(`<span class="ed-chip">${esc(day)}</span>`);
  if (time) chips.push(`<span class="ed-chip">${esc(time)} PHT</span>`);
  chips.push(`<span class="ed-chip">Online via Zoom</span>`);
  return chips.join("");
}

function statusPill(ev, registered, now = portalNow()) {
  const status = headerStatus(ev, { registered }, now);
  if (status === "Past") {
    return pill("ok", ICO.check, ev.listedAttended ? "Attended" : "Past");
  }
  if (status === "Live") return pill("gold", ICO.play, "Live");
  if (status === "Registered") return pill("ok", ICO.check, "Registered");
  return pill("info", ICO.clock, "Upcoming");
}

function partnerMount(ev) {
  return `<span data-partner-cta data-event-id="${esc(ev.id)}" data-partner-source="portal_events"
    data-event-title="${esc(ev.title || "")}"></span>`;
}

function joinControl(ev, { live } = {}) {
  if (live) {
    const href = String(ev.joinUrl || ev.joinHref || "").trim();
    if (href) {
      return `<a class="btn btn-gold btn-sm" href="${esc(href)}" target="_blank" rel="noopener">Join</a>`;
    }
    return `<span class="btn btn-gold btn-sm" aria-disabled="true" title="Join link is sent by email">Join</span>`;
  }
  return `<span class="btn btn-ghost btn-sm" aria-disabled="true">${esc(joinCopyFor(ev))}</span>`;
}

function calendarGhost(ev) {
  return ev.ics
    ? `<a class="btn btn-ghost btn-sm" href="${esc(ev.ics)}" download>Add to calendar</a>`
    : "";
}

/** Header actions by state — Register gold / Registered / Join / calendar / partner. */
export function headerActionsHtml(ev, { registered } = {}, now = portalNow()) {
  const phase = detailPhase(ev, { registered }, now);
  const bits = [];
  const regHref = ev.registerHref ? registerFromPortalHref(ev.registerHref, ev.id) : "";
  if (phase === "upcoming" && regHref) {
    bits.push(`<a class="btn btn-gold btn-sm" href="${esc(regHref)}">Register</a>`);
  }
  if (phase === "registered") {
    bits.push(pill("ok", ICO.check, "Registered"));
    bits.push(joinControl(ev, { live: false }));
  }
  if (phase === "live") bits.push(joinControl(ev, { live: true }));
  if (phase !== "past") bits.push(calendarGhost(ev));
  bits.push(partnerMount(ev));
  return bits.filter(Boolean).join("");
}

function chevron() {
  return `<svg class="ed-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
}

/** Sections start expanded (Paul). Header click collapses. */
function collapseSection(id, title, body, extra = "") {
  return `<section class="ed-sec" data-ed-sec="${esc(id)}" data-ed-open="1">
    <button type="button" class="ed-sec-hd" data-ed-toggle aria-expanded="true">
      <h3>${esc(title)}</h3>
      <span class="ed-sec-aside">${extra}${chevron()}</span>
    </button>
    <div class="ed-sec-body">${body}</div>
  </section>`;
}

function aboutBody(ev) {
  const topic = ev.topic || ev.subtitle || "Topic to be announced";
  const about = ev.description || "";
  const who = [ev.speaker && ev.speaker, ev.host && `Host: ${ev.host}`].filter(Boolean).join(" · ");
  const bullets = expectList(ev);
  const list = bullets.length
    ? `<ul class="ed-expect">${bullets.map(s => `<li>${esc(s)}</li>`).join("")}</ul>`
    : "";
  return `<p class="ed-lede">${esc(about || topic)}</p>
    ${who ? `<p class="ed-sub">${esc(who)}</p>` : ""}
    ${list}`;
}

function scheduleBody(ev) {
  const day = eventDateLong(ev);
  const time = eventTimeRange(ev);
  const compact = [day, time ? `${time} PHT` : "", "Online"].filter(Boolean).join(" · ");
  const rows = programRows(ev);
  const agenda = rows.length
    ? `<ul class="ed-agenda">${rows.map(r =>
      `<li>${r.time ? `<b>${esc(r.time)}</b>` : ""}<span>${esc(r.item || "")}</span></li>`).join("")}</ul>`
    : "";
  return `<p class="ed-lede">${esc(compact)}</p>${agenda}`;
}

function partnersBody(ev, sponsors = []) {
  const g = groupSponsors(sponsors || []);
  if (g.any) {
    const logos = [...g.presenting, ...g.supporting, ...g.community].map(r => {
      const o = r.organization || {};
      const mark = o.logoUrl
        ? `<img src="${esc(o.logoUrl)}" alt="${esc(o.name || "Partner")}" loading="lazy">`
        : `<span>${esc(o.name || "Partner")}</span>`;
      return o.website
        ? `<a class="ed-logo" href="${esc(o.website)}" target="_blank" rel="noopener">${mark}</a>`
        : `<span class="ed-logo">${mark}</span>`;
    }).join("");
    return `<div class="ed-logos">${logos}</div>`;
  }
  return `<p class="ed-sub">Does your company want to support this Exchange?</p>
    <div class="ed-acts">${partnerMount(ev)}</div>
    <p class="ed-foot">Guests and Agents can apply as Partner for this event from here.</p>`;
}

function shareBody(ev) {
  const { square, wide } = shareAssets(ev);
  const links = [];
  if (square) links.push(`<a class="btn btn-ghost btn-sm" href="${esc(square)}" download>Square banner</a>`);
  if (wide) links.push(`<a class="btn btn-ghost btn-sm" href="${esc(wide)}" download>Wide banner</a>`);
  return `<p class="ed-sub">Download a banner to share this Exchange.</p>
    <div class="ed-acts">${links.join("")}</div>`;
}

function calendarBody(ev) {
  const gcal = googleCalendarHref(ev);
  const bits = [];
  if (gcal) bits.push(`<a class="btn btn-ghost btn-sm" href="${esc(gcal)}" target="_blank" rel="noopener">Google</a>`);
  if (ev.ics) bits.push(`<a class="btn btn-ghost btn-sm" href="${esc(ev.ics)}" download>Apple / Outlook (.ics)</a>`);
  return `<p class="ed-sub">Add this session to your calendar.</p>
    <div class="ed-acts">${bits.join("")}</div>`;
}

function detailHeader(ev, { registered } = {}, now = portalNow()) {
  const topic = ev.topic || ev.subtitle || "Topic to be announced";
  return `<header class="ed-head" data-ed-head>
    <div class="ed-head-copy">
      ${statusPill(ev, registered, now)}
      <div class="ed-meta">${headerPills(ev)}</div>
      <p class="ed-topic">${esc(topic)}</p>
    </div>
    <div class="ed-head-acts ed-acts">${headerActionsHtml(ev, { registered }, now)}</div>
  </header>`;
}

function overviewHtml(ev, registered, sponsors = []) {
  const share = shareAssets(ev);
  const blocks = [
    collapseSection("about", "About / What to expect", aboutBody(ev)),
    collapseSection("schedule", "Schedule", scheduleBody(ev)),
    collapseSection("partners", "Partners", partnersBody(ev, sponsors)),
  ];
  if (share.any) blocks.push(collapseSection("share", "Share", shareBody(ev)));
  blocks.push(collapseSection("calendar", "Calendar", calendarBody(ev)));
  return `<section class="ed-card" data-ed-panel="overview">
    <div class="ed-card-hd">
      <h2>Overview</h2>
    </div>
    ${blocks.join("")}
  </section>`;
}

function feedbackIntroCopy(ev, win) {
  const close = formatCloseCopy(win.closes);
  if (win.state === "locked") {
    return {
      pill: "soon",
      pillLabel: "Locked",
      lede: "Feedback opens one hour after the session starts.",
      extra: win.opens
        ? `This session starts ${eventTimeRange(ev) || "at the published time"} PHT. The form unlocks one hour later and stays open until ${close}.`
        : "The event record has no start time yet, so the form cannot open.",
    };
  }
  if (win.state === "open") {
    return {
      pill: "ok",
      pillLabel: "Open",
      lede: `Opened one hour after the session started. Closes ${close}.`,
      extra: "Submitting feedback (while registered) is required for the Certificate of Participation. The server issues the certificate on submit — this page does not POST issue.",
    };
  }
  if (win.state === "closed") {
    return {
      pill: "info",
      pillLabel: "Closed",
      lede: `Closed ${close}.`,
      extra: "Feedback is closed. Certificates already earned stay available under Certificate. New feedback is not accepted.",
    };
  }
  return {
    pill: "info",
    pillLabel: "Unavailable",
    lede: "Feedback timing cannot be computed from this event record.",
    extra: "",
  };
}

function feedbackShell(ev, win, body) {
  const copy = feedbackIntroCopy(ev, win);
  return `<section class="ed-card" data-ed-panel="feedback" data-ed-sec="feedback" data-ed-open="1"
    data-feedback-window="${esc(win.state)}" data-feedback-window-source="${esc(win.source || "client")}">
    <button type="button" class="ed-card-hd ed-sec-hd" data-ed-toggle aria-expanded="true">
      <h2>Feedback</h2>
      <span class="ed-sec-aside">${pill(copy.pill, ICO.clock, copy.pillLabel)}${chevron()}</span>
    </button>
    <div class="ed-sec-body">
      <p class="ed-lede">${esc(copy.lede)}</p>
      ${copy.extra ? `<p class="ed-sub">${esc(copy.extra)}</p>` : ""}
      ${body}
    </div>
  </section>`;
}

function certificateChecklist({ registered, submitted, submittedLabel, ev, win }) {
  const regNote = registered
    ? (ev.listedAttended ? "Confirmed · this event window" : "Confirmed · within the registration window")
    : "Register for this event first.";
  const fbNote = submitted
    ? (submittedLabel ? `Received ${submittedLabel}` : "Received")
    : win.state === "open"
      ? "Answer the feedback form before noon tomorrow to unlock your certificate"
      : win.state === "closed"
        ? "The feedback window has closed"
        : "Wait until one hour after the session starts";
  return `<ul class="ed-check">
    <li class="${registered ? "done" : ""}">
      <i aria-hidden="true">${registered ? ICO.check : ""}</i>
      <div><b>Registered for this event</b><small>${esc(regNote)}</small></div>
    </li>
    <li class="${submitted ? "done" : ""}">
      <i aria-hidden="true">${submitted ? ICO.check : ""}</i>
      <div><b>Feedback submitted</b><small>${esc(fbNote)}</small></div>
    </li>
  </ul>`;
}

function certActions({
  issued,
  downloadUrl,
  emailLive,
  openFeedbackHref,
  registerHref,
  notWired,
}) {
  const canDownload = Boolean(downloadUrl);
  const dlLabel = canDownload && /\.png(\?|$)/i.test(downloadUrl) && !/\.pdf(\?|$)/i.test(downloadUrl)
    ? "Download image"
    : "Download PDF";
  const dl = canDownload
    ? `<a class="btn btn-gold btn-sm" data-cert-download href="${esc(downloadUrl)}" target="_blank" rel="noopener">${esc(dlLabel)}</a>`
    : `<button type="button" class="btn btn-ghost btn-sm" data-cert-download disabled
      title="${notWired
        ? "Certificate download is not wired yet. Clarence’s certificate GET is not live on this host (no 200/401)."
        : "No media.paaipe.org file URL was returned. Download stays disabled."}">${esc(dlLabel)}</button>`;
  const em = emailLive
    ? `<button type="button" class="btn btn-ghost btn-sm" data-cert-email>Email me the certificate</button>`
    : `<button type="button" class="btn btn-ghost btn-sm" data-cert-email disabled
      title="${notWired
        ? "Certificate email is not wired yet. The re-send route is not live on this host (no 200/401)."
        : "Email is available after the certificate is issued. Inbox delivery is not wired yet — failures stay honest."}">Email me the certificate</button>`;
  const reg = registerHref
    ? `<a class="btn btn-gold btn-sm" href="${esc(registerHref)}">Register</a>`
    : "";
  const fb = openFeedbackHref
    ? `<a class="btn btn-gold btn-sm" href="${esc(openFeedbackHref)}">Open feedback</a>`
    : "";
  if (issued) return `<div class="ed-acts">${dl}${em}</div>`;
  return `<div class="ed-acts">${reg}${fb}${dl}${em}</div>`;
}

function certificateHtml(ev, state, {
  registered, submitted, submittedLabel, win, live = false, cert = null,
}) {
  const issued = state === CERT_STATES.ISSUED;
  const issuing = state === CERT_STATES.ISSUING;
  const downloadUrl = issued ? certificateDownloadUrl(cert) : "";
  const previewSrc = issued ? (mediaFileUrl(cert?.pngUrl) || CERT_PREVIEW) : CERT_PREVIEW;
  const emailLive = live && issued;
  const openFb = (registered && !submitted && win.state !== "closed" && !issued && !issuing)
    ? portalEventHref(ev.id, "feedback")
    : "";
  const registerHref = (!registered && ev.registerHref)
    ? registerFromPortalHref(ev.registerHref, ev.id) : "";
  let statusLabel = "Not ready yet";
  let statusKind = "info";
  let note = live
    ? "When both gates are done, the server issues the certificate on feedback submit. Download uses the media.paaipe.org file URL. This page does not POST issue."
    : "Certificate GET is not live on this host yet (no 200/401). Download and Email me stay disabled — nothing was generated or sent.";
  let preview = "";
  if (state === CERT_STATES.NOT_REGISTERED) {
    note = "Register for this event first. Download and Email me stay disabled until you are registered and have submitted feedback in the window.";
  } else if (state === CERT_STATES.CLOSED_NO_CERT) {
    statusLabel = "Not earned";
    note = "Feedback closed without a submission, so this event has no Certificate of Participation. Download and Email me stay disabled.";
  } else if (state === CERT_STATES.AWAITING_FEEDBACK_OPEN) {
    note = "Feedback is still locked. Download and Email me stay disabled until you submit in the window.";
  } else if (state === CERT_STATES.FEEDBACK_OPEN) {
    note = "Open feedback and submit once. The server issues the certificate on submit — this page does not POST issue.";
  } else if (issuing) {
    statusLabel = "Issuing";
    statusKind = "info";
    note = live
      ? "Feedback is in. The server is issuing your certificate. Download stays disabled until the file URL is present."
      : "Eligibility is complete (registered + feedback). Issue is server-side. Certificate GET is not live on this host yet — Download and Email me stay disabled. Nothing was generated or sent.";
    preview = `<figure class="ed-cert">
      <img src="${CERT_PREVIEW}" alt="Approved Certificate of Participation template. Recipient name, event name, and date are merge fields when the certificate is issued.">
    </figure>`;
  } else if (issued) {
    statusLabel = "Issued";
    statusKind = "ok";
    note = downloadUrl
      ? (cert?.emailedAt
        ? "Issued. A copy was emailed. Download uses the file on media.paaipe.org."
        : "Issued. Download uses the file on media.paaipe.org. Email me re-sends that copy.")
      : "Issued, but no media.paaipe.org file URL was returned. Download stays disabled.";
    preview = `<figure class="ed-cert">
      <img src="${esc(previewSrc)}" alt="Certificate of Participation${downloadUrl ? "" : " template"}.">
    </figure>`;
  }
  const closeLine = win.closes
    ? `Feedback open until ${formatCloseCopy(win.closes)}.`
    : "Feedback opens one hour after the session and closes at noon PHT the next day.";
  return `<section class="ed-card" data-ed-panel="certificate" data-ed-sec="certificate" data-ed-open="1"
    data-cert-state="${esc(state)}" data-cert-live="${live ? "1" : "0"}">
    <button type="button" class="ed-card-hd ed-sec-hd" data-ed-toggle aria-expanded="true">
      <h2>Certificate</h2>
      <span class="ed-sec-aside">${pill(statusKind, issued ? ICO.check : ICO.clock, statusLabel)}${chevron()}</span>
    </button>
    <div class="ed-sec-body">
      <p class="ed-sub">${esc(closeLine)}</p>
      ${certificateChecklist({ registered, submitted, submittedLabel, ev, win })}
      ${preview}
      ${certActions({
        issued,
        downloadUrl,
        emailLive,
        openFeedbackHref: openFb,
        registerHref,
        notWired: !live,
      })}
      <p class="ed-note${issued ? " ok" : ""}" data-cert-msg>${esc(note)}</p>
    </div>
  </section>`;
}

function detailsChrome(ev, tab, registered, panel, { windowSource = "client", certLive = false } = {}) {
  const status = headerStatus(ev, { registered });
  const phase = detailPhase(ev, { registered });
  return `<div class="ed" data-ed-root data-event-id="${esc(ev.id)}" data-ed-tab="${esc(tab)}"
    data-ed-status="${esc(status)}" data-ed-phase="${esc(phase)}"
    data-feedback-window-source="${esc(windowSource)}" data-cert-live="${certLive ? "1" : "0"}">
    ${detailHeader(ev, { registered })}
    <div class="ed-tabs" role="tablist">
      ${PORTAL_EVENT_TABS.map(t => tabBtn(ev.id, t, tab)).join("")}
    </div>
    ${panel}
  </div>`;
}

function applyHeader(ev, registered) {
  const h = $(".top .ttl h1");
  const s = $(".top .ttl small");
  if (h) h.textContent = ev.title || "Event";
  if (s) s.textContent = metaLine(ev);
  const crumb = $(".top .ttl");
  if (crumb && !crumb.querySelector("[data-event-back]")) {
    const a = document.createElement("a");
    a.href = "portal-events.html";
    a.dataset.eventBack = "1";
    a.className = "ed-back";
    a.textContent = "Events";
    crumb.insertBefore(a, crumb.firstChild);
  }
  if (crumb && !crumb.querySelector("[data-ed-top-status]")) {
    const wrap = document.createElement("span");
    wrap.dataset.edTopStatus = "1";
    wrap.className = "ed-top-status";
    crumb.insertBefore(wrap, crumb.querySelector("h1") || null);
  }
  const topStatus = $("[data-ed-top-status]");
  if (topStatus) topStatus.innerHTML = statusPill(ev, registered);
}

function restoreHeader() {
  const h = $(".top .ttl h1");
  const s = $(".top .ttl small");
  if (h) h.textContent = "Events";
  if (s) {
    s.textContent = document.body.contains($("[data-events-home]"))
      ? (location.pathname.includes("past")
        ? "Past AI Exchange and member events."
        : "Upcoming AI Exchange and member events.")
      : s.textContent;
  }
  $("[data-event-back]")?.remove();
  $("[data-ed-top-status]")?.remove();
}

async function resolveLive(id) {
  const catalog = catalogEvent(id);
  let live = null;
  try { live = await getEvent(id); }
  catch { live = null; }
  return mergeEvent(catalog, live);
}

async function loadFeedbackRow(eventId) {
  const receipt = registrationReceiptFor(eventId);
  if (!receipt?.registrationId) return { receipt: null, row: null, error: "" };
  try {
    const token = await idTokenForRequest();
    const row = await getEventFeedbackResponse(eventId, receipt.registrationId, { token });
    return { receipt, row, error: "" };
  } catch (e) {
    return { receipt, row: null, error: e?.message || String(e) };
  }
}

async function loadMeCertificate(eventId) {
  try {
    const token = await idTokenForRequest();
    if (!token) return { live: false, status: 0, certificate: null, unauthorized: true };
    return await getMeEventCertificate(eventId, { token });
  } catch (e) {
    if (e?.status === 401 || e?.code === "not-signed-in" || e?.code === "api/unauthorized") {
      return { live: e?.status === 401, status: e?.status || 0, certificate: null, unauthorized: true };
    }
    return { live: false, status: e?.status || 0, certificate: null, error: e?.message || String(e) };
  }
}

async function sendCertificateEmail(eventId) {
  const note = $("[data-cert-msg]");
  const btn = $("[data-cert-email]");
  const show = m => { if (note) note.textContent = m; };
  if (btn) btn.disabled = true;
  try {
    const token = await idTokenForRequest();
    const result = await postMeEventCertificateEmail(eventId, { token });
    const when = result?.emailedAt ? formatSubmittedAt({ submittedAt: result.emailedAt }) : "";
    show(when
      ? `The API accepted the re-send (${when}). Inbox delivery is not wired yet — nothing was assumed delivered.`
      : "The API accepted the re-send. Inbox delivery is not wired yet — nothing was assumed delivered.");
    if (note) note.classList.add("ok");
  } catch (e) {
    if (btn) btn.disabled = false;
    if (e?.status === 409) {
      show("This certificate is not issued yet. Nothing was emailed.");
      return;
    }
    if (e?.status === 404) {
      show("No certificate is available to email.");
      return;
    }
    if (e?.status === 501 || e?.status === 502) {
      show("Certificate email delivery is not wired yet. Nothing was sent.");
      return;
    }
    show(e?.message || "Could not email the certificate. Nothing was assumed sent.");
  }
}

function paintFeedbackForm(host, ev, questions, receipt) {
  const fields = questions.map(q => {
    const req = q.required ? "" : ` <span class="opt">Optional</span>`;
    if (q.type === Q_TYPE.SCALE) {
      const btns = [1, 2, 3, 4, 5].map(n =>
        `<button type="button" data-efb-choice="${esc(q.id)}" data-val="${n}" aria-pressed="false">${n}</button>`).join("");
      return `<div class="ed-q" data-efb-q="${esc(q.id)}" data-type="${q.type}" data-required="${q.required ? "1" : "0"}">
        <b>${esc(q.prompt)}${req}</b><div class="ed-scale">${btns}</div></div>`;
    }
    if (q.type === Q_TYPE.YESNO) {
      return `<div class="ed-q" data-efb-q="${esc(q.id)}" data-type="${q.type}" data-required="${q.required ? "1" : "0"}">
        <b>${esc(q.prompt)}${req}</b>
        <div class="ed-yn">
          <button type="button" data-efb-choice="${esc(q.id)}" data-val="yes" aria-pressed="false">Yes</button>
          <button type="button" data-efb-choice="${esc(q.id)}" data-val="no" aria-pressed="false">No</button>
        </div></div>`;
    }
    return `<div class="ed-q" data-efb-q="${esc(q.id)}" data-type="${q.type}" data-required="${q.required ? "1" : "0"}">
      <b>${esc(q.prompt)}${req}</b>
      <textarea data-efb-text="${esc(q.id)}" maxlength="2000" rows="3" autocomplete="off"></textarea></div>`;
  }).join("");

  host.innerHTML = `<form class="ed-form" data-efb-form novalidate>${fields}
    <button class="btn btn-gold" type="submit">Submit feedback</button>
    <p class="ed-sub">One response for this event. You can send it once.</p>
    <p class="ed-err" data-efb-err hidden></p>
  </form>`;

  host.addEventListener("click", e => {
    const b = e.target.closest("[data-efb-choice]");
    if (!b) return;
    const id = b.dataset.efbChoice;
    $$(`[data-efb-choice="${id}"]`, host).forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
  });

  $("[data-efb-form]", host)?.addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("[data-efb-err]", host);
    const show = m => { if (err) { err.textContent = m; err.hidden = !m; } };
    show("");
    const answers = {};
    for (const q of questions) {
      const wrap = $(`[data-efb-q="${q.id}"]`, host);
      let val = "";
      if (q.type === Q_TYPE.SHORT) val = $(`[data-efb-text="${q.id}"]`, wrap)?.value?.trim() || "";
      else val = $(`[data-efb-choice="${q.id}"][aria-pressed="true"]`, wrap)?.dataset.val || "";
      if (q.required && !val) {
        show("Please answer the required questions before sending.");
        return;
      }
      if (!val) continue;
      if (q.type === Q_TYPE.SHORT) {
        if (val.length > 2000) {
          show("A short answer can be at most 2,000 characters.");
          return;
        }
        answers[q.questionKey || q.id] = val;
        continue;
      }
      answers[q.questionKey || q.id] = q.type === Q_TYPE.SCALE ? Number(val) : val;
    }
    const btn = $("button[type=submit]", host);
    if (btn) btn.disabled = true;
    try {
      const token = await idTokenForRequest();
      const result = await postEventFeedbackResponse(ev.id, {
        registrationId: receipt.registrationId,
        answers,
      }, { token });
      show("");
      await showDetails(ev.id, "feedback", { push: false });
      openFeedbackThanks(ev.id, feedbackCertificateFromResponse(result));
    } catch (ex) {
      if (btn) btn.disabled = false;
      if (ex?.status === 403) {
        show("The feedback window is not open. The API did not accept this response.");
        return;
      }
      if (ex?.status === 409 || /already/i.test(ex?.message || "")) {
        show("A response already exists for this registration. Nothing new was sent.");
        return;
      }
      show(`Could not send feedback: ${ex?.message || ex}. Nothing was stored.`);
    }
  });
}

async function feedbackBody(ev, win, { registered, receipt, row, error }) {
  if (row) {
    const when = formatSubmittedAt(row);
    return `<p class="ed-note ok">You have already sent feedback${when ? ` · ${esc(when)}` : ""}. One response.</p>`;
  }
  if (!registered) {
    const reg = ev.registerHref
      ? `<a class="btn btn-gold btn-sm" href="${esc(registerFromPortalHref(ev.registerHref, ev.id))}">Register</a>`
      : "";
    return `<p class="ed-sub">Register for this event to send feedback.</p><div class="ed-acts">${reg}</div>`;
  }
  if (win.state === "locked") {
    return `<button type="button" class="btn btn-ghost" disabled>Feedback opens one hour after the session starts</button>`;
  }
  if (win.state === "closed") {
    return "";
  }
  if (!receipt?.registrationId) {
    return `<p class="ed-sub">We do not have a registration id on this device, so the live Feedback API cannot accept a response from here. If you registered in this browser after the receipt was added, reload and try again.</p>`;
  }
  if (error && !row) {
    return `<p class="ed-sub">${esc(error)}</p>`;
  }
  const formHost = `<div data-ed-fb-form><p class="ed-sub">Loading questions…</p></div>`;
  return `${formHost}`;
}

async function mountPartner(ev) {
  const hosts = $$("[data-event-details] [data-partner-cta]");
  if (!hosts.length) return;
  if (!acceptsPartners(ev)) {
    hosts.forEach(host => {
      host.innerHTML = "";
      host.setAttribute("data-partner-cta-state", `hidden:${ev.status || ev.when || "unknown"}`);
    });
    return;
  }
  const me = await currentAgent().catch(() => null);
  const mine = await myApplications(me?.uid).catch(() => new Map());
  for (const host of hosts) {
    if (mine.has(ev.id)) {
      const app = mine.get(ev.id);
      host.innerHTML = `<span class="pmine"><span class="pcta-dot"></span>Your partner application
        <b>${esc(app.reference || "")}</b></span>`;
      continue;
    }
    mountPartnerCta(host, ev, host.dataset.partnerSource || "portal_events");
  }
}

async function loadQuestionsInto(ev, receipt) {
  const box = $("[data-ed-fb-form]");
  if (!box) return;
  try {
    const rows = await listEventFeedbackQuestions(ev.id);
    const active = rows.map(normalizeApiQuestion).filter(q => q && q.active)
      .sort((a, b) => a.order - b.order);
    if (!active.length) {
      box.innerHTML = `<p class="ed-sub">No feedback questions have been published for this event yet.</p>`;
      return;
    }
    paintFeedbackForm(box, ev, active, receipt);
  } catch (e) {
    box.innerHTML = `<p class="ed-sub">${esc(e?.message || "Feedback questions could not be read. This is not an empty form.")}</p>`;
  }
}

let detailsGen = 0;

export async function showDetails(eventId, tab, { push = true } = {}) {
  const home = $("[data-events-home]");
  const mount = $("[data-event-details]");
  if (!mount) return false;
  const gen = ++detailsGen;
  const still = () => gen === detailsGen;
  const id = String(eventId || "").trim();
  const safeTab = PORTAL_EVENT_TABS.includes(tab) ? tab : "overview";
  const ev = await resolveLive(id);
  if (!still()) return false;
  if (!ev) {
    if (home) home.hidden = true;
    mount.hidden = false;
    mount.innerHTML = `<section class="ed-card"><h2>Event not available</h2>
      <p class="ed-lede">There is no portal Event Details for that id.</p>
      <p><a class="btn btn-ghost btn-sm" data-event-back href="portal-events.html">Back to Events</a></p>
    </section>`;
    writeHash({ event: id, tab: safeTab === "overview" ? "" : safeTab }, { push });
    return false;
  }

  const registeredLocal = isPortalRegistered(ev);
  const [winResolved, meCert, fb, sponsors] = await Promise.all([
    resolveFeedbackWindow(ev).catch(() => ({
      ...feedbackWindowState(ev), source: "client", live: false, timezone: "Asia/Manila",
    })),
    loadMeCertificate(ev.id),
    loadFeedbackRow(ev.id),
    listEventSponsors(ev.id).catch(() => []),
  ]);
  if (!still()) return false;
  const api = meCert.certificate;
  let win = winResolved;
  if (!win.live && api) win = windowFromCertificate(api, ev, win);

  const registered = api ? api.registered === true : registeredLocal;
  const submitted = api ? api.feedbackSubmitted === true : Boolean(fb.row);
  const issued = api?.state === CERT_STATES.ISSUED && Boolean(api.certificate);
  const certState = certificateUiState({
    registered,
    submitted,
    windowState: win.state,
    issued,
    apiState: api?.state || "",
  });

  let panel = "";
  if (safeTab === "feedback") {
    const body = await feedbackBody(ev, win, { registered, ...fb });
    panel = feedbackShell(ev, win, body);
  } else if (safeTab === "certificate") {
    panel = certificateHtml(ev, certState, {
      registered,
      submitted,
      submittedLabel: formatSubmittedAt(fb.row),
      win,
      live: meCert.live === true && meCert.status === 200,
      cert: api?.certificate || null,
    });
  } else {
    panel = overviewHtml(ev, registered, sponsors);
  }

  if (home) home.hidden = true;
  mount.hidden = false;
  mount.innerHTML = detailsChrome(ev, safeTab, registered, panel, {
    windowSource: win.source || "client",
    certLive: meCert.live === true && meCert.status === 200,
  });
  applyHeader(ev, registered);
  document.documentElement.setAttribute("data-portal-event", ev.id);
  document.documentElement.setAttribute("data-portal-event-tab", safeTab);
  document.documentElement.setAttribute("data-portal-event-phase", detailPhase(ev, { registered }));
  document.documentElement.setAttribute("data-portal-cert-state", certState);
  document.documentElement.setAttribute("data-portal-feedback-window", win.state);
  document.documentElement.setAttribute("data-portal-feedback-window-source", win.source || "client");
  document.documentElement.setAttribute("data-portal-cert-live", meCert.live && meCert.status === 200 ? "1" : "0");

  const params = { event: ev.id };
  if (safeTab !== "overview") params.tab = safeTab;
  writeHash(params, { push });

  if (!still()) return false;
  await mountPartner(ev);
  if (safeTab === "feedback" && win.state === "open" && registered && fb.receipt?.registrationId && !fb.row) {
    await loadQuestionsInto(ev, fb.receipt);
  }
  return still();
}

export function showList({ push = true } = {}) {
  detailsGen += 1;
  const home = $("[data-events-home]");
  const mount = $("[data-event-details]");
  if (home) home.hidden = false;
  if (mount) { mount.hidden = true; mount.innerHTML = ""; }
  restoreHeader();
  document.documentElement.removeAttribute("data-portal-event");
  document.documentElement.removeAttribute("data-portal-event-tab");
  document.documentElement.removeAttribute("data-portal-event-phase");
  document.documentElement.removeAttribute("data-portal-cert-state");
  document.documentElement.removeAttribute("data-portal-feedback-window");
  document.documentElement.removeAttribute("data-portal-feedback-window-source");
  document.documentElement.removeAttribute("data-portal-cert-live");
  writeHash({}, { push });
}

function applyFromLocation({ push = false } = {}) {
  const v = readView();
  const id = String(v.event || "").trim();
  if (!id) {
    detailsGen += 1;
    const home = $("[data-events-home]");
    const mount = $("[data-event-details]");
    if (home) home.hidden = false;
    if (mount) { mount.hidden = true; mount.innerHTML = ""; }
    restoreHeader();
    document.documentElement.removeAttribute("data-portal-event");
    document.documentElement.removeAttribute("data-portal-event-tab");
    document.documentElement.removeAttribute("data-portal-event-phase");
    document.documentElement.removeAttribute("data-portal-cert-state");
    document.documentElement.removeAttribute("data-portal-feedback-window");
    document.documentElement.removeAttribute("data-portal-feedback-window-source");
    document.documentElement.removeAttribute("data-portal-cert-live");
    return;
  }
  showDetails(id, v.tab || "overview", { push });
}

function bind() {
  if (!$("[data-event-details]")) return;
  document.addEventListener("click", e => {
    if (e.target.closest(".acts, .pcta, [data-partner-cta]")) return;
    const back = e.target.closest("[data-event-back]");
    if (back) {
      e.preventDefault();
      showList({ push: true });
      return;
    }
    const toggle = e.target.closest("[data-ed-toggle]");
    if (toggle) {
      const sec = toggle.closest("[data-ed-sec]");
      if (!sec) return;
      e.preventDefault();
      const open = sec.getAttribute("data-ed-open") !== "0";
      sec.setAttribute("data-ed-open", open ? "0" : "1");
      toggle.setAttribute("aria-expanded", open ? "false" : "true");
      return;
    }
    const tab = e.target.closest("button.ed-tab[data-ed-tab]");
    if (tab) {
      const id = $("[data-ed-root]")?.dataset.eventId;
      if (!id) return;
      e.preventDefault();
      showDetails(id, tab.dataset.edTab, { push: true });
      return;
    }
    const emailBtn = e.target.closest("[data-cert-email]");
    if (emailBtn && !emailBtn.disabled) {
      const id = $("[data-ed-root]")?.dataset.eventId;
      if (!id) return;
      e.preventDefault();
      sendCertificateEmail(id);
      return;
    }
    const open = e.target.closest("[data-event-open]");
    if (open) {
      const id = open.getAttribute("data-event-open") || open.getAttribute("href")?.split("event=")[1];
      if (!id) return;
      const samePage = /portal-events/.test(location.pathname);
      if (samePage && $("[data-event-details]")) {
        e.preventDefault();
        const tab = open.getAttribute("data-event-tab") || "";
        showDetails(id.split("&")[0], tab || "overview", { push: true });
      }
    }
  });
  onViewChange(() => applyFromLocation({ push: false }));
  applyFromLocation({ push: false });
}

bind();
