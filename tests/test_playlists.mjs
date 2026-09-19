/* Playlists — Clarence lock, admin tab, portal chrome (Linode API hub reads). */
import { readFileSync, existsSync } from "fs";
import { chromium } from "playwright";

const ROOT = process.env.PAAIPE_ROOT || process.cwd();
const BASE = process.env.PAAIPE_BASE || "http://127.0.0.1:8899";
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

const MICROS = [
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
const PLAYLIST = {
  id: "pl-signals",
  title: "From Signals to Strategy",
  description: "Short lessons from Sven Bally’s AI Exchange session on turning data into decisions. Watch in order, or pick the cut you need.",
  kind: "micros",
  itemIds: ["micro-1", "micro-2", "micro-3", "micro-4"],
  status: "published",
  displayOrder: 1,
};

await T("linkage is only itemIds — no playlistId on Session/Micro docs", () => {
  const pl = read("assets/js/paaipe-playlists-data.js");
  const learn = read("assets/js/paaipe-learnings-data.js");
  const admin = read("assets/js/paaipe-admin-learnings.js");
  ok(/itemIds/.test(pl), "itemIds");
  ok(!/\bplaylistId\s*[:=]/.test(pl) && !/\bplaylistId\s*[:=]/.test(learn)
    && !/\bplaylistId\s*[:=]/.test(admin), "no playlistId field written");
  ok(admin.includes("reorderLearnings") && admin.includes("saveLearning"),
    "session/micro publish+reorder kept");
});

await T("Clarence lock: collection and field names are exact", () => {
  const src = read("assets/js/paaipe-playlists-data.js");
  ok(src.includes('PLAYLISTS_COL = "paaipe_playlists"'), "collection constant");
  ok(!/firebase-firestore/.test(src), "no Firestore playlist reads");
  ok(src.includes("listApiPlaylists") && src.includes("listApiPlaylistItems"),
    "public list/get/items go through paaipe-api");
  ok(src.includes("listAdminPlaylists") && src.includes("postAdminPlaylist")
    && src.includes("patchAdminPlaylist"),
    "admin list/create/update go through paaipe-api");
  ok(!/PROVISIONAL_|pending_clarence|_awaiting/.test(src), "no provisional prefix");
  for (const field of ["title", "description", "kind", "itemIds", "status", "displayOrder", "publishedAt", "createdAt", "updatedAt", "updatedBy"]) {
    ok(src.includes(field), `field ${field}`);
  }
  ok(src.includes('"sessions"') && src.includes('"micros"'), "kind enum");
  ok(src.includes('"draft"') && src.includes('"published"') && src.includes('"archived"'), "status enum");
  ok(src.includes("assertPlaylistItemsPublishable"), "publish integrity helper");
  ok(src.includes("await assertPlaylistItemsPublishable(payload.kind, payload.itemIds)"),
    "publish check runs before save");
});

await T("UI copy says Playlist, not collection/series/channel", () => {
  const files = [
    "admin-learnings.html",
    "assets/js/paaipe-admin-learnings.js",
    "portal-sessions.html",
    "assets/js/paaipe-session-view.js",
  ];
  for (const p of files) {
    const s = read(p);
    ok(!/\b(collection|series|channel)s?\b/i.test(s.replace(/playlist/ig, "")), `no synonym in ${p}`);
    if (p.includes("admin-learnings") || p.includes("portal-sessions")) {
      ok(/Playlists/.test(s), `${p} uses Playlists`);
    }
  }
});

await T("player source: nodownload, portal-only deep link helper", () => {
  const src = read("assets/js/paaipe-session-view.js");
  ok(/controlslist["']\s*,\s*["']nodownload/.test(src) || /controlsList\s*=\s*["']nodownload/.test(src),
    "nodownload");
  ok(src.includes("playsinline"), "playsinline");
  const start = src.indexOf("export function portalPlayPath");
  const end = src.indexOf("export function portalPlayUrl");
  ok(start >= 0 && end > start, "portalPlayPath");
  const fnSrc = src.slice(start, end).replace("export function", "function");
  // eslint-disable-next-line no-new-func
  const fn = new Function(`${fnSrc}; return portalPlayPath;`)();
  eq(fn("micros", "micro-1"), "/portal-sessions#tab=micros&play=micro-1", "micro path");
  eq(fn("sessions", "part1"), "/portal-sessions#tab=sessions&play=part1", "session path");
  eq(fn("micros", "https://media.paaipe.org/x"), "", "rejects a URL as an id");
  const signin = read("signin.html");
  ok(signin.includes(".html(?:[?#]") || signin.includes("[?#][^\\s]*"), "signin next allows hash");
});

await T("admin Learnings has a Playlists tab beside Sessions and Micros", () => {
  ok(existsSync(`${ROOT}/admin-learnings.html`), "page");
  const h = read("admin-learnings.html");
  ok(h.includes('data-learn-tab="sessions"'), "sessions tab");
  ok(h.includes('data-learn-tab="micros"'), "micros tab");
  ok(h.includes('data-learn-tab="playlists"'), "playlists tab");
  ok(h.includes('data-pl-rows'), "playlist rows");
  ok(h.includes('data-add="playlists"'), "add playlist");
  const admin = read("assets/js/paaipe-admin-learnings.js");
  ok(admin.includes("savePlaylist"), "saves playlists");
  ok(admin.includes("setPlaylistStatus"), "archive/restore");
  ok(admin.includes("reorderLearnings"), "session/micro reorder kept");
  ok(admin.includes("saveLearning"), "session/micro save kept");
});

await T("firestore.rules cover paaipe_playlists without touching sessions/micros validators", () => {
  const r = read("firestore.rules");
  ok(r.includes("match /paaipe_playlists/{id}"), "playlist match");
  ok(r.includes("isWellFormedPlaylist"), "playlist validator");
  ok(r.includes("match /paaipe_sessions/{id}"), "sessions still there");
  ok(r.includes("match /paaipe_micros/{id}"), "micros still there");
  ok(r.includes("isWellFormedLearning"), "learning validator kept");
  ok(/status in \['draft', 'published', 'archived'\]/.test(r), "status enum");
  ok(/kind in \['sessions', 'micros'\]/.test(r), "kind enum");
  ok(r.includes("!('playlistId' in d.keys())"), "Session/Micro writes refuse playlistId");
  ok(!/admin-contacts/.test(r), "rules file is not contacts");
});

function loadPurePlaylistFns() {
  const src = read("assets/js/paaipe-playlists-data.js");
  const start = src.indexOf("const TITLE_MAX");
  const end = src.indexOf("export async function listPlaylists");
  ok(start >= 0 && end > start, "pure helpers present");
  const body = src.slice(start, end).replaceAll("export function", "function");
  const payloadStart = src.indexOf("export function buildPlaylistPayload");
  const payloadEnd = src.indexOf("export async function savePlaylist");
  ok(payloadStart >= 0 && payloadEnd > payloadStart, "buildPlaylistPayload");
  const payload = src.slice(payloadStart, payloadEnd).replace("export function", "function");
  const enums = src.slice(
    src.indexOf("export const PLAYLIST_KIND"),
    src.indexOf("const TITLE_MAX")
  ).replaceAll("export const", "const");
  // eslint-disable-next-line no-new-func
  return new Function(`${enums}\n${body}\n${payload}; return { groupLearningsByPlaylist, playlistForItem, buildPlaylistPayload, normalizeItemIds, PLAYLIST_STATUS };`)();
}

const {
  groupLearningsByPlaylist,
  buildPlaylistPayload,
  normalizeItemIds,
  PLAYLIST_STATUS,
} = loadPurePlaylistFns();

await T("groupLearningsByPlaylist honours itemIds order and skips missing/unpublished", () => {
  const items = [
    ...MICROS,
    { id: "ghost", title: "Unpublished", published: false, displayOrder: 9 },
  ];
  const playlists = [{
    ...PLAYLIST,
    itemIds: ["micro-2", "missing", "ghost", "micro-1"],
  }];
  const { groups, ungrouped } = groupLearningsByPlaylist(items, playlists);
  eq(groups.length, 1, "one published playlist");
  eq(groups[0].items.map(i => i.id).join(","), "micro-2,micro-1", "order + skip");
  eq(ungrouped.map(i => i.id).join(","), "micro-3,micro-4", "uncited stay visible");
});

await T("draft and archived playlists are not grouped on the portal", () => {
  const draft = { ...PLAYLIST, id: "d1", status: "draft" };
  const archived = { ...PLAYLIST, id: "a1", status: "archived", itemIds: ["micro-3"] };
  const { groups, ungrouped } = groupLearningsByPlaylist(MICROS, [draft, archived]);
  eq(groups.length, 0, "no draft/archived blocks");
  eq(ungrouped.length, 4, "all micros ungrouped");
});

await T("buildPlaylistPayload refuses an empty title and keeps kind off the title", () => {
  let threw = false;
  try { buildPlaylistPayload({ title: "  ", kind: "micros" }); }
  catch (e) { threw = true; ok(e.code === "validation", "validation"); }
  ok(threw, "empty title refused");
  const p = buildPlaylistPayload({
    title: "From Signals to Strategy",
    description: "Short lessons.",
    kind: "micros",
    status: "draft",
    itemIds: ["micro-1", "micro-1", " micro-2 "],
  });
  eq(p.title, "From Signals to Strategy", "title");
  eq(p.kind, "micros", "kind field");
  ok(!/micros/i.test(p.title), "kind not in title");
  eq(normalizeItemIds(p.itemIds).join(","), "micro-1,micro-2", "deduped itemIds");
  eq(p.status, PLAYLIST_STATUS.DRAFT, "draft");
});

await T("seed script names the four live micros and the locked collection", () => {
  const src = read("scripts/seed-playlists.mjs");
  ok(src.includes("paaipe_playlists"), "collection");
  ok(src.includes("paaipe_micros"), "micros");
  for (const id of ["micro-1", "micro-2", "micro-3", "micro-4"]) ok(src.includes(id), id);
  ok(src.includes("Start with the question, not the dashboard"), "title 1");
  ok(src.includes("Keep the story honest"), "title 4");
  ok(src.includes("From Signals to Strategy"), "playlist title");
  ok(src.includes("kind: \"micros\""), "kind micros");
  ok(!/storagePath|posterUrl/.test(src.split("MICRO_RETITLES")[1] || src), "does not rewrite media in the retitle list");
});

const REAL_FB = read("assets/js/paaipe-firebase.js");
const REAL_LEARN = read("assets/js/paaipe-learnings-data.js");
const REAL_PL = read("assets/js/paaipe-playlists-data.js");

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

const learnStub = (sessions, micros) => `
  export * from '/assets/js/paaipe-learnings-data-real.js';
  export async function listPublishedSessions(){ return ${JSON.stringify(sessions)} }
  export async function listPublishedMicros(){ return ${JSON.stringify(micros)} }
`;

const plStub = (playlists) => `
  export * from '/assets/js/paaipe-playlists-data-real.js';
  export async function listPublishedPlaylists(){ return ${JSON.stringify(playlists)} }
  export async function listPlaylists(){ return ${JSON.stringify(playlists)} }
  export async function getPlaylist(id){
    return ${JSON.stringify(playlists)}.find(p => p.id === id) || null;
  }
  export async function listPlaylistItems(){ return [] }
`;

const fbAdmin = `
  export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){
    return { uid:'admin1', email:'admin@upupapp.asia', full_name:'Admin',
      status:'guest', isAgent:false, emailVerified:true };
  }
  export async function isAdminNow(){ return true }
  export async function signOutNow(){}
  export async function idTokenForRequest(){ return 'test-id-token' }
`;

const learnAdmin = `
  export * from '/assets/js/paaipe-learnings-data-real.js';
  window.__learnWrites = [];
  export async function listLearnings(kind){
    if (kind === 'micros') return ${JSON.stringify(MICROS)};
    return [{ id:'part1', title:'Part 1', source:'youtube', youtubeId:'ePw_wlPqYUk',
      published:true, displayOrder:1 }];
  }
  export async function saveLearning(kind, id, input){
    window.__learnWrites.push({ kind, id, ...input });
    return id || 'new1';
  }
  export async function deleteLearning(){}
  export async function reorderLearnings(){}
  export async function logLearningActivity(){}
`;

const plAdmin = `
  export * from '/assets/js/paaipe-playlists-data-real.js';
  window.__plWrites = [];
  export async function listPlaylists(){ return [] }
  export async function savePlaylist(id, input){
    window.__plWrites.push({ id, ...input });
    return id || 'pl-new';
  }
  export async function setPlaylistStatus(id, status){
    window.__plWrites.push({ id, status });
  }
  export async function reorderPlaylists(){}
`;

const br = await chromium.launch();
const errs = [];

async function openHub({ sessions = [], micros = MICROS, playlists = [PLAYLIST], hash = "" } = {}) {
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
    r.fulfill({ contentType: "text/javascript", body: learnStub(sessions, micros) }));
  await p.route("**/assets/js/paaipe-playlists-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_PL }));
  await p.route("**/assets/js/paaipe-playlists-data.js", r =>
    r.fulfill({ contentType: "text/javascript", body: plStub(playlists) }));
  await p.goto(`${BASE}/portal-sessions.html${hash}`, { waitUntil: "load" });
  await p.waitForSelector("html[data-sessions-ready]", { timeout: 9000 });
  return { p, ctx };
}

await T("portal Micros lists four clips ungrouped, without Firestore playlist blocks", async () => {
  const { p, ctx } = await openHub();
  await p.locator('[data-ss-hub-tab="micros"]').click();
  eq(await p.locator('[data-ss-hub-panel="micros"] [data-playlist]').count(), 0, "no playlist blocks");
  eq(await p.locator('[data-ss-hub-panel="micros"] .micro-card').count(), 4, "four cards");
  const titles = await p.locator('[data-ss-hub-panel="micros"] .micro-card .cap').allInnerTexts();
  eq(titles[0], "Start with the question, not the dashboard", "card 1 title");
  eq(titles[1], "Signals vs noise", "card 2 title");
  eq(titles[2], "From insight to a next step", "card 3 title");
  eq(titles[3], "Keep the story honest", "card 4 title");
  ok(!(await p.getByText("Micro 1").count()), "no Micro N");
  await ctx.close();
});

await T("play chrome shows the Micro title and the Micro description", async () => {
  const { p, ctx } = await openHub();
  await p.locator('[data-ss-hub-tab="micros"]').click();
  await p.locator(".micro-card [data-ss-open-player]").first().click();
  await p.locator("[data-ss-watch-popup]").waitFor({ state: "visible" });
  eq(await p.locator("[data-ss-watch-title]").innerText(),
    "Start with the question, not the dashboard", "chrome title");
  ok((await p.locator("[data-ss-watch-desc]").innerText()).includes("name the decision"),
    "micro description in chrome");
  eq(await p.locator("[data-ss-watch-panel]").getAttribute("data-aspect"), "9:16", "9:16");
  await ctx.close();
});

await T("Micro player has no Download; Share + Copy link use the portal deep link", async () => {
  const { p, ctx } = await openHub();
  await p.locator('[data-ss-hub-tab="micros"]').click();
  await p.locator(".micro-card [data-ss-open-player]").first().click();
  await p.locator("[data-ss-watch-popup]").waitFor({ state: "visible" });
  const video = p.locator("[data-ss-popup-player] video");
  await video.waitFor({ timeout: 5000 });
  const list = (await video.getAttribute("controlslist")) || "";
  ok(/nodownload/i.test(list), `controlslist=${list}`);
  ok(await video.evaluate(el => el.hasAttribute("playsinline") || el.playsInline), "playsinline");
  eq(await p.locator("[data-ss-share]").count(), 1, "Share");
  eq(await p.locator("[data-ss-copy-link]").count(), 1, "Copy link");
  ok(!(await p.getByText("Download", { exact: true }).count()), "no Download label");
  await p.evaluate(() => {
    window.__copied = "";
    navigator.clipboard.writeText = async t => { window.__copied = t; };
  });
  await p.locator("[data-ss-copy-link]").click();
  const copied = await p.waitForFunction(() => window.__copied, null, { timeout: 4000 })
    .then(() => p.evaluate(() => window.__copied));
  ok(/\/portal-sessions#tab=micros&play=micro-1$/.test(copied), `copied ${copied}`);
  ok(!/media\.paaipe\.org/.test(copied), "no CDN");
  ok(!/youtube\.com|youtu\.be/.test(copied), "no YouTube");
  await ctx.close();
});

await T("a signed-out Micro deep link goes to sign-in, then back to that Micro", async () => {
  const signedOut = `
    export * from '/assets/js/paaipe-firebase-real.js';
    export function isConfigured(){ return true }
    export async function currentAgent(){ return null }
  `;
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: signedOut }));
  await p.goto(`${BASE}/portal-sessions.html#tab=micros&play=micro-1`, { waitUntil: "domcontentloaded" });
  await p.waitForURL(/signin\.html\?next=/, { timeout: 9000 });
  const next = new URL(p.url()).searchParams.get("next") || "";
  eq(next, "portal-sessions.html#tab=micros&play=micro-1", "next preserves the play hash");
  ok(!/media\.paaipe\.org/.test(next), "next is not a CDN url");
  await ctx.close();
});

