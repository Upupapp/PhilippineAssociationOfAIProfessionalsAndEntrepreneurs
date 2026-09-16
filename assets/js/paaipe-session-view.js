/* Past sessions list and the session watch page.
 *
 * Both render from paaipe-sessions.js and hide every affordance whose artefact
 * does not exist. The mockup shipped a video player with no video, a resume
 * position, a watched percentage and an "Attended" badge - all invented. A play
 * button that cannot play is the same defect as a claim that cannot be true.
 */
import { PAST_SESSIONS, findSession } from "/assets/js/paaipe-sessions.js";

const hide = el => { if (el) el.style.display = "none"; };
const setText = (root, sel, text) =>
  root.querySelectorAll(sel).forEach(e => { e.textContent = text; });

function applySession(root, s) {
  setText(root, "[data-ss-title]", s.title);
  setText(root, "[data-ss-edition]", s.edition);
  setText(root, "[data-ss-date]", s.dateLong);
  setText(root, "[data-ss-speaker]", s.speaker);
  setText(root, "[data-ss-host]", s.host);
  root.querySelectorAll("[data-ss-poster]").forEach(i => { i.src = s.poster; i.alt = s.edition; });

  // slides: real, and it is a Gamma deck rather than a PDF
  root.querySelectorAll("[data-ss-slides]").forEach(a => {
    if (!s.slidesUrl) return hide(a);
    a.href = s.slidesUrl; a.target = "_blank"; a.rel = "noopener";
    a.textContent = s.slidesLabel || "Slides";
  });

  setText(root, "[data-ss-duration]", s.durationLabel || "");

  // symmetric to data-ss-needs: shown ONLY while the artefact is absent, so the
  // "not published yet" line disappears by itself the day a recording lands
  root.querySelectorAll("[data-ss-unless='recording']").forEach(el => {
    if (s.recordingUrl) hide(el);
  });

  // everything below is hidden unless the artefact or the per-member fact exists
  if (!s.recordingUrl)   root.querySelectorAll("[data-ss-needs='recording']").forEach(hide);
  if (!s.durationLabel)  root.querySelectorAll("[data-ss-needs='duration']").forEach(hide);
  if (!s.qaCount)        root.querySelectorAll("[data-ss-needs='qa']").forEach(hide);
  if (!s.transcriptUrl)  root.querySelectorAll("[data-ss-needs='transcript']").forEach(hide);
  if (s.attended == null)       root.querySelectorAll("[data-ss-needs='attended']").forEach(hide);
  if (s.watchedPercent == null) root.querySelectorAll("[data-ss-needs='watched']").forEach(hide);
  if (s.resumeAt == null)       root.querySelectorAll("[data-ss-needs='resume']").forEach(hide);
}

(function () {
  const page = document.documentElement.getAttribute("data-page");

  if (page === "sessions-past") {
    // the template's own parent is the list; requiring a separate [data-ss-list]
    // container meant one missing attribute silently rendered nothing
    const tpl = document.querySelector("[data-ss-item]");
    if (tpl) {
      const count = PAST_SESSIONS.length;
      setText(document, "[data-ss-count]",
        count === 1 ? "1 past session" : `${count} past sessions`);
      const frag = document.createDocumentFragment();
      PAST_SESSIONS.forEach(s => {
        const el = tpl.cloneNode(true);
        el.removeAttribute("data-ss-item");
        el.querySelectorAll("[data-ss-watch]").forEach(a => {
          a.href = `portal-session-watch.html?session=${encodeURIComponent(s.id)}`;
        });
        applySession(el, s);
        frag.appendChild(el);
      });
      tpl.replaceWith(frag);
    }
    document.documentElement.setAttribute("data-sessions-ready", String(PAST_SESSIONS.length));
    return;
  }

  // the Sessions page carries a recap of the same session; it must not disagree
  // with the page it links to about whether a recording exists
  const recap = document.querySelector("[data-ss-recap]");
  if (recap && PAST_SESSIONS.length) {
    const s = PAST_SESSIONS[0];
    recap.querySelectorAll("[data-ss-watch]").forEach(a => {
      a.href = `portal-session-watch.html?session=${encodeURIComponent(s.id)}`;
    });
    applySession(recap, s);
    document.documentElement.setAttribute("data-recap-ready", s.id);
  }

  if (page === "session-watch") {
    const id = new URLSearchParams(location.search).get("session");
    const s = id ? findSession(id) : null;
    const main = document.querySelector("main.content");
    if (!s) {
      if (main) main.innerHTML =
        '<div class="crumbs"><a href="portal-sessions-past.html">Past &amp; recordings</a>' +
        '<span>&rsaquo;</span><span>Session not found</span></div>' +
        '<div class="card" style="text-align:center;padding:48px 24px">' +
        '<h1 style="font-size:22px;margin-bottom:8px">That session is not available</h1>' +
        '<p style="color:var(--muted);font-size:15px;margin:0 0 18px">' +
        (id ? "We could not find a session with that reference." : "No session was specified.") +
        '</p><a class="btn btn-gold" href="portal-sessions-past.html">Back to past sessions</a></div>';
      document.documentElement.setAttribute("data-session-view", "not-found");
      return;
    }
    document.title = s.title + " — PAAIPE AI Portal";
    setText(document, "[data-ss-heading]", s.recordingUrl ? "Watch recording" : "Session");
    applySession(document, s);
    // No recording: say so plainly instead of showing a player that cannot play.
    if (!s.recordingUrl) {
      document.querySelectorAll("[data-ss-player]").forEach(p => {
        p.innerHTML =
          '<div style="padding:40px 24px;text-align:center;color:#fff">' +
          '<p style="margin:0 0 6px;font-weight:700;font-size:16px">The recording is not published yet</p>' +
          '<p style="margin:0;font-size:14px;opacity:.85">Session materials appear here as they are approved. ' +
          "The speaker's slides are already available below.</p></div>";
        p.style.background = "linear-gradient(160deg,#20304f,#2c3f63)";
      });
    }
    document.documentElement.setAttribute("data-session-view", s.id);
  }
})();
