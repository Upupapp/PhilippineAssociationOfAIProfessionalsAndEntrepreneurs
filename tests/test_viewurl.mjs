/* In-page views must change the address bar, survive refresh, and honour Back.
 *
 * Pages are already separate HTML files. This suite covers the nested views
 * that used to change the screen while the URL stayed put.
 */
import { chromium } from "playwright";
import { readFileSync } from "fs";
import { pathToFileURL } from "url";

const BASE = process.env.PAAIPE_BASE||"http://127.0.0.1:8899";
const ROOT = process.env.PAAIPE_ROOT||"/Users/user/Philippine-Association-of-AI";
const {
  parsePairs, formatHash,
} = await import(pathToFileURL(`${ROOT}/assets/js/paaipe-view-url.js`));

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

await T("parsePairs / formatHash round-trip the existing hash contracts", () => {
  eq(formatHash({ tab: "micros" }), "#tab=micros", "learnings tab");
  eq(formatHash({ event: "e-oct", tab: "media" }), "#event=e-oct&tab=media", "admin workspace");
  eq(formatHash({ tab: "sessions", play: "part1" }), "#tab=sessions&play=part1", "play popup");
  eq(formatHash({}), "", "empty");
  eq(parsePairs("#tab=micros").tab, "micros", "parse tab");
  eq(parsePairs("event=e-oct&tab=media").event, "e-oct", "parse event");
  eq(parsePairs("#filter=upcoming").filter, "upcoming", "parse filter");
  eq(parsePairs("").tab, undefined, "empty parse");
});

await T("helper lives in the repo and existing Learnings links still name #tab=", () => {
  const view = read("assets/js/paaipe-session-view.js");
  ok(view.includes("paaipe-view-url.js"), "session-view uses the helper");
  ok(view.includes("writeHash") || view.includes("patchHash"), "writes the hash");
  ok(view.includes("playFromLocation") || view.includes("play:"), "play popup is in the URL");
  const entry = read("assets/js/paaipe-entry-popup.js");
  ok(entry.includes("portal-sessions.html#tab=sessions"), "entry popup sessions");
  ok(entry.includes("portal-sessions.html#tab=micros"), "entry popup micros");
  ok(read("netlify.toml").includes("from = \"/*.html\""), "pretty-URL redirects stay");
  const portalEv = read("assets/js/paaipe-portal-events.js");
  ok(portalEv.includes("paaipe-view-url.js"), "portal Event Details uses the helper");
  ok(portalEv.includes('event: ev.id') || portalEv.includes("event:"), "writes #event=");
});

await T("watch and slides still use ?session= (not a new path)", () => {
  const view = read("assets/js/paaipe-session-view.js");
  ok(view.includes("portal-session-slides.html?session="), "slides query");
  ok(view.includes("portal-session-watch.html?session="), "watch query");
  ok(view.includes('searchParams.set("rec"'), "rec query preserved");
  const slides = read("portal-session-slides.html");
  ok(slides.includes('get("session")'), "slides reads ?session=");
});

const br = await chromium.launch();
const errs = [];
const REAL_FB = read("assets/js/paaipe-firebase.js");
const REAL_LEARN = read("assets/js/paaipe-learnings-data.js");
const REAL_PL = read("assets/js/paaipe-playlists-data.js");
const memberFb = `
  export * from '/assets/js/paaipe-firebase-real.js';
  export function isConfigured(){ return true }
  export async function currentAgent(){
    return {
      uid:'u1', email:'member@example.com', full_name:'Rosa Villanueva',
      status:'agent', isAgent:true, emailVerified:true,
      directoryVisible:false, agentNumber:'0006', confirmationSeen:true
    };
  }`;

async function page(path) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(String(e)));
  await p.goto(`${BASE}/${path}`, { waitUntil: "load" });
  return { p, ctx };
}

async function memberPage(path, extraRoutes = async () => {}) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(String(e)));
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: memberFb }));
  await extraRoutes(p);
  await p.goto(`${BASE}/${path}`, { waitUntil: "load" });
  return { p, ctx };
}

