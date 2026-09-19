/* PAAIPE API — Clarence's BE contract.
 *
 * Default:  https://api.paaipe.org  (HTTPS live)
 * Tunnel override (offline smoke only): http://127.0.0.1:8091
 *   ?paaipe_api=tunnel | localStorage/window PAAIPE_API_BASE
 *   ssh -L 8091:127.0.0.1:8091 root@103.3.62.77
 *
 * ONE override knob, first non-empty wins:
 *   1. ?paaipe_api=   — "tunnel"/"local" → 8091; "prod"/"api" → api.paaipe.org;
 *                       otherwise an absolute base
 *   2. window.PAAIPE_API_BASE
 *   3. localStorage["PAAIPE_API_BASE"]
 *   else PAAIPE_API_DEFAULT_BASE
 *
 * Do not use media.paaipe.org as the API base. There is no public Firestore URL here.
 *
 * Public library reads (no Bearer):
 *   GET /v1/sessions                  → { sessions: [...] }
 *   GET /v1/sessions/{id}
 *   GET /v1/micros                    → { micros: [...] }
 *   GET /v1/micros/{id}
 *   GET /v1/playlists?kind=micros|sessions → { playlists: [...] }
 *   GET /v1/playlists/{id}
 *   GET /v1/playlists/{id}/items      → { items: [...] } hydrated
 *   Bare GET /v1/playlists is 400 — always pass ?kind=
 *
 * Admin (Bearer + ADMIN_EMAILS allow-list; 401 without). Live-confirmed:
 *   GET/POST /v1/admin/playlists
 *   GET/PATCH /v1/admin/playlists/{id}
 *   POST  /v1/admin/sessions
 *   PATCH /v1/admin/sessions/{id}
 *   POST  /v1/admin/micros
 *   PATCH /v1/admin/micros/{id}
 * GET /v1/admin/sessions and GET /v1/admin/micros 404 — do not call them.
 * DELETE / PUT on those resources 404 — do not invent them.
 *
 * Events (Clarence 2026-09-19, live-confirmed):
 *   GET   /v1/events                                → { events }  (public, no Bearer)
 *   GET   /v1/events/{slug}                         public one event (slug, not id)
 *   GET   /v1/admin/events                          → { events: AdminEvent[] }
 *   POST  /v1/admin/events                          → EventCreate → AdminEvent (201)
 *   PATCH /v1/admin/events/{id}/content             content only
 *   PATCH /v1/admin/events/{id}                     settings only
 *   POST  /v1/admin/events/{id}/duplicate
 *   GET   /v1/admin/events/{id}/calendar.ics
 *   GET   /v1/admin/events/{eventId}/emails         exists (401 without Bearer)
 *   GET   /v1/admin/events/{id}/content             404 — PATCH only; do not call
 *   GET   /v1/admin/events/{eventId}/registrations  optional ?status=
 *   GET   /v1/admin/registrations/{id}
 *   PATCH /v1/admin/registrations/{id}              body { status } only
 *
 * Email send is still 501. Activity log and Zoom private stay off this module.
 *
 * Feedback (Clarence deploy feedback-20260919T043818Z, live-probed):
 *   GET  /v1/events/{eventId}/feedback/questions              → { questions }  public, no Bearer
 *   PUT  /v1/admin/events/{eventId}/feedback/questions        admin write (401 without Bearer)
 *   GET  /v1/admin/events/{eventId}/feedback/questions        404 — do not call; read is the public GET
 *   PUT  /v1/events/{eventId}/feedback/questions              404 — do not call
 *   POST /v1/events/{eventId}/feedback/responses              member create-once (401 without Bearer)
 *   GET  /v1/events/{eventId}/feedback/responses/{registrationId}  member own row (401 without Bearer)
 *   GET  /v1/events/{eventId}/feedback/responses              404 — no public list
 *   GET  /v1/admin/events/{eventId}/feedback/responses        admin list (401 without Bearer)
 *   GET  /v1/admin/events/{eventId}/feedback/responses/{registrationId}  admin one (401)
 *   DELETE and a reports table 404 — do not invent them. Reports stay FE-computed.
 *
 * Organizations / partners / contacts — Aryhan Slice 2 lock (exact verbs).
 * Public / me:
 *   GET  /v1/organizations
 *   GET  /v1/organizations/{id}
 *   GET/PATCH /v1/me/organizations…   (POST /v1/me/organizations exists for create)
 *   GET  /v1/events/{eventId}/partners
 *   POST /v1/partner-applications
 * Admin (Bearer + ADMIN_EMAILS; 401 without):
 *   GET/POST /v1/admin/organizations
 *   GET/PATCH /v1/admin/organizations/{id}  (approve = PATCH status)
 *   GET  /v1/admin/partner-applications
 *   GET/PATCH /v1/admin/partner-applications/{id}
 *     Accept is PATCH { status: "accepted" }. /accept and /activate are 404.
 *   GET/PUT /v1/admin/partners
 *     PUT collection is the write (401 without Bearer). PATCH/POST/DELETE 404.
 *     PUT /v1/admin/partners/{id} 404 — do not invent it.
 *   GET  /v1/admin/events/{eventId}/partners
 *     PUT on this path is 404 live — writes use PUT /v1/admin/partners.
 *   GET  /v1/admin/contacts
 *   GET  /v1/admin/contacts/{id}
 * Contacts are read-only. Do not invent contact writes.
 *
 * Feedback (Slice 3 — portal Event Details). Admin PUT questions is admin-side
 * and is not called from the portal.
 *   GET  /v1/events/{eventId}/feedback/questions                 public
 *   POST /v1/events/{eventId}/feedback/responses                 Bearer, create-once
 *   GET  /v1/events/{eventId}/feedback/responses/{registrationId} Bearer
 *   POST responses 403 when the BE says the window is closed / not open.
 *
 * Feedback window + Certificate (LIVE — certificates-20260919T051814Z):
 *   GET  /v1/events/{eventId}/feedback/window                    public (200)
 *        { opensAt, closesAt, state: locked|open|closed, timezone: Asia/Manila }
 *   GET  /v1/me/events/{eventId}/certificate                     Bearer (401 without)
 *        { state, registered, feedbackSubmitted, feedbackWindow, certificate? }
 *        state: not_registered | awaiting_feedback_open | feedback_open
 *               | issuing | issued | closed_no_cert
 *        Always includes feedbackWindow { opensAt, closesAt, state } | null.
 *        issued is terminal and carries certificate
 *        { id, issuedAt, pdfUrl, pngUrl, emailedAt }.
 *        issuing keeps Download disabled (rare; v1 usually sync → issued).
 *        Leftover `ready` (not in the frozen enum) → issued when certificate
 *        is present, else issuing.
 *   POST /v1/me/events/{eventId}/certificate/email               Bearer (401 without)
 *        200 { emailedAt } or a full certificate payload
 *        404 none · 409 not issued yet
 *        Inbox delivery is still not wired — do not treat 200 as mail in inbox
 *        if the host later returns 501/502. Show the API result honestly.
 *   GET  /v1/admin/events/{eventId}/certificates                 admin list
 *        Path helper only. No admin certificates surface in this PR.
 * Download uses certificate.pdfUrl / pngUrl on media.paaipe.org — no download API.
 * Issue is server-side on feedback submit — FE does not POST issue.
 *
 * Auth: Authorization: Bearer <Firebase ID token>
 * Admin allow-list is enforced on the BE (paul@moveup.app live) — 403 if missing.
 * Unauthenticated admin calls return 401 (Missing bearer token), not 404.
 *
 * CORS allows https://paaipe.org. Other origins still need to be added
 * (or use the tunnel override for local smoke).
 *
 * Failed reads and writes throw. Nothing is invented, and nothing is treated
 * as saved when the API did not accept it.
 */
