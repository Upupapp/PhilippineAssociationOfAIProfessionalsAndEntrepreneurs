/* Test-only Playlists data. Import-mapped over paaipe-playlists-data.js. */
export {
  PLAYLISTS_COL,
  PLAYLIST_KIND,
  PLAYLIST_STATUS,
  groupLearningsByPlaylist,
  playlistForItem,
  normalizeItemIds,
  buildPlaylistPayload,
} from "/assets/js/paaipe-playlists-data.js?real=1";

export async function listPublishedPlaylists() {
  return [];
}

export async function listPlaylists() {
  return [];
}
