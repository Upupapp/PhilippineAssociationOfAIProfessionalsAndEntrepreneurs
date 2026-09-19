/* PAAIPE — Sessions and Micros (Learnings).
 *
 * Portal / public reads are hard-cut to Clarence's live Linode API
 * (https://api.paaipe.org). Firebase is Auth/users only for this path.
 *
 *   GET /v1/sessions          { sessions: [...] }
 *   GET /v1/sessions/{id}
 *   GET /v1/micros            { micros: [...] }
 *   GET /v1/micros/{id}
 *
 * Wire camelCase fields as returned: itemIds, displayOrder, publishedAt,
 * youtubeUrl, youtubeId, posterUrl, aspect, title, description, kind,
 * status, source, published, storagePath, posterStoragePath.
 *
 * Admin writes (save / delete / reorder) stay on Firestore until Clarence
 * documents admin Learnings CRUD. Do not invent admin endpoints.
 *
 * Upload POSTs to media.paaipe.org and stores the returned path as
 * storagePath / posterStoragePath. YouTube remains the other path.
 */
import { firebaseConfig, DATABASE_ID } from "/assets/js/paaipe-firebase.js";
import {
  listApiSessions,
  getApiSession,
  listApiMicros,
  getApiMicro,
} from "/assets/js/paaipe-api.js";

const SDK = "https://www.gstatic.com/firebasejs/12.19.0";
let _db = null;

async function db() {
  if (_db) return _db;
  const { initializeApp, getApps } = await import(`${SDK}/firebase-app.js`);
  const { getFirestore } = await import(`${SDK}/firebase-firestore.js`);
  const app = getApps().find(a => a.name === "paaipe") || initializeApp(firebaseConfig, "paaipe");
  _db = getFirestore(app, DATABASE_ID);
  return _db;
}

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

/** Admin: every row, ordered by displayOrder then createdAt.
 *  Public (asAdmin: false) reads api.paaipe.org — no Firestore. */
export async function listLearnings(kind, { asAdmin = false } = {}) {
  if (!asAdmin) {
    return kind === "micros" ? listPublishedMicros() : listPublishedSessions();
  }
  const colName = kind === "micros" ? LEARNINGS_COL.micros : LEARNINGS_COL.sessions;
  const F = await import(`${SDK}/firebase-firestore.js`);
  const col = F.collection(await db(), colName);
  const q = F.query(col, F.orderBy("displayOrder", "asc"));
  const snap = await F.getDocs(q);
  return snap.docs.map(row);
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

export async function saveLearning(kind, id, input, { actor } = {}) {
  const colName = kind === "micros" ? LEARNINGS_COL.micros : LEARNINGS_COL.sessions;
  const F = await import(`${SDK}/firebase-firestore.js`);
  const firestore = await db();
  let existing = null;
  if (id) {
    const s = await F.getDoc(F.doc(firestore, colName, id));
    if (s.exists()) existing = row(s);
  }
  const payload = buildLearningPayload(input, { actor, existing });
  const stampPublished = payload._stampPublishedAt;
  delete payload._stampPublishedAt;

  const data = {
    ...payload,
    publishedAt: stampPublished ? F.serverTimestamp()
      : (payload.publishedAt === null ? null : payload.publishedAt),
    updatedAt: F.serverTimestamp(),
    updatedBy: actor || null,
  };
  if (!id) {
    data.createdAt = F.serverTimestamp();
    const ref = await F.addDoc(F.collection(firestore, colName), data);
    return ref.id;
  }
  if (!existing) data.createdAt = F.serverTimestamp();
  await F.setDoc(F.doc(firestore, colName, id), data, { merge: true });
  return id;
}

export async function deleteLearning(kind, id) {
  const colName = kind === "micros" ? LEARNINGS_COL.micros : LEARNINGS_COL.sessions;
  const F = await import(`${SDK}/firebase-firestore.js`);
  await F.deleteDoc(F.doc(await db(), colName, id));
}

/** Persist a new displayOrder sequence after drag-reorder. Index 0 → order 1. */
export async function reorderLearnings(kind, orderedIds, { actor } = {}) {
  const colName = kind === "micros" ? LEARNINGS_COL.micros : LEARNINGS_COL.sessions;
  const F = await import(`${SDK}/firebase-firestore.js`);
  const firestore = await db();
  const batch = F.writeBatch(firestore);
  orderedIds.forEach((id, i) => {
    batch.set(F.doc(firestore, colName, id), {
      displayOrder: i + 1,
      updatedAt: F.serverTimestamp(),
      updatedBy: actor || null,
    }, { merge: true });
  });
  await batch.commit();
}

export async function logLearningActivity(action, details, { actor, kind = null } = {}) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  try {
    await F.addDoc(F.collection(await db(), LEARNINGS_COL.log), {
      action, details, kind, actor: actor || null, at: F.serverTimestamp(),
    });
  } catch { /* activity log is best-effort */ }
}
