/* Test-only Playlists seed. Import-mapped over paaipe-playlists-data.js. */
export {
  PLAYLISTS_COL,
  PLAYLIST_KIND,
  PLAYLIST_STATUS,
  groupLearningsByPlaylist,
  playlistForItem,
  normalizeItemIds,
  buildPlaylistPayload,
} from "/assets/js/paaipe-playlists-data.js?real=1";

const PLAYLIST = {
  id: "pl-signals",
  title: "From Signals to Strategy",
  description: "Short lessons from Sven Bally’s AI Exchange session on turning data into decisions. Watch in order, or pick the cut you need.",
  kind: "micros",
  itemIds: ["micro-1", "micro-2", "micro-3", "micro-4"],
  status: "published",
  displayOrder: 1,
};

export async function listPublishedPlaylists(kind) {
  if (kind && kind !== PLAYLIST.kind) return [];
  return [PLAYLIST];
}

export async function listPlaylists() {
  return [PLAYLIST];
}

export async function getPlaylist(id) {
  return id === PLAYLIST.id ? PLAYLIST : null;
}

export async function listPlaylistItems(id) {
  if (id !== PLAYLIST.id) return [];
  const { listPublishedMicros } = await import("/assets/js/paaipe-learnings-data.js");
  const micros = await listPublishedMicros();
  const byId = new Map(micros.map(m => [m.id, m]));
  return PLAYLIST.itemIds.map(itemId => byId.get(itemId)).filter(Boolean);
}