export const PAAIPE_API_PROD_BASE = "https://api.paaipe.org";
export const PAAIPE_API_TUNNEL_BASE = "http://127.0.0.1:8091";
/** Live default. Override to PAAIPE_API_TUNNEL_BASE for offline 8091 smoke only. */
export const PAAIPE_API_DEFAULT_BASE = PAAIPE_API_PROD_BASE;
export const PAAIPE_API_OVERRIDE_KEY = "PAAIPE_API_BASE";
export const PAAIPE_API_QUERY_PARAM = "paaipe_api";

export const EVENT_SETTINGS_FIELDS = [
  "registrationOpensAt",
  "registrationClosesAt",
  "whoCanRegister",
  "waitlistEnabled",
  "questionsEnabled",
  "status",
];

export const EVENT_CONTENT_FIELDS = [
  "title",
  "slug",
  "series",
  "topic",
  "description",
  "whatToExpect",
  "date",
  "startTime",
  "endTime",
  "format",
  "speakers",
  "program",
  "gallery",
  "coverUrl",
  "bannerSquareUrl",
  "bannerWideUrl",
  "bannerSourceUrl",
  "confirmationEmailText",
  "capacity",
];

const REG_STATUSES = new Set(["registered", "attended", "no_show", "cancelled"]);

export function resolvePaaipeApiBase({
  query,
  windowValue,
  storageValue,
} = {}) {
  const q = String(query ?? "").trim();
  if (q) {
    if (q === "tunnel" || q === "local") return PAAIPE_API_TUNNEL_BASE;
    if (q === "prod" || q === "api") return PAAIPE_API_PROD_BASE;
    return q.replace(/\/+$/, "");
  }
  const w = String(windowValue ?? "").trim();
  if (w) return w.replace(/\/+$/, "");
  const s = String(storageValue ?? "").trim();
  if (s) return s.replace(/\/+$/, "");
  return PAAIPE_API_DEFAULT_BASE;
}

function currentQuery() {
  try {
    return new URL(globalThis.location.href).searchParams.get(PAAIPE_API_QUERY_PARAM) || "";
  } catch { return ""; }
}

function currentWindow() {
  try {
    return typeof globalThis.PAAIPE_API_BASE === "string" ? globalThis.PAAIPE_API_BASE : "";
  } catch { return ""; }
}

function currentStorage() {
  try { return globalThis.localStorage?.getItem(PAAIPE_API_OVERRIDE_KEY) || ""; }
  catch { return ""; }
}

/** Resolved once at module load. Override before importing, or reload after flipping the knob. */
export const PAAIPE_API_BASE = resolvePaaipeApiBase({
  query: currentQuery(),
  windowValue: currentWindow(),
  storageValue: currentStorage(),
});

export function eventsPath() {
  return "/v1/events";
}

export function adminEventsPath() {
  return "/v1/admin/events";
}

export function adminEventPath(id) {
  return `/v1/admin/events/${encodeURIComponent(id)}`;
}

export function adminEventContentPath(id) {
  return `/v1/admin/events/${encodeURIComponent(id)}/content`;
}

export function adminEventDuplicatePath(id) {
  return `/v1/admin/events/${encodeURIComponent(id)}/duplicate`;
}

export function adminEventCalendarPath(id) {
  return `/v1/admin/events/${encodeURIComponent(id)}/calendar.ics`;
}

export function adminEventEmailsPath(eventId) {
  return `/v1/admin/events/${encodeURIComponent(eventId)}/emails`;
}

export function eventPath(slug) {
  return `/v1/events/${encodeURIComponent(slug)}`;
}

export function adminEventRegistrationsPath(eventId, { status } = {}) {
  const path = `/v1/admin/events/${encodeURIComponent(eventId)}/registrations`;
  return status ? `${path}?status=${encodeURIComponent(status)}` : path;
}

export function adminRegistrationPath(id) {
  return `/v1/admin/registrations/${encodeURIComponent(id)}`;
}

export function eventFeedbackQuestionsPath(eventId) {
  return `/v1/events/${encodeURIComponent(eventId)}/feedback/questions`;
}

export function eventFeedbackResponsesPath(eventId) {
  return `/v1/events/${encodeURIComponent(eventId)}/feedback/responses`;
}

export function eventFeedbackResponsePath(eventId, registrationId) {
  return `/v1/events/${encodeURIComponent(eventId)}/feedback/responses/${encodeURIComponent(registrationId)}`;
}

export function adminEventFeedbackQuestionsPath(eventId) {
  return `/v1/admin/events/${encodeURIComponent(eventId)}/feedback/questions`;
}

export function adminEventFeedbackResponsesPath(eventId) {
  return `/v1/admin/events/${encodeURIComponent(eventId)}/feedback/responses`;
}

export function adminEventFeedbackResponsePath(eventId, registrationId) {
  return `/v1/admin/events/${encodeURIComponent(eventId)}/feedback/responses/${encodeURIComponent(registrationId)}`;
}

export function sessionsPath() {
  return "/v1/sessions";
}

export function sessionPath(id) {
  return `/v1/sessions/${encodeURIComponent(id)}`;
}

export function microsPath() {
  return "/v1/micros";
}

export function microPath(id) {
  return `/v1/micros/${encodeURIComponent(id)}`;
}

export function playlistsPath(kind) {
  if (kind !== "sessions" && kind !== "micros") {
    throw Object.assign(
      new Error("kind query must be sessions or micros."),
      { code: "api/bad-kind" }
    );
  }
  return `/v1/playlists?kind=${encodeURIComponent(kind)}`;
}

export function playlistPath(id) {
  return `/v1/playlists/${encodeURIComponent(id)}`;
}

export function playlistItemsPath(id) {
  return `/v1/playlists/${encodeURIComponent(id)}/items`;
}

export function adminPlaylistsPath() {
  return "/v1/admin/playlists";
}

export function adminPlaylistPath(id) {
  return `/v1/admin/playlists/${encodeURIComponent(id)}`;
}

export function adminSessionsPath() {
  return "/v1/admin/sessions";
}

export function adminSessionPath(id) {
  return `/v1/admin/sessions/${encodeURIComponent(id)}`;
}

export function adminMicrosPath() {
  return "/v1/admin/micros";
}

export function adminMicroPath(id) {
  return `/v1/admin/micros/${encodeURIComponent(id)}`;
}

export function organizationsPath() {
  return "/v1/organizations";
}

export function organizationPath(id) {
  return `/v1/organizations/${encodeURIComponent(id)}`;
}

export function eventPartnersPath(eventId) {
  return `/v1/events/${encodeURIComponent(eventId)}/partners`;
}

export function partnerApplicationsPath() {
  return "/v1/partner-applications";
}

export function meOrganizationsPath() {
  return "/v1/me/organizations";
}

export function meOrganizationPath(id) {
  return `/v1/me/organizations/${encodeURIComponent(id)}`;
}

export function adminOrganizationsPath() {
  return "/v1/admin/organizations";
}

export function adminOrganizationPath(id) {
  return `/v1/admin/organizations/${encodeURIComponent(id)}`;
}

export function adminPartnersPath() {
  return "/v1/admin/partners";
}