await T("Events chips write #filter= and Back restores the previous view", async () => {
  const { p, ctx } = await page("events.html");
  await p.locator('[data-filter="upcoming"]').click();
  ok(/#filter=upcoming/.test(p.url()), `upcoming url: ${p.url()}`);
  ok(await p.locator('.ecell[data-status="upcoming"]').first().isVisible(), "upcoming shown");
  eq(await p.locator('.ecell[data-status="past"]').first().isVisible(), false, "past hidden");
  await p.locator('[data-filter="past"]').click();
  ok(/#filter=past/.test(p.url()), "past url");
  ok(!(await p.locator(".featured").isVisible()), "featured hidden on past");
  await p.goBack();
  await p.waitForFunction(() => /filter=upcoming/.test(location.hash), { timeout: 4000 });
  ok(await p.locator('.ecell[data-status="upcoming"]').first().isVisible(), "back to upcoming");
  await ctx.close();
});

await T("a pasted Events filter opens that view", async () => {
  const { p, ctx } = await page("events.html#filter=past");
  ok(!(await p.locator(".featured").isVisible()), "past hides featured");
  ok(await p.locator('.chip[data-filter="past"]').evaluate(el => el.classList.contains("on")), "past chip on");
  await ctx.close();
});

await T("Resources chips write #filter= and honour a pasted link", async () => {
  const { p, ctx } = await memberPage("resources.html");
  await p.waitForSelector('html[data-gate="ok"]', { timeout: 9000 });
  await p.locator('.chips [data-filter="video"]').click();
  ok(/#filter=video/.test(p.url()), `video url: ${p.url()}`);
  await ctx.close();
  const pasted = await memberPage("resources.html#filter=presentation");
  await pasted.p.waitForSelector('html[data-gate="ok"]', { timeout: 9000 });
  ok(await pasted.p.locator('.chip[data-filter="presentation"]').evaluate(el => el.classList.contains("on")),
    "presentation chip on from hash");
  await pasted.ctx.close();
});

await T("Partners chips write #filter=", async () => {
  const { p, ctx } = await page("partners.html");
  await p.locator('[data-filter="education"]').click();
  ok(/#filter=education/.test(p.url()), `education url: ${p.url()}`);
  await p.goBack();
  await p.waitForFunction(() => !/filter=education/.test(location.hash), { timeout: 4000 });
  await ctx.close();
});

await T("Portal Resources chips write #filter=", async () => {
  const { p, ctx } = await memberPage("portal-resources.html");
  await p.locator('.libchip[data-filter="slides"]').click();
  ok(/#filter=slides/.test(p.url()), `slides url: ${p.url()}`);
  await ctx.close();
});

await T("Registration steps write #step= and Back returns to the previous step", async () => {
  const { p, ctx } = await page("register-2026-10-ai-exchange.html");
  await p.fill('[name="full_name"]', "Maria Santos");
  await p.fill('[name="email"]', "maria@example.com");
  await p.locator('input[name="profile"][value="founder"]').check();
  await p.locator("[data-next]").first().click();
  await p.waitForFunction(() => location.hash === "#step=2", { timeout: 4000 });
  ok(await p.locator('[data-step="2"]').evaluate(el => el.classList.contains("on")), "step 2 on");
  await p.goBack();
  await p.waitForFunction(() => !location.hash || location.hash === "#", { timeout: 4000 });
  ok(await p.locator('[data-step="1"]').evaluate(el => el.classList.contains("on")), "back to step 1");
  await ctx.close();
});

await T("a pasted registration step opens that step", async () => {
  const { p, ctx } = await page("register-2026-10-ai-exchange.html#step=3");
  ok(await p.locator('[data-step="3"]').evaluate(el => el.classList.contains("on")), "step 3 from hash");
  await ctx.close();
});

const learnStub = `
  export * from '/assets/js/paaipe-learnings-data-real.js';
  export async function listPublishedSessions(){ return [
    { id:'part1', title:'Part 1', source:'youtube', youtubeId:'ePw_wlPqYUk', published:true, displayOrder:1 }
  ]; }
  export async function listPublishedMicros(){ return [
    { id:'m1', title:'Micro one', source:'youtube', youtubeId:'ePw_wlPqYUk', published:true, displayOrder:1 }
  ]; }
`;

const plStub = `
  export * from '/assets/js/paaipe-playlists-data-real.js';
  export async function listPublishedPlaylists(){ return [] }
  export async function listPlaylists(){ return [] }
  export async function listPlaylistItems(){ return [] }
`;

async function openHub(hash = "") {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(String(e)));
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: memberFb }));
  await p.route("**/assets/js/paaipe-learnings-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_LEARN }));
  await p.route("**/assets/js/paaipe-learnings-data.js", r =>
    r.fulfill({ contentType: "text/javascript", body: learnStub }));
  await p.route("**/assets/js/paaipe-playlists-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_PL }));
  await p.route("**/assets/js/paaipe-playlists-data.js", r =>
    r.fulfill({ contentType: "text/javascript", body: plStub }));
  await p.goto(`${BASE}/portal-sessions.html${hash}`, { waitUntil: "load" });
  await p.waitForSelector("html[data-sessions-ready]", { timeout: 9000 });
  return { p, ctx };
}

await T("Learnings Micros tab writes #tab=micros; Back returns to Sessions", async () => {
  const { p, ctx } = await openHub();
  await p.locator('[data-ss-hub-tab="micros"]').click();
  await p.waitForFunction(() => /tab=micros/.test(location.hash), { timeout: 4000 });
  ok(await p.locator('[data-ss-hub-panel="micros"]').isVisible(), "micros panel");
  await p.goBack();
  await p.waitForFunction(() => /tab=sessions/.test(location.hash) || !location.hash, { timeout: 4000 });
  ok(await p.locator('[data-ss-hub-panel="sessions"]').isVisible(), "back to sessions");
  await ctx.close();
});

await T("Learnings play popup writes #play= and a pasted link reopens it", async () => {
  const { p, ctx } = await openHub();
  await p.locator("[data-ss-open-player]").first().click();
  await p.locator("[data-ss-watch-popup]").waitFor({ state: "visible" });
  ok(/play=part1/.test(p.url()), `play in url: ${p.url()}`);
  await p.locator(".ss-watch-close").click();
  ok(!(await p.locator("[data-ss-watch-popup]").isVisible()), "closed");
  ok(!/play=/.test(new URL(p.url()).hash), "play dropped from hash");
  await ctx.close();

  const pasted = await openHub("#tab=micros&play=m1");
  await pasted.p.locator("[data-ss-watch-popup]").waitFor({ state: "visible", timeout: 5000 });
  eq(await pasted.p.locator("[data-ss-watch-panel]").getAttribute("data-aspect"), "9:16", "micro aspect");
  await pasted.ctx.close();
});

await T("#tab=micros from the entry popup still opens Micros", async () => {
  const { p, ctx } = await openHub("#tab=micros");
  ok(await p.locator('[data-ss-hub-panel="micros"]').isVisible(), "micros from hash");
  ok(!(await p.locator('[data-ss-hub-panel="sessions"]').isVisible()), "sessions hidden");
  await ctx.close();
});

const REAL_DATA = read("assets/js/paaipe-events-data.js");
const REAL_API = read("assets/js/paaipe-api.js");
const orgFb = `
  export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){return {
    uid:'u1', email:'rosa@example.com', full_name:'Rosa', status:'agent',
    isAgent:true, emailVerified:true, directoryVisible:false,
    agentNumber:'0006', confirmationSeen:true
  }}`;
const orgData = `
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function listMyOrganizations(){ return [] }
  export async function listEvents(){ return [] }
  export async function myApplications(){ return new Map() }
  export async function saveMyOrganization(fields){ return { id:'new-org', ...fields, status:'inactive' } }
`;

await T("My Organization Add writes ?new=1; Back returns to the list", async () => {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(String(e)));
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: orgFb }));
  await p.route("**/assets/js/paaipe-events-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_DATA }));
  await p.route("**/assets/js/paaipe-events-data.js", r =>
    r.fulfill({ contentType: "text/javascript", body: orgData }));
  await p.goto(`${BASE}/portal-organization.html`, { waitUntil: "load" });
  await p.waitForSelector("html[data-org-ready]", { timeout: 9000 });
  await p.locator("[data-org-add]").click();
  await p.waitForFunction(() => /new=1/.test(location.search), { timeout: 4000 });
  eq(await p.getAttribute("html", "data-org-view"), "editor", "editor");
  await p.goBack();
  await p.waitForFunction(() => !/new=1/.test(location.search), { timeout: 4000 });
  eq(await p.getAttribute("html", "data-org-view"), "empty", "back to empty list");
  await ctx.close();
});

