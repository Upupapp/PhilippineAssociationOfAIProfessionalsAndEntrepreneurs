/* Admin shell + dense tables (R-05 / R-06 / R-21). */
import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.PAAIPE_BASE || "http://127.0.0.1:8899";
const ROOT = process.env.PAAIPE_ROOT || process.cwd();
const REAL_FB = readFileSync(`${ROOT}/assets/js/paaipe-firebase.js`, "utf8");
const REAL_DATA = readFileSync(`${ROOT}/assets/js/paaipe-events-data.js`, "utf8");

let pass = 0, fail = 0;
const T = async (n, f) => {
  try { await f(); console.log(`  PASS  ${n}`); pass++; }
  catch (e) { console.log(`  FAIL  ${n}\n        ${e.message}`); fail++; }
};
const ok = (c, m) => { if (!c) throw new Error(m); };

const EVENTS = [
  { id: "2026-10-ai-exchange", title: "AI Exchange — October 2026",
    status: "registration_open", startsAt: { seconds: 1760361600 } },
];
const ORGS = [
  { id: "gethired", name: "GetHired Online", website: "https://gethired.ph",
    type: "sponsor", status: "active", logoUrl: "" },
];
const APPS = [
  { id: "AbCd1234efgh", reference: "PA-2026-ABCD", companyName: "Northwind Analytics",
    contactName: "Rosa Villanueva", email: "rosa@example.com",
    supportTypes: ["speaker"], source: "public_event", status: "new",
    eventId: "2026-10-ai-exchange", createdAt: { seconds: 1758067200 } },
];

const fbStub = `
  export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){return {uid:'u1',email:'admin@upupapp.asia',full_name:'Admin',status:'agent'}}
  export async function isAdminNow(){return true}
  export async function signOutNow(){}
  export async function idTokenForRequest(){ return 'test-id-token' }
  export async function listMembers(){return []}
  export async function listRegistrations(){return []}
  export async function countNewPartnerApplications(){return 0}`;
const dataStub = `
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function listEvents(){ return ${JSON.stringify(EVENTS)} }
  export async function listOrganizations(){ return ${JSON.stringify(ORGS)} }
  export async function listEventSponsors(){ return [] }`;

const br = await chromium.launch();
const errs = [];

async function openAdmin(path, viewport) {
  const ctx = await br.newContext({ viewport });
  const p = await ctx.newPage();
  p.on("pageerror", e => errs.push(String(e)));
  await p.route("**/assets/js/paaipe-firebase-real.js", r => r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r => r.fulfill({ contentType: "text/javascript", body: fbStub }));
  await p.route("**/assets/js/paaipe-events-data-real.js", r => r.fulfill({ contentType: "text/javascript", body: REAL_DATA }));
  await p.route("**/assets/js/paaipe-events-data.js", r => r.fulfill({ contentType: "text/javascript", body: dataStub }));
  await p.route("https://api.paaipe.org/**", async route => {
    const url = route.request().url();
    if (url.includes("/v1/admin/partner-applications")) {
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ applications: APPS }) });
    }
    if (url.includes("/v1/admin/organizations")) {
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ organizations: ORGS }) });
    }
    if (url.includes("/v1/admin/contacts")) {
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ contacts: [] }) });
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await p.goto(`${BASE}/${path}`, { waitUntil: "load" });
  await p.waitForSelector("[data-admin-burger]", { state: "attached", timeout: 9000 });
  return { p, ctx };
}

function measureShell() {
  const aside = document.querySelector(".aside");
  const top = document.querySelector(".top");
  const burger = document.querySelector("[data-admin-burger]");
  const ar = aside.getBoundingClientRect();
  const flow = getComputedStyle(aside).position;
  return {
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    asideH: ar.height,
    asideRight: ar.right,
    asidePos: flow,
    topY: top.getBoundingClientRect().top,
    burger: burger ? {
      display: getComputedStyle(burger).display,
      expanded: burger.getAttribute("aria-expanded"),
      w: burger.getBoundingClientRect().width,
      h: burger.getBoundingClientRect().height,
    } : null,
    bodyOpen: document.body.classList.contains("aside-open"),
    backdropOn: !document.querySelector("[data-aside-backdrop]")?.hidden,
  };
}

