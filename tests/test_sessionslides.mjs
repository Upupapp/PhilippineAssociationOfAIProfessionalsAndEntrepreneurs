/* In-portal session slides: Gamma /docs URLs cannot be framed. */
import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.PAAIPE_BASE || "http://127.0.0.1:8899";
const ROOT = process.env.PAAIPE_ROOT || "/Users/user/Philippine-Association-of-AI";

let pass = 0, fail = 0;
const T = async (n, f) => {
  try { await f(); console.log(`  PASS  ${n}`); pass++; }
  catch (e) { console.log(`  FAIL  ${n}\n        ${e.message}`); fail++; }
};
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => {
  if (a !== b) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
};

const sessionsSrc = readFileSync(`${ROOT}/assets/js/paaipe-sessions.js`, "utf8");
const start = sessionsSrc.indexOf("export function slidesOpensExternally");
const end = sessionsSrc.indexOf("/** Landscape recordings");
const fnSrc = sessionsSrc.slice(start, end).replace("export function", "function");
// eslint-disable-next-line no-new-func
const slidesOpensExternally = new Function(`${fnSrc}; return slidesOpensExternally;`)();

await T("September 2026 deck is a Gamma /docs URL", () => {
  ok(sessionsSrc.includes('id: "2026-09"'), "session id");
  ok(sessionsSrc.includes("https://gamma.app/docs/Sven-Bally-09v66kz53a10hm0"), "hosted on Gamma docs");
  eq(slidesOpensExternally("https://gamma.app/docs/Sven-Bally-09v66kz53a10hm0"), true, "must not be iframed");
});

await T("slidesOpensExternally only flags Gamma", () => {
  eq(slidesOpensExternally("https://gamma.app/docs/Sven-Bally-09v66kz53a10hm0"), true, "docs");
  eq(slidesOpensExternally("https://www.gamma.app/embed/abc"), true, "www embed");
  eq(slidesOpensExternally("https://example.com/deck.pdf"), false, "pdf");
  eq(slidesOpensExternally("not-a-url"), false, "junk");
});

await T("slides page keeps the do-not-repost notice and Open control", () => {
  const html = readFileSync(`${ROOT}/portal-session-slides.html`, "utf8");
  ok(/Viewed inside the PAAIPE member portal/.test(html), "notice");
  ok(/don't re-post outside the association/.test(html), "repost");
  ok(/id="slides-open-btn"/.test(html), "open button");
  ok(/slidesOpensExternally/.test(html), "uses helper");
  ok(!/frame\.src = src/.test(html), "no leftover docs iframe assignment");
});

await T("watch page still sends members to the in-portal slides page", () => {
  const js = readFileSync(`${ROOT}/assets/js/paaipe-session-view.js`, "utf8");
  ok(/portal-session-slides\.html\?session=/.test(js), "in-portal href");
});

const br = await chromium.launch();
const errs = [];

async function open(qs) {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(String(e)));
  await p.goto(`${BASE}/portal-session-slides.html${qs}`, { waitUntil: "load" });
  await p.waitForSelector("html[data-slides-mode]", { timeout: 9000 });
  return p;
}

await T("September 2026 page does not iframe Gamma", async () => {
  const p = await open("?session=2026-09");
  eq(await p.getAttribute("html", "data-slides-mode"), "external", "mode");
  ok(await p.locator("#slides-open").isVisible(), "open panel visible");
  ok(await p.getByText("Viewed inside the PAAIPE member portal").isVisible(), "notice stays");
  const btn = p.locator("#slides-open-btn");
  ok(await btn.isVisible(), "open button visible");
  const href = await btn.getAttribute("href");
  eq(href, "https://gamma.app/docs/Sven-Bally-09v66kz53a10hm0", "opens the real deck");
  eq(await btn.getAttribute("target"), "_blank", "new window");
  ok(!(await p.locator("#slides-frame-wrap").isVisible()), "iframe wrap hidden");
  const src = await p.locator("#slides-frame").getAttribute("src");
  ok(!src, "iframe has no Gamma src");
  await p.close();
});

await T("unknown session is an honest empty state, not a broken frame", async () => {
  const p = await open("?session=no-such");
  eq(await p.getAttribute("html", "data-slides-mode"), "missing", "mode");
  ok(await p.getByText("Slides not available").isVisible(), "title");
  ok(!(await p.locator("#slides-frame-wrap").isVisible()), "no iframe");
  await p.close();
});

await T("no console errors", () => ok(errs.length === 0, errs.join(" | ")));

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();
process.exit(fail ? 1 : 0);