export function adminEventPartnersPath(eventId) {
  return `/v1/admin/events/${encodeURIComponent(eventId)}/partners`;
}

export function adminPartnerApplicationsPath() {
  return "/v1/admin/partner-applications";
}

export function adminPartnerApplicationPath(id) {
  return `/v1/admin/partner-applications/${encodeURIComponent(id)}`;
}

export function adminContactsPath() {
  return "/v1/admin/contacts";
}

export function adminContactPath(id) {
  return `/v1/admin/contacts/${encodeURIComponent(id)}`;
}

export function eventFeedbackWindowPath(eventId) {
  return `/v1/events/${encodeURIComponent(eventId)}/feedback/window`;
}

export function meEventCertificatePath(eventId) {
  return `/v1/me/events/${encodeURIComponent(eventId)}/certificate`;
}

export function meEventCertificateEmailPath(eventId) {
  return `/v1/me/events/${encodeURIComponent(eventId)}/certificate/email`;
}

/** Admin list. No portal/admin UI in this PR — path only. */
export function adminEventCertificatesPath(eventId) {
  return `/v1/admin/events/${encodeURIComponent(eventId)}/certificates`;
}

/** Draft OpenAPI routes are live only when the host answers 200 or 401. */
export function isDraftRouteLive(status) {
  return status === 200 || status === 401;
}

const WINDOW_STATES = new Set(["locked", "open", "closed"]);
const CERT_API_STATES = new Set([
  "not_registered", "awaiting_feedback_open", "feedback_open",
  "issued", "issuing", "closed_no_cert",
]);

export function normalizeFeedbackWindow(data) {
  if (!data || typeof data !== "object") return null;
  const state = String(data.state || "").trim();
  if (!WINDOW_STATES.has(state)) return null;
  return {
    state,
    opensAt: data.opensAt || null,
    closesAt: data.closesAt || null,
    timezone: data.timezone || "Asia/Manila",
  };
}

/**
 * Frozen enum (no `ready`). issued is terminal and requires certificate
 * { id, issuedAt, pdfUrl, pngUrl, emailedAt }. issuing keeps Download disabled
 * even if a partial certificate object is present. A leftover `ready` maps to
 * issued when that object is present, otherwise issuing.
 */
export function normalizeMeCertificate(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const raw = data.certificate && typeof data.certificate === "object" && !Array.isArray(data.certificate)
    ? data.certificate
    : null;
  let state = String(data.state || "").trim();
  if (state === "ready" || !state) state = raw ? "issued" : "issuing";
  if (state === "issued" && !raw) state = "issuing";
  if (!CERT_API_STATES.has(state)) return null;
  return {
    state,
    registered: data.registered === true,
    feedbackSubmitted: data.feedbackSubmitted === true,
    feedbackWindow: data.feedbackWindow && typeof data.feedbackWindow === "object"
      ? normalizeFeedbackWindow(data.feedbackWindow)
      : null,
    certificate: raw ? {
      id: String(raw.id || ""),
      issuedAt: raw.issuedAt || null,
      pdfUrl: raw.pdfUrl || "",
      pngUrl: raw.pngUrl || "",
      emailedAt: raw.emailedAt || null,
    } : null,
  };
}

/** Only https://media.paaipe.org/… — never a guessed download route. */
export function mediaFileUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return "";
    const host = u.hostname.replace(/^www\./, "");
    if (host !== "media.paaipe.org") return "";
    return s;
  } catch { return ""; }
}

export function certificateDownloadUrl(cert) {
  if (!cert) return "";
  return mediaFileUrl(cert.pdfUrl) || mediaFileUrl(cert.pngUrl);
}

/**
 * Probe a draft OpenAPI route. 200 and 401 mean the route is deployed.
 * 404 is not-wired. Other statuses are not treated as a product state.
 * Never invents a body.
 */
