/* PAAIPE — Sessions and Micros (Learnings).
 *
 * Portal / public reads and admin writes are hard-cut to api.paaipe.org.
 * Firebase is Auth/users (Bearer) only on this path.
 *
 * Public (no Bearer):
 *   GET /v1/sessions          { sessions: [...] }
 *   GET /v1/sessions/{id}
 *   GET /v1/micros            { micros: [...] }
 *   GET /v1/micros/{id}
 *
 * Admin (Bearer + allow-list). Live-confirmed:
 *   POST  /v1/admin/sessions
 *   PATCH /v1/admin/sessions/{id}
 *   POST  /v1/admin/micros
 *   PATCH /v1/admin/micros/{id}
 * GET /v1/admin/sessions and GET /v1/admin/micros 404 — admin list uses
 * the public GETs (published only). DELETE 404 — remove fails honestly.
 *
 * Wire camelCase fields as returned: itemIds, displayOrder, publishedAt,
 * youtubeUrl, youtubeId, posterUrl, aspect, title, description, kind,
 * status, source, published, storagePath, posterStoragePath.
 *
 * Upload POSTs to media.paaipe.org and stores the returned path as
 * storagePath / posterStoragePath. YouTube remains the other path.
 */
import {
  listApiSessions,
  getApiSession,
  listApiMicros,
  getApiMicro,
  postAdminSession,
  patchAdminSession,
  postAdminMicro,
  patchAdminMicro,
} from "/assets/js/paaipe-api.js";

export const LEARNINGS_COL = {
  sessions: "paaipe_sessions",
  micros:   "paaipe_micros",
  log:      "paaipe_activity_log",
};

/** True once media.paaipe.org accepts kind=session|micro|poster. */
export const LEARNINGS_UPLOAD_STORAGE_READY = true;

export const LEARNING_SOURCE = { YOUTUBE: "youtube", UPLOAD: "upload" };

const UPLOAD_STUB =
  "File upload is not available yet — Storage is not wired. Paste a YouTube URL instead. Nothing was uploaded.";

export function learningsUploadStubMessage() {
  return UPLOAD_STUB;
}

/**
 * Derive a YouTube video id from a watch / share / embed / shorts URL, or from
 * a bare 11-char id. Returns "" when nothing usable is found — never invents.
 */
