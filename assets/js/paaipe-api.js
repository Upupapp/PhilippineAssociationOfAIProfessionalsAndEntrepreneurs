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
 * Email send is still 501. Sponsors, partners, orgs, activity log, Zoom
 * private join, and Feedback/Reports are not on this API — do not invent them.
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
    detail = "You do not have permission. The admin allow-list is enforced on the API.";
  } else if (status === 404) {
    detail = /\/registrations/.test(path || "")
      ? "The registrations API route was not found (404). It may not be deployed on this host yet."
      : "The API route was not found (404).";
  } else if (trimmed && trimmed.length < 280 && !/^[\s{[]/.test(trimmed)) {
    detail = trimmed.replace(/\.?$/, ".");
  } else {
    detail = `The API request failed (${status}).`;
  }
  const err = new Error(`${detail}${tail}`);
  err.code = status === 401 ? "api/unauthorized"
    : status === 403 ? "api/forbidden"
    : status === 404 ? "api/not-found"
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
  if (Array.isArray(data?.items)) return data.items;
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
  for (const key of ["session", "micro", "playlist", "item", "event"]) {
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