const EV = { id: "e-oct", slug: "event-2026-10-ai-exchange", title: "AI Exchange — October 2026",
  status: "registration_open", date: "2026-10-13", startTime: "20:00", endTime: "21:30",
  timezone: "Asia/Manila" };
const adminFb = `export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){return {uid:'a1',email:'admin@upupapp.asia',status:'guest'}}
  export async function isAdminNow(){return true}
  export async function signOutNow(){}
  export async function idTokenForRequest(){ return 'test-id-token' }`;
const adminData = `
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function listEvents(){ return ${JSON.stringify([EV])} }
  export async function listOrganizations(){ return [] }
  export async function listEventSponsors(){ return [] }
  export async function listPartnerApplicationsFor(){ return [] }
  export async function listAllRegistrations(){ return [] }`;
const adminApi = `
  export * from '/assets/js/paaipe-api-real.js';
  export async function listAdminEvents(){ return ${JSON.stringify([EV])} }`;

await T("Admin event workspace writes #event= on open and #tab= on a deeper tab; refresh restores", async () => {
  const ctx = await br.newContext({ viewport: { width: 1400, height: 1000 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(String(e)));
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: adminFb }));
  await p.route("**/assets/js/paaipe-events-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_DATA }));
  await p.route("**/assets/js/paaipe-events-data.js", r =>
    r.fulfill({ contentType: "text/javascript", body: adminData }));
  await p.route("**/assets/js/paaipe-api-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_API }));
  await p.route("**/assets/js/paaipe-api.js", r =>
    r.fulfill({ contentType: "text/javascript", body: adminApi }));
  await p.goto(`${BASE}/admin-events.html`, { waitUntil: "load" });
  await p.waitForSelector("html[data-admin-events]", { timeout: 9000 });
  await p.click('tr[data-event="e-oct"] [data-edit-event]');
  await p.waitForSelector("[data-event-tabs] button", { timeout: 9000 });
  ok(/event=e-oct/.test(p.url()), `event in url after open: ${p.url()}`);
  ok(/tab=details/.test(p.url()), "details tab in url");
  await p.click('[data-tab="media"]');
  ok(/tab=media/.test(p.url()), "media tab");
  await p.goBack();
  await p.waitForFunction(() => /tab=details/.test(location.hash), { timeout: 4000 });
  ok(await p.locator('[data-tabpanel="details"]').isVisible(), "back to details");
  const hashed = new URL(p.url()).hash;
  await p.goto(`${BASE}/admin-events.html${hashed}`, { waitUntil: "load" });
  await p.waitForSelector("html[data-admin-events]", { timeout: 9000 });
  await p.waitForSelector("[data-event-tabs] button", { timeout: 9000 });
  ok(await p.locator('[data-tabpanel="details"]').isVisible(), "refresh restores the workspace");
  await ctx.close();
});

await T("Admin door Forgot password writes #door=forgot; Back returns to sign-in", async () => {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(String(e)));
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: `
      export * from '/assets/js/paaipe-firebase-real.js';
      export async function currentAgent(){return null}
      export async function isAdminNow(){return false}
    ` }));
  await p.goto(`${BASE}/admin.html`, { waitUntil: "load" });
  await p.waitForSelector('html[data-admin-door="ready"]', { timeout: 9000 });
  await p.getByRole("button", { name: "Forgot password" }).click();
  await p.waitForFunction(() => /door=forgot/.test(location.hash), { timeout: 4000 });
  ok(await p.locator('[data-panel="forgot"]').isVisible(), "forgot panel");
  await p.goBack();
  await p.waitForFunction(() => !/door=forgot/.test(location.hash), { timeout: 4000 });
  ok(await p.locator('[data-panel="signin"]').isVisible(), "back to sign-in");
  await ctx.close();

  const pasted = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const pp = await pasted.newPage();
  pp.on("pageerror", e => errs.push(String(e)));
  await pp.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await pp.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: `
      export * from '/assets/js/paaipe-firebase-real.js';
      export async function currentAgent(){return null}
      export async function isAdminNow(){return false}
    ` }));
  await pp.goto(`${BASE}/admin.html#door=forgot`, { waitUntil: "load" });
  await pp.waitForSelector('html[data-admin-door="ready"]', { timeout: 9000 });
  ok(await pp.locator('[data-panel="forgot"]').isVisible(), "pasted #door=forgot");
  await pasted.close();
});

await T("no console errors", () => ok(errs.length === 0, errs.join(" | ")));

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();
process.exit(fail ? 1 : 0);
