/* My Certificates: nav, Clarence list bind, URL-sweep, collapse, 404 empty. */
import { chromium } from "playwright";
import { readFileSync, existsSync } from "fs";

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

const SAMPLE = {
  certificates: [
    {
      id: "c-sep",
      eventId: "2026-09-ai-exchange",
      eventTitle: "From Signals to Strategy: Using AI to Turn Data into Real Insight",
      eventDate: "2026-09-15",
      year: 2026,
      series: "AI Exchange",
      pdfUrl: "https://media.paaipe.org/certificates/sep.pdf",
      pngUrl: "https://media.paaipe.org/certificates/sep.png",
      issuedAt: "2026-09-15",
      emailedAt: null,
    },
    {
      id: "c-aug",
      eventId: "2026-08-ai-exchange",
      eventTitle: "Building Trustworthy AI Agents",
      eventDate: "2026-08-12",
      year: 2026,
      series: "AI Exchange",
      pdfUrl: "https://media.paaipe.org/certificates/aug.pdf",
      pngUrl: "https://media.paaipe.org/certificates/aug.png",
      issuedAt: "2026-08-12",
      emailedAt: null,
    },
    {
      id: "c-jul",
      eventId: "2026-07-ai-exchange",
      eventTitle: "AI for Philippine Enterprises",
      eventDate: "2026-07-08",
      year: 2026,
      series: "AI Exchange",
      pdfUrl: "https://media.paaipe.org/certificates/jul.pdf",
      pngUrl: "",
      issuedAt: "2026-07-08",
      emailedAt: null,
    },
    {
      id: "c-jun",
      eventTitle: "Prompting That Ships",
      eventDate: "2026-06-10",
      year: 2026,
      series: "AI Exchange",
      pdfUrl: "https://media.paaipe.org/certificates/jun.pdf",
      pngUrl: "https://media.paaipe.org/certificates/jun.png",
      issuedAt: "2026-06-10",
      emailedAt: null,
    },
  ],
};

await T("page, nav under YOU below My Profile, helpers exist", () => {
  ok(existsSync(`${ROOT}/portal-my-certificates.html`), "page file");
  const html = readFileSync(`${ROOT}/portal-my-certificates.html`, "utf8");
  ok(html.includes("data-mc-root"), "root");
  ok(html.includes("paaipe-my-certificates.js"), "module");
  const you = html.split("YOU")[1] || "";
  const profile = you.indexOf("portal-profile.html");
  const certs = you.indexOf("portal-my-certificates.html");
  const org = you.indexOf("portal-organization.html");
  ok(profile >= 0 && certs > profile, "certs after profile");
  ok(org > certs, "org after certs");
  const home = readFileSync(`${ROOT}/portal.html`, "utf8");
  ok(home.includes("portal-my-certificates.html"), "Home sidebar wired");
  const js = readFileSync(`${ROOT}/assets/js/paaipe-my-certificates.js`, "utf8");
  ok(js.includes("getMeCertificates"), "probes list");
  ok(js.includes("postMeEventCertificateEmail"), "reuses email POST");
  ok(!/certificate\/(issue|download)/.test(js), "no invented issue/download");
  const api = readFileSync(`${ROOT}/assets/js/paaipe-api.js`, "utf8");
  ok(api.includes("meCertificatesPath"), "path helper");
  ok(api.includes("clarence-me-certificates"), "contract id");
});

const fbStub = `export * from '/assets/js/paaipe-firebase-real.js';
  export function isConfigured(){ return true }
  export async function currentAgent(){
    return { uid:'u1', email:'agent@example.com', full_name:'Paul Espinas',
      status:'agent', isAgent:true, emailVerified:true, confirmationSeen:true };
  }
  export async function idTokenForRequest(){ return 'test-id-token' }
  export async function isAdminNow(){ return false }
  export async function signOutNow(){}`;

const br = await chromium.launch();
const apiHits = [];

async function open(path, { width = 1280, height = 900, listStatus = 404, listBody = "not found", listImpl } = {}) {
  const ctx = await br.newContext({ viewport: { width, height } });
  const p = await ctx.newPage();
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: fbStub }));
  await p.route("https://api.paaipe.org/**", async route => {
    const url = route.request().url();
    const method = route.request().method();
    apiHits.push(`${method} ${url}`);
    if (typeof listImpl === "function") {
      await listImpl(route);
      return;
    }
    if (/\/v1\/me\/certificates/.test(url) && method === "GET") {
      await route.fulfill({
        status: listStatus,
        contentType: listStatus === 200 ? "application/json" : "text/plain",
        body: typeof listBody === "string" ? listBody : JSON.stringify(listBody),
      });
      return;
    }
    if (/\/certificate\/email/.test(url) && method === "POST") {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ emailedAt: "2026-09-16T05:00:00.000Z" }),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "not found" });
  });
  await p.goto(`${BASE}/${path}`, { waitUntil: "load" });
  return { p, ctx };
}

