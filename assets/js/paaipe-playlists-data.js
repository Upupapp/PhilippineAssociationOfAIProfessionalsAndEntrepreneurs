/* PAAIPE — Playlists.
 *
 * Clarence's schema, locked. Collection `paaipe_playlists` (auto-id) on
 * database `paaipe`. Do not invent collection or field names.
 *
 *   title        string — kind is NOT written into the title
 *   description  string, optional, ≤2000
 *   kind         "sessions" | "micros" — never mixed in v1
 *   itemIds      string[] — ordered published Session/Micro ids of that kind
 *   status       "draft" | "published" | "archived"
 *   displayOrder number
 *   publishedAt  timestamp | null
 *   createdAt / updatedAt / updatedBy
 *
 * Portal reads status==published only. The Learnings hub lists every
 * published Playlist on its own Playlists tab, and still groups cited
 * items on Sessions / Micros. Archived stays in admin for restore. Publish integrity is enforced
 * here: every itemIds entry must exist and be published==true of that kind
 * before status may become published. The portal still skips missing or
 * unpublished ids so a later unpublish cannot blank the block.
 *
 * Linkage is ONLY itemIds on this collection. Do not write playlistId (or
 * anything like it) onto Session/Micro docs — one Micro may sit in more than
 * one Playlist later without rewriting the item.
 *
 * Sessions and Micros keep their own publish and their own displayOrder
 * reorder. This module does not write paaipe_sessions or paaipe_micros except
 * to read them for the publish check.
 */
import { firebaseConfig, DATABASE_ID } from "/assets/js/paaipe-firebase.js";
import { getLearning } from "/assets/js/paaipe-learnings-data.js";

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

/** Clarence lock. One constant — this is the collection name. */
export const PLAYLISTS_COL = "paaipe_playlists";

export const PLAYLIST_KIND = { SESSIONS: "sessions", MICROS: "micros" };
export const PLAYLIST_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived",
};

const TITLE_MAX = 200;
const DESC_MAX = 2000;
const ITEMS_MAX = 80;

function row(doc) {
  return { id: doc.id, ...doc.data() };
}

function sortByOrder(rows) {
  return [...rows].sort((a, b) => {
    const ao = Number(a.displayOrder);
    const bo = Number(b.displayOrder);
    const an = Number.isFinite(ao) ? ao : 0;
    const bn = Number.isFinite(bo) ? bo : 0;
    if (an !== bn) return an - bn;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

export function normalizeItemIds(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const value of raw) {
    const id = String(value || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= ITEMS_MAX) break;
  }
  return out;
}

/**
 * FE grouping. Each published playlist becomes a block of items in itemIds
 * order. Missing or unpublished ids are skipped. An item may appear in more
 * than one playlist. Items not cited by any published playlist of this set
 * are returned as `ungrouped` so existing Sessions stay visible.
 */
export function groupLearningsByPlaylist(items, playlists) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const byId = new Map(list.map(item => [item.id, item]));
  const cited = new Set();
  const groups = [];
  const published = sortByOrder(
    (playlists || []).filter(p => p && p.status === PLAYLIST_STATUS.PUBLISHED)
  );
  for (const playlist of published) {
    const resolved = [];
    for (const id of normalizeItemIds(playlist.itemIds)) {
      const item = byId.get(id);
      if (!item || item.published === false) continue;
      resolved.push(item);
      cited.add(id);
    }
    if (!resolved.length) continue;
    groups.push({ playlist, items: resolved });
  }
  const ungrouped = sortByOrder(list.filter(item => item.published !== false && !cited.has(item.id)));
  return { groups, ungrouped };
}

export function playlistForItem(playlists, itemId) {
  const id = String(itemId || "").trim();
  if (!id) return null;
  return sortByOrder(
    (playlists || []).filter(p => p && p.status === PLAYLIST_STATUS.PUBLISHED)
  ).find(p => normalizeItemIds(p.itemIds).includes(id)) || null;
}

export async function listPlaylists({ asAdmin = false, kind = null } = {}) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const col = F.collection(await db(), PLAYLISTS_COL);
  const q = asAdmin
    ? F.query(col, F.orderBy("displayOrder", "asc"))
    : F.query(col, F.where("status", "==", PLAYLIST_STATUS.PUBLISHED));
  const snap = await F.getDocs(q);
  let rows = snap.docs.map(row);
  if (kind === PLAYLIST_KIND.SESSIONS || kind === PLAYLIST_KIND.MICROS) {
    rows = rows.filter(r => r.kind === kind);
  }
  return sortByOrder(rows);
}

export async function listPublishedPlaylists(kind) {
  return listPlaylists({ asAdmin: false, kind });
}

