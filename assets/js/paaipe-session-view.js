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
import {
  listPublishedSessions,
  listPublishedMicros,
  youtubeEmbedSrc,
  LEARNING_SOURCE,
} from "/assets/js/paaipe-learnings-data.js";

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
    // Stay inside the member portal — open the in-portal slides viewer, never gamma.app.
    a.href = `portal-session-slides.html?session=${encodeURIComponent(s.id)}`;
    a.removeAttribute("target");
    a.removeAttribute("rel");
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
  const hasQaRec = sessionRecordings(s).some(
    r => r.id === "qa" || /q\s*&?\s*a/i.test(r.title || "")
  );
  if (!s.qaCount && !hasQaRec) root.querySelectorAll("[data-ss-needs='qa']").forEach(hide);
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
  
function catalogHasReels() {
  return PAST_SESSIONS.some(s => sessionHasReels(s));
}

function applyReelsChrome(root = document) {
  const has = catalogHasReels();
  root.querySelectorAll('[data-ss-needs="reels"]').forEach(el => {
    if (!has) hide(el);
    else el.hidden = false;
  });
  root.querySelectorAll("[data-ss-tabs-reels]").forEach(el => {
    // Whole Recordings|Reels row only when reels exist; otherwise hide tabs entirely
    if (!has) hide(el);
    else el.hidden = false;
  });
}

  const page = document.documentElement.getAttribute("data-page");




  if (page === "sessions-hub") {
    // Sub-tabs: Sessions (default) | Micros.
    const tabs = [...document.querySelectorAll("[data-ss-hub-tab]")];
    const panels = {
      sessions: document.querySelector('[data-ss-hub-panel="sessions"]'),
      micros: document.querySelector('[data-ss-hub-panel="micros"]'),
    };
    function hubTabFromLocation() {
      const q = new URLSearchParams(location.search).get("tab");
      const h = /(?:^|#|&)tab=([a-z]+)/.exec(location.hash || "");
      const name = (q || (h && h[1]) || "").toLowerCase();
      return name === "micros" ? "micros" : "sessions";
    }
    function showHubTab(name, { focus = false, syncUrl = false } = {}) {
      const tab = name === "micros" ? "micros" : "sessions";
      tabs.forEach(t => {
        const on = t.getAttribute("data-ss-hub-tab") === tab;
        t.classList.toggle("on", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus();
      });
      Object.keys(panels).forEach(k => {
        if (!panels[k]) return;
        panels[k].hidden = k !== tab;
      });
      if (syncUrl) {
        const next = `#tab=${tab}`;
        if (location.hash !== next) history.replaceState(null, "", next);
      }
    }
    tabs.forEach(t => {
      t.addEventListener("click", () => showHubTab(t.getAttribute("data-ss-hub-tab"), { syncUrl: true }));
      t.addEventListener("keydown", e => {
        const i = tabs.indexOf(t);
        if (i < 0) return;
        let next = -1;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = tabs.length - 1;
        if (next < 0) return;
        e.preventDefault();
        showHubTab(tabs[next].getAttribute("data-ss-hub-tab"), { focus: true, syncUrl: true });
      });
    });
    showHubTab(hubTabFromLocation());
    window.addEventListener("hashchange", () => showHubTab(hubTabFromLocation()));

    const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    function mountYt(stage, row) {
      if (!stage) return;
      if (row.source === LEARNING_SOURCE.YOUTUBE && row.youtubeId) {
        const iframe = document.createElement("iframe");
        iframe.src = youtubeEmbedSrc(row.youtubeId);
        iframe.title = row.title || "Learning";
        iframe.setAttribute(
          "allow",
          "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        );
        iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
        // No top-navigation / popups — keep playback in-portal; no Open on YouTube CTA.
        iframe.setAttribute(
          "sandbox",
          "allow-scripts allow-same-origin allow-presentation allow-forms"
        );
        stage.appendChild(iframe);
        return;
      }
      if (row.posterUrl) {
        const img = document.createElement("img");
        img.src = row.posterUrl;
        img.alt = row.title || "";
        stage.appendChild(img);
        return;
      }
      stage.innerHTML =
        '<div style="padding:24px;color:#BFE3FA;font-size:13px;text-align:center">' +
        "This item has no playable YouTube source yet.</div>";
    }

    function renderSessions(rows) {
      const host = document.querySelector("[data-ss-live-sessions]");
      const empty = document.querySelector("[data-ss-sessions-empty]");
      const loading = document.querySelector("[data-ss-sessions-loading]");
      if (loading) loading.remove();
      const count = document.querySelector("[data-ss-session-count]");
      if (count) {
        count.textContent = rows.length === 1
          ? "1 published · 16:9"
          : `${rows.length} published · 16:9`;
      }
      if (!host) return;
      if (!rows.length) {
        host.innerHTML = "";
        if (empty) empty.hidden = false;
        return;
      }
      if (empty) empty.hidden = true;
      host.innerHTML = "";
      rows.forEach(row => {
        const el = document.createElement("article");
        el.className = "live-session";
        el.setAttribute("data-learn-id", row.id);
        const stage = document.createElement("div");
        stage.className = "stage";
        mountYt(stage, row);
        const meta = document.createElement("div");
        meta.innerHTML =
          `<b>${esc(row.title || "Untitled")}</b>` +
          (row.description
            ? `<p class="desc">${esc(row.description)}</p>`
            : "") +
          `<div class="src"><span class="pill info">${
            row.source === "upload" ? "Upload" : "YouTube"
          }</span></div>`;
        // Deliberately no "Open on YouTube" link.
        el.appendChild(stage);
        el.appendChild(meta);
        host.appendChild(el);
      });
    }

    function renderMicros(rows) {
      const empty = document.querySelector("[data-ss-micro-empty]");
      const grid = document.querySelector("[data-ss-live-micros]");
      const count = document.querySelector("[data-ss-micro-count]");
      if (count) {
        count.textContent = rows.length === 1
          ? "1 published · 9:16"
          : `${rows.length} published · 9:16`;
      }
      if (!grid) return;
      if (!rows.length) {
        if (empty) empty.hidden = false;
        grid.hidden = true;
        grid.innerHTML = "";
        return;
      }
      if (empty) hide(empty);
      grid.hidden = false;
      grid.innerHTML = "";
      rows.forEach(row => {
        const card = document.createElement("div");
        card.className = "micro-card";
        card.setAttribute("data-learn-id", row.id);
        const stage = document.createElement("div");
        stage.className = "stage";
        mountYt(stage, row);
        const cap = document.createElement("div");
        cap.className = "cap";
        cap.textContent = row.title || "Micro";
        card.appendChild(stage);
        card.appendChild(cap);
        grid.appendChild(card);
      });
    }

    (async () => {
      try {
        const [sessions, micros] = await Promise.all([
          listPublishedSessions(),
          listPublishedMicros(),
        ]);
        renderSessions(sessions);
        renderMicros(micros);
        document.documentElement.setAttribute(
          "data-sessions-ready",
          `live:${sessions.length}:${micros.length}`
        );
      } catch (ex) {
        const host = document.querySelector("[data-ss-live-sessions]");
        if (host) {
          host.innerHTML =
            `<p class="note">Published sessions could not be loaded just now. ` +
            `This is not an empty library — try again shortly.</p>`;
        }
        document.documentElement.setAttribute("data-sessions-ready", "error");
      }
    })();
    return;
  }

  if (page === "sessions-past") {
    // Full "All recordings" library — one row per landscape recording.
    const tpl = document.querySelector("[data-ss-item]");
    if (tpl) {
      const sessions = PAST_SESSIONS.filter(sessionHasRecording);
      const items = [];
      (sessions.length ? sessions : PAST_SESSIONS).forEach(s => {
        const recs = sessionRecordings(s);
        if (recs.length) recs.forEach(r => items.push({ session: s, rec: r }));
        else items.push({ session: s, rec: null });
      });
      setText(
        document,
        "[data-ss-count]",
        items.length === 1 ? "1 recording" : `${items.length} recordings`
      );
      const frag = document.createDocumentFragment();
      items.forEach(({ session: s, rec }) => {
        const el = tpl.cloneNode(true);
        el.removeAttribute("data-ss-item");
        const isQa = !!(rec && (rec.id === "qa" || /q\s*&?\s*a/i.test(rec.title || "")));
        applySession(el, s);
        if (rec && rec.title) setText(el, "[data-ss-title]", rec.title);
        if (rec && rec.thumb) {
          el.querySelectorAll("[data-ss-poster]").forEach(img => { img.src = rec.thumb; });
        }
        const watchUrl = rec
          ? `portal-session-watch.html?session=${encodeURIComponent(s.id)}&rec=${encodeURIComponent(rec.id)}`
          : `portal-session-watch.html?session=${encodeURIComponent(s.id)}`;
        el.querySelectorAll("[data-ss-watch]").forEach(a => {
          a.href = watchUrl;
          if (
            a.classList.contains("btn-gold") === false &&
            /continue watching/i.test(a.textContent || "")
          ) {
            if (s.resumeAt == null && s.watchedPercent == null) {
              a.textContent = "Watch";
            }
          }
        });
        const qa = sessionRecordings(s).find(r => r.id === "qa" || /q\s*&?\s*a/i.test(r.title || ""));
        el.querySelectorAll("[data-ss-needs='qa']").forEach(a => {
          if (!qa || isQa) return hide(a);
          a.href = `portal-session-watch.html?session=${encodeURIComponent(s.id)}&rec=${encodeURIComponent(qa.id)}`;
          a.textContent = "Q&A";
        });
        el.querySelectorAll("[data-ss-reels-row]").forEach(row => {
          if (!sessionHasReels(s)) hide(row);
        });
        frag.appendChild(el);
      });
      tpl.replaceWith(frag);
    }
    applyReelsChrome(document);
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
          '<div class="crumbs"><a href="portal-sessions-past.html">Recordings</a>' +
          "<span>&rsaquo;</span><span>Session not found</span></div>" +
          '<div class="card" style="text-align:center;padding:48px 24px">' +
          '<h1 style="font-size:22px;margin-bottom:8px">That session is not available</h1>' +
          '<p style="color:var(--muted);font-size:15px;margin:0 0 18px">' +
          (id
            ? "We could not find a session with that reference."
            : "No session was specified.") +
          '</p><a class="btn btn-gold" href="portal-sessions-past.html">Back to recordings</a></div>';
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
