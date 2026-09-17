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
    // Sub-tabs: Sessions (default) | Micros. Micros is the only reels surface.
    const tabs = [...document.querySelectorAll("[data-ss-hub-tab]")];
    const panels = {
      sessions: document.querySelector('[data-ss-hub-panel="sessions"]'),
      micros: document.querySelector('[data-ss-hub-panel="micros"]'),
    };
    function showHubTab(name, { focus = false } = {}) {
      tabs.forEach(t => {
        const on = t.getAttribute("data-ss-hub-tab") === name;
        t.classList.toggle("on", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        if (on && focus) t.focus();
      });
      Object.keys(panels).forEach(k => {
        if (!panels[k]) return;
        panels[k].hidden = k !== name;
      });
    }
    tabs.forEach(t => {
      t.addEventListener("click", () => showHubTab(t.getAttribute("data-ss-hub-tab")));
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
        showHubTab(tabs[next].getAttribute("data-ss-hub-tab"), { focus: true });
      });
    });
    showHubTab("sessions");

    // Micros: honest empty state today; 9:16 grid only when reels exist.
    const allReels = [];
    PAST_SESSIONS.forEach(s => {
      sessionReels(s).forEach(r => allReels.push({ session: s, reel: r }));
    });
    const microEmpty = document.querySelector("[data-ss-micro-empty]");
    const microGrid = document.querySelector("[data-ss-micro-grid]");
    if (allReels.length && microGrid) {
      if (microEmpty) hide(microEmpty);
      microGrid.hidden = false;
      microGrid.innerHTML = "";
      allReels.forEach(({ session: s, reel: r }) => {
        const a = document.createElement("a");
        a.className = "micro-card";
        a.href = `portal-session-watch.html?session=${encodeURIComponent(s.id)}&rec=${encodeURIComponent(r.id || "reel")}`;
        const img = document.createElement("img");
        img.src = r.thumb || s.poster || "assets/img/ai-exchange-session.jpg";
        img.alt = r.title || s.title || "Micro";
        const cap = document.createElement("div");
        cap.className = "cap";
        cap.textContent = r.title || s.title || "Micro";
        a.appendChild(img);
        a.appendChild(cap);
        microGrid.appendChild(a);
      });
    } else {
      if (microEmpty) microEmpty.hidden = false;
      if (microGrid) hide(microGrid);
    }

    const withRec = PAST_SESSIONS.filter(sessionHasRecording);
    const latest = withRec[0] || PAST_SESSIONS[0] || null;

    // Continue learning: latest published recording. Never invent progress %.
    const cont = document.querySelector("[data-ss-continue]");
    if (cont && latest) {
      applySession(cont, latest);
      const recs = sessionRecordings(latest);
      const first = recs[0];
      const watchUrl = first
        ? `portal-session-watch.html?session=${encodeURIComponent(latest.id)}&rec=${encodeURIComponent(first.id)}`
        : `portal-session-watch.html?session=${encodeURIComponent(latest.id)}`;
      cont.querySelectorAll("[data-ss-watch]").forEach(a => { a.href = watchUrl; });
      if (first && first.title) setText(cont, "[data-ss-title]", first.title);
      const label = cont.querySelector("[data-ss-continue-label]");
      const primary = cont.querySelector("a.btn-gold[data-ss-watch]");
      if (latest.resumeAt != null || latest.watchedPercent != null) {
        if (label) label.textContent = "Continue learning";
        if (primary) primary.textContent = "Continue watching";
      } else {
        if (label) label.textContent = "Latest recording";
        if (primary) primary.textContent = "Watch";
      }
      const qa = recs.find(r => r.id === "qa" || /q\s*&?\s*a/i.test(r.title || ""));
      cont.querySelectorAll("[data-ss-needs='qa']").forEach(a => {
        if (!qa) return;
        a.href = `portal-session-watch.html?session=${encodeURIComponent(latest.id)}&rec=${encodeURIComponent(qa.id)}`;
        a.textContent = "Q&A";
      });
    } else if (cont) {
      hide(cont);
    }

    // Library lists each landscape recording as its own row (Part 1 + Part 2
    // both visible). Session-level slides still link from every sibling row.
    const tpl = document.querySelector("[data-ss-lesson]");
    const list = document.querySelector("[data-ss-lesson-list]");
    if (tpl && list) {
      const sessions = withRec.length ? withRec : PAST_SESSIONS;
      const items = [];
      sessions.forEach(s => {
        const recs = sessionRecordings(s);
        if (recs.length) {
          recs.forEach(r => items.push({ session: s, rec: r }));
        } else if (sessionHasRecording(s)) {
          items.push({ session: s, rec: null });
        }
      });

      setText(
        document,
        "[data-ss-count]",
        items.length === 1 ? "1 recording" : `${items.length} recordings`
      );

      // Speaker select from distinct catalog speakers (no invented names).
      const speakerSel = document.querySelector("[data-ss-filter-speaker]");
      if (speakerSel) {
        const speakers = [...new Set(sessions.map(s => s.speaker).filter(Boolean))].sort();
        speakers.forEach(name => {
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          speakerSel.appendChild(opt);
        });
      }

      const frag = document.createDocumentFragment();
      items.forEach(({ session: s, rec }) => {
        const el = tpl.cloneNode(true);
        el.removeAttribute("data-ss-lesson");
        el.hidden = false;
        el.style.display = "";
        const recId = rec ? rec.id : "";
        const isQa = !!(rec && (rec.id === "qa" || /q\s*&?\s*a/i.test(rec.title || "")));
        el.setAttribute("data-ss-lesson-id", recId ? `${s.id}::${recId}` : s.id);
        el.setAttribute("data-ss-session-id", s.id);
        el.setAttribute("data-ss-rec-id", recId);
        el.setAttribute("data-ss-has-recording", "1");
        el.setAttribute("data-ss-has-slides", s.slidesUrl ? "1" : "0");
        el.setAttribute("data-ss-has-qa", isQa ? "1" : "0");
        el.setAttribute("data-ss-speaker", s.speaker || "");
        applySession(el, s);
        // Title = recording part name; keep edition/speaker from session.
        const partTitle = rec && rec.title
          ? rec.title
          : s.title;
        setText(el, "[data-ss-title]", partTitle);
        if (rec && rec.thumb) {
          el.querySelectorAll("[data-ss-poster]").forEach(img => {
            img.src = rec.thumb;
          });
        }
        const pill = el.querySelector("[data-ss-needs='recording']");
        if (pill) pill.textContent = isQa ? "Q&A" : "Recording";
        const watchUrl = rec
          ? `portal-session-watch.html?session=${encodeURIComponent(s.id)}&rec=${encodeURIComponent(rec.id)}`
          : `portal-session-watch.html?session=${encodeURIComponent(s.id)}`;
        el.querySelectorAll("[data-ss-watch]").forEach(a => { a.href = watchUrl; });
        // Row-level Q&A link: only useful on non-Q&A rows when a sibling Q&A exists.
        const qaRec = sessionRecordings(s).find(
          r => r.id === "qa" || /q\s*&?\s*a/i.test(r.title || "")
        );
        el.querySelectorAll("[data-ss-needs='qa']").forEach(a => {
          if (!qaRec || isQa) return hide(a);
          a.href = `portal-session-watch.html?session=${encodeURIComponent(s.id)}&rec=${encodeURIComponent(qaRec.id)}`;
          a.textContent = "Q&A";
        });
        frag.appendChild(el);
      });
      tpl.replaceWith(frag);

      let typeFilter = "all";
      const search = document.querySelector("[data-ss-lesson-search]");
      const emptyNote = document.querySelector("[data-ss-filter-empty]");

      function applyLibraryFilters() {
        const q = (search && search.value.trim().toLowerCase()) || "";
        const speaker = (speakerSel && speakerSel.value) || "";
        let visible = 0;
        list.querySelectorAll("[data-ss-lesson-id]").forEach(row => {
          const text = row.textContent.toLowerCase();
          const okSearch = !q || text.includes(q);
          const okSpeaker = !speaker || row.getAttribute("data-ss-speaker") === speaker;
          let okType = true;
          if (typeFilter === "recording") okType = row.getAttribute("data-ss-has-recording") === "1";
          else if (typeFilter === "slides") okType = row.getAttribute("data-ss-has-slides") === "1";
          else if (typeFilter === "qa") okType = row.getAttribute("data-ss-has-qa") === "1";
          const show = okSearch && okSpeaker && okType;
          row.style.display = show ? "" : "none";
          if (show) visible += 1;
        });
        if (emptyNote) emptyNote.hidden = visible !== 0;
        setText(
          document,
          "[data-ss-count]",
          visible === 1 ? "1 recording" : `${visible} recordings`
        );
      }

      document.querySelectorAll("[data-ss-filter-type] .fchip").forEach(chip => {
        chip.addEventListener("click", () => {
          document.querySelectorAll("[data-ss-filter-type] .fchip").forEach(c => c.classList.remove("on"));
          chip.classList.add("on");
          typeFilter = chip.getAttribute("data-type") || "all";
          applyLibraryFilters();
        });
      });
      if (search) search.addEventListener("input", applyLibraryFilters);
      if (speakerSel) speakerSel.addEventListener("change", applyLibraryFilters);
    }

    document.documentElement.setAttribute("data-sessions-ready", "hub");
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
