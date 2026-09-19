/* R-18 partners phone grid + R-19 portal/admin .btn-sm touch targets.
 * Static file://-style measures via the local gate server; JS off. */
import { readFileSync } from "fs";
import { chromium } from "playwright";

const ROOT = process.env.PAAIPE_ROOT || process.cwd();
const BASE = process.env.PAAIPE_BASE || "http://127.0.0.1:8899";
let pass = 0, fail = 0;
const T = async (n, f) => {
  try { await f(); console.log(`  PASS  ${n}`); pass++; }
  catch (e) { console.log(`  FAIL  ${n}\n        ${e.message}`); fail++; }
};
const ok = (c, m) => { if (!c) throw new Error(m); };
const read = p => readFileSync(`${ROOT}/${p}`, "utf8");

const PARTNER_PAGES = [
  "partners.html",
  "partner-dpdigital.html",
  "partner-gethired.html",
  "partner-mvj.html",
  "partner-servana.html",
];
const PHONE_GRID = /@media \(max-width:560px\)\{\s*\.help \.cols\{grid-template-columns:1fr\}/;
const TOUCH = /@media \(max-width:560px\)\{\s*\.btn,\s*\.btn-sm\{min-height:44px\}/;

await T("R-18 source: partners + partner-* stack .help .cols at ≤560", () => {
  for (const page of PARTNER_PAGES) {
    const h = read(page);
    ok(PHONE_GRID.test(h), `${page} has 560 1fr on .help .cols`);
    ok(/footer \.top\{grid-template-columns:1fr\}/.test(h), `${page} stacks footer .top at 560`);
  }
});

await T("R-19 source: shared portal motion + admin.css raise .btn-sm at ≤560", () => {
  ok(TOUCH.test(read("assets/css/paaipe-motion.css")), "paaipe-motion.css phone min-height 44");
  ok(TOUCH.test(read("assets/css/paaipe-admin.css")), "paaipe-admin.css phone min-height 44");
});

const br = await chromium.launch();

async function open(page, viewport, extra) {
  const ctx = await br.newContext({ viewport, javaScriptEnabled: false, ...extra });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${page}`, { waitUntil: "load" });
  return { p, ctx };
}

function overflow(p) {
  return p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

await T("partners.html @320: overflow ≤0 and .help .cols is 1fr (R-18)", async () => {
  const { p, ctx } = await open("partners.html", { width: 320, height: 568 });
  const m = await p.evaluate(() => {
    const cols = document.querySelector(".help .cols");
    const foot = document.querySelector("footer .top");
    const last = cols && cols.lastElementChild;
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cols: cols ? getComputedStyle(cols).gridTemplateColumns : "",
      foot: foot ? getComputedStyle(foot).gridTemplateColumns : "",
      lastRight: last ? last.getBoundingClientRect().right : 0,
    };
  });
  ok(m.overflow <= 0, `overflow ${m.overflow} ≤ 0`);
  ok(m.cols.trim().split(/\s+/).length === 1, `.help .cols is 1 col, got ${m.cols}`);
  ok(m.foot.trim().split(/\s+/).length === 1, `footer .top is 1 col, got ${m.foot}`);
  ok(m.lastRight <= 320, `last help col right ${m.lastRight.toFixed(1)} ≤ 320`);
  await ctx.close();
});

await T("partners.html @960 still two-col help (tablet, not phone)", async () => {
  const { p, ctx } = await open("partners.html", { width: 960, height: 800 });
  const cols = await p.evaluate(() => getComputedStyle(document.querySelector(".help .cols")).gridTemplateColumns);
  ok(cols.trim().split(/\s+/).length === 2, `960 help cols stay 2: ${cols}`);
  ok((await overflow(p)) <= 0, "no overflow at 960");
  await ctx.close();
});

async function measureBtns(page, viewport, selector) {
  const { p, ctx } = await open(page, viewport);
  const m = await p.evaluate((sel) => {
    const els = [...document.querySelectorAll(sel)];
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      heights: els.map(el => ({
        text: (el.textContent || "").trim().slice(0, 40),
        h: el.getBoundingClientRect().height,
      })),
    };
  }, selector);
  await ctx.close();
  return m;
}

await T("portal Register / Connect .btn-sm ≥44 @320 and @390 (R-19)", async () => {
  for (const width of [320, 390]) {
    const events = await measureBtns("portal-events.html", { width, height: 844 },
      "a.btn-gold.btn-sm, a.btn.btn-gold.btn-sm");
    const register = events.heights.find(x => /Register/i.test(x.text));
    ok(register, `Register present at ${width}`);
    ok(register.h >= 44, `Register @${width} ${register.h.toFixed(1)} ≥ 44`);

    const dir = await measureBtns("portal-directory.html", { width, height: 844 },
      "button.btn-gold.btn-sm, .btn-gold.btn-sm");
    const connect = dir.heights.find(x => /Connect/i.test(x.text));
    ok(connect, `Connect present at ${width}`);
    ok(connect.h >= 44, `Connect @${width} ${connect.h.toFixed(1)} ≥ 44`);
  }
});

await T("admin Export CSV / Print PDF .btn-sm ≥44 @320 and @390 (R-19)", async () => {
  for (const width of [320, 390]) {
    const regs = await measureBtns("admin-registrations.html", { width, height: 844 },
      "[data-export], .btn-sm");
    const csv = regs.heights.find(x => /Export CSV/i.test(x.text));
    ok(csv, `Export CSV present at ${width}`);
    ok(csv.h >= 44, `Export CSV @${width} ${csv.h.toFixed(1)} ≥ 44`);

    const brief = await measureBtns("admin-speaker-brief.html", { width, height: 844 },
      "[data-print], .btn-sm");
    const pdf = brief.heights.find(x => /Print/i.test(x.text));
    ok(pdf, `Print PDF present at ${width}`);
    ok(pdf.h >= 44, `Print PDF @${width} ${pdf.h.toFixed(1)} ≥ 44`);
  }
});

await T("desktop ≥861 .btn-sm stays dense (no 44 min-height)", async () => {
  const dir = await measureBtns("portal-directory.html", { width: 1280, height: 900 },
    "button.btn-gold.btn-sm, .btn-gold.btn-sm");
  const connect = dir.heights.find(x => /Connect/i.test(x.text));
  ok(connect, "Connect present at 1280");
  ok(connect.h < 44, `desktop Connect ${connect.h.toFixed(1)} stays < 44`);

  const regs = await measureBtns("admin-registrations.html", { width: 1280, height: 900 },
    "[data-export]");
  const csv = regs.heights.find(x => /Export CSV/i.test(x.text));
  ok(csv, "Export CSV present at 1280");
  ok(csv.h < 44, `desktop Export CSV ${csv.h.toFixed(1)} stays < 44`);
});

await br.close();
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
