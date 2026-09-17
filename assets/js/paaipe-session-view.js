/* Past sessions list and the session watch page.
 *
 * Both render from paaipe-sessions.js and hide every affordance whose artefact
 * does not exist. The mockup shipped a video player with no video, a resume
 * position, a watched percentage and an "Attended" badge - all invented. A play
 * button that cannot play is the same defect as a claim that cannot be true.
 *
 * Playback is in-portal only: youtube-nocookie embed into [data-ss-player].
 * No "Open on YouTube", no copyable URL field, no new-tab handoff. The video id
 * still appears in the iframe src / network traffic; unlisted ≠ DRM.
 */
import {
  PAST_SESSIONS,
  findSession,
  sessionRecordings,
  sessionHasRecording,
  sessionReels,
  sessionHasReels,
  sessionHasChapters,
} from "/assets/js/paaipe-sessions.js";

const hide = el => { if (el) el.style.display = "none"; };
const setText = (root, sel, text) =>
  root.querySelectorAll(sel).forEach(e => { e.textContent = text; });

/** Modest-branding nocookie embed. Id is unavoidable in src. */
function embedSrc(youtubeId) {
  const id = encodeURIComponent(youtubeId);
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`;
}

function mountEmbed(player, rec) {
  if (!player || !rec?.youtubeId) return;
  player.innerHTML = "";
  player.style.background = "#0a1c3e";
  // Fill the existing 16:9 .player box without inventing a parallel layout.
  const frame = document.createElement("iframe");
  frame.src = embedSrc(rec.youtubeId);
  frame.title = rec.title || "Session recording";
  frame.setAttribute("allowfullscreen", "");
  frame.setAttribute(
    "allow",
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  );
  frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  Object.assign(frame.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    border: "0",
  });
  // Ensure the player is a positioning context for the absolute iframe.
  if (getComputedStyle(player).position === "static") {
    player.style.position = "relative";
  }
  player.appendChild(frame);
}

/** Compact switcher when a session has more than one landscape recording. */
function mountRecordingSwitcher(player, recordings, activeId, onPick) {
  if (!player || recordings.length < 2) return;
  let bar = player.parentElement?.querySelector("[data-ss-rec-switch]");
  if (!bar) {
    bar = document.createElement("div");
    bar.setAttribute("data-ss-rec-switch", "");
    bar.style.cssText =
      "display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center";
    const label = document.createElement("span");
    label.textContent = "Recordings";
    label.style.cssText =
      "font-size:12.5px;font-weight:700;color:var(--navy);margin-right:4px";
    bar.appendChild(label);
    player.insertAdjacentElement("afterend", bar);
  } else {
    // Keep the label; rebuild buttons.
    bar.querySelectorAll("[data-ss-rec-id]").forEach(b => b.remove());
  }
  recordings.forEach(rec => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm " + (rec.id === activeId ? "btn-navy" : "btn-ghost");
    btn.setAttribute("data-ss-rec-id", rec.id);
    btn.textContent = rec.title || "Recording";
    btn.addEventListener("click", () => onPick(rec.id));
    bar.appendChild(btn);
  });
}

function applyMediaPills(root, s) {
  // Brief: pill shows Recording / Reels / both when present. Hide when neither.
  root.querySelectorAll("[data-ss-media-pill]").forEach(el => {
    const hasRec = sessionHasRecording(s);
    const hasReel = sessionHasReels(s);
    if (!hasRec && !hasReel) return hide(el);
    el.style.display = "";
    if (hasRec && hasReel) el.textContent = "Recording · Reels";
    else if (hasRec) el.textContent = "Recording";
    else el.textContent = "Reels";
  });
}

function applySession(root, s) {
  setText(root, "[data-ss-title]", s.title);
  setText(root, "[data-ss-edition]", s.edition);
  setText(root, "[data-ss-date]", s.dateLong);
  setText(root, "[data-ss-speaker]", s.speaker);
  setText(root, "[data-ss-host]", s.host);
  root.querySelectorAll("[data-ss-poster]").forEach(i => {
    i.src = s.poster;
    i.alt = s.edition;
  });

  // slides: real, and it is a Gamma deck rather than a PDF
  root.querySelectorAll("[data-ss-slides]").forEach(a => {
    if (!s.slidesUrl) return hide(a);
    a.href = s.slidesUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = s.slidesLabel || "Slides";
  });

  setText(root, "[data-ss-duration]", s.durationLabel || "");

  const hasRec = sessionHasRecording(s);
  const hasReel = sessionHasReels(s);

  // symmetric to data-ss-needs: shown ONLY while the artefact is absent
  root.querySelectorAll("[data-ss-unless='recording']").forEach(el => {
    if (hasRec) hide(el);
  });
  root.querySelectorAll("[data-ss-unless='reels']").forEach(el => {
    if (hasReel) hide(el);
  });

  // everything below is hidden unless the artefact or the per-member fact exists
  if (!hasRec) root.querySelectorAll("[data-ss-needs='recording']").forEach(hide);
  if (!hasReel) root.querySelectorAll("[data-ss-needs='reels']").forEach(hide);
  if (!sessionHasChapters(s)) root.querySelectorAll("[data-ss-needs='chapters']").forEach(hide);
  if (!s.durationLabel) root.querySelectorAll("[data-ss-needs='duration']").forEach(hide);
  if (!s.qaCount) root.querySelectorAll("[data-ss-needs='qa']").forEach(hide);
  if (!s.transcriptUrl) root.querySelectorAll("[data-ss-needs='transcript']").forEach(hide);
  if (s.attended == null) root.querySelectorAll("[data-ss-needs='attended']").forEach(hide);
  if (s.watchedPercent == null) root.querySelectorAll("[data-ss-needs='watched']").forEach(hide);
  if (s.resumeAt == null) root.querySelectorAll("[data-ss-needs='resume']").forEach(hide);

  applyMediaPills(root, s);
}

function watchMetaLine(s, rec) {
  // Honest meta: date + selected recording title. No invented duration / post date.
  const parts = [];
  if (s.dateLong) parts.push(`Recorded ${s.dateLong}`);
  if (rec?.title) parts.push(rec.title);
  if (s.durationLabel) parts.push(s.durationLabel);
  return parts.join(" · ");
}

(function () {
  const page = document.documentElement.getAttribute("data-page");

  if (page === "sessions-past") {
    // the template's own parent is the list; requiring a separate [data-ss-list]
    // container meant one missing attribute silently rendered nothing
    const tpl = document.querySelector("[data-ss-item]");
    if (tpl) {
      const count = PAST_SESSIONS.length;
      setText(
        document,
        "[data-ss-count]",
        count === 1 ? "1 past session" : `${count} past sessions`
      );
      const frag = document.createDocumentFragment();
      PAST_SESSIONS.forEach(s => {
        const el = tpl.cloneNode(true);
        el.removeAttribute("data-ss-item");
        el.querySelectorAll("[data-ss-watch]").forEach(a => {
          a.href = `portal-session-watch.html?session=${encodeURIComponent(s.id)}`;
        });
        applySession(el, s);
        // Compact reels row under the event — only if markup exists AND reels do.
        // This ticket ships empty reels; hide any stub so there is no dead carousel.
        el.querySelectorAll("[data-ss-reels-row]").forEach(row => {
          if (!sessionHasReels(s)) hide(row);
        });
        frag.appendChild(el);
      });
      tpl.replaceWith(frag);
    }
    document.documentElement.setAttribute(
      "data-sessions-ready",
      String(PAST_SESSIONS.length)
    );
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
    const params = new URLSearchParams(location.search);
    const id = params.get("session");
    const s = id ? findSession(id) : null;
    const main = document.querySelector("main.content");
    if (!s) {
      if (main)
        main.innerHTML =
          '<div class="crumbs"><a href="portal-sessions-past.html">Past &amp; recordings</a>' +
          "<span>&rsaquo;</span><span>Session not found</span></div>" +
          '<div class="card" style="text-align:center;padding:48px 24px">' +
          '<h1 style="font-size:22px;margin-bottom:8px">That session is not available</h1>' +
          '<p style="color:var(--muted);font-size:15px;margin:0 0 18px">' +
          (id
            ? "We could not find a session with that reference."
            : "No session was specified.") +
          '</p><a class="btn btn-gold" href="portal-sessions-past.html">Back to past sessions</a></div>';
      document.documentElement.setAttribute("data-session-view", "not-found");
      return;
    }

    const recordings = sessionRecordings(s);
    const hasRec = sessionHasRecording(s);

    document.title = s.title + " — PAAIPE AI Portal";
    setText(document, "[data-ss-heading]", hasRec ? "Watch recording" : "Session");
    applySession(document, s);

    // Hide empty reels chrome on Watch (brief: omit when empty).
    document.querySelectorAll("[data-ss-reels], [data-ss-reels-row]").forEach(el => {
      if (!sessionHasReels(s)) hide(el);
    });

    const players = document.querySelectorAll("[data-ss-player]");

    if (!hasRec || !recordings.length) {
      // No recording: say so plainly instead of showing a player that cannot play.
      players.forEach(p => {
        p.innerHTML =
          '<div style="padding:40px 24px;text-align:center;color:#fff">' +
          '<p style="margin:0 0 6px;font-weight:700;font-size:16px">The recording is not published yet</p>' +
          '<p style="margin:0;font-size:14px;opacity:.85">Session materials appear here as they are approved. ' +
          "The speaker's slides are already available below.</p></div>";
        p.style.background = "linear-gradient(160deg,#20304f,#2c3f63)";
      });
      document.documentElement.setAttribute("data-session-view", s.id);
      return;
    }

    const pickInitial = () => {
      const wanted = params.get("rec");
      if (wanted) {
        const hit = recordings.find(r => r.id === wanted || r.youtubeId === wanted);
        if (hit) return hit;
      }
      return recordings[0];
    };

    let active = pickInitial();

    const paint = rec => {
      active = rec;
      players.forEach(p => mountEmbed(p, rec));
      // Update honest meta under the stage if the page exposes a hook; otherwise
      // rewrite the invented "1 h 22 min · posted Sep 16" small next to the title.
      const meta = watchMetaLine(s, rec);
      document.querySelectorAll("[data-ss-watch-meta]").forEach(el => {
        el.textContent = meta;
      });
      // Fallback: the watch page shipped a hard-coded duration/post date in a
      // <small> beside the title. Replace that whole line so we do not claim it.
      document.querySelectorAll(".player + h1, [data-ss-player]").forEach(() => {});
      const titleEl = document.querySelector("[data-ss-title]");
      if (titleEl) {
        const small = titleEl.parentElement?.querySelector("small");
        if (small && !small.hasAttribute("data-ss-watch-meta")) {
          small.setAttribute("data-ss-watch-meta", "");
          small.textContent = meta;
        }
      }
      mountRecordingSwitcher(players[0], recordings, rec.id, nextId => {
        const next = recordings.find(r => r.id === nextId);
        if (!next) return;
        // Keep deep-linkable without leaving the portal.
        const url = new URL(location.href);
        url.searchParams.set("session", s.id);
        url.searchParams.set("rec", next.id);
        history.replaceState(null, "", url);
        paint(next);
      });
    };

    paint(active);
    document.documentElement.setAttribute("data-session-view", s.id);
    document.documentElement.setAttribute("data-ss-active-rec", active.id);
  }
})();