export async function probeDraftGet(path, {
  token,
  fetchImpl,
  base = PAAIPE_API_BASE,
  auth = "public",
} = {}) {
  const root = String(base || "").trim().replace(/\/+$/, "");
  if (!root) {
    throw Object.assign(
      new Error("PAAIPE_API_BASE is not set. Nothing was requested."),
      { code: "api/no-base" }
    );
  }
  const fetchFn = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!fetchFn) {
    throw Object.assign(
      new Error("The API is unavailable in this browser. Nothing was requested."),
      { code: "api/no-fetch" }
    );
  }
  const isPublic = auth === "public";
  if (!isPublic && !token) {
    throw Object.assign(new Error("You need to be signed in."), { code: "not-signed-in" });
  }
  const url = `${root}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {};
  if (!isPublic) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetchFn(url, { method: "GET", headers });
  } catch (e) {
    throw Object.assign(
      new Error(
        `Could not reach the API at ${root}. If this browser is not on paaipe.org, CORS may still be blocking.`
      ),
      { code: "api/network", cause: e, url }
    );
  }
  const live = isDraftRouteLive(res.status);
  let data = null;
  if (res.status === 200) {
    let text = "";
    try { text = await res.text(); } catch {
      throw Object.assign(
        new Error("The API returned a response that could not be read. Nothing was assumed."),
        { code: "api/invalid-response", status: 200 }
      );
    }
    if (text) {
      try { data = JSON.parse(text); }
      catch {
        throw Object.assign(
          new Error("The API returned a response that could not be read. Nothing was assumed."),
          { code: "api/invalid-response", status: 200 }
        );
      }
    }
  }
  return { live, status: res.status, data };
}

/** Public GET. live only on 200/401. 404 → live:false, no invented window. */
export async function getEventFeedbackWindow(eventId, opts) {
  const probe = await probeDraftGet(eventFeedbackWindowPath(eventId), {
    ...opts,
    auth: "public",
    token: undefined,
  });
  return {
    live: probe.live,
    status: probe.status,
    window: probe.status === 200 ? normalizeFeedbackWindow(probe.data) : null,
  };
}

/** Bearer GET. live only on 200/401. 404 → live:false, no invented certificate. */
export async function getMeEventCertificate(eventId, opts) {
  const probe = await probeDraftGet(meEventCertificatePath(eventId), {
    ...opts,
    auth: "member",
  });
  return {
    live: probe.live,
    status: probe.status,
    certificate: probe.status === 200 ? normalizeMeCertificate(probe.data) : null,
  };
}

/**
 * Bearer POST re-send. 200 returns { emailedAt } or a normalized certificate.
 * Throws on 404 (none) / 409 (not issued) / other refusals. Nothing is assumed sent.
 */
export async function postMeEventCertificateEmail(eventId, opts = {}) {
  const data = await paaipeApiRequest(meEventCertificateEmailPath(eventId), {
    method: "POST",
    ...opts,
  });
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const full = normalizeMeCertificate(data);
    if (full) {
      return {
        emailedAt: full.certificate?.emailedAt || data.emailedAt || null,
        certificate: full,
      };
    }
    if (data.emailedAt) {
      return { emailedAt: data.emailedAt, certificate: null };
    }
  }
  throw Object.assign(
    new Error("The API did not return an email confirmation. Nothing was assumed sent."),
    { code: "api/invalid-response" }
  );
}

export function eventSettingsPayload(src = {}) {
  const out = {};
  if ("registrationOpensAt" in src) out.registrationOpensAt = src.registrationOpensAt || null;
  if ("registrationClosesAt" in src) out.registrationClosesAt = src.registrationClosesAt || null;
  if ("whoCanRegister" in src) out.whoCanRegister = src.whoCanRegister;
  if ("waitlistEnabled" in src) out.waitlistEnabled = src.waitlistEnabled === true;
  if ("questionsEnabled" in src) {
    out.questionsEnabled = Array.isArray(src.questionsEnabled) ? src.questionsEnabled : [];
  }
  if ("status" in src && src.status) out.status = src.status;
  return out;
}

function copyIfPresent(out, src, key) {
  if (key in src) out[key] = src[key];
}

export function eventContentPayload(src = {}) {
  const out = {};
  for (const key of [
    "title", "slug", "series", "topic", "description",
    "date", "startTime", "endTime", "format",
    "coverUrl", "bannerSquareUrl", "bannerWideUrl", "bannerSourceUrl",
    "confirmationEmailText",
  ]) copyIfPresent(out, src, key);
  if ("capacity" in src) {
    const n = src.capacity;
    if (n === "" || n == null) out.capacity = null;
    else {
      const num = Number(n);
      out.capacity = Number.isFinite(num) ? num : null;
    }
  }
  if ("whatToExpect" in src) {
    out.whatToExpect = Array.isArray(src.whatToExpect) ? src.whatToExpect : [];
  }
  if ("speakers" in src) out.speakers = Array.isArray(src.speakers) ? src.speakers : [];
  if ("program" in src) out.program = Array.isArray(src.program) ? src.program : [];
  if ("gallery" in src) out.gallery = Array.isArray(src.gallery) ? src.gallery : [];
  return out;
}

export function eventCreatePayload(src = {}) {
  const out = { ...eventContentPayload(src), ...eventSettingsPayload(src) };
  if (src.id) out.id = String(src.id);
  return out;
}

function statusError(status, bodyText, { method, path } = {}) {
  const write = /^(PATCH|POST|PUT|DELETE)$/i.test(method || "");
  const tail = write ? " Nothing was changed." : "";
  const trimmed = String(bodyText || "").trim();
  let detail;
  if (status === 401) detail = "Sign-in expired or missing.";
  else if (status === 403) {
    detail = /\/feedback\/responses/.test(path || "")
      ? "The feedback window is not open. The API did not accept this response."
      : /\/admin\//.test(path || "")
      ? "You do not have permission. The admin allow-list is enforced on the API."
      : "You do not have permission.";
  } else if (status === 404) {
    detail = /\/certificate\/email/.test(path || "")
      ? "No certificate is available to email (404)."
      : /\/registrations/.test(path || "")
      ? "The registrations API route was not found (404). It may not be deployed on this host yet."
      : "The API route was not found (404).";
  } else if (status === 409) {
    detail = /\/certificate\/email/.test(path || "")
      ? "This certificate is not issued yet. Nothing was emailed."
      : /feedback\/responses/.test(path || "")
      ? "A response already exists for this registration."
      : "This record already exists.";
  } else if (status === 501 || status === 502) {
    detail = /\/certificate\/email/.test(path || "")
      ? "Certificate email delivery is not wired yet. Nothing was sent."
      : `The API is not ready (${status}).`;
  } else if (trimmed && trimmed.length < 280 && !/^[\s{[]/.test(trimmed)) {
    detail = trimmed.replace(/\.?$/, ".");
  } else {
    detail = `The API request failed (${status}).`;
  }
  const err = new Error(`${detail}${tail}`);
  err.code = status === 401 ? "api/unauthorized"
    : status === 403 ? "api/forbidden"
    : status === 404 ? "api/not-found"
    : status === 409 ? (/\/certificate\/email/.test(path || "") ? "api/conflict" : "already-exists")
    : "api/request-failed";
  err.status = status;
  return err;
}

/**
 * Fetch one API path. Throws on network, CORS, non-OK, or unreadable JSON.
 * Never invents a body. Public GETs omit Authorization. Admin calls require
 * a Bearer token.
 */
export async function paaipeApiRequest(path, {
  method = "GET",
  body,
  token,
  fetchImpl,
  base = PAAIPE_API_BASE,
  auth = "admin",
  asText = false,
} = {}) {
  const root = String(base || "").trim().replace(/\/+$/, "");
  if (!root) {
    throw Object.assign(
      new Error("PAAIPE_API_BASE is not set. Nothing was requested."),
      { code: "api/no-base" }
    );
  }
  const isPublic = auth === "public";
  if (!isPublic && !token) {
    throw Object.assign(new Error("You need to be signed in."), { code: "not-signed-in" });
  }
  const fetchFn = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!fetchFn) {
    throw Object.assign(
      new Error("The API is unavailable in this browser. Nothing was requested."),
      { code: "api/no-fetch" }
    );
  }
  const url = `${root}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {};
  if (!isPublic) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetchFn(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw Object.assign(
      new Error(
        `Could not reach the API at ${root}. If this browser is not on paaipe.org, CORS may still be blocking.`
      ),
      { code: "api/network", cause: e, url }
    );
  }
  if (!res.ok) {
    let text = "";
    try { text = await res.text(); } catch { /* ignore */ }
    throw statusError(res.status, text, { method, path });
  }
  if (res.status === 204) return null;
  let text = "";
  try { text = await res.text(); } catch {
    throw Object.assign(
      new Error("The API returned a response that could not be read. Nothing was assumed."),
      { code: "api/invalid-response", status: res.status }
    );
  }
  if (asText) return text || "";
  if (!text) return null;
  try { return JSON.parse(text); }
  catch {
    throw Object.assign(
      new Error("The API returned a response that could not be read. Nothing was assumed."),
      { code: "api/invalid-response", status: res.status }
    );
  }
}

