/* R-03 — portal-agent-view CTA stack. Overflow ≤0 at 320 and 390. */
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

const html = readFileSync(`${ROOT}/portal-agent-view.html`, "utf8");
const PAGE = pathToFileURL(`${ROOT}/portal-agent-view.html`).href;

await T("agent-view source stacks CTAs and does not force a 1100 row (R-03)", () => {
  ok(/@media \(max-width:560px\)/.test(html), "560 phone harden");
  ok(/\.phead \.acts\{[^}]*flex-direction:column/.test(html), "column stack");
  const m1100 = html.match(/@media \(max-width:1100px\)\{([\s\S]*?)\n  \/\* R-03 \/ R-04/);
  const block1100 = m1100 ? m1100[1] : html;
  ok(!/\.phead \.acts\{[^}]*flex-direction:row/.test(block1100),
    "1100 must not force acts into a row");
  ok(/\.phead \.acts>\.btn\{[^}]*width:100%/.test(html), "full-width primaries on phone");
  ok(/class="pair"/.test(html), "Save/Share pair class");
  ok(!/style="display:flex;gap:8px"/.test(html), "no inline Save/Share row");
  ok(!/hamburger|aria-expanded|drawer/.test(html), "does not add R-01 drawer");
  ok(!/watch-layout/.test(html), "does not add R-02 watch layout");
});

const br = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());

async function open(viewport) {
  const ctx = await br.newContext({ viewport, javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto(PAGE, { waitUntil: "load" });
  await p.waitForSelector(".phead .acts");
  return { p, ctx };
}

async function metrics(p) {
  return p.evaluate(() => {
    const acts = document.querySelector(".phead .acts");
    const vw = document.documentElement.clientWidth;
    const box = el => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, right: r.right, left: r.left };
    };
    const byText = t => [...document.querySelectorAll(".phead .acts a")]
      .find(a => a.textContent.trim() === t);
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      actsOverflow: acts.scrollWidth - acts.clientWidth,
      dir: getComputedStyle(acts).flexDirection,
      share: box(byText("Share")),
      save: box(byText("Save")),
      connect: box(byText("Connect")),
      mentor: box(byText("Request mentoring")),
      vw,
    };
  });
}

async function assertPhone(width, height) {
  const { p, ctx } = await open({ width, height });
  const m = await metrics(p);
  ok(m.overflow <= 0, `doc overflow ${m.overflow} ≤ 0 at ${width}`);
  ok(m.actsOverflow <= 0, `acts overflow ${m.actsOverflow} ≤ 0 at ${width}`);
  ok(m.dir === "column", `acts column at ${width}, got ${m.dir}`);
  for (const [name, b] of [["Connect", m.connect], ["Request mentoring", m.mentor], ["Save", m.save], ["Share", m.share]]) {
    ok(b.w > 0 && b.h > 0, `${name} has a box at ${width}`);
    ok(b.right <= m.vw + 0.5, `${name} right ${b.right.toFixed(1)} not clipped (vw ${m.vw})`);
    ok(b.left >= -0.5, `${name} left ${b.left.toFixed(1)} on-screen at ${width}`);
    ok(b.w >= 44 && b.h >= 44, `${name} usable ${b.w.toFixed(1)}×${b.h.toFixed(1)} at ${width}`);
  }
  ok(m.connect.w + 1 >= m.mentor.w * 0.95, `primary CTAs full-width at ${width}`);
  await ctx.close();
  return m;
}

await T("agent-view at 320 has no overflow and unclipped CTAs (R-03)", async () => {
  await assertPhone(320, 844);
});

await T("agent-view at 390 has no overflow and unclipped CTAs (R-03)", async () => {
  await assertPhone(390, 844);
});

await T("agent-view at 768 has no overflow (R-03)", async () => {
  const { p, ctx } = await open({ width: 768, height: 1024 });
  const m = await metrics(p);
  ok(m.overflow <= 0, `doc overflow ${m.overflow} ≤ 0 at 768`);
  ok(m.actsOverflow <= 0, `acts overflow ${m.actsOverflow} ≤ 0 at 768`);
  ok(m.share.right <= m.vw + 0.5, `Share right ${m.share.right.toFixed(1)} not clipped at 768`);
  await ctx.close();
});

await T("agent-view desktop keeps sidebar CTA column (R-03)", async () => {
  const { p, ctx } = await open({ width: 1280, height: 900 });
  const m = await p.evaluate(() => {
    const acts = document.querySelector(".phead .acts");
    const phead = document.querySelector(".phead");
    return {
      dir: getComputedStyle(acts).flexDirection,
      cols: getComputedStyle(phead).gridTemplateColumns,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  ok(m.dir === "column", `desktop acts column, got ${m.dir}`);
  ok(m.cols.trim().split(/\s+/).length === 3, `desktop 3-col phead, got ${m.cols}`);
  ok(m.overflow <= 0, `desktop overflow ${m.overflow} ≤ 0`);
  await ctx.close();
});

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();
process.exit(fail ? 1 : 0);
