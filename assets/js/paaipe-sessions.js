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
    slidesLabel: "Slides (Gamma)",

    // Not held. The September event page says materials appear "as they are
    // approved", and no recording of this session has been published.
    recordingUrl: null,
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
