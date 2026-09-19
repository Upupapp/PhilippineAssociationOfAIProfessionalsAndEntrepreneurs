/* R-04 — backport 560px phone harden to the missing portal pages. Layout-only. */
import { readFileSync } from "fs";
import { pathToFileURL } from "url";
import { chromium } from "playwright";

const ROOT = process.env.PAAIPE_ROOT || process.cwd();
let pass = 0, fail = 0;
const T = async (n, f) => {
  try { await f(); console.log(`  PASS  ${n}`); pass++; }
  catch (e) { console.log(`  FAIL  ${n}\n        ${e.message}`); fail++; }
};
const ok = (c, m) => { if (!c) throw new Error(m); };
const read = p => readFileSync(`${ROOT}/${p}`, "utf8");

const ADDED = [
  "portal-sessions.html",
  "portal-sessions-past.html",
  "portal-events-past.html",
  "portal-session-slides.html",
];
const WATCH = "portal-session-watch.html";

await T("R-04 pages that needed 560 now have the additive harden", () => {
  for (const file of ADDED) {
    const h = read(file);
    ok(/@media \(max-width:560px\)/.test(h), `${file} 560 phone harden`);
    ok(/min-width:0/.test(h), `${file} min-width:0`);
    ok(!/hamburger|aria-expanded|drawer/.test(h), `${file} does not add R-01 drawer`);
  }
});

await T("watch keeps R-02 560 harden (no regression)", () => {
  const h = read(WATCH);
  ok(/@media \(max-width:560px\)/.test(h), "watch still has 560");
  ok(/class="grid2 watch-layout"/.test(h), "watch-layout class stays");
  ok(/\.watch-layout\{[^}]*1\.55fr \.65fr/.test(h), "desktop split stays");
  ok(/max-width:1100px\)\{\.watch-layout\{grid-template-columns:1fr\}/.test(h),
    "stacks at ≤1100");
});

const br = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());

async function open(file, viewport) {
  // Layout-only: portal JS bounces guests to sign-in. Same method as the sprint pack / R-02.
  const ctx = await br.newContext({ viewport, javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(`${ROOT}/${file}`).href, { waitUntil: "load" });
  return { p, ctx };
}

async function overflowOf(file, viewport) {
  const { p, ctx } = await open(file, viewport);
  const overflow = await p.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  await ctx.close();
  return overflow;
}

const PAGES_AT_390 = [...ADDED, WATCH];

await T("R-04 + R-02 pages: horizontal overflow ≤ 0 at 390", async () => {
  for (const file of PAGES_AT_390) {
    const overflow = await overflowOf(file, { width: 390, height: 844 });
    ok(overflow <= 0, `${file} overflow ${overflow} ≤ 0 at 390`);
  }
});

await T("R-04 pages stay overflow-free on desktop", async () => {
  for (const file of ADDED) {
    const overflow = await overflowOf(file, { width: 1280, height: 900 });
    ok(overflow <= 0, `${file} overflow ${overflow} ≤ 0 at 1280`);
  }
});

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();
process.exit(fail ? 1 : 0);
