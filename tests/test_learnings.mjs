/* Admin Learnings + portal wiring — unit checks (no live Firebase needed). */
import { readFileSync, existsSync } from "fs";
import { chromium } from "playwright";

const ROOT = process.env.PAAIPE_ROOT || process.cwd();
let pass = 0, fail = 0;
const T = async (n, f) => {
  try { await f(); console.log(`  PASS  ${n}`); pass++; }
  catch (e) { console.log(`  FAIL  ${n}\n        ${e.message}`); fail++; }
};
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => {
  if (a !== b) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
};

const read = p => readFileSync(`${ROOT}/${p}`, "utf8");

await T("admin-learnings.html exists and wires the module", async () => {
  ok(existsSync(`${ROOT}/admin-learnings.html`), "page");
  const h = read("admin-learnings.html");
  ok(h.includes('data-admin-learnings'), "body attr");
  ok(h.includes("paaipe-admin-learnings.js"), "script");
  ok(h.includes('data-learn-tab="sessions"') && h.includes('data-learn-tab="micros"')
    && h.includes('data-learn-tab="playlists"'), "tabs");
  ok(h.includes("aspect-cue"), "aspect cues");
});

await T("ADMIN_NAV lists Learnings under CONTENT", async () => {
  const js = read("assets/js/paaipe-admin.js");
  ok(/href:\s*"admin-learnings\.html"/.test(js), "nav href");
  ok(/label:\s*"Learnings"/.test(js), "label");
  const content = js.indexOf('{ sec: "CONTENT" }');
  const learn = js.indexOf("admin-learnings.html");
  const orgs = js.indexOf("admin-organizations.html");
  ok(content >= 0 && learn > content && learn < orgs, "Learnings before Organizations");
});

await T("firestore.rules cover both collections", async () => {
  const r = read("firestore.rules");
  ok(r.includes("match /paaipe_sessions/{id}"), "sessions");
  ok(r.includes("match /paaipe_micros/{id}"), "micros");
  ok(r.includes("match /paaipe_playlists/{id}"), "playlists");
  ok(r.includes("isWellFormedLearning"), "validator");
  ok(/source in \['youtube','upload'\]/.test(r), "source enum");
});

// Dynamic import of the data module needs a browser-ish path; evaluate the pure
// helpers by extracting via a tiny Node reimplementation check against source.
await T("youtubeIdFromUrl derives common shapes (source contract)", async () => {
  const src = read("assets/js/paaipe-learnings-data.js");
  ok(src.includes("export function youtubeIdFromUrl"), "export");
  // Evaluate the function body in isolation for known cases.
  const start = src.indexOf("export function youtubeIdFromUrl");
  const end = src.indexOf("export function youtubeWatchUrl");
  const fnSrc = src.slice(start, end).replace("export function", "function");
  // eslint-disable-next-line no-new-func
  const fn = new Function(`${fnSrc}; return youtubeIdFromUrl;`)();
  eq(fn("https://www.youtube.com/watch?v=ePw_wlPqYUk"), "ePw_wlPqYUk", "watch");
  eq(fn("https://youtu.be/0PkiRVczWdQ"), "0PkiRVczWdQ", "short");
  eq(fn("https://www.youtube.com/embed/ePw_wlPqYUk"), "ePw_wlPqYUk", "embed");
  eq(fn("https://www.youtube.com/shorts/abcdefghijk"), "abcdefghijk", "shorts");
  eq(fn("ePw_wlPqYUk"), "ePw_wlPqYUk", "bare id");
  eq(fn("not-a-url"), "", "junk");
  eq(fn(""), "", "empty");
});

await T("LEARNINGS_UPLOAD_STORAGE_READY is true and admin posts to media.paaipe.org", async () => {
  const src = read("assets/js/paaipe-learnings-data.js");
  ok(/LEARNINGS_UPLOAD_STORAGE_READY\s*=\s*true/.test(src), "flag true");
  const admin = read("assets/js/paaipe-admin-learnings.js");
  ok(admin.includes("postMediaUpload"), "admin uses media client");
  ok(admin.includes("data-f-file"), "file input");
  ok(admin.includes("data-f-poster-file"), "poster file");
  ok(admin.includes("MEDIA_KIND.SESSION") || /kind:\s*kind === "micros"/.test(admin), "session/micro kind");
  ok(!/firebase-storage/.test(admin), "no Firebase Storage");
  ok(admin.includes("data-f-youtube"), "YouTube path remains");
});

