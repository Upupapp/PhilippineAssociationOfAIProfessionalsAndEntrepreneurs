/* Admin Learnings + portal wiring — unit checks (no live Firebase needed). */
import { readFileSync, existsSync } from "fs";
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

await T("admin-learnings.html exists and wires the module", async () => {
  ok(existsSync(`${ROOT}/admin-learnings.html`), "page");
  const h = read("admin-learnings.html");
  ok(h.includes('data-admin-learnings'), "body attr");
  ok(h.includes("paaipe-admin-learnings.js"), "script");
  ok(h.includes('data-learn-tab="sessions"') && h.includes('data-learn-tab="micros"'), "tabs");
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

await T("LEARNINGS_UPLOAD_STORAGE_READY is false with honest stub", async () => {
  const src = read("assets/js/paaipe-learnings-data.js");
  ok(/LEARNINGS_UPLOAD_STORAGE_READY\s*=\s*false/.test(src), "flag false");
  ok(/Storage is not wired/.test(src), "stub copy");
  const admin = read("assets/js/paaipe-admin-learnings.js");
  ok(admin.includes("learningsUploadStubMessage"), "admin uses stub");
  ok(admin.includes("data-upload-stub") || admin.includes("File upload is disabled"), "disabled UI");
});

await T("portal-sessions hub loads live learnings, not PAST_SESSIONS library", async () => {
  const h = read("portal-sessions.html");
  ok(h.includes("data-ss-live-sessions"), "live sessions mount");
  ok(h.includes("data-ss-live-micros"), "live micros mount");
  ok(!h.includes("data-ss-continue"), "no continue/attendance chrome");
  ok(!h.includes("data-ss-lesson-list"), "no hardcoded library list");
  const view = read("assets/js/paaipe-session-view.js");
  ok(view.includes("listPublishedSessions"), "fetches sessions");
  ok(view.includes("listPublishedMicros"), "fetches micros");
  ok(view.includes("youtubeEmbedSrc"), "in-portal embed");
  ok(!/Open on YouTube/i.test(h), "no Open on YouTube in markup");
});

await T("admin editor requires title and YouTube path", async () => {
  const admin = read("assets/js/paaipe-admin-learnings.js");
  ok(admin.includes("data-f-title"), "title field");
  ok(admin.includes("data-f-youtube"), "youtube field");
  ok(admin.includes("data-f-published"), "published toggle");
  ok(admin.includes("reorderLearnings"), "drag reorder");
  ok(admin.includes("Remove"), "remove");
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
