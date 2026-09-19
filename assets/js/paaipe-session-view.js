/* Past sessions list and the session watch page.
 *
 * Both render from paaipe-sessions.js and hide every affordance whose artefact
 * does not exist. The mockup shipped a video player with no video, a resume
 * position, a watched percentage and an "Attended" badge - all invented. A play
 * button that cannot play is the same defect as a claim that cannot be true.
 *
 * Playback is in-portal only. YouTube uses a nocookie embed + grab shield.
 * source=upload uses a native <video> whose src is the row's storagePath on
 * media.paaipe.org (never invented). Learnings cards open a centered popup
 * (16:9 sessions, 9:16 micros). No "Open on YouTube", no copyable URL field,
 * no new-tab handoff. The YouTube id still appears in the iframe src /
 * network traffic; unlisted ≠ DRM.
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
import {
  listPublishedPlaylists,
  groupLearningsByPlaylist,
  playlistForItem,
} from "/assets/js/paaipe-playlists-data.js";
import { currentAgent } from "/assets/js/paaipe-firebase.js";
import { readHash, readView, patchHash, writeHash, onViewChange } from "/assets/js/paaipe-view-url.js";

/** Portal-only deep link. Pretty path, never a CDN or YouTube URL. */
export function portalPlayPath(kind, id) {
  const tab = kind === "micros" ? "micros" : "sessions";
  const safe = String(id || "").trim();
  if (!safe || /[^\w-]/.test(safe)) return "";
  return `/portal-sessions#tab=${tab}&play=${safe}`;
}

export function portalPlayUrl(kind, id) {
  const path = portalPlayPath(kind, id);
  return path ? `${location.origin}${path}` : "";
}

function toastChrome(pop, msg) {
  const el = pop?.querySelector("[data-ss-watch-toast]");
  if (!el) return;
  el.textContent = msg;
  el.hidden = !msg;
}

async function copyPortalLink(url) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      return;
    }
  } catch { /* fall through */ }
  const ta = document.createElement("textarea");
  ta.value = url;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

async function shareOrCopyLink(title, url, pop) {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: title || "PAAIPE Learnings", url });
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
  }
  await copyPortalLink(url);
  toastChrome(pop, "Link copied");
}

const hide = el => { if (el) el.style.display = "none"; };
const setText = (root, sel, text) =>
  root.querySelectorAll(sel).forEach(e => { e.textContent = text; });

/** In-portal nocookie embed. Video id still appears in iframe src / network —
 *  unlisted ≠ DRM. controls=0 + a full grab shield block YouTube's link icon,
 *  "Watch on YouTube", title link, and right-click "Copy video URL". Self-host
 *  is the only complete lock. */
function embedSrc(youtubeId, { autoplay = false } = {}) {
  return youtubeEmbedSrc(youtubeId, { autoplay });
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
    // top-left title that navigates to YouTube
    ["tl", "left:0;top:0;width:min(72%,360px);height:64px"],
    // top-right YouTube logo / share affordance
    ["tr", "top:0;right:0;width:min(36%,150px);height:64px"],
    // bottom-left chain/link control
    ["bl", "left:0;bottom:0;width:88px;height:88px"],
    // bottom-right Watch on YouTube watermark
    ["br", "right:0;bottom:0;width:min(55%,260px);height:72px"],
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
      return;
    }
    // Swallow YouTube shortcuts (f = fullscreen / open on YouTube family).
    // Tab stays available so the close control remains reachable.
    if (e.key === "Tab" || e.key === "Escape") return;
    e.preventDefault();
  });
  player.appendChild(grab);
}

/** Playback URL for an upload row. Uses storagePath as-is when it already
 *  starts with http; otherwise prefixes https://media.paaipe.org/. */
