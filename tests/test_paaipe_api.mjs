/* API client: api.paaipe.org default, public Learnings GETs, Bearer admin. */
import { readFileSync } from "fs";
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

const api = await import(pathToFileURL(`${ROOT}/assets/js/paaipe-api.js`).href);

const LIVE_SESSIONS = {
  sessions: [
    {
      id: "2026-09-presentation",
      title: "Part 1 — Presentation",
      description: "From Signals to Strategy.",
      source: "youtube",
      youtubeUrl: "https://www.youtube.com/watch?v=ePw_wlPqYUk",
      youtubeId: "ePw_wlPqYUk",
      storagePath: null,
      posterUrl: "https://paaipe.org/assets/img/ai-exchange-session.jpg",
      posterStoragePath: null,
      published: true,
      publishedAt: "2026-09-15T02:00:00.000Z",
      displayOrder: 1,
      aspect: "16:9",
    },
    {
      id: "2026-09-qa",
      title: "Part 2 — Q&A",
      source: "youtube",
      youtubeUrl: "https://www.youtube.com/watch?v=0PkiRVczWdQ",
      youtubeId: "0PkiRVczWdQ",
      storagePath: null,
      posterUrl: "https://paaipe.org/assets/img/ai-exchange-session.jpg",
      posterStoragePath: null,
      published: true,
      publishedAt: "2026-09-15T02:00:00.000Z",
      displayOrder: 2,
      aspect: "16:9",
    },
  ],
};

const LIVE_MICROS = {
  micros: [
    {
      id: "micro-1",
      title: "Start with the question, not the dashboard",
      description: "Before you open a chart, name the decision you are trying to make.",
      source: "upload",
      youtubeUrl: null,
      youtubeId: null,
      storagePath: null,
      posterUrl: null,
      posterStoragePath: null,
      published: true,
      publishedAt: "2026-09-19T01:46:17.151Z",
      displayOrder: 1,
      aspect: "9:16",
    },
  ],
};

const LIVE_PLAYLIST = {
  id: "v55ktOv1GGmUhecYo4L8",
  title: "From Signals to Strategy",
  description: "Short lessons from Sven Bally’s AI Exchange session.",
  kind: "micros",
  itemIds: ["micro-1", "micro-2", "micro-3", "micro-4"],
  status: "published",
  displayOrder: 1,
  publishedAt: "2026-09-19T02:07:00.000Z",
};

await T("source: default is https://api.paaipe.org; 8091 is an override only", () => {
  eq(api.PAAIPE_API_TUNNEL_BASE, "http://127.0.0.1:8091", "tunnel override");
  eq(api.PAAIPE_API_PROD_BASE, "https://api.paaipe.org", "prod");
  eq(api.PAAIPE_API_DEFAULT_BASE, api.PAAIPE_API_PROD_BASE, "default is prod");
  eq(api.resolvePaaipeApiBase({}), "https://api.paaipe.org", "resolver empty → prod");
  eq(api.PAAIPE_API_BASE, "https://api.paaipe.org", "module default");
  const src = read("assets/js/paaipe-api.js");
  ok(!/media\.paaipe\.org/.test(src.split("\n").filter(l =>
    !l.trim().startsWith("*") && !l.trim().startsWith("//")).join("\n")),
     "media.paaipe.org must not be used as an API base");
});

await T("one knob: query / window / localStorage, first non-empty wins", () => {
  eq(api.resolvePaaipeApiBase({ query: "tunnel" }), "http://127.0.0.1:8091", "query tunnel");
  eq(api.resolvePaaipeApiBase({ query: "prod" }), "https://api.paaipe.org", "query prod");
  eq(api.resolvePaaipeApiBase({ query: "https://example.test/api/" }),
     "https://example.test/api", "query absolute strips slash");
  eq(api.resolvePaaipeApiBase({
    query: "",
    windowValue: "https://api.paaipe.org",
    storageValue: "http://127.0.0.1:8091",
  }), "https://api.paaipe.org", "window beats storage");
  eq(api.resolvePaaipeApiBase({
    query: "",
    windowValue: "",
    storageValue: "https://api.paaipe.org",
  }), "https://api.paaipe.org", "storage when window empty");
});