await T("portal-sessions hub loads live learnings, not PAST_SESSIONS library", async () => {
  const h = read("portal-sessions.html");
  ok(h.includes("data-ss-live-sessions"), "live sessions mount");
  ok(h.includes("data-ss-live-micros"), "live micros mount");
  ok(h.includes('data-ss-hub-tab="playlists"'), "playlists tab");
  ok(h.includes("data-ss-live-playlists"), "live playlists mount");
  const tabSessions = h.indexOf('data-ss-hub-tab="sessions"');
  const tabMicros = h.indexOf('data-ss-hub-tab="micros"');
  const tabPlaylists = h.indexOf('data-ss-hub-tab="playlists"');
  ok(tabSessions >= 0 && tabMicros > tabSessions && tabPlaylists > tabMicros,
    "tab order Sessions → Micros → Playlists");
  ok(h.includes('role="tab"') && h.includes('aria-controls="ss-panel-playlists"'),
    "Playlists tab uses the same tab markup");
  ok(/<div class="hd"><h2>Playlists<\/h2><small data-ss-playlist-count>/.test(h),
    "Playlists hd is title + count");
  ok(!h.includes("data-ss-playlists-all"), "no extra All playlists chrome in hd");
  ok(!h.includes("data-ss-continue"), "no continue/attendance chrome");
  ok(!h.includes("data-ss-lesson-list"), "no hardcoded library list");
  const view = read("assets/js/paaipe-session-view.js");
  ok(view.includes("listPublishedSessions"), "fetches sessions");
  ok(view.includes("listPublishedMicros"), "fetches micros");
  ok(/from\s+["']\/assets\/js\/paaipe-playlists-data\.js["']/.test(view),
    "hub imports playlists-data");
  ok(/\bloadOne\s*\(\s*(?:\(\)\s*=>\s*)?listPublishedPlaylists/.test(view),
    "hub fetches playlists via the API module");
  ok(!/firebase-firestore/.test(read("assets/js/paaipe-playlists-data.js")),
    "playlists-data has no Firestore reads");
  ok(/listApiSessions|listPublishedSessions/.test(read("assets/js/paaipe-learnings-data.js")),
    "sessions list is wired");
  ok(read("assets/js/paaipe-learnings-data.js").includes("listApiSessions"),
    "published sessions come from the API");
  ok(read("assets/js/paaipe-learnings-data.js").includes("listApiMicros"),
    "published micros come from the API");
  ok(view.includes("function loadOne"), "isolates each hub fetch");
  ok(view.includes("youtubeEmbedSrc"), "in-portal embed");
  ok(view.includes("LEARNING_SOURCE"), "uses LEARNING_SOURCE");
  ok(/createElement\(\s*"video"\s*\)/.test(view), "native video for uploads");
  ok(/playsinline/i.test(view), "playsinline on upload video");
  ok(view.includes("https://media.paaipe.org/"), "media host prefix");
  ok(!/Open on YouTube/i.test(h), "no Open on YouTube in markup");
});

await T("mediaPlaybackUrl prefixes relative storagePath only", async () => {
  const src = read("assets/js/paaipe-session-view.js");
  const start = src.indexOf("function mediaPlaybackUrl");
  const end = src.indexOf("function isUploadPlayable");
  ok(start >= 0 && end > start, "found mediaPlaybackUrl");
  const fnSrc = src.slice(start, end);
  // eslint-disable-next-line no-new-func
  const fn = new Function(`${fnSrc}; return mediaPlaybackUrl;`)();
  eq(fn("micro/m1.mp4"), "https://media.paaipe.org/micro/m1.mp4", "relative");
  eq(fn("/session/s1.webm"), "https://media.paaipe.org/session/s1.webm", "leading slash");
  eq(fn("https://media.paaipe.org/micro/abs.mp4"), "https://media.paaipe.org/micro/abs.mp4", "absolute kept");
  eq(fn("https://cdn.example.com/x.mp4"), "https://cdn.example.com/x.mp4", "http prefix kept as-is");
  eq(fn(""), "", "empty");
  eq(fn("   "), "", "blank");
});

await T("Paul rule: portal/player copy is never YouTube-only", async () => {
  const files = [
    "assets/js/paaipe-session-view.js",
    "portal-sessions.html",
    "portal-session-watch.html",
    "portal-sessions-past.html",
  ];
  for (const p of files) {
    const s = read(p);
    ok(!/no playable YouTube source/i.test(s), `${p}: no YouTube-only empty copy`);
    ok(!/YouTube source yet/i.test(s), `${p}: no YouTube-only “source yet”`);
    ok(!/has no playable YouTube/i.test(s), `${p}: no YouTube-only unplayable`);
  }
  const view = read("assets/js/paaipe-session-view.js");
  ok(view.includes("This item has no playable source yet."), "honest empty copy");
  ok(view.includes("function isUploadPlayable") && view.includes("function isYoutubePlayable"),
    "both upload and YouTube playability helpers");
  ok(view.includes("https://media.paaipe.org/"), "upload path stays media.paaipe.org");
});

await T("portal-session-watch layout stacks without an inline grid (R-02)", async () => {
  const h = read("portal-session-watch.html");
  ok(!/style="[^"]*grid-template-columns/.test(h), "no inline grid-template-columns");
  ok(/class="grid2 watch-layout"/.test(h), "watch-layout class on the player/rail grid");
  ok(/\.watch-layout\{[^}]*1\.55fr \.65fr/.test(h), "desktop 1.55 / .65");
  ok(/max-width:1100px\)\{\.watch-layout\{grid-template-columns:1fr\}/.test(h),
    "stacks to 1fr at ≤1100");
  ok(/@media \(max-width:560px\)/.test(h), "560 phone harden on this page");
});

await T("isUploadPlayable needs a real storagePath; empty copy is source-agnostic", async () => {
  const src = read("assets/js/paaipe-session-view.js");
  ok(src.includes("This item has no playable source yet."), "honest empty copy");
  ok(!/no playable YouTube source/i.test(src), "no YouTube-only empty copy");
  ok(!/YouTube source yet/i.test(src), "no YouTube-only wording");
  const start = src.indexOf("function mediaPlaybackUrl");
  const end = src.indexOf("function youtubeIdOf");
  ok(start >= 0 && end > start, "found playable-upload helpers");
  const { mediaPlaybackUrl, isUploadPlayable } = new Function(
    `${src.slice(start, end)}; return { mediaPlaybackUrl, isUploadPlayable };`
  )();
  ok(!isUploadPlayable({ source: "upload", storagePath: null }), "null path is not playable");
  ok(!isUploadPlayable({ source: "upload", storagePath: "" }), "empty path is not playable");
  ok(!isUploadPlayable({ source: "upload" }), "missing path is not invented");
  ok(isUploadPlayable({ source: "upload", storagePath: "micros/a.mp4" }), "relative path");
  ok(isUploadPlayable({ storagePath: "https://media.paaipe.org/m.mp4" }),
    "absolute media URL is playable even without source");
  eq(mediaPlaybackUrl(null), "", "null storagePath yields no URL");
});

await T("YouTube path accepts youtubeId or youtubeUrl", async () => {
  const view = read("assets/js/paaipe-session-view.js");
  const learn = read("assets/js/paaipe-learnings-data.js");
  const yStart = learn.indexOf("export function youtubeIdFromUrl");
  const yEnd = learn.indexOf("export function youtubeWatchUrl");
  const vStart = view.indexOf("function youtubeIdOf");
  const vEnd = view.indexOf("function destroyEmbed");
  ok(yStart >= 0 && yEnd > yStart && vStart >= 0 && vEnd > vStart, "found YouTube helpers");
  const ySrc = learn.slice(yStart, yEnd).replace("export function", "function");
  const { youtubeIdOf, isYoutubePlayable } = new Function(
    `${ySrc}; ${view.slice(vStart, vEnd)}; return { youtubeIdOf, isYoutubePlayable };`
  )();
  ok(isYoutubePlayable({ youtubeId: "ePw_wlPqYUk" }), "id");
  ok(isYoutubePlayable({ youtubeUrl: "https://youtu.be/0PkiRVczWdQ" }), "url without id");
  ok(!isYoutubePlayable({ source: "youtube" }), "source alone is not a playable source");
  ok(!isYoutubePlayable({ youtubeUrl: "" }), "empty url");
  eq(youtubeIdOf({ youtubeUrl: "https://www.youtube.com/watch?v=ePw_wlPqYUk" }),
    "ePw_wlPqYUk", "derive id from url");
});

await T("youtubeEmbedSrc locks member chrome (no share, no kb, no fs)", async () => {
  const src = read("assets/js/paaipe-learnings-data.js");
  const start = src.indexOf("export function youtubeEmbedSrc");
  const end = src.indexOf("\nfunction row(");
  ok(start >= 0 && end > start, "found youtubeEmbedSrc");
  const fnSrc = src.slice(start, end).replace("export function", "function");
  // eslint-disable-next-line no-new-func
  const fn = new Function(`${fnSrc}; return youtubeEmbedSrc;`)();
  const u = fn("ePw_wlPqYUk");
  ok(u.startsWith("https://www.youtube-nocookie.com/embed/ePw_wlPqYUk"), `nocookie: ${u}`);
  ok(/[?&]controls=0(?:&|$)/.test(u), "controls off");
  ok(/disablekb=1/.test(u), "keyboard off");
  ok(/[?&]fs=0(?:&|$)/.test(u), "no fullscreen");
  ok(/modestbranding=1/.test(u), "modest branding");
  ok(/enablejsapi=1/.test(u), "js api for shield play/pause");
  ok(!/[?&]controls=1(?:&|$)/.test(u), "must not enable controls by default");
  const admin = fn("ePw_wlPqYUk", { controls: true });
  ok(/[?&]controls=1(?:&|$)/.test(admin), "admin preview can keep controls");
});

await T("Learnings playback is a locked popup, not a live YouTube card", async () => {
  const h = read("portal-sessions.html");
  const view = read("assets/js/paaipe-session-view.js");
  ok(view.includes("openWatchPopup"), "popup opener");
  ok(view.includes("mountPlayStage"), "poster+play on the card");
  ok(view.includes('data-yt-shield", "grab"') || view.includes("data-yt-shield"), "grab shield");
  ok(view.includes('data-yt-plate", "bl"') || view.includes("data-yt-plate"), "corner plates");
  ok(h.includes("ss-watch-popup") && h.includes("ss-watch-scrim"), "popup CSS");
  ok(h.includes("ss-play"), "card play overlay CSS");
  ok(!/allowfullscreen/i.test(view), "no allowfullscreen");
  const allows = [...view.matchAll(/setAttribute\(\s*"allow",\s*"([^"]*)"/g)].map(m => m[1]);
  ok(allows.length > 0, "iframe allow is set");
  ok(allows.every(a => !/web-share/i.test(a)), `no web-share in allow: ${allows.join(" | ")}`);
  ok(allows.every(a => !/picture-in-picture/i.test(a)), `no picture-in-picture in allow: ${allows.join(" | ")}`);
  ok(!/Open on YouTube/i.test(h), "no Open on YouTube in markup");
  ok(!/Copy video URL/i.test(h), "no copy-url field");
  // Cards must not mount a live iframe; that was the share-icon leak.
  ok(view.includes("Playback is the popup") || view.includes("openWatchPopup"), "card is not the player");
  ok(!/iframe\.src = youtubeEmbedSrc/.test(view), "hub no longer assigns youtubeEmbedSrc onto a card iframe");
});

await T("admin editor requires title and YouTube path", async () => {
  const admin = read("assets/js/paaipe-admin-learnings.js");
  ok(admin.includes("data-f-title"), "title field");
  ok(admin.includes("data-f-youtube"), "youtube field");
  ok(admin.includes("data-f-published"), "published toggle");
  ok(admin.includes("reorderLearnings"), "drag reorder");
  ok(admin.includes("Remove"), "remove");
});

/* Browser: stubbed Learnings hub. Same two September recordings, no invented micros. */

const BASE = process.env.PAAIPE_BASE || "http://127.0.0.1:8899";
const REAL_FB = read("assets/js/paaipe-firebase.js");
const REAL_LEARN = read("assets/js/paaipe-learnings-data.js");

const SESSIONS = [
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

const fbStub = `
  export * from '/assets/js/paaipe-firebase-real.js';
  export function isConfigured(){ return true }
  export async function currentAgent(){
    return {
      uid:'u1', email:'member@example.com', full_name:'Rosa Villanueva',
      status:'agent', isAgent:true, emailVerified:true,
      directoryVisible:false, agentNumber:'0006', confirmationSeen:true
    };
  }`;

const learnStub = (sessions, micros, { failSessions = false, failMicros = false } = {}) => `
  export * from '/assets/js/paaipe-learnings-data-real.js';
  export async function listPublishedSessions(){
    ${failSessions ? `const e = new Error("Missing or insufficient permissions."); e.code = "permission-denied"; throw e;` : `return ${JSON.stringify(sessions)}`}
  }
  export async function listPublishedMicros(){
    ${failMicros ? `const e = new Error("Missing or insufficient permissions."); e.code = "permission-denied"; throw e;` : `return ${JSON.stringify(micros)}`}
  }
`;

const REAL_PL = read("assets/js/paaipe-playlists-data.js");
const plStub = (playlists = [], { fail = false } = {}) => fail
  ? `
  export * from '/assets/js/paaipe-playlists-data-real.js';
  export async function listPublishedPlaylists(){
    const e = new Error("Missing or insufficient permissions.");
    e.code = "permission-denied";
    throw e;
  }
  export async function listPlaylists(){ return [] }
  export async function listPlaylistItems(){ return [] }
`
  : `
  export * from '/assets/js/paaipe-playlists-data-real.js';
  export async function listPublishedPlaylists(){ return ${JSON.stringify(playlists)} }
  export async function listPlaylists(){ return ${JSON.stringify(playlists)} }
  export async function getPlaylist(id){
    return ${JSON.stringify(playlists)}.find(p => p.id === id) || null;
  }
  export async function listPlaylistItems(id){
    const pl = ${JSON.stringify(playlists)}.find(p => p.id === id);
    return (pl && Array.isArray(pl.items)) ? pl.items : [];
  }
`;

const br = await chromium.launch();
const errs = [];

async function openHub({
  sessions = SESSIONS,
  micros = [],
  playlists = [],
  playlistError = false,
  failSessions = false,
  failMicros = false,
  hash = "",
} = {}) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(String(e)));
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: fbStub }));
  await p.route("**/assets/js/paaipe-learnings-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_LEARN }));
  await p.route("**/assets/js/paaipe-learnings-data.js", r =>
    r.fulfill({
      contentType: "text/javascript",
      body: learnStub(sessions, micros, { failSessions, failMicros }),
    }));
  await p.route("**/assets/js/paaipe-playlists-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_PL }));
  await p.route("**/assets/js/paaipe-playlists-data.js", r =>
    r.fulfill({
      contentType: "text/javascript",
      body: plStub(playlists, { fail: playlistError }),
    }));
  await p.goto(`${BASE}/portal-sessions.html${hash}`, { waitUntil: "load" });
  await p.waitForSelector("html[data-sessions-ready]", { timeout: 9000 });
  return { p, ctx };
}

await T("cards show a play control, not a live YouTube iframe", async () => {
  const { p, ctx } = await openHub();
  eq(await p.locator(".live-session").count(), 2, "two published sessions");
  eq(await p.locator(".live-session iframe").count(), 0, "no iframe in the card");
  eq(await p.locator("[data-ss-open-player]").count(), 2, "play on each card");
  ok(!(await p.getByText("Open on YouTube").count()), "no Open on YouTube");
  eq(await p.locator('a[href*="youtube.com"]').count(), 0, "no youtube.com link");
  eq(await p.locator('a[href*="youtu.be"]').count(), 0, "no youtu.be link");
  eq(await p.locator('input[value*="youtu"]').count(), 0, "no copyable URL field");
  await ctx.close();
});

await T("play opens a centered 16:9 popup with the link lock", async () => {
  const { p, ctx } = await openHub();
  await p.locator("[data-ss-open-player]").first().click();
  const pop = p.locator("[data-ss-watch-popup]");
  await pop.waitFor({ state: "visible", timeout: 5000 });
  ok(await pop.isVisible(), "popup visible");
  const panel = p.locator("[data-ss-watch-panel]");
  eq(await panel.getAttribute("data-aspect"), "16:9", "16:9 panel");
  const iframe = p.locator("[data-ss-popup-player] iframe");
  await iframe.waitFor({ timeout: 5000 });
  const src = await iframe.getAttribute("src");
  ok(/youtube-nocookie\.com\/embed\/ePw_wlPqYUk/.test(src), `nocookie src: ${src}`);
  ok(/[?&]controls=0(?:&|$)/.test(src), "controls=0");
  ok(/disablekb=1/.test(src), "disablekb");
  ok(/[?&]fs=0(?:&|$)/.test(src), "fs=0");
  eq(await iframe.getAttribute("allowfullscreen"), null, "no allowfullscreen attr");
  const allow = await iframe.getAttribute("allow") || "";
  ok(!/web-share/i.test(allow), "no web-share");
  ok(!/picture-in-picture/i.test(allow), "no picture-in-picture");
  eq(await iframe.evaluate(el => getComputedStyle(el).pointerEvents), "none", "iframe not clickable");
  const grab = p.locator('[data-yt-shield="grab"]');
  ok(await grab.isVisible(), "grab shield covers the player");
  const grabBox = await grab.boundingBox();
  const stageBox = await p.locator("[data-ss-popup-player]").boundingBox();
  ok(grabBox && stageBox, "boxes");
  ok(Math.abs(grabBox.width - stageBox.width) < 2 && Math.abs(grabBox.height - stageBox.height) < 2,
    `shield should cover the stage: grab=${grabBox.width}x${grabBox.height} stage=${stageBox.width}x${stageBox.height}`);
  for (const kind of ["tl", "tr", "bl", "br"]) {
    ok(await p.locator(`[data-yt-plate="${kind}"]`).count() > 0, `plate ${kind}`);
  }
  const prevented = await grab.evaluate(el => {
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  ok(prevented, "right-click on the overlay is cancelled — YouTube Copy video URL is not offered");
  const panelBox = await panel.boundingBox();
  const vp = p.viewportSize();
  ok(panelBox && vp, "panel box");
  const cx = panelBox.x + panelBox.width / 2;
  const cy = panelBox.y + panelBox.height / 2;
  ok(Math.abs(cx - vp.width / 2) < 40, `horizontally centered: ${cx} vs ${vp.width / 2}`);
  ok(Math.abs(cy - vp.height / 2) < 80, `vertically centered: ${cy} vs ${vp.height / 2}`);
  const ratio = panelBox.width / panelBox.height;
  ok(Math.abs(ratio - 16 / 9) < 0.15, `about 16:9, got ${ratio.toFixed(3)}`);
  await ctx.close();
});

await T("close returns to the list and tears down the iframe", async () => {
  const { p, ctx } = await openHub();
  await p.locator("[data-ss-open-player]").first().click();
  await p.locator("[data-ss-watch-popup]").waitFor({ state: "visible" });
  await p.locator(".ss-watch-close").click();
  eq(await p.locator("[data-ss-watch-popup]").getAttribute("hidden"), "", "popup hidden attr");
  ok(!(await p.locator("[data-ss-watch-popup]").isVisible()), "popup not visible");
  eq(await p.locator("[data-ss-popup-player] iframe").count(), 0, "iframe gone");
  ok(await p.locator(".live-session").first().isVisible(), "list still there");
  await ctx.close();
});

await T("Micros stay empty when none are published, and use the same lock when one is", async () => {
  const empty = await openHub({ micros: [] });
  await empty.p.locator('[data-ss-hub-tab="micros"]').click();
  ok(await empty.p.locator("[data-ss-micro-empty]").isVisible(), "honest empty micros");
  eq(await empty.p.locator(".micro-card").count(), 0, "no invented micros");
  await empty.ctx.close();

  const micro = {
    id: "m1",
    title: "30-second takeaway",
    source: "youtube",
    youtubeId: "ePw_wlPqYUk",
    published: true,
    displayOrder: 1,
  };
  const { p, ctx } = await openHub({ micros: [micro] });
  await p.locator('[data-ss-hub-tab="micros"]').click();
  eq(await p.locator(".micro-card").count(), 1, "published micro only");
  eq(await p.locator(".micro-card iframe").count(), 0, "no live iframe in micro card");
  await p.locator(".micro-card [data-ss-open-player]").click();
  await p.locator("[data-ss-watch-popup]").waitFor({ state: "visible" });
  eq(await p.locator("[data-ss-watch-panel]").getAttribute("data-aspect"), "9:16", "vertical panel");
  const src = await p.locator("[data-ss-popup-player] iframe").getAttribute("src");
  ok(/controls=0/.test(src) && /fs=0/.test(src), "same locked embed");
  ok(await p.locator('[data-yt-shield="grab"]').isVisible(), "same grab shield");
  await ctx.close();
});

await T("uploaded micro plays via native video on media.paaipe.org", async () => {
  const micro = {
    id: "m-up",
    title: "Uploaded takeaway",
    source: "upload",
    storagePath: "micro/m-up.mp4",
    published: true,
    displayOrder: 1,
  };
  const { p, ctx } = await openHub({ micros: [micro] });
  await p.locator('[data-ss-hub-tab="micros"]').click();
  eq(await p.locator(".micro-card").count(), 1, "published upload micro");
  eq(await p.locator(".micro-card iframe").count(), 0, "no YouTube iframe on card");
  eq(await p.locator(".micro-card [data-ss-open-player]").count(), 1, "play affordance");
  const cardVideo = p.locator(".micro-card .stage video");
  eq(await cardVideo.count(), 1, "first-frame video on card when no poster");
  eq(await cardVideo.getAttribute("src"), "https://media.paaipe.org/micro/m-up.mp4", "card preview src");
  await p.locator(".micro-card [data-ss-open-player]").click();
  await p.locator("[data-ss-watch-popup]").waitFor({ state: "visible" });
  eq(await p.locator("[data-ss-watch-panel]").getAttribute("data-aspect"), "9:16", "vertical panel");
  eq(await p.locator("[data-ss-popup-player] iframe").count(), 0, "popup is not YouTube");
  eq(await p.locator('[data-yt-shield="grab"]').count(), 0, "no YouTube grab shield on upload");
  const video = p.locator("[data-ss-popup-player] video");
  await video.waitFor({ timeout: 5000 });
  eq(await video.getAttribute("src"), "https://media.paaipe.org/micro/m-up.mp4", "popup video src");
  ok(await video.evaluate(el => el.hasAttribute("controls")), "controls");
  ok(await video.evaluate(el => el.hasAttribute("playsinline") || el.playsInline), "playsinline");
  await ctx.close();
});

await T("upload with null storagePath is honest empty, not YouTube-only wording", async () => {
  const micro = {
    id: "m-null",
    title: "Pending upload",
    source: "upload",
    storagePath: null,
    published: true,
    displayOrder: 1,
  };
  const playlist = {
    id: "pl-pending",
    title: "Pending micros",
    kind: "micros",
    itemIds: ["m-null"],
    status: "published",
    displayOrder: 1,
  };
  const { p, ctx } = await openHub({
    sessions: SESSIONS,
    micros: [micro],
    playlists: [playlist],
  });
  await p.locator('[data-ss-hub-tab="micros"]').click();
  eq(await p.locator(".micro-card").count(), 1, "card still listed");
  eq(await p.locator(".micro-card [data-ss-open-player]").count(), 0, "no play affordance");
  ok((await p.locator(".micro-card").innerText()).includes("This item has no playable source yet."),
    "source-agnostic empty on Micros");
  ok(!(await p.locator(".micro-card").innerText()).includes("YouTube source"),
    "not YouTube-only on Micros");
  await p.locator('[data-ss-hub-tab="playlists"]').click();
  await p.locator("[data-ss-open-playlist]").click();
  await p.waitForSelector('[data-ss-hub-panel="playlists"] .micro-card', { timeout: 5000 });
  const item = p.locator('[data-ss-hub-panel="playlists"] .micro-card');
  ok((await item.innerText()).includes("This item has no playable source yet."),
    "playlist item same copy");
  ok(!(await item.innerText()).includes("YouTube source"), "not YouTube-only in playlist");
  eq(await p.locator('[data-ss-hub-panel="playlists"] [data-ss-open-player]').count(), 0,
    "playlist item has no play");
  await ctx.close();
});

await T("uploaded session with poster uses poster on the card and video in the popup", async () => {
  const session = {
    id: "s-up",
    title: "Uploaded session",
    description: "A self-hosted recording.",
    source: "upload",
    storagePath: "https://media.paaipe.org/session/s-up.webm",
    posterUrl: "https://media.paaipe.org/poster/s-up.jpg",
    published: true,
    displayOrder: 3,
  };
  const { p, ctx } = await openHub({ sessions: [...SESSIONS, session] });
  const card = p.locator('[data-learn-id="s-up"]');
  ok(await card.isVisible(), "upload session card");
  eq(await card.locator("iframe").count(), 0, "no iframe on upload card");
  eq(await card.locator(".stage img").getAttribute("src"),
    "https://media.paaipe.org/poster/s-up.jpg", "poster on card");
  eq(await card.locator(".stage video").count(), 0, "no preview video when poster exists");
  eq(await card.locator("[data-ss-open-player]").count(), 1, "play affordance");
  await card.locator("[data-ss-open-player]").click();
  await p.locator("[data-ss-watch-popup]").waitFor({ state: "visible" });
  eq(await p.locator("[data-ss-watch-panel]").getAttribute("data-aspect"), "16:9", "landscape panel");
  const video = p.locator("[data-ss-popup-player] video");
  await video.waitFor({ timeout: 5000 });
  eq(await video.getAttribute("src"), "https://media.paaipe.org/session/s-up.webm", "absolute storagePath kept");
  eq(await video.getAttribute("poster"), "https://media.paaipe.org/poster/s-up.jpg", "poster on player");
  eq(await p.locator("[data-ss-popup-player] iframe").count(), 0, "YouTube path unused");
  await ctx.close();
});

await T("session fetch error does not blank published Micros", async () => {
  const micro = {
    id: "m1",
    title: "30-second takeaway",
    source: "youtube",
    youtubeId: "ePw_wlPqYUk",
    published: true,
    displayOrder: 1,
  };
  const { p, ctx } = await openHub({
    sessions: SESSIONS,
    micros: [micro],
    failSessions: true,
  });
  ok((await p.locator("[data-ss-live-sessions]").innerText()).includes("could not be loaded"),
    "honest sessions fault");
  await p.locator('[data-ss-hub-tab="micros"]').click();
  eq(await p.locator(".micro-card").count(), 1, "micros still render");
  await ctx.close();
});

await T("playlist stub failure does not blank published Sessions or Micros", async () => {
  const micro = {
    id: "m1",
    title: "30-second takeaway",
    source: "youtube",
    youtubeId: "ePw_wlPqYUk",
    published: true,
    displayOrder: 1,
  };
  const { p, ctx } = await openHub({
    sessions: SESSIONS,
    micros: [micro],
    playlistError: true,
  });
  eq(await p.locator(".live-session").count(), 2, "sessions still render");
  ok(!(await p.locator("[data-ss-sessions-empty]").isVisible()), "not the empty sessions state");
  await p.locator('[data-ss-hub-tab="micros"]').click();
  eq(await p.locator(".micro-card").count(), 1, "micros still render");
  await p.locator('[data-ss-hub-tab="playlists"]').click();
  ok(await p.locator('[data-ss-hub-panel="playlists"]').isVisible(), "playlists panel");
  ok((await p.locator("[data-ss-live-playlists]").innerText()).includes("could not be loaded"),
    "honest playlist fault — not an empty library");
  ok(!(await p.locator("[data-ss-playlists-empty]").isVisible()), "must not look like none published");
  await ctx.close();
});

const HUB_PLAYLIST = {
  id: "pl-signals",
  title: "From Signals to Strategy",
  description: "Short lessons from Sven Bally’s AI Exchange session.",
  kind: "micros",
  itemIds: ["m-hub"],
  status: "published",
  displayOrder: 1,
};
const HUB_MICRO = {
  id: "m-hub",
  title: "Start with the question, not the dashboard",
  source: "upload",
  storagePath: "micros/micro-1.mp4",
  published: true,
  displayOrder: 1,
};

await T("Playlists tab lists the API-published micros playlist", async () => {
  const { p, ctx } = await openHub({
    sessions: SESSIONS,
    micros: [HUB_MICRO],
    playlists: [HUB_PLAYLIST],
  });
  eq(await p.locator(".live-session").count(), 2, "sessions stay visible");
  eq(await p.locator("[data-ss-session-count]").innerText(), "2 published · 16:9", "session count matches list");
  eq(await p.locator('[data-ss-hub-panel="sessions"] [data-playlist]').count(), 0,
    "Sessions stay ungrouped");
  const tabs = p.locator("[data-ss-hub-tab]");
  eq(await tabs.count(), 3, "three hub tabs");
  eq(await tabs.nth(2).innerText(), "Playlists", "Playlists after Micros");
  await p.locator('[data-ss-hub-tab="playlists"]').click();
  await p.waitForFunction(() => /#tab=playlists/.test(location.hash), { timeout: 4000 });
  eq(await p.locator("[data-ss-playlist-count]").innerText(), "1 published", "chrome count");
  ok(!(await p.locator("[data-ss-playlists-empty]").isVisible()), "not empty");
  eq(await p.locator('[data-ss-hub-panel="playlists"] [data-playlist]').count(), 1,
    "one API playlist row");
  ok((await p.locator('[data-ss-hub-panel="playlists"]').innerText()).includes("From Signals to Strategy"),
    "seeded title");
  await ctx.close();
});

await T("#tab=playlists hash restores the Playlists tab with the seeded row", async () => {
  const pasted = await openHub({
    sessions: SESSIONS,
    micros: [HUB_MICRO],
    playlists: [HUB_PLAYLIST],
    hash: "#tab=playlists",
  });
  ok(await pasted.p.locator('[data-ss-hub-tab="playlists"]').evaluate(el => el.classList.contains("on")),
    "playlists tab");
  eq(await pasted.p.locator("[data-ss-playlist-count]").innerText(), "1 published", "count");
  ok((await pasted.p.locator("[data-ss-live-playlists]").innerText()).includes("From Signals to Strategy"),
    "row on paste");
  await pasted.ctx.close();

  const { p, ctx } = await openHub({
    sessions: SESSIONS,
    micros: [HUB_MICRO],
  });
  await p.locator('[data-ss-hub-tab="playlists"]').click();
  await p.waitForFunction(() => /#tab=playlists/.test(location.hash), { timeout: 4000 });
  await p.goBack();
  await p.waitForFunction(() => /tab=sessions/.test(location.hash) || !location.hash, { timeout: 4000 });
  ok(await p.locator('[data-ss-hub-panel="sessions"]').isVisible(), "Back returns to Sessions");
  await ctx.close();
});

await T("Playlists tab is honestly empty when the API returns no playlists", async () => {
  const { p, ctx } = await openHub({
    sessions: SESSIONS,
    micros: [HUB_MICRO],
    playlists: [],
  });
  await p.locator('[data-ss-hub-tab="playlists"]').click();
  eq(await p.locator("[data-ss-playlist-count]").innerText(), "0 published", "empty count");
  ok(await p.locator("[data-ss-playlists-empty]").isVisible(), "honest empty");
  eq(await p.locator('[data-ss-hub-panel="playlists"] [data-playlist]').count(), 0, "no rows");
  await ctx.close();
});

await T("Open on the seeded playlist paints items and writes #playlist=", async () => {
  const { p, ctx } = await openHub({
    sessions: SESSIONS,
    micros: [HUB_MICRO],
    playlists: [HUB_PLAYLIST],
  });
  await p.locator('[data-ss-hub-tab="playlists"]').click();
  await p.locator("[data-ss-open-playlist]").click();
  await p.waitForFunction(() => /playlist=pl-signals/.test(location.hash), { timeout: 4000 });
  await p.waitForSelector('[data-ss-hub-panel="playlists"] [data-playlist="pl-signals"] .micro-card', {
    timeout: 5000,
  });
  eq(await p.locator('[data-ss-hub-panel="playlists"] .micro-card').count(), 1, "hydrated item");
  eq(await p.locator('[data-ss-hub-panel="playlists"] .micro-card .cap').innerText(),
    "Start with the question, not the dashboard", "item title");
  ok(!(await p.locator("[data-ss-watch-popup]").isVisible()), "no auto-play");
  await ctx.close();
});

await T("watch page at 390 has no overflow and a full-width player (R-02)", async () => {
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/portal-session-watch.html`, { waitUntil: "load" });
  const m = await p.evaluate(() => {
    const layout = document.querySelector(".watch-layout");
    const player = document.querySelector(".player");
    const r = player.getBoundingClientRect();
    const content = document.querySelector(".content");
    const cw = content ? content.getBoundingClientRect().width : 0;
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      playerW: r.width,
      contentW: cw,
      cols: getComputedStyle(layout).gridTemplateColumns,
    };
  });
  ok(m.overflow <= 0, `overflow ${m.overflow} ≤ 0`);
  ok(m.playerW >= 320, `player ${m.playerW.toFixed(1)}px ≥ 320`);
  ok(m.playerW + 1 >= m.contentW * 0.9, `player ≈ content column (${m.playerW.toFixed(1)} vs ${m.contentW.toFixed(1)})`);
  ok(m.cols.trim().split(/\s+/).length === 1, `single column at 390, got ${m.cols}`);
  await ctx.close();
});

await T("watch layout stays two-column on desktop (R-02)", async () => {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/portal-session-watch.html`, { waitUntil: "load" });
  const cols = await p.evaluate(() => getComputedStyle(document.querySelector(".watch-layout")).gridTemplateColumns);
  ok(cols.trim().split(/\s+/).length === 2, `desktop two cols: ${cols}`);
  await ctx.close();
});

await br.close();
if (errs.length) {
  console.log("page errors:", errs.slice(0, 5).join("\n"));
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);

