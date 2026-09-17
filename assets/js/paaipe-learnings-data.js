/* PAAIPE — Sessions and Micros (Learnings).
 *
 * Two collections, Clarence's schema, locked:
 *   paaipe_sessions  — landscape 16:9 recordings
 *   paaipe_micros    — vertical 9:16 clips
 *
 * Do NOT extend paaipe_recordings. Portal reads published==true ordered by
 * displayOrder asc. Admin writes go through isAdmin() in firestore.rules.
 *
 * Upload is schema-ready (storagePath / posterStoragePath) but not wired:
 * LEARNINGS_UPLOAD_STORAGE_READY stays false until Storage exists. YouTube is
 * the v1 path and must work end-to-end.
 */
import { firebaseConfig, DATABASE_ID } from "/assets/js/paaipe-firebase.js";

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

/** Flip only after a writable bucket + Storage rules exist. */
export const LEARNINGS_UPLOAD_STORAGE_READY = false;

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

/** In-portal nocookie embed src. Do not surface "Open on YouTube" in the UI. */
export function youtubeEmbedSrc(youtubeId, { origin = "" } = {}) {
  const id = encodeURIComponent(youtubeId || "");
  if (!id) return "";
  const o = encodeURIComponent(origin || (typeof location !== "undefined" ? location.origin : ""));
  return `https://www.youtube-nocookie.com/embed/${id}` +
    `?rel=0&modestbranding=1&playsinline=1&controls=1` +
    `&fs=0&iv_load_policy=3${o ? `&origin=${o}` : ""}`;
}

function row(doc) {
  return { id: doc.id, ...doc.data() };
}

/** Admin: every row, ordered by displayOrder then createdAt. */
export async function listLearnings(kind, { asAdmin = false } = {}) {
  const colName = kind === "micros" ? LEARNINGS_COL.micros : LEARNINGS_COL.sessions;
  const F = await import(`${SDK}/firebase-firestore.js`);
  const col = F.collection(await db(), colName);
  let q;
  if (asAdmin) {
    q = F.query(col, F.orderBy("displayOrder", "asc"));
  } else {
    q = F.query(col, F.where("published", "==", true), F.orderBy("displayOrder", "asc"));
  }
  const snap = await F.getDocs(q);
  return snap.docs.map(row);
}

export async function listPublishedSessions() {
  return listLearnings("sessions", { asAdmin: false });
}

export async function listPublishedMicros() {
  return listLearnings("micros", { asAdmin: false });
}

export async function getLearning(kind, id) {
  const colName = kind === "micros" ? LEARNINGS_COL.micros : LEARNINGS_COL.sessions;
  const F = await import(`${SDK}/firebase-firestore.js`);
  const s = await F.getDoc(F.doc(await db(), colName, id));
  return s.exists() ? row(s) : null;
}

/**
 * Build a write payload. Derives youtubeId on save. Upload source is refused
 * while LEARNINGS_UPLOAD_STORAGE_READY is false — schema fields stay empty.
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
    storagePath: existing?.storagePath ?? null,
    posterUrl: posterUrl || null,
    posterStoragePath: existing?.posterStoragePath ?? null,
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