await T("contract paths are exact — admin + public library", () => {
  eq(api.adminEventPath("2026-10-ai-exchange"),
     "/v1/admin/events/2026-10-ai-exchange", "event PATCH path");
  eq(api.adminEventRegistrationsPath("e-oct"),
     "/v1/admin/events/e-oct/registrations", "event regs");
  eq(api.adminEventRegistrationsPath("e-oct", { status: "attended" }),
     "/v1/admin/events/e-oct/registrations?status=attended", "optional status");
  eq(api.adminRegistrationPath("r1"), "/v1/admin/registrations/r1", "reg id");
  eq(api.sessionsPath(), "/v1/sessions", "sessions list");
  eq(api.sessionPath("2026-09-presentation"), "/v1/sessions/2026-09-presentation", "session id");
  eq(api.microsPath(), "/v1/micros", "micros list");
  eq(api.microPath("micro-1"), "/v1/micros/micro-1", "micro id");
  eq(api.playlistsPath("micros"), "/v1/playlists?kind=micros", "playlists micros");
  eq(api.playlistsPath("sessions"), "/v1/playlists?kind=sessions", "playlists sessions");
  eq(api.playlistPath("v55ktOv1GGmUhecYo4L8"),
     "/v1/playlists/v55ktOv1GGmUhecYo4L8", "playlist id");
  eq(api.playlistItemsPath("v55ktOv1GGmUhecYo4L8"),
     "/v1/playlists/v55ktOv1GGmUhecYo4L8/items", "playlist items");
  eq(api.adminPlaylistsPath(), "/v1/admin/playlists", "admin playlists");
  eq(api.adminPlaylistPath("v55ktOv1GGmUhecYo4L8"),
     "/v1/admin/playlists/v55ktOv1GGmUhecYo4L8", "admin playlist id");
  eq(api.adminSessionsPath(), "/v1/admin/sessions", "admin sessions POST");
  eq(api.adminSessionPath("2026-09-presentation"),
     "/v1/admin/sessions/2026-09-presentation", "admin session PATCH");
  eq(api.adminMicrosPath(), "/v1/admin/micros", "admin micros POST");
  eq(api.adminMicroPath("micro-1"), "/v1/admin/micros/micro-1", "admin micro PATCH");
  let threw = false;
  try { api.playlistsPath(); }
  catch (e) { threw = true; eq(e.code, "api/bad-kind", "kind required"); }
  ok(threw, "playlistsPath refuses a missing kind — bare GET /v1/playlists is 400");
});

await T("settings payload sends only Clarence's fields", () => {
  const body = api.eventSettingsPayload({
    title: "must not go",
    registrationOpensAt: "2026-10-01T08:00",
    registrationClosesAt: "",
    whoCanRegister: "members_only",
    waitlistEnabled: true,
    questionsEnabled: ["organization"],
    status: "registration_open",
    confirmationEmailText: "must not go",
  });
  eq(JSON.stringify(Object.keys(body).sort()),
     JSON.stringify(["questionsEnabled","registrationClosesAt","registrationOpensAt","status","waitlistEnabled","whoCanRegister"]),
     "keys");
  eq(body.registrationClosesAt, null, "blank close → null");
  eq(body.waitlistEnabled, true, "waitlist bool");
  ok(!("title" in body) && !("confirmationEmailText" in body), "no extra fields");
});

await T("PATCH event request: Bearer + JSON body to api.paaipe.org", async () => {
  let captured;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  await api.patchAdminEvent("2026-10-ai-exchange", {
    whoCanRegister: "members_and_guests",
    waitlistEnabled: false,
    questionsEnabled: [],
    status: "published",
  }, { token: "tok-admin", fetchImpl });
  eq(captured.url, "https://api.paaipe.org/v1/admin/events/2026-10-ai-exchange", "url");
  eq(captured.opts.method, "PATCH", "method");
  eq(captured.opts.headers.Authorization, "Bearer tok-admin", "Authorization");
  eq(captured.opts.headers["Content-Type"], "application/json", "json");
  const body = JSON.parse(captured.opts.body);
  eq(body.whoCanRegister, "members_and_guests", "who");
  eq(body.status, "published", "status");
  ok(!("title" in body), "title not sent");
});