await T("R-05: at 320 the aside is off-canvas and the hamburger is in .top", async () => {
  const { p, ctx } = await openAdmin("admin-partners.html", { width: 320, height: 568 });
  await p.waitForSelector("[data-open]", { timeout: 9000 });
  const m = await p.evaluate(measureShell);
  ok(m.asidePos === "fixed", `aside position ${m.asidePos}`);
  ok(m.asideRight <= 1, `closed aside stays off-canvas (right=${m.asideRight})`);
  ok(m.topY < 8, `page title at top, not below a stacked rail (topY=${m.topY})`);
  ok(m.burger && m.burger.display !== "none", "hamburger visible");
  ok(m.burger.w >= 44 && m.burger.h >= 44, `hamburger ${m.burger.w}×${m.burger.h} ≥ 44`);
  ok(!m.bodyOpen && m.burger.expanded === "false", "starts closed");
  await ctx.close();
});

await T("R-05: hamburger opens; Esc and backdrop close", async () => {
  const { p, ctx } = await openAdmin("admin-partners.html", { width: 390, height: 844 });
  await p.waitForSelector("[data-admin-nav] a", { state: "attached", timeout: 9000 });
  await p.click("[data-admin-burger]");
  await p.waitForFunction(() => document.body.classList.contains("aside-open")
    && document.querySelector(".aside").getBoundingClientRect().right > 200);
  const open = await p.evaluate(measureShell);
  ok(open.bodyOpen && open.burger.expanded === "true", "opens");
  ok(open.asideRight > 200, `rail slides in (right=${open.asideRight})`);
  ok(open.backdropOn, "backdrop shown");
  await p.keyboard.press("Escape");
  await p.waitForFunction(() => !document.body.classList.contains("aside-open")
    && document.querySelector(".aside").getBoundingClientRect().right <= 1);
  const afterEsc = await p.evaluate(measureShell);
  ok(!afterEsc.bodyOpen && afterEsc.burger.expanded === "false", "Esc closes");
  ok(afterEsc.asideRight <= 1, "aside off-canvas after Esc");
  await p.click("[data-admin-burger]");
  await p.waitForFunction(() => document.body.classList.contains("aside-open"));
  await p.locator("[data-aside-backdrop]").click({ position: { x: 360, y: 400 } });
  await p.waitForFunction(() => !document.body.classList.contains("aside-open"));
  const afterBd = await p.evaluate(measureShell);
  ok(!afterBd.bodyOpen, "backdrop closes");
  await ctx.close();
});

await T("R-05: desktop ≥901 keeps the sticky rail and hides the burger", async () => {
  const { p, ctx } = await openAdmin("admin-partners.html", { width: 1024, height: 768 });
  const m = await p.evaluate(measureShell);
  ok(m.asidePos === "sticky", `desktop aside sticky, got ${m.asidePos}`);
  ok(m.burger.display === "none", "hamburger hidden on desktop");
  const cols = await p.evaluate(() => getComputedStyle(document.querySelector(".ashell")).gridTemplateColumns);
  ok(cols.trim().split(/\s+/).length === 2, `desktop two cols: ${cols}`);
  await ctx.close();
});

await T("R-05: print stylesheet still hides chrome", async () => {
  const { p, ctx } = await openAdmin("admin-partners.html", { width: 390, height: 844 });
  await p.emulateMedia({ media: "print" });
  const hide = await p.evaluate(() => {
    const d = sel => getComputedStyle(document.querySelector(sel)).display;
    return { aside: d(".aside"), top: d(".top"), burger: d("[data-admin-burger]") };
  });
  ok(hide.aside === "none" && hide.top === "none" && hide.burger === "none",
    `print hides chrome: ${JSON.stringify(hide)}`);
  await ctx.close();
});

await T("R-06: partners at 320 are card rows; company + status readable; overflow 0", async () => {
  const { p, ctx } = await openAdmin("admin-partners.html", { width: 320, height: 568 });
  await p.waitForSelector("[data-open]", { timeout: 9000 });
  const m = await p.evaluate(() => {
    const tr = document.querySelector("[data-rows] tr[data-app]");
    const tds = [...tr.querySelectorAll("td")];
    const company = tds[1];
    const status = tds[5];
    const cr = company.getBoundingClientRect();
    const sr = status.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      display: getComputedStyle(tr).display,
      companyLabel: company.getAttribute("data-label"),
      statusLabel: status.getAttribute("data-label"),
      companyText: company.innerText,
      statusText: status.innerText,
      companyInView: cr.left >= 0 && cr.right <= innerWidth + 1,
      statusInView: sr.left >= 0 && sr.right <= innerWidth + 1,
      filterDir: getComputedStyle(document.querySelector(".filters")).flexDirection,
      placeholder: document.querySelector("[data-f-q]")?.getAttribute("placeholder") || "",
    };
  });
  ok(m.overflow <= 0, `page overflow ${m.overflow} ≤ 0`);
  ok(m.display === "block", `card row display, got ${m.display}`);
  ok(m.companyLabel === "Company" && m.statusLabel === "Status",
    `labels ${m.companyLabel}/${m.statusLabel}`);
  ok(/Northwind/.test(m.companyText), "company readable");
  ok(/New/.test(m.statusText), "status readable");
  ok(m.companyInView && m.statusInView, "company + status in viewport, no guessed scroll");
  ok(m.filterDir === "column", "filters stack");
  ok(m.placeholder.length <= 24, `short placeholder (${m.placeholder})`);
  await ctx.close();
});