function mediaPlaybackUrl(storagePath) {
  const raw = String(storagePath ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://media.paaipe.org/${raw.replace(/^\/+/, "")}`;
}

function isUploadPlayable(row) {
  return row?.source === LEARNING_SOURCE.UPLOAD && !!mediaPlaybackUrl(row.storagePath);
}

function destroyEmbed(player) {
  if (!player) return;
  try { player._ytPlayer?.destroy?.(); } catch { /* already gone */ }
  player._ytPlayer = null;
  player.querySelectorAll("video").forEach(v => {
    try { v.pause(); v.removeAttribute("src"); v.load(); } catch { /* ignore */ }
  });
  player.innerHTML = "";
}

function fillPlayerBox(el) {
  Object.assign(el.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    border: "0",
  });
}

function mountUploadVideo(player, rec, { autoplay = false } = {}) {
  const url = mediaPlaybackUrl(rec?.storagePath);
  if (!player || !url) return;
  destroyEmbed(player);
  player.classList.add("is-embed");
  player.style.background = "#0a1c3e";
  if (getComputedStyle(player).position === "static") {
    player.style.position = "relative";
  }
  const video = document.createElement("video");
  video.src = url;
  video.controls = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("controls", "");
  video.setAttribute("controlslist", "nodownload");
  video.controlsList = "nodownload";
  video.preload = "metadata";
  if (rec.posterUrl) video.poster = rec.posterUrl;
  video.title = rec.title || "Session recording";
  fillPlayerBox(video);
  video.style.objectFit = "contain";
  video.style.background = "#0a1c3e";
  player.appendChild(video);
  if (autoplay) {
    video.autoplay = true;
    video.play().catch(() => { /* browser may block autoplay until a gesture */ });
  }
}

function mountEmbed(player, rec, { autoplay = false } = {}) {
  if (!player || !rec) return;
  if (isUploadPlayable(rec)) {
    mountUploadVideo(player, rec, { autoplay });
    return;
  }
  if (!rec.youtubeId) return;
  destroyEmbed(player);
  player.classList.add("is-embed");
  player.style.background = "#0a1c3e";
  if (getComputedStyle(player).position === "static") {
    player.style.position = "relative";
  }

  const frame = document.createElement("iframe");
  const frameId = "paaipe-yt-" + String(rec.id || rec.youtubeId).replace(/[^\w-]+/g, "");
  frame.id = frameId;
  frame.src = embedSrc(rec.youtubeId, { autoplay });
  frame.title = rec.title || "Session recording";
  // No PiP / fullscreen / web-share — those reopen YouTube chrome.
  frame.setAttribute("allow", "accelerometer; autoplay; encrypted-media; gyroscope");
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
      playerVars: { fs: 0, disablekb: 1, modestbranding: 1, rel: 0, controls: 0 },
      events: {
        onReady(ev) {
          player._ytPlayer = ev.target;
          try { ev.target.setOption?.("fullscreen", false); } catch { /* ignore */ }
          if (autoplay) ev.target.playVideo();
        },
      },
    });
  }).catch(() => {
    // API blocked: shield still stops right-click / chrome clicks
  });
}

const PLAY_ICON =
  '<span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.14v13.72L19.5 12z"/></svg></span>';

function posterUrlFor(row) {
  if (row?.posterUrl) return row.posterUrl;
  if (row?.youtubeId) {
    return `https://i.ytimg.com/vi/${encodeURIComponent(row.youtubeId)}/hqdefault.jpg`;
  }
  return "";
}

function closeWatchPopup({ silent = false } = {}) {
  const pop = document.querySelector("[data-ss-watch-popup]");
  if (!pop || pop.hidden) return;
  destroyEmbed(pop.querySelector("[data-ss-popup-player]"));
  pop.hidden = true;
  pop.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  const opener = pop._opener;
  pop._opener = null;
  if (opener && typeof opener.focus === "function") opener.focus();
  if (!silent && readHash().play) patchHash({ play: "" }, { push: true });
}