await T("after sign-in, that same next URL opens the Micro on Micros", async () => {
  const { p, ctx } = await openHub({ hash: "#tab=micros&play=micro-2" });
  await p.locator("[data-ss-watch-popup]").waitFor({ state: "visible", timeout: 9000 });
  eq(await p.locator("[data-ss-watch-title]").innerText(), "Signals vs noise", "opens that micro");
  ok(await p.locator('[data-ss-hub-tab="micros"]').evaluate(el => el.classList.contains("on")),
    "micros tab");
  ok(/\/portal-sessions(?:\.html)?#tab=micros&play=micro-2/.test(p.url()), `url ${p.url()}`);
  await ctx.close();
});

await T("draft playlists stay off the Playlists tab; published API rows show", async () => {
  const { p, ctx } = await openHub({
    playlists: [{ ...PLAYLIST, status: "draft" }],
  });
  await p.locator('[data-ss-hub-tab="micros"]').click();
  eq(await p.locator("[data-playlist]").count(), 0, "no playlist grouping");
  eq(await p.locator(".micro-card").count(), 4, "items still listed");
  await p.locator('[data-ss-hub-tab="playlists"]').click();
  eq(await p.locator("[data-ss-live-playlists] [data-playlist]").count(), 0, "draft hidden");
  ok(await p.locator("[data-ss-playlists-empty]").isVisible(), "empty published playlists");
  await ctx.close();
});

await T("Playlists tab after Micros lists the seeded micros playlist from the API", async () => {
  const { p, ctx } = await openHub();
  const tabs = p.locator("[data-ss-hub-tab]");
  eq(await tabs.count(), 3, "three tabs");
  eq(await tabs.nth(0).innerText(), "Sessions", "Sessions first");
  eq(await tabs.nth(1).innerText(), "Micros", "Micros second");
  eq(await tabs.nth(2).innerText(), "Playlists", "Playlists third");
  await p.locator('[data-ss-hub-tab="micros"]').click();
  eq(await p.locator("[data-ss-micro-count]").innerText(), "4 published · 9:16", "micro count matches list");
  eq(await p.locator('[data-ss-hub-panel="micros"] .micro-card').count(), 4, "four micros");
  eq(await p.locator('[data-ss-hub-panel="micros"] [data-playlist]').count(), 0,
    "Micros stay ungrouped");
  await p.locator('[data-ss-hub-tab="playlists"]').click();
  await p.waitForFunction(() => /#tab=playlists/.test(location.hash), { timeout: 4000 });
  eq(await p.locator("[data-ss-playlist-count]").innerText(), "1 published", "one published playlist");
  eq(await p.locator('[data-ss-hub-panel="playlists"] [data-playlist]').count(), 1,
    "lists the API playlist");
  ok((await p.locator("[data-ss-live-playlists]").innerText()).includes("From Signals to Strategy"),
    "seeded title");
  ok((await p.locator("[data-ss-live-playlists]").innerText()).includes("4 items"), "item count");
  ok(!(await p.locator("[data-ss-playlists-empty]").isVisible()), "not empty");
  ok(!(await p.locator("[data-ss-watch-popup]").isVisible()), "no auto-play");
  await ctx.close();
});

await T("Open playlist paints the four micros and keeps Sessions/Micros ungrouped", async () => {
  const { p, ctx } = await openHub();
  await p.locator('[data-ss-hub-tab="playlists"]').click();
  await p.locator("[data-ss-open-playlist]").click();
  await p.waitForFunction(() => /playlist=pl-signals/.test(location.hash), { timeout: 4000 });
  await p.waitForSelector('[data-ss-hub-panel="playlists"] .micro-card', { timeout: 5000 });
  eq(await p.locator('[data-ss-hub-panel="playlists"] .micro-card').count(), 4, "four items");
  const titles = await p.locator('[data-ss-hub-panel="playlists"] .micro-card .cap').allInnerTexts();
  eq(titles[0], "Start with the question, not the dashboard", "item 1");
  eq(titles[3], "Keep the story honest", "item 4");
  await p.locator('[data-ss-hub-tab="sessions"]').click();
  eq(await p.locator('[data-ss-hub-panel="sessions"] [data-playlist]').count(), 0, "sessions ungrouped");
  await ctx.close();
});

await T("admin can open a Playlist editor for Sessions and Micros", async () => {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(String(e)));
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: fbAdmin }));
  await p.route("**/assets/js/paaipe-learnings-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_LEARN }));
  await p.route("**/assets/js/paaipe-learnings-data.js", r =>
    r.fulfill({ contentType: "text/javascript", body: learnAdmin }));
  await p.route("**/assets/js/paaipe-playlists-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_PL }));
  await p.route("**/assets/js/paaipe-playlists-data.js", r =>
    r.fulfill({ contentType: "text/javascript", body: plAdmin }));
  await p.goto(`${BASE}/admin-learnings.html`, { waitUntil: "load" });
  await p.waitForSelector("html[data-admin-learnings]", { timeout: 9000 });
  await p.locator('[data-learn-tab="playlists"]').click();
  ok(await p.locator('[data-learn-panel="playlists"]').isVisible(), "playlists panel");
  await p.locator('[data-add="playlists"]').click();
  await p.waitForSelector("[data-f-pl-title]", { timeout: 5000 });
  await p.locator("[data-f-pl-title]").fill("From Signals to Strategy");
  await p.locator("[data-f-pl-desc]").fill(PLAYLIST.description);
  await p.locator('[data-pl-kind="micros"]').click();
  await p.locator("[data-pl-add-select]").selectOption("micro-1");
  await p.locator('[data-pl-status="published"]').click();
  await p.locator("[data-pl-save]").click();
  await p.waitForFunction(() => (window.__plWrites || []).length > 0, null, { timeout: 9000 });
  const writes = await p.evaluate(() => window.__plWrites);
  eq(writes[0].title, "From Signals to Strategy", "title");
  eq(writes[0].kind, "micros", "kind");
  eq(writes[0].status, "published", "published");
  eq(writes[0].itemIds[0], "micro-1", "item id");
  await p.locator('[data-learn-tab="sessions"]').click();
  ok(await p.locator('[data-add="sessions"]').isVisible(), "sessions add still there");
  await p.locator('[data-learn-tab="micros"]').click();
  ok(await p.locator('[data-add="micros"]').isVisible(), "micros add still there");
  await ctx.close();
});

await br.close();
if (errs.length) console.log("page errors:", errs.slice(0, 5).join("\n"));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
