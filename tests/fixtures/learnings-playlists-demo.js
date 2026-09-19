/* Test-only Learnings + the four live Micros. Import-mapped over paaipe-learnings-data.js. */
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
      description: "From Signals to Strategy: Using AI to Turn Data into Real Insight.",
      source: "youtube",
      youtubeId: "ePw_wlPqYUk",
      published: true,
      displayOrder: 1,
    },
  ];
}

export async function getLearning(kind, id) {
  const rows = kind === "sessions"
    ? await listPublishedSessions()
    : await listPublishedMicros();
  return rows.find(r => r.id === id) || null;
}

export async function listPublishedMicros() {
  return [
    { id: "micro-1", title: "Start with the question, not the dashboard",
      description: "Before you open a chart, name the decision you are trying to make.",
      source: "upload", storagePath: "micros/micro-1.mp4", published: true, displayOrder: 1 },
    { id: "micro-2", title: "Signals vs noise",
      description: "What to trust in the data, and what to leave on the floor.",
      source: "upload", storagePath: "micros/micro-2.mp4", published: true, displayOrder: 2 },
    { id: "micro-3", title: "From insight to a next step",
      description: "Turn a finding into one clear action your team can take this week.",
      source: "upload", storagePath: "micros/micro-3.mp4", published: true, displayOrder: 3 },
    { id: "micro-4", title: "Keep the story honest",
      description: "How to brief others without overselling what the model saw.",
      source: "upload", storagePath: "micros/micro-4.mp4", published: true, displayOrder: 4 },
  ];
}
