/* Admin API client: tunnel default, one flip knob, Bearer, honest failures. */
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

await T("source: draft default is the tunnel; prod is the flip target, not the default", () => {
  eq(api.PAAIPE_API_TUNNEL_BASE, "http://127.0.0.1:8091", "tunnel");
  eq(api.PAAIPE_API_PROD_BASE, "https://api.paaipe.org", "prod target");
  eq(api.PAAIPE_API_DEFAULT_BASE, api.PAAIPE_API_TUNNEL_BASE, "default is tunnel");
  eq(api.resolvePaaipeApiBase({}), "http://127.0.0.1:8091", "resolver empty → tunnel");
  ok(api.PAAIPE_API_DEFAULT_BASE !== api.PAAIPE_API_PROD_BASE,
     "do not default to api.paaipe.org until DNS A + TLS land");
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

await T("contract paths are exact", () => {
  eq(api.adminEventPath("2026-10-ai-exchange"),
     "/v1/admin/events/2026-10-ai-exchange", "event PATCH path");
  eq(api.adminEventRegistrationsPath("e-oct"),
     "/v1/admin/events/e-oct/registrations", "event regs");
  eq(api.adminEventRegistrationsPath("e-oct", { status: "attended" }),
     "/v1/admin/events/e-oct/registrations?status=attended", "optional status");
  eq(api.adminRegistrationPath("r1"), "/v1/admin/registrations/r1", "reg id");
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

await T("PATCH event request: Bearer + JSON body to the tunnel default", async () => {
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
  }, { token: "tok-admin", fetchImpl, base: api.PAAIPE_API_TUNNEL_BASE });
  eq(captured.url, "http://127.0.0.1:8091/v1/admin/events/2026-10-ai-exchange", "url");
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
    token: "tok", fetchImpl, base: "http://127.0.0.1:8091",
  });
  eq(rows.length, 1, "one row");
  eq(rows[0].id, "r1", "id kept");
  eq(rows[0].eventId, "e-oct", "eventId from path hint");
  eq(captured[0].opts.headers.Authorization, "Bearer tok", "list bearer");

  await api.patchAdminRegistration("r1", "attended", {
    token: "tok", fetchImpl, base: "http://127.0.0.1:8091",
  });
  const patch = captured[1];
  eq(patch.url, "http://127.0.0.1:8091/v1/admin/registrations/r1", "patch url");
  eq(patch.opts.method, "PATCH", "patch method");
  eq(patch.opts.body, JSON.stringify({ status: "attended" }), "status only");

  let threw = false;
  try { await api.patchAdminRegistration("r1", "maybe", { token: "tok", fetchImpl }); }
  catch (e) { threw = true; eq(e.code, "api/bad-status", "code"); }
  ok(threw, "unknown status refused");
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
  await p.route("http://127.0.0.1:8091/**", route =>
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
  await p.route("http://127.0.0.1:8091/**", async route => {
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
