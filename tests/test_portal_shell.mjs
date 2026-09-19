/* R-01 / Epic A: portal shell is an off-canvas drawer ≤860, not a stacked rail. */
import { chromium } from "playwright";
import { readdirSync, readFileSync } from "fs";

const BASE = process.env.PAAIPE_BASE || "http://127.0.0.1:8899";
const ROOT = process.env.PAAIPE_ROOT || "/Users/user/Philippine-Association-of-AI";
const REAL_FB = readFileSync(`${ROOT}/assets/js/paaipe-firebase.js`, "utf8");

let pass = 0, fail = 0;
const T = async (n, f) => {
  try { await f(); console.log(`  PASS  ${n}`); pass++; }
  catch (e) { console.log(`  FAIL  ${n}\n        ${e.message}`); fail++; }
};
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => {
  if (a !== b) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
};

const portalPages = readdirSync(ROOT).filter((f) => /^portal.*\.html$/.test(f)).sort();

const fbStub = `export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){
    return {uid:'u1',email:'agent@example.com',full_name:'Test Agent',status:'agent',isAgent:true,emailVerified:true,directoryVisible:false,agentNumber:'0006',confirmationSeen:true}
  }
  export async function isAdminNow(){return false}
  export async function signOutNow(){}`;

const br = await chromium.launch();

async function open(path, viewport) {
  const ctx = await br.newContext({ viewport });
  const p = await ctx.newPage();
  await p.route("**/assets/js/paaipe-firebase-real.js", (r) =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", (r) =>
    r.fulfill({ contentType: "text/javascript", body: fbStub }));
  await p.goto(`${BASE}/${path}`, { waitUntil: "load" });
  await p.waitForSelector("html[data-paaipe-portal-shell=ready]", { timeout: 9000 });
  return p;
}

function metrics() {
  const side = document.querySelector(".side");
  const main = document.querySelector(".main");
  const title = document.querySelector(".top h1");
  const cs = getComputedStyle(side);
  const sr = side.getBoundingClientRect();
  return {
    position: cs.position,
    visibility: cs.visibility,
    transform: cs.transform,
    sideX: Math.round(sr.x),
    sideW: Math.round(sr.width),
    sideH: Math.round(sr.height),
    mainOffsetTop: main.offsetTop,
    titleY: title ? Math.round(title.getBoundingClientRect().top) : null,
    burger: !!document.querySelector(".portal-nav-burger"),
    open: document.documentElement.classList.contains("portal-nav-open"),
    aria: document.querySelector(".portal-nav-burger")?.getAttribute("aria-expanded") || null,
  };
}

await T("every portal-*.html links the shared shell CSS and JS", () => {
  ok(portalPages.length >= 14, `expected the portal set, got ${portalPages.join(",")}`);
  for (const f of portalPages) {
    const html = readFileSync(`${ROOT}/${f}`, "utf8");
    ok(html.includes("assets/css/paaipe-portal-shell.css"), `${f} missing shell CSS`);
    ok(html.includes("assets/js/paaipe-portal-shell.js"), `${f} missing shell JS`);
    ok(/class="shell"/.test(html), `${f} is not a shell page`);
    ok(/class="side"/.test(html), `${f} has no .side`);
  }
});