function asList(data, namedKey) {
  if (Array.isArray(data)) return data;
  if (namedKey && Array.isArray(data?.[namedKey])) return data[namedKey];
  if (Array.isArray(data?.sessions)) return data.sessions;
  if (Array.isArray(data?.micros)) return data.micros;
  if (Array.isArray(data?.playlists)) return data.playlists;
  if (Array.isArray(data?.events)) return data.events;
  if (Array.isArray(data?.registrations)) return data.registrations;
  if (Array.isArray(data?.questions)) return data.questions;
  if (Array.isArray(data?.responses)) return data.responses;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.organizations)) return data.organizations;
  if (Array.isArray(data?.partners)) return data.partners;
  if (Array.isArray(data?.applications)) return data.applications;
  if (Array.isArray(data?.partnerApplications)) return data.partnerApplications;
  if (Array.isArray(data?.contacts)) return data.contacts;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function sortByDisplayOrder(rows) {
  return [...rows].sort((a, b) => {
    const ao = Number(a?.displayOrder);
    const bo = Number(b?.displayOrder);
    const an = Number.isFinite(ao) ? ao : 0;
    const bn = Number.isFinite(bo) ? bo : 0;
    if (an !== bn) return an - bn;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}

function withIds(rows) {
  return (Array.isArray(rows) ? rows : []).filter(r => r && typeof r === "object" && r.id);
}

/** Public GET. No Bearer. Throws on network / non-OK / unreadable JSON. */
export async function paaipePublicGet(path, opts = {}) {
  return paaipeApiRequest(path, { ...opts, method: "GET", auth: "public", token: undefined });
}

function asResource(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (data.id) return data;
  for (const key of ["session", "micro", "playlist", "item", "event", "organization", "partner", "application", "contact"]) {
    const inner = data[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner) && inner.id) return inner;
  }
  return null;
}

export async function listApiSessions(opts) {
  const data = await paaipePublicGet(sessionsPath(), opts);
  return sortByDisplayOrder(withIds(asList(data, "sessions")));
}

export async function getApiSession(id, opts) {
  const data = await paaipePublicGet(sessionPath(id), opts);
  return asResource(data);
}

export async function listApiMicros(opts) {
  const data = await paaipePublicGet(microsPath(), opts);
  return sortByDisplayOrder(withIds(asList(data, "micros")));
}

export async function getApiMicro(id, opts) {
  const data = await paaipePublicGet(microPath(id), opts);
  return asResource(data);
}

export async function listApiPlaylists(kind, opts) {
  if (kind == null || kind === "") {
    const settled = await Promise.allSettled([
      listApiPlaylists("sessions", opts),
      listApiPlaylists("micros", opts),
    ]);
    const rows = [];
    const errors = [];
    for (const result of settled) {
      if (result.status === "fulfilled") rows.push(...result.value);
      else errors.push(result.reason);
    }
    if (errors.length === 2 && !rows.length) throw errors[0];
    return sortByDisplayOrder(rows);
  }
  const data = await paaipePublicGet(playlistsPath(kind), opts);
  return sortByDisplayOrder(withIds(asList(data, "playlists")));
}

export async function getApiPlaylist(id, opts) {
  const data = await paaipePublicGet(playlistPath(id), opts);
  return asResource(data);
}

export async function listApiPlaylistItems(id, opts) {
  const data = await paaipePublicGet(playlistItemsPath(id), opts);
  return withIds(asList(data, "items"));
}

export function learningWritePayload(src = {}, { kind } = {}) {
  const out = {};
  if (src.id) out.id = String(src.id);
  if ("title" in src) out.title = src.title;
  if ("description" in src) out.description = src.description || null;
  if ("source" in src) out.source = src.source;
  if ("youtubeUrl" in src) out.youtubeUrl = src.youtubeUrl || null;
  if ("youtubeId" in src) out.youtubeId = src.youtubeId || null;
  if ("storagePath" in src) out.storagePath = src.storagePath || null;
  if ("posterUrl" in src) out.posterUrl = src.posterUrl || null;
  if ("posterStoragePath" in src) out.posterStoragePath = src.posterStoragePath || null;
  if ("published" in src) out.published = src.published === true;
  if ("displayOrder" in src && Number.isFinite(Number(src.displayOrder))) {
    out.displayOrder = Number(src.displayOrder);
  }
  if ("publishedAt" in src && src.publishedAt !== "SERVER") {
    out.publishedAt = src.publishedAt || null;
  }
  if ("updatedBy" in src) out.updatedBy = src.updatedBy || null;
  out.aspect = kind === "micros" ? "9:16" : (src.aspect || "16:9");
  return out;
}

export function playlistWritePayload(src = {}) {
  const out = {};
  if (src.id) out.id = String(src.id);
  if ("title" in src) out.title = src.title;
  if ("description" in src) out.description = src.description || null;
  if ("kind" in src) out.kind = src.kind === "micros" ? "micros" : "sessions";
  if ("itemIds" in src) out.itemIds = Array.isArray(src.itemIds) ? src.itemIds : [];
  if ("status" in src) out.status = src.status;
  if ("displayOrder" in src && Number.isFinite(Number(src.displayOrder))) {
    out.displayOrder = Number(src.displayOrder);
  }
  if ("publishedAt" in src && src.publishedAt !== "SERVER") {
    out.publishedAt = src.publishedAt || null;
  }
  if ("updatedBy" in src) out.updatedBy = src.updatedBy || null;
  return out;
}

function createdId(data, fallback) {
  const row = asResource(data);
  if (row?.id) return String(row.id);
  if (fallback) return String(fallback);
  throw Object.assign(
    new Error("The API did not return an id. Nothing was assumed."),
    { code: "api/invalid-response" }
  );
}

export async function listAdminPlaylists(opts) {
  const data = await paaipeApiRequest(adminPlaylistsPath(), opts);
  return sortByDisplayOrder(withIds(asList(data, "playlists")));
}

export async function getAdminPlaylist(id, opts) {
  const data = await paaipeApiRequest(adminPlaylistPath(id), opts);
  return asResource(data);
}

export async function postAdminPlaylist(fields, opts) {
  const data = await paaipeApiRequest(adminPlaylistsPath(), {
    method: "POST",
    body: playlistWritePayload(fields),
    ...opts,
  });
  return createdId(data, fields.id);
}

export async function patchAdminPlaylist(id, fields, opts) {
  return paaipeApiRequest(adminPlaylistPath(id), {
    method: "PATCH",
    body: playlistWritePayload(fields),
    ...opts,
  });
}

export async function postAdminSession(fields, opts) {
  const data = await paaipeApiRequest(adminSessionsPath(), {
    method: "POST",
    body: learningWritePayload(fields, { kind: "sessions" }),
    ...opts,
  });
  return createdId(data, fields.id);
}

export async function patchAdminSession(id, fields, opts) {
  return paaipeApiRequest(adminSessionPath(id), {
    method: "PATCH",
    body: learningWritePayload(fields, { kind: "sessions" }),
    ...opts,
  });
}

export async function postAdminMicro(fields, opts) {
  const data = await paaipeApiRequest(adminMicrosPath(), {
    method: "POST",
    body: learningWritePayload(fields, { kind: "micros" }),
    ...opts,
  });
  return createdId(data, fields.id);
}

export async function patchAdminMicro(id, fields, opts) {
  return paaipeApiRequest(adminMicroPath(id), {
    method: "PATCH",
    body: learningWritePayload(fields, { kind: "micros" }),
    ...opts,
  });
}

export function normalizeRegistration(row, eventHint) {
  if (!row || typeof row !== "object") return null;
  const id = row.id || row.registrationId;
  if (!id) return null;
  const eventId = row.eventId || row.event_id || eventHint?.id || "";
  const event = row.event || row.eventTitle || eventHint?.title || eventId;
  return {
    ...row,
    id: String(id),
    eventId: eventId ? String(eventId) : "",
    event: event || "",
    full_name: row.full_name || row.fullName || row.name || "",
    email: row.email || "",
    organization: row.organization || row.organisation || "",
    position: row.position || "",
    profile: row.profile || "",
    profile_other: row.profile_other || row.profileOther || "",
    learn: row.learn || "",
    speaker_question: row.speaker_question || row.speakerQuestion || "",
    source: row.source || "",
    updates: row.updates === true,
    privacyVersion: row.privacyVersion || row.privacy_version || "",
    status: row.status || "registered",
    createdAt: row.createdAt || row.created_at || row.registeredAt || null,
  };
}

function asRegistration(data, eventHint) {
  if (!data || typeof data !== "object") return null;
  if (data.registration && typeof data.registration === "object") {
    return normalizeRegistration(data.registration, eventHint);
  }
  return normalizeRegistration(data, eventHint);
}

function sortEventsByDate(rows) {
  return [...rows].sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")));
}

export function normalizeAdminEvent(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const id = row.id || row.eventId;
  if (!id) return null;
  return { ...row, id: String(id) };
}

function asAdminEvent(data) {
  if (!data || typeof data !== "object") return null;
  if (data.event && typeof data.event === "object" && !Array.isArray(data.event)) {
    return normalizeAdminEvent(data.event);
  }
  return normalizeAdminEvent(data);
}

function requireAdminEvent(data) {
  const row = asAdminEvent(data);
  if (!row) {
    throw Object.assign(
      new Error("The API did not return an event. Nothing was assumed."),
      { code: "api/invalid-response" }
    );
  }
  return row;
}

/** Public GET /v1/events. No Bearer. Not wired to portal reads in this slice. */
export async function listApiEvents(opts) {
  const data = await paaipePublicGet(eventsPath(), opts);
  return sortEventsByDate(withIds(asList(data, "events")).map(normalizeAdminEvent).filter(Boolean));
}

export async function getApiEventBySlug(slug, opts) {
  const data = await paaipePublicGet(eventPath(slug), opts);
  return asAdminEvent(data);
}

export async function getAdminEventCalendarIcs(id, opts) {
  return paaipeApiRequest(adminEventCalendarPath(id), { ...opts, asText: true });
}

export async function listAdminEvents(opts) {
  const data = await paaipeApiRequest(adminEventsPath(), opts);
  return sortEventsByDate(withIds(asList(data, "events")).map(normalizeAdminEvent).filter(Boolean));
}

export async function postAdminEvent(fields, opts) {
  const data = await paaipeApiRequest(adminEventsPath(), {
    method: "POST",
    body: eventCreatePayload(fields),
    ...opts,
  });
  return requireAdminEvent(data);
}

export async function patchAdminEvent(id, fields, opts) {
  return paaipeApiRequest(adminEventPath(id), {
    method: "PATCH",
    body: eventSettingsPayload(fields),
    ...opts,
  });
}

export async function patchAdminEventContent(id, fields, opts) {
  return paaipeApiRequest(adminEventContentPath(id), {
    method: "PATCH",
    body: eventContentPayload(fields),
    ...opts,
  });
}

export async function postAdminEventDuplicate(id, opts) {
  const data = await paaipeApiRequest(adminEventDuplicatePath(id), {
    method: "POST",
    ...opts,
  });
  return requireAdminEvent(data);
}

export async function listAdminEventRegistrations(eventId, { status, ...opts } = {}) {
  const data = await paaipeApiRequest(
    adminEventRegistrationsPath(eventId, { status }),
    opts
  );
  const hint = { id: eventId };
  return asList(data).map(r => normalizeRegistration(r, hint)).filter(Boolean);
}

export async function getAdminRegistration(id, opts) {
  const data = await paaipeApiRequest(adminRegistrationPath(id), opts);
  const row = asRegistration(data);
  if (!row) {
    throw Object.assign(
      new Error("The API did not return a registration. Nothing was assumed."),
      { code: "api/invalid-response" }
    );
  }
  return row;
}

export function eventFeedbackResponsePayload(src = {}) {
  const out = {};
  if (src.registrationId) out.registrationId = String(src.registrationId);
  if ("answers" in src) {
    out.answers = src.answers && typeof src.answers === "object" && !Array.isArray(src.answers)
      ? src.answers
      : {};
  }
  return out;
}

/** Public GET. Throws on network / non-OK / unreadable JSON. */
export async function listEventFeedbackQuestions(eventId, opts) {
  const data = await paaipePublicGet(eventFeedbackQuestionsPath(eventId), opts);
  return withIds(asList(data, "questions").map((row, i) => {
    if (!row || typeof row !== "object") return null;
    const questionKey = String(row.questionKey || row.key || "").trim();
    const id = String(row.id || questionKey || "").trim();
    if (!id && !questionKey) return null;
    return {
      ...row,
      id: id || questionKey,
      questionKey: questionKey || id,
      order: Number.isFinite(Number(row.order)) ? Number(row.order) : i,
    };
  }).filter(Boolean));
}

/**
 * Member GET. 404 means no response yet — that is a fact, not a failure.
 * Other errors throw. Never invents a submitted row.
 */
export async function getEventFeedbackResponse(eventId, registrationId, opts) {
  try {
    const data = await paaipeApiRequest(eventFeedbackResponsePath(eventId, registrationId), opts);
    if (!data) return null;
    if (data.response && typeof data.response === "object") return data.response;
    if (data.id || data.registrationId || data.answers) return data;
    return asResource(data);
  } catch (e) {
    if (e?.status === 404 || e?.code === "api/not-found") return null;
    throw e;
  }
}

export async function patchAdminRegistration(id, status, opts) {
  if (!REG_STATUSES.has(status)) {
    throw Object.assign(
      new Error(`refusing to write an unknown registration status: ${status}`),
      { code: "api/bad-status" }
    );
  }
  return paaipeApiRequest(adminRegistrationPath(id), {
    method: "PATCH",
    body: { status },
    ...opts,
  });
}

export const FEEDBACK_QUESTION_TYPES = new Set(["1-5", "yes-no", "short"]);

export function normalizeFeedbackQuestion(q, eventHint, i = 0) {
  if (!q || typeof q !== "object" || Array.isArray(q)) return null;
  const type = FEEDBACK_QUESTION_TYPES.has(q.type) ? q.type : null;
  const questionKey = String(q.questionKey || "").trim();
  const prompt = String(q.prompt || "").trim();
  if (!type || !questionKey || !prompt) return null;
  const eventId = String(q.eventId || eventHint || "").trim();
  return {
    id: q.id || (eventId ? `${eventId}_${questionKey}` : questionKey),
    eventId,
    questionKey,
    prompt,
    type,
    required: q.required !== false,
    active: q.active !== false,
    order: Number.isFinite(Number(q.order)) ? Number(q.order) : i,
  };
}

export function normalizeFeedbackResponse(row, eventHint, registrationHint) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const registrationId = String(row.registrationId || registrationHint || "").trim();
  const answers = row.answers && typeof row.answers === "object" && !Array.isArray(row.answers)
    ? row.answers
    : null;
  if (!registrationId && !answers) return null;
  const eventId = String(row.eventId || eventHint || "").trim();
  const rid = registrationId || "";
  return {
    ...row,
    id: row.id || (eventId && rid ? `${eventId}_${rid}` : rid),
    eventId,
    registrationId: rid,
    answers: answers || {},
    submittedAt: row.submittedAt || row.submitted_at || null,
  };
}

