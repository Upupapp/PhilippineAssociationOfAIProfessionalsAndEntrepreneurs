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

/** In-portal nocookie embed. Video id still appears in iframe src / network —
 *  unlisted ≠ DRM. controls=0 + a full grab shield block YouTube's link icon,
 *  "Watch on YouTube", and right-click "Copy video URL". Self-host is the only
 *  complete lock. */
function embedSrc(youtubeId) {
  const id = encodeURIComponent(youtubeId);
  const origin = encodeURIComponent(location.origin);
  return `https://www.youtube-nocookie.com/embed/${id}` +
    `?rel=0&modestbranding=1&playsinline=1&controls=0&disablekb=1` +
    `&enablejsapi=1&fs=0&iv_load_policy=3&origin=${origin}`;
}

let ytApiPromise = null;
function ensureYtApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise(resolve => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") prev();
      resolve(window.YT);
    };
    if (!document.querySelector("script[data-paaipe-yt-api]")) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
      tag.setAttribute("data-paaipe-yt-api", "1");
      document.head.appendChild(tag);
    }
  });
  return ytApiPromise;
}

function mountYtGrabShield(player) {
  // Full-surface shield: owns pointer events so YouTube chrome cannot be clicked
  // or right-clicked. Play/pause goes through the IFrame API instead.
  // Opaque corner plates hide the paused-state link icon (bottom-left) and
  // "Watch on YouTube" (bottom-right) that controls=0 does not remove.
  const grab = document.createElement("div");
  grab.setAttribute("data-yt-shield", "grab");
  grab.setAttribute("role", "button");
  grab.setAttribute("tabindex", "0");
  grab.setAttribute("aria-label", "Play or pause recording");
  grab.style.cssText =
    "position:absolute;inset:0;z-index:5;cursor:pointer;background:transparent;touch-action:manipulation";

  const plates = [
    // bottom-left chain/link control
    ["bl", "left:0;bottom:0;width:72px;height:72px"],
    // bottom-right Watch on YouTube
    ["br", "right:0;bottom:0;width:min(46%,220px);height:64px"],
    // top-right YouTube logo / share affordance
    ["tr", "top:0;right:0;width:min(30%,130px);height:56px"],
  ];
  plates.forEach(([kind, box]) => {
    const plate = document.createElement("div");
    plate.setAttribute("data-yt-plate", kind);
    plate.setAttribute("aria-hidden", "true");
    plate.style.cssText =
      `position:absolute;z-index:6;${box};background:#0a1c3e;pointer-events:auto`;
    plate.addEventListener("contextmenu", e => {
      e.preventDefault();
      e.stopPropagation();
    });
    // Plates sit on top of grab for paint; clicks on plates should still toggle.
    plate.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      grab.click();
    });
    player.appendChild(plate);
  });

  const blockMenu = e => {
    e.preventDefault();
    e.stopPropagation();
  };
  grab.addEventListener("contextmenu", blockMenu);
  player.addEventListener("contextmenu", blockMenu);

  const toggle = () => {
    const yt = player._ytPlayer;
    if (!yt || typeof yt.getPlayerState !== "function") return;
    const state = yt.getPlayerState();
    // 1 = playing, 3 = buffering — pause those; otherwise play
    if (state === 1 || state === 3) yt.pauseVideo();
    else yt.playVideo();
  };
  grab.addEventListener("click", e => {
    e.preventDefault();
    toggle();
  });
  grab.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  });
  player.appendChild(grab);
}

function mountEmbed(player, rec) {
  if (!player || !rec?.youtubeId) return;
  player.innerHTML = "";
  player.classList.add("is-embed");
  player.style.background = "#0a1c3e";
  if (getComputedStyle(player).position === "static") {
    player.style.position = "relative";
  }

  const frame = document.createElement("iframe");
  const frameId = "paaipe-yt-" + String(rec.id || rec.youtubeId).replace(/[^\w-]+/g, "");
  frame.id = frameId;
  frame.src = embedSrc(rec.youtubeId);
  frame.title = rec.title || "Session recording";
  frame.setAttribute(
    "allow",
    "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
  );
  frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  // No popups / top-navigation — logo and Watch links cannot open youtube.com.
  frame.setAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-presentation allow-forms"
  );
  Object.assign(frame.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    border: "0",
    pointerEvents: "none", // all interaction via grab shield + API
  });
  player.appendChild(frame);
  mountYtGrabShield(player);

  ensureYtApi().then(YT => {
    if (!player.isConnected || !document.getElementById(frameId)) return;
    player._ytPlayer = new YT.Player(frameId, {
      events: {
        onReady(ev) {
          player._ytPlayer = ev.target;
        },
      },
    });
  }).catch(() => {
    // API blocked: shield still stops right-click / chrome clicks
  });
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
        // Canonical slugs: presentation | qa. Legacy ids still accepted.
        const aliases = {
          "2026-09-part1": "presentation",
          "part1": "presentation",
          "part-1": "presentation",
          "2026-09-part2": "qa",
          "part2": "qa",
          "part-2": "qa",
          "q&a": "qa",
        };
        const key = aliases[wanted] || wanted;
        const hit = recordings.find(
          r => r.id === key || r.id === wanted || r.youtubeId === wanted
        );
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

    // Canonicalise the address bar to the clean rec slug (presentation|qa).
    {
      const url = new URL(location.href);
      url.searchParams.set("session", s.id);
      url.searchParams.set("rec", active.id);
      history.replaceState(null, "", url);
    }
    paint(active);
    document.documentElement.setAttribute("data-session-view", s.id);
    document.documentElement.setAttribute("data-ss-active-rec", active.id);
  }
})();
