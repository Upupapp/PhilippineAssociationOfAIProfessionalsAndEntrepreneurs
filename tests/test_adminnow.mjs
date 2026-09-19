/* isAdminNow — status mapping for the API admin probe.
 *
 * The door still asks isAdminNow(); this suite is the probe itself:
 * GET /v1/admin/events 200 → admin, 401/403 → not admin, anything else
 * is not an answer (same spirit as the old permission-denied-only false).
 */
import { readFileSync } from "fs";
import { pathToFileURL } from "url";

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

const fb = await import(pathToFileURL(`${ROOT}/assets/js/paaipe-firebase.js`).href);
const api = await import(pathToFileURL(`${ROOT}/assets/js/paaipe-api.js`).href);

await T("200 → true; 401/403 → false", () => {
  eq(fb.isAdminFromApiStatus(200), true, "200");
  eq(fb.isAdminFromApiStatus(401), false, "401");
  eq(fb.isAdminFromApiStatus(403), false, "403");
});

await T("5xx / 404 / network-shaped status are not 'not admin'", () => {
  for (const status of [500, 502, 503, 404, 0]) {
    let threw;
    try { fb.isAdminFromApiStatus(status); }
    catch (e) { threw = e; }
    ok(threw, `${status} must throw, not return false`);
    ok(threw.status === status, `${status} keeps the status`);
    ok(threw.code === "api/request-failed", `${status} is not a refusal`);
  }
});

await T("listAdminEvents errors map the same way (empty 200 is still admin)", async () => {
  const listed = await api.listAdminEvents({
    token: "tok",
    fetchImpl: async () => new Response(JSON.stringify({ events: [] }), {
      status: 200, headers: { "content-type": "application/json" },
    }),
  });
  eq(listed.length, 0, "empty list");
  eq(fb.isAdminFromApiStatus(200), true, "empty 200 → admin");

  for (const status of [401, 403]) {
    let err;
    try {
      await api.listAdminEvents({
        token: "tok",
        fetchImpl: async () => new Response("nope", { status }),
      });
    } catch (e) { err = e; }
    ok(err && err.status === status, `${status} thrown by listAdminEvents`);
    eq(fb.isAdminFromApiStatus(err.status), false, `${status} → not admin`);
  }

  let five;
  try {
    await api.listAdminEvents({
      token: "tok",
      fetchImpl: async () => new Response("boom", { status: 500 }),
    });
  } catch (e) { five = e; }
  ok(five && five.status === 500, "500 thrown by listAdminEvents");
  let threw;
  try { fb.isAdminFromApiStatus(five.status); } catch (e) { threw = e; }
  ok(threw, "500 must not collapse to 'not admin'");
});

await T("isAdminNow probes GET /v1/admin/events via listAdminEvents + Bearer", () => {
  const src = read("assets/js/paaipe-firebase.js");
  const start = src.indexOf("export async function isAdminNow");
  const end = src.indexOf("\n/** Every member", start);
  ok(start >= 0 && end > start, "isAdminNow is still next to listMembers");
  const fn = src.slice(start, end);
  ok(/listAdminEvents/.test(fn), "uses listAdminEvents");
  ok(/idTokenForRequest/.test(fn), "sends the Firebase ID token as Bearer");
  ok(/isAdminFromApiStatus/.test(fn), "maps status through isAdminFromApiStatus");
  ok(/status === 401/.test(fn) && /status === 403/.test(fn), "401/403 are the refusals");
  ok(!/getDocs/.test(fn), "no Firestore getDocs probe");
  ok(!/COLLECTIONS\.registrations/.test(fn), "not the registrations collection");
  ok(!/permission-denied/.test(fn), "Firestore permission-denied is no longer the signal");
});

await T("adminness comments name the API allow-list, not firestore.rules", () => {
  const src = read("assets/js/paaipe-firebase.js");
  const blockStart = src.indexOf("ADMINISTRATORS");
  const blockEnd = src.indexOf("export async function listMembers");
  const block = src.slice(blockStart, blockEnd);
  ok(/ADMIN_EMAILS/.test(block), "backend ADMIN_EMAILS is named as the source");
  ok(!/stated in firestore\.rules/.test(block), "must not say adminness lives only in firestore.rules");
  ok(!/DEPLOYED RULES let this account read registrations/.test(block),
     "must not still describe the registrations probe");
  ok(!/ADMIN_EMAILS\s*=/.test(src), "must not hardcode the allow-list");
  ok(!/paul@moveup\.app/.test(block), "must not copy a live admin email into FE");
});

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