function ensureWatchPopup() {
  let pop = document.querySelector("[data-ss-watch-popup]");
  if (pop) return pop;
  pop = document.createElement("div");
  pop.className = "ss-watch-popup";
  pop.setAttribute("data-ss-watch-popup", "");
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-modal", "true");
  pop.setAttribute("aria-label", "Session recording");
  pop.hidden = true;
  pop.innerHTML =
    `<div class="ss-watch-scrim" data-ss-watch-close></div>` +
    `<div class="ss-watch-frame">` +
      `<div class="ss-watch-chrome" data-ss-watch-chrome hidden>` +
        `<div class="ss-watch-copy">` +
          `<b data-ss-watch-title></b>` +
          `<p data-ss-watch-desc hidden></p>` +
        `</div>` +
        `<div class="ss-watch-actions">` +
          `<button type="button" class="btn btn-ghost btn-sm" data-ss-share>Share</button>` +
          `<button type="button" class="btn btn-ghost btn-sm" data-ss-copy-link>Copy link</button>` +
          `<span class="ss-watch-toast" data-ss-watch-toast hidden></span>` +
        `</div>` +
      `</div>` +
      `<div class="ss-watch-panel" data-ss-watch-panel data-aspect="16:9">` +
        `<button type="button" class="ss-watch-close" data-ss-watch-close aria-label="Close">` +
          `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>` +
        `</button>` +
        `<div class="ss-watch-stage is-embed" data-ss-popup-player></div>` +
      `</div>` +
    `</div>`;
  document.body.appendChild(pop);
  pop.addEventListener("contextmenu", e => {
    if (e.target.closest("[data-yt-shield], [data-yt-plate]")) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
  pop.addEventListener("click", e => {
    if (e.target.closest("[data-ss-watch-close]")) return closeWatchPopup();
    const share = e.target.closest("[data-ss-share]");
    const copy = e.target.closest("[data-ss-copy-link]");
    if (!share && !copy) return;
    const url = portalPlayUrl(pop._playKind, pop._rowId);
    if (!url) return;
    e.preventDefault();
    const title = pop.querySelector("[data-ss-watch-title]")?.textContent || "";
    toastChrome(pop, "");
    if (share) return shareOrCopyLink(title, url, pop);
    return copyPortalLink(url).then(() => toastChrome(pop, "Link copied"));
  });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || pop.hidden) return;
    e.preventDefault();
    closeWatchPopup();
  });
  return pop;
}

function paintWatchChrome(pop, row, playlist) {
  const chrome = pop.querySelector("[data-ss-watch-chrome]");
  const titleEl = pop.querySelector("[data-ss-watch-title]");
  const descEl = pop.querySelector("[data-ss-watch-desc]");
  if (!chrome || !titleEl) return;
  const title = String(row?.title || "").trim();
  const desc = String(playlist?.description || row?.description || "").trim();
  chrome.hidden = false;
  titleEl.textContent = title;
  if (descEl) {
    descEl.textContent = desc;
    descEl.hidden = !desc;
  }
  toastChrome(pop, "");
}

function openWatchPopup(row, { aspect = "16:9", opener = null, syncUrl = true, playlist = null, kind = null } = {}) {
  if (!isUploadPlayable(row) && !row?.youtubeId) return;
  const pop = ensureWatchPopup();
  const panel = pop.querySelector("[data-ss-watch-panel]");
  const stage = pop.querySelector("[data-ss-popup-player]");
  const playKind = kind === "micros" || aspect === "9:16" ? "micros" : "sessions";
  panel.setAttribute("data-aspect", playKind === "micros" ? "9:16" : "16:9");
  pop.setAttribute("aria-label", row.title || "Session recording");
  pop._opener = opener;
  pop._rowId = row.id;
  pop._playKind = playKind;
  pop.hidden = false;
  pop.removeAttribute("aria-hidden");
  document.body.style.overflow = "hidden";
  paintWatchChrome(pop, row, playlist);
  mountEmbed(stage, row, { autoplay: true });
  pop.querySelector(".ss-watch-close")?.focus();
  if (syncUrl && row.id && readHash().play !== row.id) {
    patchHash({ play: row.id }, { push: true });
  }
}

