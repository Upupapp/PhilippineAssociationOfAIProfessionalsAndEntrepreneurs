/* PAAIPE admin API — Clarence's BE contract.
 *
 * Draft default:  http://127.0.0.1:8091  (SSH tunnel)
 *   ssh -L 8091:127.0.0.1:8091 root@103.3.62.77
 * Flip target:    https://api.paaipe.org
 *   Change PAAIPE_API_DEFAULT_BASE to PAAIPE_API_PROD_BASE when Paul
 *   authorizes nginx for api.paaipe.org. Do not default there yet.
 *
 * ONE constant / env-style knob — flip without a rewrite:
 *   1. ?paaipe_api=   — "tunnel"/"local" → 8091; "prod"/"api" → api.paaipe.org;
 *                       otherwise an absolute base
 *   2. window.PAAIPE_API_BASE
 *   3. localStorage["PAAIPE_API_BASE"]
 *   else PAAIPE_API_DEFAULT_BASE
 *
 * Do not use media.paaipe.org as the API base. There is no public Firestore URL here.
 *
 * Auth: Authorization: Bearer <Firebase ID token>
 * Admin allow-list is enforced on the BE (paul@moveup.app live) — 403 if missing.
 * Settings PATCH is live on Linode. Registrations admin is still 404 until
 * the BE deploy — the client is drafted; failures stay honest.
 *
 * CORS: none yet. A browser on paaipe.org will block until origins are added
 * (or use the tunnel / a local proxy while drafting).
 *
 * Paths (use exactly):
 *   PATCH /v1/admin/events/{id}
 *     registrationOpensAt, registrationClosesAt, whoCanRegister,
 *     waitlistEnabled, questionsEnabled, status
 *   GET   /v1/admin/events/{eventId}/registrations   optional ?status=
 *   GET   /v1/admin/registrations/{id}
 *   PATCH /v1/admin/registrations/{id}               body { status } only
 *     registered | attended | no_show | cancelled
 *
 * Failed reads and writes throw. Nothing is invented, and nothing is treated
 * as saved when the API did not accept it.
 */
export const PAAIPE_API_PROD_BASE = "https://api.paaipe.org";
export const PAAIPE_API_TUNNEL_BASE = "http://127.0.0.1:8091";
/** Draft default. Flip to PAAIPE_API_PROD_BASE after Paul-authorized nginx. */
export const PAAIPE_API_DEFAULT_BASE = PAAIPE_API_TUNNEL_BASE;
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

export function adminEventPath(id) {
  return `/v1/admin/events/${encodeURIComponent(id)}`;
}

export function adminEventRegistrationsPath(eventId, { status } = {}) {
  const path = `/v1/admin/events/${encodeURIComponent(eventId)}/registrations`;
  return status ? `${path}?status=${encodeURIComponent(status)}` : path;
}

export function adminRegistrationPath(id) {
  return `/v1/admin/registrations/${encodeURIComponent(id)}`;
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
 * Fetch one admin API path. Throws on network, CORS, non-OK, or unreadable JSON.
 * Never invents a body.
 */
export async function paaipeApiRequest(path, {
  method = "GET",
  body,
  token,
  fetchImpl,
  base = PAAIPE_API_BASE,
} = {}) {
  const root = String(base || "").trim().replace(/\/+$/, "");
  if (!root) {
    throw Object.assign(
      new Error("PAAIPE_API_BASE is not set. Nothing was requested."),
      { code: "api/no-base" }
    );
  }
  if (!token) {
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
  const headers = { Authorization: `Bearer ${token}` };
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
  if (!text) return null;
  try { return JSON.parse(text); }
  catch {
    throw Object.assign(
      new Error("The API returned a response that could not be read. Nothing was assumed."),
      { code: "api/invalid-response", status: res.status }
    );
  }
}

function asList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.registrations)) return data.registrations;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
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

export async function patchAdminEvent(id, fields, opts) {
  return paaipeApiRequest(adminEventPath(id), {
    method: "PATCH",
    body: eventSettingsPayload(fields),
    ...opts,
  });
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