await T("exported bind/group/hash helpers", async () => {
  const { p, ctx } = await open("portal-my-certificates.html");
  const got = await p.evaluate(async () => {
    const m = await import("/assets/js/paaipe-my-certificates.js");
    const items = [
      { eventTitle: "A", eventDate: "2026-09-15", year: 2026, series: "AI Exchange" },
      { eventTitle: "B", eventDate: "2026-08-12", year: 2026, series: "AI Exchange" },
    ];
    const view = m.viewFromHash("#q=signals&sort=title_asc&year=2026");
    const params = m.hashParamsFromView({ q: "", sort: "date_desc", year: "", series: "", collapsed: [] });
    const emailOnly = {
      eventId: "2026-09-ai-exchange",
      emailedAt: "2026-09-15T05:00:00.000Z",
      eventTitle: "",
      pdfUrl: "",
      pngUrl: "",
    };
    return {
      seriesKey: m.seriesKey("AI Exchange"),
      year: m.cardYear({ year: 2026 }),
      yearFromEmail: m.cardYear(emailOnly),
      groups: m.groupByYear(items).length,
      cards: m.groupByYear(items)[0].items.length,
      q: view.q,
      sort: view.sort,
      yearQ: view.year,
      emptyHash: Object.keys(params).length,
      emailHtml: m.cardHtml(emailOnly),
    };
  });
  eq(got.seriesKey, "ai-exchange", "series slug");
  eq(got.year, "2026", "year");
  eq(got.yearFromEmail, "2026", "emailedAt year fallback");
  eq(got.groups, 1, "one year group");
  eq(got.cards, 2, "2 cards");
  eq(got.q, "signals", "q");
  eq(got.sort, "title_asc", "sort");
  eq(got.yearQ, "2026", "year");
  eq(got.emptyHash, 0, "defaults omitted from hash");
  ok(/data-mc-emailed/.test(got.emailHtml), "emailedAt rendered");
  ok(/Emailed · Sep 15, 2026/.test(got.emailHtml), "Sept 15 emailed date");
  ok(/Certificate of Participation/.test(got.emailHtml), "title fallback");
  ok(/data-mc-download disabled/.test(got.emailHtml), "download stays disabled");
  ok(/data-mc-view disabled/.test(got.emailHtml), "view stays disabled");
  ok(/data-event-id="2026-09-ai-exchange"/.test(got.emailHtml), "eventId on card");
  ok(!/media\.paaipe\.org/.test(got.emailHtml), "no invented media URL");
  await ctx.close();
});

await T("404 list is honest empty / not-wired; no invented cards", async () => {
  const { p, ctx } = await open("portal-my-certificates.html");
  await p.waitForSelector("[data-mc-root]");
  await p.waitForFunction(() => document.querySelector("[data-mc-root]")?.dataset.mcState);
  eq(await p.getAttribute("[data-mc-root]", "data-mc-state"), "not-wired", "state");
  ok(await p.locator("[data-mc-empty]").count(), "empty chrome");
  eq(await p.locator("[data-mc-card]").count(), 0, "no invented cards");
  ok(/\/v1\/me\/certificates/.test(await p.locator("[data-mc-hold]").innerText()), "404 note");
  ok(await p.locator('a[href="portal-events.html"]').count(), "CTA to Events");
  ok(apiHits.some(u => /GET .*\/v1\/me\/certificates/.test(u)), "probed list");
  await ctx.close();
});

await T("200 list paints Clarence cards; URL updates; collapse defaults open", async () => {
  const { p, ctx } = await open("portal-my-certificates.html", {
    listStatus: 200, listBody: SAMPLE,
  });
  await p.waitForSelector("[data-mc-card]");
  eq(await p.locator("[data-mc-card]").count(), 4, "4 cards");
  eq(await p.getAttribute("[data-mc-root]", "data-mc-state"), "list", "list state");
  ok(await p.locator(".mc-group [data-collapse-hd]").first().getAttribute("aria-expanded") === "true", "expanded");
  const dl = await p.locator("[data-mc-download]").first().getAttribute("href");
  eq(dl, "https://media.paaipe.org/certificates/sep.pdf", "download is pdfUrl");
  const view = await p.locator("[data-mc-view]").first().getAttribute("href");
  eq(view, "https://media.paaipe.org/certificates/sep.png", "view is pngUrl");

  await p.locator("[data-mc-q]").fill("Trustworthy");
  await p.waitForFunction(() => /q=Trustworthy/.test(location.hash) || /q=Trustworthy/.test(location.href));
  ok(/q=Trustworthy/.test(p.url()), `search hash: ${p.url()}`);

  await p.locator("[data-mc-sort]").selectOption("title_asc");
  await p.waitForFunction(() => /sort=title_asc/.test(location.hash));
  ok(/sort=title_asc/.test(p.url()), "sort hash");

  await p.locator('.mc-chip[data-filter="year"]').first().click();
  await p.waitForFunction(() => /year=2026/.test(location.hash));
  ok(/year=2026/.test(p.url()), "year → API year");

  await p.locator('.mc-chip[data-filter="series"]').first().click();
  await p.waitForFunction(() => /series=ai-exchange/.test(location.hash));
  ok(/series=ai-exchange/.test(p.url()), "series client filter in hash");

  await p.locator(".mc-group [data-collapse-hd]").first().click();
  await p.waitForFunction(() => document.querySelector(".mc-group")?.classList.contains("is-collapsed"));
  ok(/collapsed=/.test(p.url()), "collapsed groups in hash");
  await ctx.close();
});

