/* Pass 5 leftovers: R-07 journey stack, R-20 partner/MB overflow, R-26 slides top.
 * Layout-only file:// measures. JS on only for the slides burger (shell inject). */
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
const read = (p) => readFileSync(`${ROOT}/${p}`, "utf8");

const PARTNER_PAGES = [
  "partner-servana.html",
  "partner-gethired.html",
  "partner-mvj.html",
  "partner-dpdigital.html",
];

await T("R-07 source: programs journey stacks at ≤560", () => {
  const h = read("portal-programs.html");
  ok(/@media \(max-width:560px\)\{[\s\S]*\.journey\{[\s\S]*display:grid/.test(h),
    "journey becomes a 1-col grid at ≤560");
  ok(/\.journey::before\{display:none\}/.test(h), "hides the dashed connector");
  ok(/\.journey li\{[\s\S]*flex-direction:row/.test(h), "steps go row");
});

await T("R-20 source: four partner pages share the overflow sheet", () => {
  const css = read("assets/css/paaipe-partner.css");
  ok(/@media \(max-width: 400px\)/.test(css), "400 breakpoint");
  ok(/\.pinfo\s*\{[\s\S]*min-width:\s*0/.test(css), "pinfo min-width 0");
  for (const page of PARTNER_PAGES) {
    ok(read(page).includes("assets/css/paaipe-partner.css"), `${page} links shared sheet`);
  }
});

await T("R-20 source: member-benefits facewall minmax(0,1fr) at ≤400", () => {
  const h = read("member-benefits.html");
  ok(/@media \(max-width:400px\)\{[\s\S]*\.facewall\{[\s\S]*minmax\(0,1fr\)/.test(h),
    "facewall minmax at 400");
});

await T("R-26 source: slides title/lede live in .content, not .top", () => {
  const h = read("portal-session-slides.html");
  ok(/<div class="top">[\s\S]*<div class="crumbs">[\s\S]*<\/div>\s*<\/div>\s*<div class="content">/.test(h),
    ".top is crumbs-only");
  ok(/<div class="content">[\s\S]*id="slides-title"/.test(h), "h1 in .content");
  ok(/class="lede"/.test(h), "lede class");
  ok(!/id="slides-title"[^>]*style=/.test(h), "no inline 22px on the title");
  ok(!/<div class="top">[\s\S]*id="slides-title"[\s\S]*<div class="content">/.test(h),
    "title is not inside .top");
});

await T("Pass 5 does not touch My Certificates keep-gate", () => {
  const cert = read("portal-my-certificates.html");
  ok(cert.includes("assets/css/paaipe-portal-shell.css"), "certs still on shared shell");
  ok(cert.includes("assets/js/paaipe-portal-shell.js"), "certs still on shared shell JS");
});

const br = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());

async function open(file, viewport, javaScriptEnabled = false) {
  const ctx = await br.newContext({ viewport, javaScriptEnabled });
  const p = await ctx.newPage();
  await p.goto(pathToFileURL(`${ROOT}/${file}`).href, { waitUntil: "load" });
  return { p, ctx };
}

function pageOverflow() {
  return document.documentElement.scrollWidth - document.documentElement.clientWidth;
}

await T("R-07 @390: journey scrollOverflow ≤0, last step reachable, no page overflow", async () => {
  // JS on matches Pass 5 / live (shell CSS is enough; main@320 js-off already +4).
  const { p, ctx } = await open("portal-programs.html", { width: 390, height: 844 }, true);
  const m = await p.evaluate(() => {
    const j = document.querySelector(".journey");
    const last = j && j.lastElementChild;
    return {
      pageOv: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scrollOv: j ? j.scrollWidth - j.clientWidth : -1,
      display: j ? getComputedStyle(j).display : "",
      cols: j ? getComputedStyle(j).gridTemplateColumns : "",
      lastRight: last ? last.getBoundingClientRect().right : 0,
      count: j ? j.children.length : 0,
    };
  });
  ok(m.pageOv <= 0, `page overflow ${m.pageOv} ≤ 0`);
  ok(m.scrollOv <= 0, `journey scrollOverflow ${m.scrollOv} ≤ 0`);
  ok(m.display === "grid", `journey display ${m.display}`);
  ok(m.cols.trim().split(/\s+/).length === 1, `1-col grid, got ${m.cols}`);
  ok(m.count === 7, "seven steps");
  ok(m.lastRight <= 390 + 1, `last step right ${m.lastRight.toFixed(1)} ≤ 390`);
  await p.locator(".journey li").last().scrollIntoViewIfNeeded();
  const after = await p.evaluate(() => {
    const last = document.querySelector(".journey li:last-child");
    const r = last.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, vh: window.innerHeight };
  });
  ok(after.top >= 0 && after.bottom <= after.vh + 1,
    `last step in view after scroll (${after.top}–${after.bottom} / ${after.vh})`);
  await ctx.close();
});

await T("R-07 @320: journey still stacked, no page overflow", async () => {
  const { p, ctx } = await open("portal-programs.html", { width: 320, height: 568 }, true);
  const m = await p.evaluate(() => {
    const j = document.querySelector(".journey");
    return {
      pageOv: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scrollOv: j ? j.scrollWidth - j.clientWidth : -1,
      display: j ? getComputedStyle(j).display : "",
    };
  });
  ok(m.pageOv <= 0, `page overflow ${m.pageOv} ≤ 0`);
  ok(m.scrollOv <= 0, `journey scrollOverflow ${m.scrollOv} ≤ 0`);
  ok(m.display === "grid", `journey display ${m.display}`);
  await ctx.close();
});

await T("R-20 @320: partner-* and member-benefits pageOverflow ≤0", async () => {
  for (const file of [...PARTNER_PAGES, "member-benefits.html"]) {
    const { p, ctx } = await open(file, { width: 320, height: 568 });
    const ov = await p.evaluate(pageOverflow);
    ok(ov <= 0, `${file} overflow ${ov} ≤ 0 at 320`);
    await ctx.close();
  }
});

await T("R-20 @390/768 stay overflow-free", async () => {
  for (const vp of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    for (const file of [...PARTNER_PAGES, "member-benefits.html"]) {
      const { p, ctx } = await open(file, vp);
      const ov = await p.evaluate(pageOverflow);
      ok(ov <= 0, `${file} overflow ${ov} ≤ 0 at ${vp.width}`);
      await ctx.close();
    }
  }
});

await T("R-26 ≤768: chrome-only .top, titleTop < 80, burger still there", async () => {
  for (const vp of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    const { p, ctx } = await open("portal-session-slides.html", vp, true);
    await p.waitForSelector("html[data-paaipe-portal-shell=ready]", { timeout: 9000 });
    const m = await p.evaluate(() => {
      const top = document.querySelector(".top");
      const h1 = document.getElementById("slides-title");
      const burger = document.querySelector(".portal-nav-burger");
      const lede = document.querySelector(".lede");
      return {
        pageOv: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        topH: top ? Math.round(top.getBoundingClientRect().height) : -1,
        titleTop: h1 ? Math.round(h1.getBoundingClientRect().top) : -1,
        h1InTop: !!(top && h1 && top.contains(h1)),
        ledeInTop: !!(top && lede && top.contains(lede)),
        burgerOn: !!(burger && getComputedStyle(burger).display !== "none"),
        burgerBox: burger ? {
          w: Math.round(burger.getBoundingClientRect().width),
          h: Math.round(burger.getBoundingClientRect().height),
        } : null,
      };
    });
    ok(m.pageOv <= 0, `@${vp.width} page overflow ${m.pageOv} ≤ 0`);
    ok(!m.h1InTop, `@${vp.width} h1 is not in .top`);
    ok(!m.ledeInTop, `@${vp.width} lede is not in .top`);
    ok(m.titleTop < 80, `@${vp.width} titleTop ${m.titleTop} < 80`);
    ok(m.topH > 0 && m.topH <= 88, `@${vp.width} .top height ${m.topH} ≤ 88`);
    ok(m.burgerOn, `@${vp.width} burger visible`);
    ok(m.burgerBox && m.burgerBox.w >= 44 && m.burgerBox.h >= 44,
      `@${vp.width} burger ${JSON.stringify(m.burgerBox)}`);
    await ctx.close();
  }
});

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();
process.exit(fail ? 1 : 0);