function mountPlayStage(stage, row, { aspect = "16:9" } = {}) {
  if (!stage) return;
  stage.innerHTML = "";
  const uploadUrl = isUploadPlayable(row) ? mediaPlaybackUrl(row.storagePath) : "";
  const youtubePlayable = row.source === LEARNING_SOURCE.YOUTUBE && row.youtubeId;
  if (youtubePlayable || uploadUrl) {
    const poster = posterUrlFor(row);
    if (poster) {
      const img = document.createElement("img");
      img.src = poster;
      img.alt = "";
      img.draggable = false;
      stage.appendChild(img);
    } else if (uploadUrl) {
      const preview = document.createElement("video");
      preview.src = uploadUrl;
      preview.muted = true;
      preview.playsInline = true;
      preview.setAttribute("playsinline", "");
      preview.preload = "metadata";
      preview.setAttribute("aria-hidden", "true");
      preview.draggable = false;
      Object.assign(preview.style, {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
      });
      stage.appendChild(preview);
    }
    const play = document.createElement("button");
    play.type = "button";
    play.className = "ss-play";
    play.setAttribute("data-ss-open-player", "");
    play.setAttribute("aria-label", `Play ${row.title || "recording"}`);
    play.innerHTML = PLAY_ICON;
    play.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      openWatchPopup(row, {
        aspect,
        opener: play,
        playlist: row._playlist || null,
        kind: aspect === "9:16" ? "micros" : "sessions",
      });
    });
    stage.appendChild(play);
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
    // Stay on the in-portal slides page (Gamma cannot be framed; that page
    // hosts the deck or an on-brand Open control, plus the do-not-repost notice).
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
    // Sub-tabs: Sessions (default) | Micros | Playlists. Nested play popup is #tab=&play=.
    const tabs = [...document.querySelectorAll("[data-ss-hub-tab]")];
    const panels = {
      sessions: document.querySelector('[data-ss-hub-panel="sessions"]'),
      micros: document.querySelector('[data-ss-hub-panel="micros"]'),
      playlists: document.querySelector('[data-ss-hub-panel="playlists"]'),
    };
    const HUB = {
      sessions: [],
      micros: [],
      playlists: { all: [], sessions: [], micros: [] },
      playlistsError: false,
    };
    function hubTabFromLocation() {
      // Hash is the live contract (#tab=sessions|#tab=micros|#tab=playlists).
      // ?tab= still opens the same view so a half-written query link keeps working.
      const name = String(readView().tab || "").toLowerCase();
      if (name === "micros") return "micros";
      if (name === "playlists") return "playlists";
      return "sessions";
    }
    function showHubTab(name, { focus = false, syncUrl = false } = {}) {
      const tab = name === "micros" ? "micros"
        : name === "playlists" ? "playlists"
        : "sessions";
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
        const next = { tab };
        writeHash(next, { push: true });
        closeWatchPopup({ silent: true });
      }
    }
    async function playFromLocation() {
      const id = readHash().play;
      const tab = hubTabFromLocation();
      if (!id) {
        closeWatchPopup({ silent: true });
        return;
      }
      const me = await currentAgent().catch(() => null);
      if (!me) {
        closeWatchPopup({ silent: true });
        return;
      }
      const row = (tab === "micros" ? HUB.micros : HUB.sessions).find(r => r.id === id)
        || HUB.sessions.find(r => r.id === id)
        || HUB.micros.find(r => r.id === id);
      const pop = document.querySelector("[data-ss-watch-popup]");
      if (row && pop && !pop.hidden && pop._rowId === row.id) return;
      if (row) {
        const isMicro = HUB.micros.some(r => r.id === id);
        showHubTab(tab === "playlists"
          ? "playlists"
          : (isMicro && !HUB.sessions.some(r => r.id === id) ? "micros" : tab));
        const playlist = playlistForItem(
          HUB.playlists.all.length
            ? HUB.playlists.all
            : HUB.playlists[isMicro ? "micros" : "sessions"],
          row.id
        );
        openWatchPopup(row, {
          aspect: isMicro ? "9:16" : "16:9",
          syncUrl: false,
          playlist,
          kind: isMicro ? "micros" : "sessions",
        });
      } else {
        closeWatchPopup({ silent: true });
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
    document.querySelector("[data-ss-playlists-all]")?.addEventListener("click", e => {
      e.preventDefault();
      writeHash({ tab: "playlists" }, { push: true });
    });
    onViewChange(() => {
      showHubTab(hubTabFromLocation());
      renderPlaylists(HUB.playlists.all, {
        loadError: HUB.playlistsError,
      });
      playFromLocation();
    });

    const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    function mountYt(stage, row, aspect) {
      // Poster + play only. A live iframe in the card exposes YouTube's share
      // chain, Watch on YouTube, and Copy video URL. Playback is the popup.
      mountPlayStage(stage, row, { aspect });
    }

    function playlistHead(playlist) {
      const head = document.createElement("header");
      head.className = "playlist-head";
      head.setAttribute("data-playlist-id", playlist.id);
      const h = document.createElement("h3");
      h.textContent = playlist.title || "Playlist";
      head.appendChild(h);
      if (playlist.description) {
        const p = document.createElement("p");
        p.textContent = playlist.description;
        head.appendChild(p);
      }
      return head;
    }

    function sessionCard(row, { inPlaylist = false, playlist = null } = {}) {
      const el = document.createElement("article");
      el.className = "live-session";
      el.setAttribute("data-learn-id", row.id);
      const withPl = { ...row, _playlist: playlist };
      const stage = document.createElement("div");
      stage.className = "stage";
      mountYt(stage, withPl, "16:9");
      const meta = document.createElement("div");
      meta.innerHTML =
        `<b>${esc(row.title || "Untitled")}</b>` +
        (!inPlaylist && row.description
          ? `<p class="desc">${esc(row.description)}</p>`
          : "") +
        `<div class="src"><span class="pill info">${
          row.source === "upload" ? "Upload" : "YouTube"
        }</span></div>`;
      el.appendChild(stage);
      el.appendChild(meta);
      return el;
    }

    function microCard(row, playlist = null) {
      const card = document.createElement("div");
      card.className = "micro-card";
      card.setAttribute("data-learn-id", row.id);
      const withPl = { ...row, _playlist: playlist };
      const stage = document.createElement("div");
      stage.className = "stage";
      mountYt(stage, withPl, "9:16");
      const cap = document.createElement("div");
      cap.className = "cap";
      cap.textContent = row.title || "Micro";
      card.appendChild(stage);
      card.appendChild(cap);
      return card;
    }

    function renderSessions(rows, playlists = []) {
      const host = document.querySelector("[data-ss-live-sessions]");
      const empty = document.querySelector("[data-ss-sessions-empty]");
      const loading = document.querySelector("[data-ss-sessions-loading]");
      if (loading) loading.remove();
      const count = document.querySelector("[data-ss-session-count]");
      const { groups, ungrouped } = groupLearningsByPlaylist(rows, playlists);
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
      groups.forEach(({ playlist, items }) => {
        const block = document.createElement("section");
        block.className = "playlist-block";
        block.setAttribute("data-playlist", playlist.id);
        block.appendChild(playlistHead(playlist));
        items.forEach(row => block.appendChild(sessionCard(row, { inPlaylist: true, playlist })));
        host.appendChild(block);
      });
      ungrouped.forEach(row => host.appendChild(sessionCard(row)));
    }

    function renderMicros(rows, playlists = []) {
      const empty = document.querySelector("[data-ss-micro-empty]");
      const host = document.querySelector("[data-ss-live-micros]");
      const count = document.querySelector("[data-ss-micro-count]");
      const { groups, ungrouped } = groupLearningsByPlaylist(rows, playlists);
      if (count) {
        count.textContent = rows.length === 1
          ? "1 published · 9:16"
          : `${rows.length} published · 9:16`;
      }
      if (!host) return;
      if (!rows.length) {
        if (empty) empty.hidden = false;
        host.hidden = true;
        host.innerHTML = "";
        return;
      }
      if (empty) hide(empty);
      host.hidden = false;
      host.innerHTML = "";
      groups.forEach(({ playlist, items }) => {
        const block = document.createElement("section");
        block.className = "playlist-block";
        block.setAttribute("data-playlist", playlist.id);
        block.appendChild(playlistHead(playlist));
        const grid = document.createElement("div");
        grid.className = "micro-grid";
        items.forEach(row => grid.appendChild(microCard(row, playlist)));
        block.appendChild(grid);
        host.appendChild(block);
      });
      if (ungrouped.length) {
        const grid = document.createElement("div");
        grid.className = "micro-grid";
        ungrouped.forEach(row => grid.appendChild(microCard(row)));
        host.appendChild(grid);
      }
    }

    function playlistKindLabel(kind) {
      return kind === "micros" ? "Micros" : "Sessions";
    }

    function itemsForPlaylist(playlist) {
      const pool = playlist?.kind === "micros" ? HUB.micros : HUB.sessions;
      const { groups } = groupLearningsByPlaylist(pool, [playlist]);
      return groups[0]?.items || [];
    }

    function firstPlayable(items) {
      return (items || []).find(row => isUploadPlayable(row) || row?.youtubeId) || null;
    }

    function renderPlaylists(playlists, { loadError = false } = {}) {
      const host = document.querySelector("[data-ss-live-playlists]");
      const empty = document.querySelector("[data-ss-playlists-empty]");
      const loading = document.querySelector("[data-ss-playlists-loading]");
      const count = document.querySelector("[data-ss-playlist-count]");
      const back = document.querySelector("[data-ss-playlists-all]");
      if (loading) loading.remove();
      if (!host) return;

      const published = (playlists || []).filter(p => p && p.status === "published");
      if (count) {
        count.textContent = published.length === 1
          ? "1 published"
          : `${published.length} published`;
      }

      if (loadError) {
        if (empty) empty.hidden = true;
        if (back) back.hidden = true;
        host.innerHTML =
          `<p class="note">Published playlists could not be loaded just now. ` +
          `This is not an empty library — try again shortly.</p>`;
        return;
      }

      if (!published.length) {
        host.innerHTML = "";
        if (empty) empty.hidden = false;
        if (back) back.hidden = true;
        return;
      }
      if (empty) empty.hidden = true;

      const openId = String(readView().playlist || "").trim();
      const open = published.find(p => p.id === openId) || null;
      if (back) back.hidden = !open;

      if (open) {
        const items = itemsForPlaylist(open);
        host.innerHTML = "";
        const block = document.createElement("section");
        block.className = "playlist-block";
        block.setAttribute("data-playlist", open.id);
        block.appendChild(playlistHead(open));
        if (!items.length) {
          const note = document.createElement("p");
          note.className = "note";
          note.textContent = "This Playlist has no published items to show yet.";
          block.appendChild(note);
        } else if (open.kind === "micros") {
          const grid = document.createElement("div");
          grid.className = "micro-grid";
          items.forEach(row => grid.appendChild(microCard(row, open)));
          block.appendChild(grid);
        } else {
          items.forEach(row => block.appendChild(sessionCard(row, {
            inPlaylist: true,
            playlist: open,
          })));
        }
        host.appendChild(block);
        return;
      }

      host.innerHTML = "";
      published.forEach(pl => {
        const items = itemsForPlaylist(pl);
        const n = items.length;
        const meta = n === 1 ? "1 item" : `${n} items`;
        const el = document.createElement("div");
        el.className = "row";
        el.setAttribute("data-playlist", pl.id);
        const bits = [pl.description, meta].filter(Boolean);
        el.innerHTML =
          `<span class="pill info">${esc(playlistKindLabel(pl.kind))}</span>` +
          `<div><b>${esc(pl.title || "Playlist")}</b>` +
            (bits.length ? `<small style="color:var(--muted)">${esc(bits.join(" · "))}</small>` : "") +
          `</div>` +
          `<div class="acts">` +
            `<button type="button" class="btn btn-gold btn-sm" data-ss-open-playlist>Open</button>` +
          `</div>`;
        const go = playFirst => {
          const first = playFirst ? firstPlayable(items) : null;
          writeHash({
            tab: "playlists",
            playlist: pl.id,
            ...(first ? { play: first.id } : {}),
          }, { push: true });
        };
        el.querySelector("[data-ss-open-playlist]").addEventListener("click", e => {
          e.preventDefault();
          e.stopPropagation();
          go(true);
        });
        el.addEventListener("click", e => {
          if (e.target.closest("[data-ss-open-playlist]")) return;
          e.preventDefault();
          go(false);
        });
        host.appendChild(el);
      });
    }

    function loadOne(loader) {
      return loader().then(
        value => ({ ok: true, value }),
        error => ({ ok: false, error, value: [] })
      );
    }

    function splitPlaylists(rows) {
      const all = Array.isArray(rows) ? rows : [];
      return {
        all,
        sessions: all.filter(p => p.kind === "sessions"),
        micros: all.filter(p => p.kind === "micros"),
      };
    }

    (async () => {
      // Isolate fetches: a playlist permission error must not blank Sessions/Micros.
      const [sessionRes, microRes, playlistRes] = await Promise.all([
        loadOne(listPublishedSessions),
        loadOne(listPublishedMicros),
        loadOne(() => listPublishedPlaylists()),
      ]);
      HUB.sessions = sessionRes.value;
      HUB.micros = microRes.value;
      HUB.playlists = splitPlaylists(playlistRes.value);
      HUB.playlistsError = !playlistRes.ok;
      if (!sessionRes.ok) {
        const host = document.querySelector("[data-ss-live-sessions]");
        if (host) {
          host.innerHTML =
            `<p class="note">Published sessions could not be loaded just now. ` +
            `This is not an empty library — try again shortly.</p>`;
        }
      } else {
        renderSessions(HUB.sessions, HUB.playlists.sessions);
      }
      if (!microRes.ok) {
        const host = document.querySelector("[data-ss-live-micros]");
        const empty = document.querySelector("[data-ss-micro-empty]");
        if (empty) hide(empty);
        if (host) {
          host.hidden = false;
          host.innerHTML =
            `<p class="note">Published micros could not be loaded just now. ` +
            `This is not an empty library — try again shortly.</p>`;
        }
      } else {
        renderMicros(HUB.micros, HUB.playlists.micros);
      }
      renderPlaylists(HUB.playlists.all, { loadError: HUB.playlistsError });
      document.documentElement.setAttribute(
        "data-sessions-ready",
        (!sessionRes.ok && !microRes.ok)
          ? "error"
          : `live:${HUB.sessions.length}:${HUB.micros.length}:${HUB.playlists.all.length}`
      );
      playFromLocation();
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
        history.pushState({ paaipeView: 1 }, "", url);
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
    onViewChange(() => {
      const next = pickInitial();
      if (next && next.id !== active.id) paint(next);
      document.documentElement.setAttribute("data-ss-active-rec", active.id);
    });
  }
})();