export function youtubeIdFromUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0] || "";
      return /^[\w-]{11}$/.test(id) ? id : "";
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const v = u.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      // /embed/ID, /shorts/ID, /live/ID, /v/ID
      const i = parts.findIndex(p => ["embed", "shorts", "live", "v"].includes(p));
      if (i >= 0 && parts[i + 1] && /^[\w-]{11}$/.test(parts[i + 1])) return parts[i + 1];
    }
  } catch { /* not a URL */ }
  const m = s.match(/(?:v=|\/embed\/|\/shorts\/|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : "";
}

export function youtubeWatchUrl(id) {
  return id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : "";
}

/** In-portal nocookie embed src. Member playback defaults to controls=0 so
 *  YouTube's share/chain, Watch-on-YouTube, title link, copy-link, and keyboard
 *  shortcuts are not offered. Pair with the grab shield in session-view.
 *  The video id still appears in the iframe src / network; unlisted ≠ DRM.
 *  Do not surface "Open on YouTube" in the UI. Admin preview may pass
 *  `{ controls: true }` — that page already has the watch URL in the editor. */
export function youtubeEmbedSrc(youtubeId, {
  origin = "",
  autoplay = false,
  controls = false,
} = {}) {
  const id = encodeURIComponent(youtubeId || "");
  if (!id) return "";
  const o = encodeURIComponent(origin || (typeof location !== "undefined" ? location.origin : ""));
  const chrome = controls ? "controls=1" : "controls=0&disablekb=1";
  return `https://www.youtube-nocookie.com/embed/${id}` +
    `?rel=0&modestbranding=1&playsinline=1&${chrome}` +
    `&enablejsapi=1&fs=0&iv_load_policy=3` +
    (autoplay ? "&autoplay=1" : "") +
    (o ? `&origin=${o}` : "");
}

function row(doc) {
  return { id: doc.id, ...doc.data() };
}

function missingAsNull(err) {
  if (err && (err.status === 404 || err.code === "api/not-found")) return null;
  throw err;
}

async function bearerToken(opts = {}) {
  if (opts.token) return opts.token;
  const { idTokenForRequest } = await import("/assets/js/paaipe-firebase.js");
  const token = await idTokenForRequest();
  if (!token) {
    throw Object.assign(new Error("You need to be signed in."), { code: "not-signed-in" });
  }
  return token;
}

/** Public published rows from the API. GET /v1/admin/sessions|micros 404,
 *  so asAdmin cannot invent a draft list — same published set. */
export async function listLearnings(kind, { asAdmin = false } = {}) {
  void asAdmin;
  return kind === "micros" ? listPublishedMicros() : listPublishedSessions();
}

export async function listPublishedSessions() {
  return listApiSessions();
}

export async function listPublishedMicros() {
  return listApiMicros();
}

export async function getLearning(kind, id) {
  const safe = String(id || "").trim();
  if (!safe) return null;
  try {
    return kind === "micros" ? await getApiMicro(safe) : await getApiSession(safe);
  } catch (err) {
    return missingAsNull(err);
  }
}

/**
 * Build a write payload. Derives youtubeId on save. Upload source stores
 * storagePath / posterStoragePath from media.paaipe.org (never invented).
 */
export function buildLearningPayload(input, { actor, existing = null } = {}) {
  const title = String(input.title || "").trim();
  const description = String(input.description || "").trim();
  const source = input.source === LEARNING_SOURCE.UPLOAD
    ? LEARNING_SOURCE.UPLOAD
    : LEARNING_SOURCE.YOUTUBE;
  const youtubeUrl = String(input.youtubeUrl || "").trim();
  const youtubeId = source === LEARNING_SOURCE.YOUTUBE
    ? youtubeIdFromUrl(youtubeUrl || input.youtubeId)
    : "";
  const posterUrl = String(input.posterUrl || "").trim();
  const storagePath = input.storagePath != null && String(input.storagePath).trim()
    ? String(input.storagePath).trim()
    : (existing?.storagePath ?? null);
  const posterStoragePath = input.posterStoragePath != null && String(input.posterStoragePath).trim()
    ? String(input.posterStoragePath).trim()
    : (existing?.posterStoragePath ?? null);
  const published = !!input.published;
  const displayOrder = Number.isFinite(Number(input.displayOrder))
    ? Number(input.displayOrder)
    : (existing?.displayOrder ?? 100);

  if (!title) throw Object.assign(new Error("A title is required."), { code: "validation" });
  if (title.length > 200) throw Object.assign(new Error("Title is too long (200 max)."), { code: "validation" });
  if (description.length > 4000)
    throw Object.assign(new Error("Description is too long (4000 max)."), { code: "validation" });

  if (source === LEARNING_SOURCE.UPLOAD && !LEARNINGS_UPLOAD_STORAGE_READY) {
    throw Object.assign(new Error(UPLOAD_STUB), { code: "storage/not-wired" });
  }
  if (source === LEARNING_SOURCE.UPLOAD && !storagePath) {
    throw Object.assign(new Error("Upload an mp4 or webm file. Nothing was saved."), { code: "validation" });
  }
  if (source === LEARNING_SOURCE.YOUTUBE && !youtubeId) {
    throw Object.assign(new Error("Paste a valid YouTube URL (or 11-character video id)."), { code: "validation" });
  }

  const nowPublished = published;
  const wasPublished = !!(existing && existing.published);
  let publishedAt = existing?.publishedAt ?? null;
  if (nowPublished && !wasPublished) publishedAt = "SERVER"; // stamped below
  if (!nowPublished) publishedAt = null;

  return {
    title,
    description: description || null,
    source,
    youtubeUrl: source === LEARNING_SOURCE.YOUTUBE
      ? (youtubeUrl || youtubeWatchUrl(youtubeId))
      : null,
    youtubeId: source === LEARNING_SOURCE.YOUTUBE ? youtubeId : null,
    storagePath: source === LEARNING_SOURCE.UPLOAD ? storagePath : (existing?.storagePath ?? null),
    posterUrl: posterUrl || null,
    posterStoragePath: posterStoragePath,
    published: nowPublished,
    publishedAt,
    displayOrder,
    updatedBy: actor || null,
    _stampPublishedAt: publishedAt === "SERVER",
  };
}

export async function saveLearning(kind, id, input, { actor, token } = {}) {
  const existing = id ? await getLearning(kind, id) : null;
  const payload = buildLearningPayload(input, { actor, existing });
  delete payload._stampPublishedAt;
  const body = { ...payload, ...(id ? { id } : {}) };
  const tok = await bearerToken({ token });
  const opts = { token: tok };
  if (kind === "micros") {
    return id ? (await patchAdminMicro(id, body, opts), id) : postAdminMicro(body, opts);
  }
  return id ? (await patchAdminSession(id, body, opts), id) : postAdminSession(body, opts);
}

export async function deleteLearning(_kind, _id) {
  void _kind;
  void _id;
  throw Object.assign(
    new Error("Delete is not on api.paaipe.org yet (DELETE 404). Nothing was changed."),
    { code: "api/not-wired" }
  );
}

/** Persist a new displayOrder sequence after drag-reorder. Index 0 → order 1.
 *  No reorder route — PATCH each row's displayOrder on the confirmed path. */
export async function reorderLearnings(kind, orderedIds, { actor, token } = {}) {
  const tok = await bearerToken({ token });
  const patch = kind === "micros" ? patchAdminMicro : patchAdminSession;
  for (let i = 0; i < orderedIds.length; i++) {
    await patch(orderedIds[i], { displayOrder: i + 1, updatedBy: actor || null }, { token: tok });
  }
}

export async function logLearningActivity(_action, _details, _opts = {}) {
  /* No activity-log route is documented. Best-effort no-op. */
}
