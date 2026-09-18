/* Test-only Learnings data. Import-mapped over paaipe-learnings-data.js so the
 * hub can render without Firestore. Not shipped to visitors (tests/ is skipped).
 * `?real=1` bypasses the import map so we still use the real embed helper. */
export {
  youtubeEmbedSrc,
  youtubeIdFromUrl,
  youtubeWatchUrl,
  LEARNING_SOURCE,
  LEARNINGS_COL,
  LEARNINGS_UPLOAD_STORAGE_READY,
  learningsUploadStubMessage,
} from "/assets/js/paaipe-learnings-data.js?real=1";

export async function listPublishedSessions() {
  return [
    {
      id: "part1",
      title: "Part 1 — Presentation",
      description: "From Signals to Strategy: Using AI to Turn Data into Real Insight. Sven Bally, Honorary Agent. AI Exchange, Tuesday, September 15, 2026.",
      source: "youtube",
      youtubeId: "ePw_wlPqYUk",
      published: true,
      displayOrder: 1,
    },
    {
      id: "part2",
      title: "Part 2 — Q&A",
      description: "From Signals to Strategy: Using AI to Turn Data into Real Insight. Sven Bally, Honorary Agent. AI Exchange Q&A, Tuesday, September 15, 2026.",
      source: "youtube",
      youtubeId: "0PkiRVczWdQ",
      published: true,
      displayOrder: 2,
    },
  ];
}

export async function listPublishedMicros() {
  return [];
}
