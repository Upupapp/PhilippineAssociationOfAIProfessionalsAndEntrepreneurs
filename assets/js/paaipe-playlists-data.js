/* PAAIPE — Playlists.
 *
 * Clarence's schema, locked. Collection name `paaipe_playlists` is the
 * historical lock; portal / public reads are hard-cut to api.paaipe.org.
 * Do not invent field names.
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
 * Public reads (no Bearer):
 *   GET /v1/playlists?kind=micros|sessions → { playlists: [...] }
 *   GET /v1/playlists/{id}
 *   GET /v1/playlists/{id}/items           → { items: [...] } hydrated
 *
 * Admin Playlist writes are on hold: Clarence did not document admin
 * Learnings CRUD in this cut. save / status / reorder fail honestly.
 * Do not invent admin endpoints. Do not read paaipe_playlists from Firestore.
 *
 * Archived stays in admin for restore. Publish integrity is enforced
 * here: every itemIds entry must exist and be published==true of that kind
 * before status may become published. groupLearningsByPlaylist still skips
 * missing or unpublished ids so a later unpublish cannot blank a block.
 *
 * Linkage is ONLY itemIds. Do not write playlistId (or anything like it)
 * onto Session/Micro docs — one Micro may sit in more than one Playlist
 * later without rewriting the item.
 *
 * Sessions and Micros keep their own publish and their own displayOrder
 * reorder.
 */
import { getLearning } from "/assets/js/paaipe-learnings-data.js";
import {
  listApiPlaylists,
  getApiPlaylist,
  listApiPlaylistItems,
} from "/assets/js/paaipe-api.js";

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
  // Public API is published-only. Admin list is not a documented route.
  void asAdmin;
  return listPublishedPlaylists(kind);
}

export async function listPublishedPlaylists(kind) {
  const filter = kind === PLAYLIST_KIND.SESSIONS || kind === PLAYLIST_KIND.MICROS
    ? kind
    : null;
  return sortByOrder(await listApiPlaylists(filter));
}

export async function getPlaylist(id) {
  const safe = String(id || "").trim();
  if (!safe) return null;
  try {
    return await getApiPlaylist(safe);
  } catch (err) {
    if (err && (err.status === 404 || err.code === "api/not-found")) return null;
    throw err;
  }
}

export async function listPlaylistItems(id) {
  const safe = String(id || "").trim();
  if (!safe) return [];
  return listApiPlaylistItems(safe);
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

function adminPlaylistWriteHold() {
  throw Object.assign(
    new Error("Admin Playlist writes are not on api.paaipe.org yet. Nothing was saved."),
    { code: "api/not-wired" }
  );
}

export async function savePlaylist(id, input, { actor } = {}) {
  const existing = id ? await getPlaylist(id) : null;
  const payload = buildPlaylistPayload(input, { actor, existing });
  if (payload.status === PLAYLIST_STATUS.PUBLISHED) {
    await assertPlaylistItemsPublishable(payload.kind, payload.itemIds);
  }
  void payload;
  adminPlaylistWriteHold();
}

export async function setPlaylistStatus(id, status, { actor } = {}) {
  const existing = await getPlaylist(id);
  if (!existing) {
    throw Object.assign(new Error("That Playlist was not found."), { code: "not-found" });
  }
  return savePlaylist(id, { ...existing, status }, { actor });
}

export async function reorderPlaylists(_orderedIds, { actor } = {}) {
  void _orderedIds;
  void actor;
  adminPlaylistWriteHold();
}