export async function getPlaylist(id) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const s = await F.getDoc(F.doc(await db(), PLAYLISTS_COL, id));
  return s.exists() ? row(s) : null;
}

/**
 * Every id must resolve to a published learning of `kind`. Used before a
 * playlist may be saved as published.
 */
export async function assertPlaylistItemsPublishable(kind, itemIds) {
  const ids = normalizeItemIds(itemIds);
  if (kind !== PLAYLIST_KIND.SESSIONS && kind !== PLAYLIST_KIND.MICROS) {
    throw Object.assign(new Error("A Playlist kind must be sessions or micros."), {
      code: "validation",
    });
  }
  const missing = [];
  const unpublished = [];
  for (const id of ids) {
    const item = await getLearning(kind, id);
    if (!item) missing.push(id);
    else if (!item.published) unpublished.push(id);
  }
  if (missing.length || unpublished.length) {
    const bits = [];
    if (missing.length) bits.push(`missing: ${missing.join(", ")}`);
    if (unpublished.length) bits.push(`not published: ${unpublished.join(", ")}`);
    throw Object.assign(
      new Error(`Every item in a published Playlist must exist and be published (${bits.join("; ")}).`),
      { code: "validation", missing, unpublished }
    );
  }
  return ids;
}

export function buildPlaylistPayload(input, { actor, existing = null } = {}) {
  const title = String(input.title || "").trim();
  const description = String(input.description || "").trim();
  const kind = input.kind === PLAYLIST_KIND.MICROS
    ? PLAYLIST_KIND.MICROS
    : PLAYLIST_KIND.SESSIONS;
  const status = input.status === PLAYLIST_STATUS.PUBLISHED
    ? PLAYLIST_STATUS.PUBLISHED
    : input.status === PLAYLIST_STATUS.ARCHIVED
      ? PLAYLIST_STATUS.ARCHIVED
      : PLAYLIST_STATUS.DRAFT;
  const itemIds = normalizeItemIds(input.itemIds);
  const displayOrder = Number.isFinite(Number(input.displayOrder))
    ? Number(input.displayOrder)
    : (existing?.displayOrder ?? 100);

  if (!title) throw Object.assign(new Error("A title is required."), { code: "validation" });
  if (title.length > TITLE_MAX)
    throw Object.assign(new Error(`Title is too long (${TITLE_MAX} max).`), { code: "validation" });
  if (description.length > DESC_MAX)
    throw Object.assign(new Error(`Description is too long (${DESC_MAX} max).`), { code: "validation" });

  const nowPublished = status === PLAYLIST_STATUS.PUBLISHED;
  const wasPublished = existing?.status === PLAYLIST_STATUS.PUBLISHED;
  let publishedAt = existing?.publishedAt ?? null;
  if (nowPublished && !wasPublished) publishedAt = "SERVER";
  if (!nowPublished) publishedAt = null;

  return {
    title,
    description: description || null,
    kind,
    itemIds,
    status,
    displayOrder,
    publishedAt,
    updatedBy: actor || null,
    _stampPublishedAt: publishedAt === "SERVER",
  };
}

export async function savePlaylist(id, input, { actor } = {}) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const firestore = await db();
  let existing = null;
  if (id) {
    const s = await F.getDoc(F.doc(firestore, PLAYLISTS_COL, id));
    if (s.exists()) existing = row(s);
  }
  const payload = buildPlaylistPayload(input, { actor, existing });
  if (payload.status === PLAYLIST_STATUS.PUBLISHED) {
    await assertPlaylistItemsPublishable(payload.kind, payload.itemIds);
  }
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
    const ref = await F.addDoc(F.collection(firestore, PLAYLISTS_COL), data);
    return ref.id;
  }
  if (!existing) data.createdAt = F.serverTimestamp();
  await F.setDoc(F.doc(firestore, PLAYLISTS_COL, id), data, { merge: true });
  return id;
}

export async function setPlaylistStatus(id, status, { actor } = {}) {
  const existing = await getPlaylist(id);
  if (!existing) {
    throw Object.assign(new Error("That Playlist was not found."), { code: "not-found" });
  }
  return savePlaylist(id, { ...existing, status }, { actor });
}

export async function reorderPlaylists(orderedIds, { actor } = {}) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const firestore = await db();
  const batch = F.writeBatch(firestore);
  orderedIds.forEach((id, i) => {
    batch.set(F.doc(firestore, PLAYLISTS_COL, id), {
      displayOrder: i + 1,
      updatedAt: F.serverTimestamp(),
      updatedBy: actor || null,
    }, { merge: true });
  });
  await batch.commit();
}