function unwrapFeedbackResponse(data, eventId, registrationId) {
  if (data == null || typeof data !== "object" || Array.isArray(data)) return null;
  const inner = data.response && typeof data.response === "object" && !Array.isArray(data.response)
    ? data.response
    : data;
  if (inner === data && (Array.isArray(data.responses) || Array.isArray(data.questions))) {
    return null;
  }
  return normalizeFeedbackResponse(inner, eventId, registrationId);
}

export function feedbackQuestionWritePayload(q = {}, eventId, i = 0) {
  const questionKey = String(q.questionKey || "").trim();
  const prompt = String(q.prompt || "").trim();
  const type = FEEDBACK_QUESTION_TYPES.has(q.type) ? q.type : null;
  if (!questionKey || !prompt || !type) return null;
  return {
    eventId: String(q.eventId || eventId || "").trim(),
    questionKey,
    prompt,
    type,
    required: q.required !== false,
    active: q.active !== false,
    order: Number.isFinite(Number(q.order)) ? Number(q.order) : i,
  };
}

export function feedbackQuestionsWritePayload(rows, eventId) {
  return {
    questions: (Array.isArray(rows) ? rows : [])
      .map((q, i) => feedbackQuestionWritePayload(q, eventId, i))
      .filter(Boolean),
  };
}