await T("shell JS does not invent APIs or touch Firebase identity", () => {
  const js = readFileSync(`${ROOT}/assets/js/paaipe-portal-shell.js`, "utf8");
  ok(!/\bfetch\s*\(|api\.paaipe|firestore/i.test(js), "drawer must stay chrome-only");
  ok(/aria-expanded/.test(js), "aria-expanded");
  ok(/Escape/.test(js), "Esc");
  ok(/inert/.test(js), "inert when closed");
  ok(/focus/.test(js), "focus management");
});

for (const width of [390, 768]) {
  await T(`at ${width}px Events title is visible without scrolling past a stacked rail`, async () => {
    const p = await open("portal-events.html", { width, height: width === 390 ? 844 : 1024 });
    const m = await p.evaluate(metrics);
    eq(m.position, "fixed", "side is off-canvas, not in-flow");
    ok(m.mainOffsetTop < 20, `main offsetTop is ${m.mainOffsetTop} — side still stacked?`);
    ok(m.titleY !== null && m.titleY < 80, `title Y is ${m.titleY}`);
    ok(m.sideX + m.sideW <= 8, `closed drawer still on screen at x=${m.sideX} w=${m.sideW}`);
    ok(m.sideH < 900, `closed side height ${m.sideH}`);
    ok(await p.locator(".portal-nav-burger").isVisible(), "hamburger visible");
    eq(m.aria, "false", "closed aria-expanded");
    eq(m.open, false, "closed class");
    await p.close();
  });
}

await T("hamburger opens and closes the drawer", async () => {
  const p = await open("portal-events.html", { width: 390, height: 844 });
  await p.click(".portal-nav-burger");
  const opened = await p.evaluate(metrics);
  eq(opened.open, true, "open class");
  eq(opened.aria, "true", "open aria");
  eq(await p.getAttribute(".portal-nav-burger", "aria-label"), "Close menu", "close label");
  ok(opened.sideX >= -2 && opened.sideX < 20, `open drawer x=${opened.sideX}`);
  ok(await p.locator(".side .menu a").first().isVisible(), "menu links visible");
  ok(await p.locator(".portal-nav-backdrop").isVisible(), "backdrop");
  await p.click(".portal-nav-burger");
  const closed = await p.evaluate(metrics);
  eq(closed.open, false, "toggled shut");
  eq(closed.aria, "false", "shut aria");
  await p.close();
});

await T("Esc and backdrop close; focus returns to the hamburger", async () => {
  const p = await open("portal.html", { width: 390, height: 844 });
  await p.click(".portal-nav-burger");
  ok(await p.locator("html.portal-nav-open").count(), "opened");
  await p.keyboard.press("Escape");
  eq(await p.getAttribute(".portal-nav-burger", "aria-expanded"), "false", "Esc closes");
  eq(await p.evaluate(() => document.activeElement.className), "portal-nav-burger", "focus after Esc");

  await p.click(".portal-nav-burger");
  await p.click(".portal-nav-backdrop");
  eq(await p.getAttribute(".portal-nav-burger", "aria-expanded"), "false", "backdrop closes");
  eq(await p.evaluate(() => document.activeElement.className), "portal-nav-burger", "focus after backdrop");
  await p.close();
});

await T("desktop ≥861 keeps the sticky rail and hides the hamburger", async () => {
  const p = await open("portal-events.html", { width: 1280, height: 900 });
  const m = await p.evaluate(metrics);
  eq(m.position, "sticky", "desktop rail stays sticky");
  ok(m.sideX < 5, `rail x=${m.sideX}`);
  ok(m.sideW >= 240 && m.sideW <= 280, `rail width ${m.sideW}`);
  ok(m.mainOffsetTop < 5, "main still beside the rail, not under it");
  ok(!(await p.locator(".portal-nav-burger").isVisible()), "no hamburger on desktop");
  ok(!(await p.locator(".portal-nav-backdrop").isVisible()), "no backdrop on desktop");
  ok(await p.locator(".side .menu").isVisible(), "rail menu stays visible");
  await p.close();
});

await T("Home and Organization use the same drawer at 390", async () => {
  for (const file of ["portal.html", "portal-organization.html"]) {
    const p = await open(file, { width: 390, height: 844 });
    const m = await p.evaluate(metrics);
    eq(m.position, "fixed", `${file} side fixed`);
    ok(m.mainOffsetTop < 20, `${file} main offset ${m.mainOffsetTop}`);
    ok(await p.locator(".portal-nav-burger").isVisible(), `${file} burger`);
    await p.close();
  }
});

await T("session slides (slim rail) still gets the drawer, not a stacked side", async () => {
  const p = await open("portal-session-slides.html", { width: 390, height: 844 });
  const m = await p.evaluate(metrics);
  eq(m.position, "fixed", "slides side fixed");
  ok(m.mainOffsetTop < 20, `slides main offset ${m.mainOffsetTop}`);
  ok(await p.locator(".portal-nav-burger").isVisible(), "slides burger");
  await p.close();
});

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
await br.close();
process.exit(fail ? 1 : 0);
