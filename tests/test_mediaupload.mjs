/* media.paaipe.org upload plumbing: request shape, no invented URL, existing controls. */
import { readFileSync, existsSync } from "fs";
import { pathToFileURL } from "url";
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

const media = await import(pathToFileURL(`${ROOT}/assets/js/paaipe-media.js`).href);

function formEntries(form) {
  const out = {};
  for (const [k, v] of form.entries()) out[k] = v;
  return out;
}

await T("source: no Firebase Storage, no Referral Bunny, endpoint is media.paaipe.org", () => {
  for (const p of [
    "assets/js/paaipe-media.js",
    "assets/js/paaipe-firebase.js",
    "assets/js/paaipe-profile-photo.js",
    "assets/js/paaipe-admin-learnings.js",
    "assets/js/paaipe-admin-orgs.js",
  ]) {
    const s = read(p);
    ok(!/firebase-storage/.test(s), `${p} must not import Firebase Storage`);
    ok(!/bunnycdn|b-cdn\.net|referral.?bunny/i.test(s.split("\n").filter(l => !l.trim().startsWith("*") && !l.trim().startsWith("//")).join("\n")),
       `${p} must not call Referral Bunny`);
  }
  eq(media.MEDIA_UPLOAD_ENDPOINT, "https://media.paaipe.org/upload", "endpoint");
  ok(existsSync(`${ROOT}/assets/js/paaipe-media.js`), "client module");
});

await T("buildMediaFormData: photo omits id; other kinds require it", () => {
  const file = new File(["x"], "p.jpg", { type: "image/jpeg" });
  const photo = formEntries(media.buildMediaFormData({ file, kind: "photo" }));
  eq(photo.kind, "photo", "kind");
  ok(photo.file, "file");
  ok(!("id" in photo), "photo has no id");

  const logo = formEntries(media.buildMediaFormData({ file, kind: "logo", id: "gethired" }));
  eq(logo.kind, "logo", "logo kind");
  eq(logo.id, "gethired", "logo id");

  let threw = false;
  try { media.buildMediaFormData({ file, kind: "session" }); }
  catch (e) { threw = true; ok(e.code === "media/no-id", `code ${e.code}`); }
  ok(threw, "session without id is refused");
});

await T("postMediaUpload request shape: Bearer, multipart file+kind, 201 returns url+path", async () => {
  const file = new File(["hi"], "talk.mp4", { type: "video/mp4" });
  let captured;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return new Response(JSON.stringify({
      url: "https://media.paaipe.org/sessions/abc.mp4",
      path: "sessions/abc.mp4",
      kind: "session",
    }), { status: 201, headers: { "content-type": "application/json" } });
  };
  const out = await media.postMediaUpload({
    file, kind: "session", id: "learn-1", token: "tok-123", fetchImpl,
  });
  eq(captured.url, "https://media.paaipe.org/upload", "POST url");
  eq(captured.opts.method, "POST", "method");
  eq(captured.opts.headers.Authorization, "Bearer tok-123", "Authorization");
  ok(captured.opts.body instanceof FormData, "FormData body");
  const fields = formEntries(captured.opts.body);
  eq(fields.kind, "session", "kind field");
  eq(fields.id, "learn-1", "id field");
  ok(fields.file, "file field");
  eq(out.url, "https://media.paaipe.org/sessions/abc.mp4", "returned url");
  eq(out.path, "sessions/abc.mp4", "returned path");
  eq(out.kind, "session", "returned kind");
});

await T("a failed POST throws and does not invent a url", async () => {
  const file = new File(["x"], "p.jpg", { type: "image/jpeg" });
  const fetchImpl = async () => new Response("nope", { status: 500 });
  let out = "SENTINEL";
  try {
    out = await media.postMediaUpload({ file, kind: "photo", token: "tok", fetchImpl });
    throw new Error("should have thrown");
  } catch (e) {
    ok(e.code === "media/upload-failed", `code ${e.code}`);
    ok(/Nothing was uploaded/i.test(e.message), e.message);
    eq(out, "SENTINEL", "must not assign a return value");
  }
});