export function feedbackResponseWritePayload(src = {}) {
  const registrationId = String(src.registrationId || "").trim();
  if (!registrationId) {
    throw Object.assign(new Error("A registration id is required."), { code: "missing-id" });
  }
  const answers = src.answers && typeof src.answers === "object" && !Array.isArray(src.answers)
    ? src.answers
    : {};
  return { registrationId, answers };
}

/** Public GET. No Bearer. Empty `{ questions: [] }` is honest empty, not a failure. */
export async function listApiFeedbackQuestions(eventId, opts) {
  const data = await paaipePublicGet(eventFeedbackQuestionsPath(eventId), opts);
  return asList(data, "questions")
    .map((q, i) => normalizeFeedbackQuestion(q, eventId, i))
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
}

export async function putAdminFeedbackQuestions(eventId, questions, opts) {
  return paaipeApiRequest(adminEventFeedbackQuestionsPath(eventId), {
    method: "PUT",
    body: feedbackQuestionsWritePayload(questions, eventId),
    ...opts,
  });
}

export async function postEventFeedbackResponse(eventId, fields, opts) {
  return paaipeApiRequest(eventFeedbackResponsesPath(eventId), {
    method: "POST",
    body: feedbackResponseWritePayload(fields),
    ...opts,
  });
}

/** Member GET of one response. A 404 is "no row yet", not a missing route. */
export async function getApiFeedbackResponse(eventId, registrationId, opts) {
  try {
    const data = await paaipeApiRequest(eventFeedbackResponsePath(eventId, registrationId), opts);
    return unwrapFeedbackResponse(data, eventId, registrationId);
  } catch (e) {
    if (e?.status === 404) return null;
    throw e;
  }
}

export async function listAdminFeedbackResponses(eventId, opts) {
  const data = await paaipeApiRequest(adminEventFeedbackResponsesPath(eventId), opts);
  return asList(data, "responses")
    .map(r => normalizeFeedbackResponse(r, eventId))
    .filter(r => r && r.registrationId)
    .sort((a, b) => String(a.submittedAt || "").localeCompare(String(b.submittedAt || "")));
}

export async function getAdminFeedbackResponse(eventId, registrationId, opts) {
  try {
    const data = await paaipeApiRequest(
      adminEventFeedbackResponsePath(eventId, registrationId),
      opts
    );
    return unwrapFeedbackResponse(data, eventId, registrationId);
  } catch (e) {
    if (e?.status === 404) return null;
    throw e;
  }
}

function asWhen(v) {
  if (v == null || v === "") return null;
  if (typeof v?.toDate === "function") {
    const d = v.toDate();
    return d instanceof Date && !isNaN(d) ? d : null;
  }
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (Number.isFinite(v?.seconds)) return new Date(v.seconds * 1000);
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  return null;
}

function sortByName(rows) {
  return [...rows].sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
}

function sortByCreatedDesc(rows) {
  return [...rows].sort((a, b) => {
    const am = asWhen(a?.createdAt)?.getTime() || 0;
    const bm = asWhen(b?.createdAt)?.getTime() || 0;
    return bm - am;
  });
}

export function organizationWritePayload(src = {}) {
  const out = {};
  if (src.id) out.id = String(src.id);
  if ("name" in src) out.name = src.name;
  if ("website" in src) out.website = src.website || "";
  if ("logoUrl" in src) out.logoUrl = src.logoUrl || "";
  if ("status" in src && src.status) out.status = src.status;
  if ("type" in src && src.type) out.type = src.type;
  return out;
}

export function partnerApplicationWritePayload(src = {}) {
  const eventId = String(src.eventId || "").trim();
  const companyName = String(src.companyName || "").trim();
  if (!eventId || !companyName) {
    throw Object.assign(
      new Error("eventId and companyName are required."),
      { code: "api/bad-application" }
    );
  }
  const out = { eventId, companyName };
  if ("eventTitle" in src) out.eventTitle = src.eventTitle || "";
  if ("contactName" in src) out.contactName = src.contactName || "";
  if ("email" in src) out.email = src.email || "";
  if ("phone" in src) out.phone = src.phone || "";
  if ("website" in src) out.website = src.website || "";
  if ("message" in src) out.message = src.message || "";
  if ("supportTypes" in src) {
    out.supportTypes = Array.isArray(src.supportTypes) ? src.supportTypes.slice(0, 5) : [];
  }
  if ("source" in src) out.source = src.source || "";
  if ("organizationId" in src && src.organizationId) out.organizationId = src.organizationId;
  return out;
}

export function partnerApplicationPatchPayload(src = {}) {
  const out = {};
  if ("status" in src && src.status) out.status = src.status;
  if ("organizationId" in src) out.organizationId = src.organizationId || "";
  if ("adminNote" in src) out.adminNote = src.adminNote || "";
  if ("assignedTo" in src) out.assignedTo = src.assignedTo || "";
  return out;
}

/** Body for PUT /v1/admin/partners. GET shape only — no invented fields. */
export function eventPartnerWritePayload(src = {}, eventHint) {
  const out = {};
  if (src.id) out.id = String(src.id);
  const eventId = src.eventId || eventHint;
  if (eventId) out.eventId = String(eventId);
  if ("organizationId" in src && src.organizationId) out.organizationId = String(src.organizationId);
  if ("tier" in src && src.tier) out.tier = src.tier;
  if ("status" in src && src.status) out.status = src.status;
  if ("displayOrder" in src && Number.isFinite(Number(src.displayOrder))) {
    out.displayOrder = Number(src.displayOrder);
  } else if ("order" in src && Number.isFinite(Number(src.order))) {
    out.displayOrder = Number(src.order);
  }
  if ("note" in src) out.note = src.note || null;
  return out;
}

function normalizeOrganization(row) {
  if (!row || typeof row !== "object") return null;
  const id = row.id || row.organizationId;
  if (!id) return null;
  return {
    ...row,
    id: String(id),
    name: row.name || "",
    website: row.website || "",
    logoUrl: row.logoUrl || row.logo_url || "",
    type: row.type || "",
    status: row.status || "",
  };
}

function normalizeEventPartner(row, eventHint) {
  if (!row || typeof row !== "object") return null;
  const id = row.id || row.partnerId;
  if (!id) return null;
  return {
    ...row,
    id: String(id),
    eventId: String(row.eventId || row.event_id || eventHint || ""),
    organizationId: String(row.organizationId || row.organization_id || ""),
    tier: row.tier || "",
    status: row.status || "",
    displayOrder: Number.isFinite(Number(row.displayOrder)) ? Number(row.displayOrder) : Number(row.order) || 0,
    note: row.note ?? null,
  };
}

function normalizeApplication(row) {
  if (!row || typeof row !== "object") return null;
  const id = row.id || row.applicationId;
  if (!id) return null;
  return {
    ...row,
    id: String(id),
    eventId: String(row.eventId || row.event_id || ""),
    eventTitle: row.eventTitle || row.event_title || "",
    reference: row.reference || "",
    companyName: row.companyName || row.company_name || "",
    contactName: row.contactName || row.contact_name || "",
    email: row.email || "",
    phone: row.phone || "",
    website: row.website || "",
    message: row.message || "",
    supportTypes: Array.isArray(row.supportTypes) ? row.supportTypes
      : (Array.isArray(row.support_types) ? row.support_types : []),
    source: row.source || "",
    status: row.status || "new",
    organizationId: row.organizationId || row.organization_id || "",
    adminNote: row.adminNote || row.admin_note || "",
    assignedTo: row.assignedTo || row.assigned_to || "",
    createdAt: row.createdAt || row.created_at || null,
    consentAt: row.consentAt || row.consent_at || null,
    privacyVersion: row.privacyVersion || row.privacy_version || "",
  };
}