await T("R-21: reports at 320 are card rows; event + status readable; overflow 0", async () => {
  const { p, ctx } = await openAdmin("admin-reports.html", { width: 320, height: 568 });
  await p.waitForSelector("[data-open-event]", { timeout: 9000 });
  const m = await p.evaluate(() => {
    const tr = document.querySelector("[data-report-rows] tr[data-open-event]");
    const tds = [...tr.querySelectorAll("td")];
    const event = tds[0], status = tds[2];
    const er = event.getBoundingClientRect(), sr = status.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      display: getComputedStyle(tr).display,
      eventLabel: event.getAttribute("data-label"),
      statusLabel: status.getAttribute("data-label"),
      eventText: event.innerText,
      statusText: status.innerText,
      eventInView: er.left >= 0 && er.right <= innerWidth + 1,
      statusInView: sr.left >= 0 && sr.right <= innerWidth + 1,
    };
  });
  ok(m.overflow <= 0, `page overflow ${m.overflow} ≤ 0`);
  ok(m.display === "block", `card row display, got ${m.display}`);
  ok(m.eventLabel === "Event" && m.statusLabel === "Status",
    `labels ${m.eventLabel}/${m.statusLabel}`);
  ok(/AI Exchange/.test(m.eventText), "event name readable");
  ok(m.eventInView && m.statusInView, "event + status in viewport");
  await ctx.close();
});

await T("R-21: organizations at 320 are card rows; name + status readable; overflow 0", async () => {
  const { p, ctx } = await openAdmin("admin-organizations.html", { width: 320, height: 568 });
  await p.waitForSelector("[data-edit-org]", { timeout: 9000 });
  const m = await p.evaluate(() => {
    const tr = document.querySelector("[data-orgs] tr[data-org]");
    const tds = [...tr.querySelectorAll("td")];
    const name = tds[0], status = tds[3];
    const nr = name.getBoundingClientRect(), sr = status.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      display: getComputedStyle(tr).display,
      nameLabel: name.getAttribute("data-label"),
      statusLabel: status.getAttribute("data-label"),
      nameText: name.innerText,
      statusText: status.innerText,
      nameInView: nr.left >= 0 && nr.right <= innerWidth + 1,
      statusInView: sr.left >= 0 && sr.right <= innerWidth + 1,
    };
  });
  ok(m.overflow <= 0, `page overflow ${m.overflow} ≤ 0`);
  ok(m.display === "block", `card row display, got ${m.display}`);
  ok(m.nameLabel === "Organization" && m.statusLabel === "Status",
    `labels ${m.nameLabel}/${m.statusLabel}`);
  ok(/GetHired/.test(m.nameText), "org name readable");
  ok(/active/.test(m.statusText), "status readable");
  ok(m.nameInView && m.statusInView, "name + status in viewport");
  await ctx.close();
});

await T("R-06: tablet 768 uses sticky first column, not stacked cards", async () => {
  const { p, ctx } = await openAdmin("admin-partners.html", { width: 768, height: 1024 });
  await p.waitForSelector("[data-open]", { timeout: 9000 });
  const m = await p.evaluate(() => {
    const td = document.querySelector("[data-rows] td");
    const tr = document.querySelector("[data-rows] tr[data-app]");
    return {
      sticky: getComputedStyle(td).position,
      rowDisplay: getComputedStyle(tr).display,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  ok(m.sticky === "sticky", `first col sticky, got ${m.sticky}`);
  ok(m.rowDisplay !== "block", `table row, got ${m.rowDisplay}`);
  ok(m.overflow <= 0, `page overflow ${m.overflow} ≤ 0`);
  await ctx.close();
});

await br.close();
if (errs.length) console.log("page errors:", errs.slice(0, 5).join("\n"));
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