await T("401/403 stay honest; 201 without url is refused", async () => {
  const file = new File(["x"], "p.jpg", { type: "image/jpeg" });
  try {
    await media.postMediaUpload({
      file, kind: "photo", token: "tok",
      fetchImpl: async () => new Response("", { status: 401 }),
    });
    throw new Error("401 should throw");
  } catch (e) { eq(e.code, "media/unauthorized", "401"); eq(e.status, 401, "status 401"); }

  try {
    await media.postMediaUpload({
      file, kind: "logo", id: "org1", token: "tok",
      fetchImpl: async () => new Response("", { status: 403 }),
    });
    throw new Error("403 should throw");
  } catch (e) { eq(e.code, "media/forbidden", "403"); }

  try {
    await media.postMediaUpload({
      file, kind: "photo", token: "tok",
      fetchImpl: async () => new Response(JSON.stringify({ path: "agents/u/profile.jpg" }), { status: 201 }),
    });
    throw new Error("missing url should throw");
  } catch (e) { eq(e.code, "media/invalid-response", "no invented url from path"); }

  try {
    await media.postMediaUpload({
      file, kind: "photo", token: "tok",
      fetchImpl: async () => new Response(JSON.stringify({
        url: "https://example.com/fake.jpg", path: "agents/u/profile.jpg",
      }), { status: 201 }),
    });
    throw new Error("non-media url should throw");
  } catch (e) { eq(e.code, "media/invalid-response", "reject non-media url"); }

  try {
    await media.postMediaUpload({ file, kind: "photo", fetchImpl: async () => new Response("{}") });
    throw new Error("missing token should throw");
  } catch (e) { eq(e.code, "not-signed-in", "no token"); }
});

await T("YouTube payload still builds without an upload", () => {
  const src = read("assets/js/paaipe-learnings-data.js");
  const start = src.indexOf("export function youtubeIdFromUrl");
  const end = src.indexOf("export function youtubeWatchUrl");
  const fnSrc = src.slice(start, end).replace("export function", "function");
  const fn = new Function(`${fnSrc}; return youtubeIdFromUrl;`)();
  eq(fn("https://youtu.be/0PkiRVczWdQ"), "0PkiRVczWdQ", "youtube still derives");
});

await T("admin org editor keeps the path field and adds a file picker", () => {
  const js = read("assets/js/paaipe-admin-orgs.js");
  ok(js.includes("data-o-logo"), "path field stays");
  ok(js.includes("data-o-logo-file"), "file picker");
  ok(js.includes("MEDIA_KIND.LOGO") || /kind:\s*MEDIA_KIND.LOGO/.test(js), "kind=logo");
  ok(!/Logo upload is not built/.test(js), "must not still say upload is not built");
  ok(/data-o-name/.test(js) && /data-o-web/.test(js) && /data-o-status/.test(js),
     "rest of the org form is unchanged");
});

await T("firestore.rules: photoUrl on self-update; learnings storagePath left allowed", () => {
  const r = read("firestore.rules");
  ok(/hasOnly\(\['full_name','updates','directoryVisible','confirmation_seen','photoUrl'\]\)/.test(r),
     "photoUrl added to self hasOnly and nothing else");
  ok(/posterStoragePath/.test(r) && /storagePath/.test(r), "learnings paths still allowed");
});

/* -------------------- Playwright: learnings + orgs against the live controls */

const REAL_FB = read("assets/js/paaipe-firebase.js");
const REAL_LEARN = read("assets/js/paaipe-learnings-data.js");
const REAL_PL = read("assets/js/paaipe-playlists-data.js");
const REAL_DATA = read("assets/js/paaipe-events-data.js");

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
  export async function listLearnings(){ return [] }
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
  export async function listPlaylists(){ return [] }
  export async function savePlaylist(){ return 'pl' }
  export async function setPlaylistStatus(){}
  export async function reorderPlaylists(){}