function asTextList(value) {
  if (Array.isArray(value)) {
    return value.map(v => {
      if (v && typeof v === "object") return String(v.name || v.title || v.label || v.id || "").trim();
      return String(v || "").trim();
    }).filter(Boolean);
  }
  const s = String(value || "").trim();
  return s ? [s] : [];
}

export function normalizeContact(row) {
  if (!row || typeof row !== "object") return null;
  const id = row.id || row.contactId || row.email || row.emailKey;
  if (!id) return null;
  const email = String(row.email || "").trim();
  const emailKey = String(row.emailKey || email).trim().toLowerCase();
  const name = row.displayName || row.full_name || row.fullName || row.contactName
    || row.name || email || String(id);
  const types = asTextList(row.types || row.type || row.roles || row.role);
  const events = asTextList(row.events || row.eventTitle || row.event || row.eventId);
  const companies = asTextList(row.companies || row.company || row.companyName
    || row.organization || row.organisation);
  const phones = asTextList(row.phones || row.phone || row.mobile);
  const added = asWhen(row.addedAt || row.addedMs || row.createdAt || row.created_at);
  return {
    ...row,
    id: String(id),
    email,
    emailKey: emailKey || String(id).toLowerCase(),
    displayName: name,
    types,
    events,
    companies,
    phones,
    addedMs: added ? added.getTime() : (Number.isFinite(Number(row.addedMs)) ? Number(row.addedMs) : null),
    createdAt: row.createdAt || row.created_at || null,
  };
}

export async function listApiOrganizations(opts = {}) {
  const data = await paaipePublicGet(organizationsPath(), opts);
  return sortByName(withIds(asList(data, "organizations")).map(normalizeOrganization).filter(Boolean));
}

export async function getApiOrganization(id, opts = {}) {
  const data = await paaipePublicGet(organizationPath(id), opts);
  return normalizeOrganization(asResource(data) || data);
}

export async function listApiEventPartners(eventId, opts = {}) {
  const data = await paaipePublicGet(eventPartnersPath(eventId), opts);
  return withIds(asList(data, "partners"))
    .map(r => normalizeEventPartner(r, eventId))
    .filter(Boolean)
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
}

export async function postPartnerApplication(fields, opts = {}) {
  const data = await paaipeApiRequest(partnerApplicationsPath(), {
    method: "POST",
    body: partnerApplicationWritePayload(fields),
    auth: "public",
    token: undefined,
    ...opts,
  });
  const row = normalizeApplication(asResource(data) || data) || data;
  const id = row?.id || fields.id;
  if (!id) {
    throw Object.assign(
      new Error("The API did not return an id. Nothing was assumed."),
      { code: "api/invalid-response" }
    );
  }
  return {
    id: String(id),
    reference: row?.reference || "",
    organizationId: row?.organizationId || fields.organizationId || "",
  };
}

export async function listMeOrganizations(opts = {}) {
  const data = await paaipeApiRequest(meOrganizationsPath(), opts);
  return sortByName(withIds(asList(data, "organizations")).map(normalizeOrganization).filter(Boolean));
}

export async function postMeOrganization(fields, opts = {}) {
  const data = await paaipeApiRequest(meOrganizationsPath(), {
    method: "POST",
    body: organizationWritePayload(fields),
    ...opts,
  });
  return createdId(data, fields.id);
}

export async function patchMeOrganization(id, fields, opts = {}) {
  return paaipeApiRequest(meOrganizationPath(id), {
    method: "PATCH",
    body: organizationWritePayload(fields),
    ...opts,
  });
}

export async function listAdminOrganizations(opts = {}) {
  const data = await paaipeApiRequest(adminOrganizationsPath(), opts);
  return sortByName(withIds(asList(data, "organizations")).map(normalizeOrganization).filter(Boolean));
}

export async function getAdminOrganization(id, opts = {}) {
  const data = await paaipeApiRequest(adminOrganizationPath(id), opts);
  return normalizeOrganization(asResource(data) || data);
}

export async function postAdminOrganization(fields, opts = {}) {
  const data = await paaipeApiRequest(adminOrganizationsPath(), {
    method: "POST",
    body: organizationWritePayload(fields),
    ...opts,
  });
  return createdId(data, fields.id);
}

export async function patchAdminOrganization(id, fields, opts = {}) {
  return paaipeApiRequest(adminOrganizationPath(id), {
    method: "PATCH",
    body: organizationWritePayload(fields),
    ...opts,
  });
}

export async function listAdminPartners(opts = {}) {
  const data = await paaipeApiRequest(adminPartnersPath(), opts);
  return withIds(asList(data, "partners")).map(r => normalizeEventPartner(r)).filter(Boolean);
}

export async function listAdminEventPartners(eventId, opts = {}) {
  const data = await paaipeApiRequest(adminEventPartnersPath(eventId), opts);
  return withIds(asList(data, "partners"))
    .map(r => normalizeEventPartner(r, eventId))
    .filter(Boolean)
    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
}

/** Aryhan lock: GET/PUT /v1/admin/partners. Not PATCH. */
export async function putAdminPartners(fields, opts = {}) {
  const data = await paaipeApiRequest(adminPartnersPath(), {
    method: "PUT",
    body: eventPartnerWritePayload(fields),
    ...opts,
  });
  return normalizeEventPartner(asResource(data) || data, fields.eventId) || data;
}

/**
 * Locked verb GET/PUT /v1/admin/events/{eventId}/partners.
 * Live PUT on this path is 404 — callers that need a write use putAdminPartners.
 */
export async function putAdminEventPartners(eventId, fields, opts = {}) {
  const data = await paaipeApiRequest(adminEventPartnersPath(eventId), {
    method: "PUT",
    body: eventPartnerWritePayload(fields, eventId),
    ...opts,
  });
  return normalizeEventPartner(asResource(data) || data, eventId) || data;
}

export async function listAdminPartnerApplications(opts = {}) {
  const data = await paaipeApiRequest(adminPartnerApplicationsPath(), opts);
  return sortByCreatedDesc(
    withIds(asList(data, "applications")).map(normalizeApplication).filter(Boolean)
  );
}

export async function getAdminPartnerApplication(id, opts = {}) {
  const data = await paaipeApiRequest(adminPartnerApplicationPath(id), opts);
  const row = normalizeApplication(asResource(data) || data);
  if (!row) {
    throw Object.assign(
      new Error("The API did not return a partner application. Nothing was assumed."),
      { code: "api/invalid-response" }
    );
  }
  return row;
}

export async function patchAdminPartnerApplication(id, fields, opts = {}) {
  return paaipeApiRequest(adminPartnerApplicationPath(id), {
    method: "PATCH",
    body: partnerApplicationPatchPayload(fields),
    ...opts,
  });
}

export async function listAdminContacts(opts = {}) {
  const data = await paaipeApiRequest(adminContactsPath(), opts);
  return sortByCreatedDesc(asList(data, "contacts").map(normalizeContact).filter(Boolean));
}

export async function getAdminContact(id, opts = {}) {
  const data = await paaipeApiRequest(adminContactPath(id), opts);
  const row = normalizeContact(asResource(data) || data);
  if (!row) {
    throw Object.assign(
      new Error("The API did not return a contact. Nothing was assumed."),
      { code: "api/invalid-response" }
    );
  }
  return row;
}