await T("GET registrations + PATCH status; unknown status is refused", async () => {
  let captured = [];
  const fetchImpl = async (url, opts) => {
    captured.push({ url, opts });
    if (String(url).endsWith("/registrations")) {
      return new Response(JSON.stringify([
        { id: "r1", full_name: "Ada", email: "a@x.com", status: "registered" },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  const rows = await api.listAdminEventRegistrations("e-oct", {
    token: "tok", fetchImpl,
  });
  eq(rows.length, 1, "one row");
  eq(rows[0].id, "r1", "id kept");
  eq(rows[0].eventId, "e-oct", "eventId from path hint");
  eq(captured[0].opts.headers.Authorization, "Bearer tok", "list bearer");

  await api.patchAdminRegistration("r1", "attended", {
    token: "tok", fetchImpl,
  });
  const patch = captured[1];
  eq(patch.url, "https://api.paaipe.org/v1/admin/registrations/r1", "patch url");
  eq(patch.opts.method, "PATCH", "patch method");
  eq(patch.opts.body, JSON.stringify({ status: "attended" }), "status only");

  let threw = false;
  try { await api.patchAdminRegistration("r1", "maybe", { token: "tok", fetchImpl }); }
  catch (e) { threw = true; eq(e.code, "api/bad-status", "code"); }
  ok(threw, "unknown status refused");
});

await T("public library GETs unwrap live shapes and send no Bearer", async () => {
  const hits = [];
  const fetchImpl = async (url, opts) => {
    hits.push({ url, headers: opts.headers || {} });
    if (url.endsWith("/v1/sessions")) {
      return new Response(JSON.stringify(LIVE_SESSIONS), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/sessions/2026-09-presentation")) {
      return new Response(JSON.stringify(LIVE_SESSIONS.sessions[0]), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/micros")) {
      return new Response(JSON.stringify(LIVE_MICROS), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/playlists?kind=micros")) {
      return new Response(JSON.stringify({ playlists: [LIVE_PLAYLIST] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/playlists?kind=sessions")) {
      return new Response(JSON.stringify({ playlists: [] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/playlists/v55ktOv1GGmUhecYo4L8")) {
      return new Response(JSON.stringify(LIVE_PLAYLIST), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/playlists/v55ktOv1GGmUhecYo4L8/items")) {
      return new Response(JSON.stringify({ items: LIVE_MICROS.micros }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return new Response("missing", { status: 404 });
  };

  const sessions = await api.listApiSessions({ fetchImpl });
  eq(sessions.length, 2, "two sessions");
  eq(sessions[0].id, "2026-09-presentation", "session id");
  eq(sessions[0].youtubeId, "ePw_wlPqYUk", "youtubeId");
  eq(sessions[0].posterUrl, "https://paaipe.org/assets/img/ai-exchange-session.jpg", "posterUrl");
  ok(!("Authorization" in hits[0].headers), "sessions list has no Bearer");

  const one = await api.getApiSession("2026-09-presentation", { fetchImpl });
  eq(one.title, "Part 1 — Presentation", "session get");
  eq(one.aspect, "16:9", "aspect");

  const micros = await api.listApiMicros({ fetchImpl });
  eq(micros.length, 1, "one micro");
  eq(micros[0].aspect, "9:16", "micro aspect");
  eq(micros[0].source, "upload", "upload source");

  const microsPl = await api.listApiPlaylists("micros", { fetchImpl });
  eq(microsPl.length, 1, "one micros playlist");
  eq(microsPl[0].id, "v55ktOv1GGmUhecYo4L8", "seed id");
  eq(microsPl[0].itemIds.join(","), "micro-1,micro-2,micro-3,micro-4", "itemIds");

  const sessionsPl = await api.listApiPlaylists("sessions", { fetchImpl });
  eq(sessionsPl.length, 0, "kind=sessions is honestly empty");

  const both = await api.listApiPlaylists(null, { fetchImpl });
  eq(both.length, 1, "combined list keeps the micros seed only");
  ok(hits.some(h => h.url.endsWith("/v1/playlists?kind=micros")), "combined uses kind=micros");
  ok(hits.some(h => h.url.endsWith("/v1/playlists?kind=sessions")), "combined uses kind=sessions");
  ok(!hits.some(h => /\/v1\/playlists$/.test(h.url)), "never calls bare GET /v1/playlists");

  const pl = await api.getApiPlaylist("v55ktOv1GGmUhecYo4L8", { fetchImpl });
  eq(pl.title, "From Signals to Strategy", "playlist get");
  const items = await api.listApiPlaylistItems("v55ktOv1GGmUhecYo4L8", { fetchImpl });
  eq(items.length, 1, "hydrated items");
  eq(items[0].id, "micro-1", "item id");

  ok(hits.every(h => !h.headers.Authorization), "no public GET sends Bearer");
  ok(hits.every(h => h.url.startsWith("https://api.paaipe.org/v1/")), "prod host");
});

await T("kind=sessions failure does not drop a successful kind=micros list", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("kind=sessions")) {
      return new Response("boom", { status: 500 });
    }
    if (String(url).includes("kind=micros")) {
      return new Response(JSON.stringify({ playlists: [LIVE_PLAYLIST] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return new Response("nope", { status: 404 });
  };
  const rows = await api.listApiPlaylists(null, { fetchImpl });
  eq(rows.length, 1, "micros playlist kept");
  eq(rows[0].id, "v55ktOv1GGmUhecYo4L8", "seed id");
});

await T("401 / 404 / missing token fail honestly and do not invent rows", async () => {
  const fetch401 = async () => new Response("nope", { status: 401 });
  let e401;
  try {
    await api.listAdminEventRegistrations("e-oct", { token: "x", fetchImpl: fetch401 });
  } catch (e) { e401 = e; }
  ok(e401 && e401.status === 401, "401 thrown");
  ok(/sign-in expired or missing/i.test(e401.message), `401 message: ${e401.message}`);

  const fetch404 = async () => new Response("missing", { status: 404 });
  let e404;
  try {
    await api.listAdminEventRegistrations("e-oct", { token: "x", fetchImpl: fetch404 });
  } catch (e) { e404 = e; }
  ok(e404 && e404.code === "api/not-found", "404 code");
  ok(/404/.test(e404.message), "404 said");

  let ePub;
  try {
    await api.listApiSessions({ fetchImpl: fetch404 });
  } catch (e) { ePub = e; }
  ok(ePub && ePub.code === "api/not-found", "public 404 code");

  let eTok;
  try { await api.paaipeApiRequest("/v1/admin/events/x", { method: "PATCH", body: {} }); }
  catch (e) { eTok = e; }
  eq(eTok?.code, "not-signed-in", "no token");
});

await T("admin JS hard-cuts Settings + Registrations off Firestore", () => {
  const ev = read("assets/js/paaipe-admin-events.js");
  const regs = read("assets/js/paaipe-admin-registrations.js");
  const save = ev.slice(ev.indexOf("async function saveEvent"), ev.indexOf("async function setStatus"));
  ok(/patchAdminEvent/.test(save), "save PATCHes the API");
  ok(/withoutSettings/.test(save), "settings fields stripped from Firestore write");
  const load = ev.slice(ev.indexOf("async function loadRegistrationsTab"),
                        ev.indexOf("async function loadEmailTab"));
  ok(/listAdminEventRegistrations/.test(load), "regs tab uses API");
  ok(!/listAllRegistrations/.test(load), "regs tab must not read Firestore");
  const link = ev.slice(ev.indexOf("async function linkRegistration"),
                        ev.indexOf("function exportEventRegistrations"));
  ok(!/firebase-firestore/.test(link) && !/COL\.registrations/.test(link),
     "link must not write Firestore");
  ok(/listAdminEventRegistrations/.test(regs), "list page uses API");
  ok(/getAdminRegistration/.test(regs) && /patchAdminRegistration/.test(regs),
     "detail + status use API");
  ok(!/listRegistrations\(/.test(regs) && !/setRegistrationStatus/.test(regs),
     "list page must not call the Firestore helpers");
});

await T("admin Learnings POST/PATCH send Bearer and camelCase only", async () => {
  const hits = [];
  const fetchImpl = async (url, opts) => {
    hits.push({ url, opts });
    return new Response(JSON.stringify({ id: "new-1", title: "T" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  const created = await api.postAdminSession({
    title: "Part 1",
    source: "youtube",
    youtubeUrl: "https://www.youtube.com/watch?v=ePw_wlPqYUk",
    youtubeId: "ePw_wlPqYUk",
    published: true,
    displayOrder: 1,
    updatedBy: "paul@moveup.app",
    createdAt: "must-not-go",
  }, { token: "tok-admin", fetchImpl });
  eq(created, "new-1", "create id");
  eq(hits[0].url, "https://api.paaipe.org/v1/admin/sessions", "POST sessions");
  eq(hits[0].opts.method, "POST", "method");
  eq(hits[0].opts.headers.Authorization, "Bearer tok-admin", "Bearer");
  const body = JSON.parse(hits[0].opts.body);
  eq(body.youtubeId, "ePw_wlPqYUk", "youtubeId");
  eq(body.aspect, "16:9", "session aspect");
  ok(!("createdAt" in body), "no invented createdAt");

  await api.patchAdminMicro("micro-1", {
    title: "Signals vs noise",
    published: true,
    displayOrder: 2,
  }, { token: "tok-admin", fetchImpl });
  eq(hits[1].url, "https://api.paaipe.org/v1/admin/micros/micro-1", "PATCH micro");
  eq(hits[1].opts.method, "PATCH", "patch method");
  eq(JSON.parse(hits[1].opts.body).aspect, "9:16", "micro aspect");

  await api.postAdminPlaylist({
    title: "From Signals to Strategy",
    kind: "micros",
    itemIds: ["micro-1"],
    status: "published",
    displayOrder: 1,
  }, { token: "tok", fetchImpl });
  eq(hits[2].url, "https://api.paaipe.org/v1/admin/playlists", "POST playlist");
  eq(JSON.parse(hits[2].opts.body).itemIds[0], "micro-1", "itemIds");

  const listed = await api.listAdminPlaylists({
    token: "tok",
    fetchImpl: async (url, opts) => {
      hits.push({ url, opts });
      return new Response(JSON.stringify({ playlists: [LIVE_PLAYLIST] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
  });
  eq(listed[0].id, "v55ktOv1GGmUhecYo4L8", "admin list");
  eq(hits[3].url, "https://api.paaipe.org/v1/admin/playlists", "GET admin playlists");
  eq(hits[3].opts.headers.Authorization, "Bearer tok", "admin list Bearer");
});

await T("portal + admin data modules hard-cut off Firestore", () => {
  const learn = read("assets/js/paaipe-learnings-data.js");
  const pl = read("assets/js/paaipe-playlists-data.js");
  const view = read("assets/js/paaipe-session-view.js");
  const admin = read("assets/js/paaipe-admin-learnings.js");
  const pubLearn = learn.slice(
    learn.indexOf("export async function listPublishedSessions"),
    learn.indexOf("export function buildLearningPayload")
  );
  ok(/listApiSessions/.test(pubLearn), "listPublishedSessions → API");
  ok(/listApiMicros/.test(pubLearn), "listPublishedMicros → API");
  ok(/getApiSession|getApiMicro/.test(pubLearn), "getLearning → API");
  ok(!/getDocs|getDoc/.test(pubLearn), "published get/list must not call Firestore");
  ok(!/firebase-firestore/.test(learn), "learnings-data has no Firestore");
  ok(/postAdminSession|patchAdminSession/.test(learn), "session writes use admin API");
  ok(/postAdminMicro|patchAdminMicro/.test(learn), "micro writes use admin API");
  ok(!/firebase-firestore/.test(pl), "playlists-data has no Firestore");
  ok(/listAdminPlaylists/.test(pl) && /postAdminPlaylist/.test(pl), "playlist admin API");
  ok(/listPublishedPlaylists/.test(view), "hub fetches playlists");
  ok(/function loadOne/.test(view), "hub isolates fetches");
  ok(/listLearnings|saveLearning|savePlaylist/.test(admin), "admin chrome still uses data modules");
  ok(!/firebase-firestore/.test(admin), "admin learnings JS has no Firestore");
});

const REAL_FB = read("assets/js/paaipe-firebase.js");
const REAL_DATA = read("assets/js/paaipe-events-data.js");
const fbStub = `
  export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){return {uid:'a1',email:'admin@upupapp.asia',status:'guest'}}
  export async function isAdminNow(){return true}
  export async function signOutNow(){}
  export async function idTokenForRequest(){ return 'test-id-token' }`;
const dataStub = `
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function listEvents(){ return [{id:'e-oct',title:'AI Exchange — October 2026',status:'registration_open'}] }
  export async function listOrganizations(){ return [] }
  export async function listEventSponsors(){ return [] }
  export async function listPartnerApplicationsFor(){ return [] }
  export async function listAllRegistrations(){ throw new Error('Firestore registrations must not be read') }`;

const br = await chromium.launch();

await T("admin-registrations 401 is an error, not an empty list", async () => {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: fbStub }));
  await p.route("**/assets/js/paaipe-events-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_DATA }));
  await p.route("**/assets/js/paaipe-events-data.js", r =>
    r.fulfill({ contentType: "text/javascript", body: dataStub }));
  await p.route("https://api.paaipe.org/**", route =>
    route.fulfill({ status: 401, contentType: "text/plain", body: "missing bearer" }));
  await p.goto(`${BASE}/admin-registrations.html`, { waitUntil: "load" });
  await p.waitForSelector('html[data-admin-regs="error"]', { timeout: 9000 });
  const flash = await p.locator("[data-flash]").innerText();
  ok(/could not load registrations/i.test(flash), `flash: ${flash}`);
  ok(/sign-in expired or missing/i.test(flash), `401 explained: ${flash}`);
  const table = await p.locator("[data-rows]").innerText();
  ok(/could not be loaded/i.test(table), `table: ${table}`);
  ok(!/no registration has been submitted yet/i.test(table), "must not read as none");
  await ctx.close();
});

await T("admin-registrations 404 is an error, not an empty list", async () => {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: fbStub }));
  await p.route("**/assets/js/paaipe-events-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_DATA }));
  await p.route("**/assets/js/paaipe-events-data.js", r =>
    r.fulfill({ contentType: "text/javascript", body: dataStub }));
  await p.route("https://api.paaipe.org/**", route =>
    route.fulfill({ status: 404, contentType: "text/plain", body: "not found" }));
  await p.goto(`${BASE}/admin-registrations.html`, { waitUntil: "load" });
  await p.waitForSelector('html[data-admin-regs="error"]', { timeout: 9000 });
  const flash = await p.locator("[data-flash]").innerText();
  ok(/could not load registrations/i.test(flash), `flash: ${flash}`);
  ok(/404/.test(flash), `404 explained: ${flash}`);
  const table = await p.locator("[data-rows]").innerText();
  ok(/could not be loaded/i.test(table), `table: ${table}`);
  ok(!/no registration has been submitted yet/i.test(table), "must not read as none");
  await ctx.close();
});

await T("admin-registrations lists rows from GET /v1/admin/events/{id}/registrations", async () => {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  let hit = "";
  let auth = "";
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: fbStub }));
  await p.route("**/assets/js/paaipe-events-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_DATA }));
  await p.route("**/assets/js/paaipe-events-data.js", r =>
    r.fulfill({ contentType: "text/javascript", body: dataStub }));
  await p.route("https://api.paaipe.org/**", async route => {
    hit = route.request().url();
    auth = route.request().headers().authorization || "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "r1", full_name: "Ada Lovelace", email: "ada@x.com",
        organization: "PAAIPE", profile: "Founder", status: "registered" }]),
    });
  });
  await p.goto(`${BASE}/admin-registrations.html`, { waitUntil: "load" });
  await p.waitForSelector('html[data-admin-regs="1"]', { timeout: 9000 });
  ok(/\/v1\/admin\/events\/e-oct\/registrations/.test(hit), `path: ${hit}`);
  eq(auth, "Bearer test-id-token", "Authorization Bearer");
  ok(/Ada Lovelace/.test(await p.locator("[data-rows]").innerText()), "row shown");
  await ctx.close();
});

await br.close();
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