`;

const dataAdmin = `
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function listOrganizations(){
    return [{ id:'gethired', name:'GetHired Online', website:'https://gethired.ph',
      status:'active', type:'sponsor', logoUrl:'assets/img/partners/logo-gethired.png' }];
  }
  export async function listEvents(){ return [] }
  export async function listEventSponsors(){ return [] }
`;

const br = await chromium.launch();
const errs = [];

function attachMedia(page, { status = 201, json } = {}) {
  const captured = [];
  page.route("https://media.paaipe.org/upload", async route => {
    const req = route.request();
    captured.push({
      method: req.method(),
      url: req.url(),
      authorization: req.headers().authorization || "",
      contentType: req.headers()["content-type"] || "",
      body: (req.postDataBuffer() || Buffer.alloc(0)).toString("latin1"),
    });
    if (status !== 201) return route.fulfill({ status, body: "nope" });
    const body = json || {
      url: "https://media.paaipe.org/sessions/x.mp4",
      path: "sessions/x.mp4",
      kind: "session",
    };
    return route.fulfill({
      status: 201, contentType: "application/json", body: JSON.stringify(body),
    });
  });
  return captured;
}

await T("YouTube save still works with no media POST", async () => {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(String(e)));
  const captured = attachMedia(p, { status: 500 });
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
  await p.locator('[data-add="sessions"]').click();
  await p.waitForSelector("[data-editor] [data-f-title]", { timeout: 5000 });
  ok(!(await p.locator("[data-f-file]").isDisabled()), "file input enabled");
  await p.locator("[data-f-title]").fill("Part 1 — Presentation");
  await p.locator("[data-f-youtube]").fill("https://www.youtube.com/watch?v=ePw_wlPqYUk");
  await p.locator("[data-save]").click();
  await p.waitForFunction(() => (window.__learnWrites || []).length > 0, null, { timeout: 9000 });
  const writes = await p.evaluate(() => window.__learnWrites);
  eq(writes.length, 1, "one save");
  eq(writes[0].source, "youtube", "youtube source");
  eq(captured.length, 0, "YouTube path must not POST to media");
  await ctx.close();
});

await T("Learnings upload POSTs kind=session with id; failed POST writes no path", async () => {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(String(e)));
  const captured = attachMedia(p, { status: 500 });
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
  await p.locator('[data-add="sessions"]').click();
  await p.locator("[data-f-title]").fill("Uploaded session");
  await p.locator('[data-source="upload"]').click();
  await p.locator("[data-f-file]").setInputFiles({
    name: "talk.mp4", mimeType: "video/mp4", buffer: Buffer.from("fake-mp4"),
  });
  await p.locator("[data-save]").click();
  await p.waitForFunction(() => {
    const el = document.querySelector("[data-flash]");
    return el && el.textContent.trim();
  }, null, { timeout: 9000 });
  const writes = await p.evaluate(() => window.__learnWrites);
  eq(writes.length, 0, "failed POST must not saveLearning");
  ok(captured.length >= 1, "POST attempted");
  const req = captured[0];
  eq(req.method, "POST", "method");
  eq(req.url, "https://media.paaipe.org/upload", "url");
  eq(req.authorization, "Bearer test-id-token", "bearer");
  ok(/multipart\/form-data/i.test(req.contentType), "multipart");
  ok(/name="file"/.test(req.body), "file");
  ok(/name="kind"/.test(req.body) && /session/.test(req.body), "kind=session");
  ok(/name="id"/.test(req.body), "id present for session");
  const flash = await p.locator("[data-flash]").innerText();
  ok(/Nothing was uploaded|failed/i.test(flash), `honest error: ${flash}`);
  ok(!/https:\/\/media\.paaipe\.org\/invented/.test(flash), "no invented url");
  await ctx.close();
});

await T("Learnings upload 201 stores returned path, not an invented url", async () => {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(String(e)));
  attachMedia(p, {
    json: { url: "https://media.paaipe.org/sessions/x.mp4", path: "sessions/x.mp4", kind: "session" },
  });
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
  await p.locator('[data-add="sessions"]').click();
  await p.locator("[data-f-title]").fill("Uploaded session");
  await p.locator('[data-source="upload"]').click();
  await p.locator("[data-f-file]").setInputFiles({
    name: "talk.mp4", mimeType: "video/mp4", buffer: Buffer.from("fake-mp4"),
  });
  await p.locator("[data-save]").click();
  await p.waitForFunction(() => (window.__learnWrites || []).length > 0, null, { timeout: 9000 });
  const writes = await p.evaluate(() => window.__learnWrites);
  eq(writes[0].storagePath, "sessions/x.mp4", "storagePath from returned path");
  eq(writes[0].source, "upload", "upload source");
  ok(writes[0].storagePath !== writes[0].youtubeUrl, "must not stuff the media url into youtube");
  await ctx.close();
});

await T("org logo pick POSTs kind=logo with id; failed POST leaves the path field", async () => {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(String(e)));
  const captured = attachMedia(p, { status: 403 });
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: fbAdmin }));
  await p.route("**/assets/js/paaipe-events-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_DATA }));
  await p.route("**/assets/js/paaipe-events-data.js", r =>
    r.fulfill({ contentType: "text/javascript", body: dataAdmin }));
  await p.goto(`${BASE}/admin-organizations.html`, { waitUntil: "load" });
  await p.waitForSelector("html[data-admin-orgs]", { timeout: 9000 });
  await p.locator("[data-edit-org]").click();
  await p.waitForSelector("[data-o-logo]", { timeout: 5000 });
  const before = await p.locator("[data-o-logo]").inputValue();
  ok(before.length > 0, "existing path stays until a successful POST");
  await p.locator("[data-o-logo-file]").setInputFiles({
    name: "logo.png", mimeType: "image/png",
    buffer: readFileSync(`${ROOT}/assets/img/paaipe-logo.png`),
  });
  await p.waitForFunction(() => {
    const el = document.querySelector("[data-flash]");
    return el && el.textContent.trim();
  }, null, { timeout: 9000 });
  eq(await p.locator("[data-o-logo]").inputValue(), before, "failed POST must not invent a logo url");
  ok(captured.length >= 1, "POST attempted");
  ok(/name="kind"/.test(captured[0].body) && /logo/.test(captured[0].body), "kind=logo");
  ok(/name="id"/.test(captured[0].body) && /gethired/.test(captured[0].body), "id=org id");
  eq(captured[0].authorization, "Bearer test-id-token", "bearer");
  await ctx.close();
});

await T("org logo 201 writes the returned url into the existing path field", async () => {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(String(e)));
  const url = "https://media.paaipe.org/organizations/gethired.png";
  attachMedia(p, { json: { url, path: "organizations/gethired.png", kind: "logo" } });
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: fbAdmin }));
  await p.route("**/assets/js/paaipe-events-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_DATA }));
  await p.route("**/assets/js/paaipe-events-data.js", r =>
    r.fulfill({ contentType: "text/javascript", body: dataAdmin }));
  await p.goto(`${BASE}/admin-organizations.html`, { waitUntil: "load" });
  await p.waitForSelector("html[data-admin-orgs]", { timeout: 9000 });
  await p.locator("[data-edit-org]").click();
  await p.locator("[data-o-logo-file]").setInputFiles({
    name: "logo.png", mimeType: "image/png",
    buffer: readFileSync(`${ROOT}/assets/img/paaipe-logo.png`),
  });
  await p.waitForFunction(u => document.querySelector("[data-o-logo]")?.value === u, url, { timeout: 9000 });
  eq(await p.locator("[data-o-logo]").inputValue(), url, "returned url in path field");
  ok(await p.locator("[data-o-name]").isVisible(), "name field unchanged");
  ok(await p.locator("[data-o-web]").isVisible(), "website field unchanged");
  ok(await p.locator("[data-o-status]").isVisible(), "status field unchanged");
  await ctx.close();
});

await br.close();
if (errs.length) console.log("page errors:", errs.slice(0, 5).join("\n"));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
