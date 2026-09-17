/* Past AI Exchange sessions.
 *
 * Only what PAAIPE actually holds. The mockup asserted "1 recording · 1 h 22
 * min", "1:22:04", "Attended", "38% watched", "Q&A follow-ups (6)" and a
 * transcript - none of which exists. Shown to a member those are not decoration,
 * they are false statements about a real session and about that member.
 *
 * A field that is null means we do not have it, and its affordance is hidden.
 * Fill the field in and the affordance appears - no markup change needed.
 *
 * The slides are a GAMMA deck, not a PDF: the September deck was published that
 * way, and the public Resources page links the same URL.
 *
 * Recordings: landscape (16:9) full-session videos, played in-portal via
 * youtube-nocookie embed. The youtubeId still appears in the iframe src and in
 * network requests; unlisted is not DRM and does not make the URL unshareable.
 * Do not surface a raw YouTube URL or "Open on YouTube" in the UI.
 *
 * Reels: optional 9:16 clips on the same event. Empty until real assets exist —
 * the UI must hide empty reels rows, never invent them.
 */
export const PAST_SESSIONS = [
  {
    id: "2026-09",
    edition: "AI Exchange — September 2026",
    title: "From Signals to Strategy: Using AI to Turn Data into Real Insight",
    speaker: "Sven Bally",
    speakerNote: "Honorary Agent",
    speakerPhoto: "assets/img/sven-bally.jpg",
    host: "MJ Soriano",
    dateLong: "Tuesday, September 15, 2026",
    poster: "assets/img/ai-exchange-session.jpg",
    eventUrl: "event-2026-09-ai-exchange.html",

    // Real, and public: the deck Sven presented.
    slidesUrl: "https://gamma.app/docs/Sven-Bally-09v66kz53a10hm0",
    slidesLabel: "Open slides",

    // Two landscape recordings from the same Sept 15 Exchange (unlisted).
    // URL slugs: ?session=2026-09&rec=presentation|qa
    // Legacy aliases 2026-09-part1 / 2026-09-part2 still resolve in the watch page.
    // Titles match the published YouTube titles (cleaned slightly for members).
    recordings: [
      {
        id: "presentation",
        youtubeId: "ePw_wlPqYUk",
        title: "Part 1 — Presentation",
        thumb: "assets/img/ai-exchange-session.jpg",
      },
      {
        id: "qa",
        youtubeId: "0PkiRVczWdQ",
        title: "Part 2 — Q&A",
        thumb: "assets/img/ai-exchange-session.jpg",
      },
    ],

    // No reels yet. Keep the array so Past/Watch can hide empty reels chrome.
    reels: [],

    // No real chapter markers yet — Watch must hide the Chapters card.
    chapters: [],

    // Compat for older checks: truthy when any landscape recording exists.
    // Not a navigable URL — playback is in-portal only (see session-view).
    recordingUrl: "in-portal",

    durationLabel: null,
    qaCount: null,
    transcriptUrl: null,

    // Per-member data. Nothing records attendance or playback position yet, so
    // the portal must not claim either.
    attended: null,
    watchedPercent: null,
    resumeAt: null,
  },
];

export function findSession(id) {
  return PAST_SESSIONS.find(s => s.id === id) || null;
}

/** Landscape recordings for a session (never invents). */
export function sessionRecordings(s) {
  if (!s) return [];
  if (Array.isArray(s.recordings) && s.recordings.length) return s.recordings;
  return [];
}

export function sessionHasRecording(s) {
  return sessionRecordings(s).length > 0 || !!(s && s.recordingUrl);
}

/** 9:16 reels for a session (empty until real assets exist). */
export function sessionReels(s) {
  if (!s || !Array.isArray(s.reels)) return [];
  return s.reels;
}

export function sessionHasReels(s) {
  return sessionReels(s).length > 0;
}

/** Chapter markers for a session (empty until real per-recording data exists). */
export function sessionChapters(s) {
  if (!s || !Array.isArray(s.chapters)) return [];
  return s.chapters;
}

export function sessionHasChapters(s) {
  return sessionChapters(s).length > 0;
}