await T("Sept 15 email-only rows paint as cards; junk dropped; downloads stay off", async () => {
  const EMAIL_ONLY = {
    certificates: [
      {
        eventId: "2026-09-ai-exchange",
        emailedAt: "2026-09-15T05:00:00.000Z",
      },
      {},
      { series: "Only series" },
      { year: 2026 },
      {
        id: "c-sep",
        eventId: "2026-09-ai-exchange-full",
        eventTitle: "From Signals to Strategy: Using AI to Turn Data into Real Insight",
        eventDate: "2026-09-15",
        year: 2026,
        series: "AI Exchange",
        pdfUrl: "https://media.paaipe.org/certificates/sep.pdf",
        pngUrl: "https://media.paaipe.org/certificates/sep.png",
        issuedAt: "2026-09-15",
        emailedAt: "2026-09-15T05:00:00.000Z",
      },
    ],
  };
  const { p, ctx } = await open("portal-my-certificates.html", {
    listStatus: 200, listBody: EMAIL_ONLY,
  });
  await p.waitForSelector("[data-mc-card]");
  eq(await p.locator("[data-mc-card]").count(), 2, "email-only + full kept; junk dropped");
  const emailOnly = p.locator("[data-mc-card]").first();
  eq(await emailOnly.getAttribute("data-event-id"), "2026-09-ai-exchange", "eventId on card");
  eq(await emailOnly.getAttribute("data-year"), "2026", "grouped by emailedAt year");
  ok(await emailOnly.locator("[data-mc-download]").isDisabled(), "download disabled without pdfUrl");
  ok(await emailOnly.locator("[data-mc-view]").isDisabled(), "view disabled without png/pdf");
  ok(!(await emailOnly.locator("[data-mc-email]").isDisabled()), "Email me wired via eventId");
  const emailed = await emailOnly.locator("[data-mc-emailed]").innerText();
  ok(/Emailed/.test(emailed), "emailedAt surfaced");
  ok(/Sep 15, 2026/.test(emailed), "Sept 15 emailed date");
  ok(/Certificate of Participation/.test(await emailOnly.locator("h2").innerText()), "title fallback");
  const full = p.locator("[data-mc-card]").nth(1);
  ok(await full.locator("[data-mc-emailed]").count(), "full card also shows emailed");
  eq(await full.locator("[data-mc-download]").getAttribute("href"),
    "https://media.paaipe.org/certificates/sep.pdf", "full download intact");
  await ctx.close();
});

await T("Email me POSTs only when eventId is present; last card is not-wired", async () => {
  const hits = [];
  const { p, ctx } = await open("portal-my-certificates.html", {
    listImpl: async route => {
      const url = route.request().url();
      const method = route.request().method();
      hits.push(`${method} ${url}`);
      if (/\/v1\/me\/certificates/.test(url)) {
        await route.fulfill({
          status: 200, contentType: "application/json", body: JSON.stringify(SAMPLE),
        });
        return;
      }
      if (/\/certificate\/email/.test(url) && method === "POST") {
        await route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({ emailedAt: "2026-09-16T05:00:00.000Z" }),
        });
        return;
      }
      await route.fulfill({ status: 404, body: "not found" });
    },
  });
  await p.waitForSelector("[data-mc-card]");
  const lastEmail = p.locator("[data-mc-card]").nth(3).locator("[data-mc-email]");
  ok(await lastEmail.isDisabled(), "no eventId → email disabled");
  await p.locator("[data-mc-card]").first().locator("[data-mc-email]").click();
  await p.waitForFunction(() => /accepted the re-send/i.test(document.querySelector("[data-mc-msg]")?.textContent || ""));
  ok(hits.some(u => /POST .*\/events\/2026-09-ai-exchange\/certificate\/email/.test(u)), "email POST");
  await ctx.close();
});

await T("375px page does not overflow horizontally", async () => {
  const { p, ctx } = await open("portal-my-certificates.html", {
    width: 375, height: 812, listStatus: 200, listBody: SAMPLE,
  });
  await p.waitForSelector("[data-mc-card]");
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  ok(!overflow, "no horizontal overflow");
  await ctx.close();
});

await T("Home injects My Certificates below My Profile", async () => {
  const { p, ctx } = await open("portal.html");
  await p.waitForSelector('a[href="portal-my-certificates.html"]');
  const order = await p.evaluate(() => {
    const hrefs = [...document.querySelectorAll(".side .menu a")].map(a => a.getAttribute("href"));
    return hrefs;
  });
  const iP = order.indexOf("portal-profile.html");
  const iC = order.indexOf("portal-my-certificates.html");
  ok(iP >= 0 && iC === iP + 1, `nav order ${order.slice(iP, iP + 3)}`);
  await ctx.close();
});

await br.close();
console.log(`==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
