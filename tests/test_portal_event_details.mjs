/* Portal Event Details: in-portal tabs, #event= URL, recap order, draft cert probe. */
import { chromium } from "playwright";
import { readFileSync, existsSync } from "fs";

const BASE = process.env.PAAIPE_BASE || "http://127.0.0.1:8899";
const ROOT = process.env.PAAIPE_ROOT || "/Users/user/Philippine-Association-of-AI";
const REAL_FB = readFileSync(`${ROOT}/assets/js/paaipe-firebase.js`, "utf8");
const REAL_DATA = readFileSync(`${ROOT}/assets/js/paaipe-events-data.js`, "utf8");

let pass = 0, fail = 0;
const T = async (n, f) => {
  try { await f(); console.log(`  PASS  ${n}`); pass++; }
  catch (e) { console.log(`  FAIL  ${n}\n        ${e.message}`); fail++; }
};
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => {
  if (a !== b) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
};

await T("URL helper and recap markup order", () => {
  const html = readFileSync(`${ROOT}/portal-events.html`, "utf8");
  ok(html.includes("portal-events.html#event=2026-10-ai-exchange"), "canonical #event=");
  ok(html.includes("portal-events.html#event=2026-09-ai-exchange&amp;tab=feedback"), "feedback deep-link");
  const recap = html.match(/data-ss-recap[\s\S]*?<\/ul>/)[0];
  const labels = [...recap.matchAll(/<li[^>]*>[\s\S]*?<b>([^<]+)<\/b>/g)].map(m => m[1].replace(/&amp;/g, "&"));
  const wanted = ["Session recording", "Speaker's slides", "Feedback", "Certificate", "Q&A follow-ups"];
  const present = wanted.filter(w => labels.includes(w));
  eq(present.join("|"), wanted.join("|"), "recap labels present");
  ok(labels.indexOf("Feedback") === labels.indexOf("Speaker's slides") + 1, "Feedback after slides");
  ok(labels.indexOf("Certificate") === labels.indexOf("Feedback") + 1, "Certificate after Feedback");
  ok(labels.indexOf("Q&A follow-ups") === labels.indexOf("Certificate") + 1, "Q&A after Certificate");
  ok(html.includes('data-event-open="2026-10-ai-exchange"'), "October opens in portal");
  ok(html.includes("paaipe-portal-events.js"), "details module");
  ok(html.includes('data-partner-cta'), "partner CTA reused");
  ok(existsSync(`${ROOT}/assets/img/paaipe-certificate-of-participation.png`), "approved template preview");
  const js = readFileSync(`${ROOT}/assets/js/paaipe-portal-events.js`, "utf8");
  ok(!/\/v1\/.*certificat/.test(js), "portal module uses helpers, not path strings");
  ok(!/certificate\/issue|certificate\/download/.test(js), "no issue or download API");
  ok(js.includes("not wired"), "honest disabled copy");
  ok(js.includes("openFeedbackThanks"), "thank-you after feedback 201");
  ok(js.includes("feedbackCertificateFromResponse"), "POST certificate pass-through");
  ok(js.includes("function registerFromPortalHref"), "portal register helper");
  ok(html.includes("from=portal"), "list Register marks portal origin");
});

const fbStub = `export * from '/assets/js/paaipe-firebase-real.js';
  export function isConfigured(){ return true }
  export async function currentAgent(){
    return { uid:'u1', email:'agent@example.com', full_name:'Test Agent',
      status:'agent', isAgent:true, emailVerified:true, confirmationSeen:true };
  }
  export async function idTokenForRequest(){ return 'test-id-token' }
  export async function isAdminNow(){ return false }
  export async function signOutNow(){}`;

const dataStub = `
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function getEvent(){ return null }
  export async function listEvents(){ return [] }
  export async function myApplications(){ return new Map() }
  export async function listEventSponsors(){ return [] }
`;

const br = await chromium.launch();
const apiHits = [];

async function open(path, { width = 1280, height = 900 } = {}) {
  const ctx = await br.newContext({ viewport: { width, height } });
  const p = await ctx.newPage();
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: fbStub }));
  await p.route("**/assets/js/paaipe-events-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_DATA }));
  await p.route("**/assets/js/paaipe-events-data.js", r =>
    r.fulfill({ contentType: "text/javascript", body: dataStub }));
  await p.route("https://api.paaipe.org/**", async route => {
    const url = route.request().url();
    const method = route.request().method();
    apiHits.push(`${method} ${url}`);
    if (/\/feedback\/questions/.test(url)) {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ questions: [] }),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "not found" });
  });
  await p.goto(`${BASE}/${path}`, { waitUntil: "load" });
  return { p, ctx };
}

await T("feedback window is +1h after start through noon PHT next day", async () => {
  const { p, ctx } = await open("portal-events.html");
  const got = await p.evaluate(async () => {
    const m = await import("/assets/js/paaipe-portal-events.js");
    const sep = m.catalogEvent("2026-09-ai-exchange");
    const oct = m.catalogEvent("2026-10-ai-exchange");
    return {
      opens: m.feedbackWindowOpensAt(sep).toISOString(),
      closes: m.feedbackWindowClosesAt(sep).toISOString(),
      before: m.feedbackWindowState(sep, new Date("2026-09-15T11:30:00+08:00")).state,
      atOpen: m.feedbackWindowState(sep, new Date("2026-09-15T21:00:00+08:00")).state,
      beforeNoon: m.feedbackWindowState(sep, new Date("2026-09-16T11:59:00+08:00")).state,
      atNoon: m.feedbackWindowState(sep, new Date("2026-09-16T12:00:00+08:00")).state,
      octLocked: m.feedbackWindowState(oct, new Date("2026-09-19T12:00:00+08:00")).state,
      href: m.portalEventHref("2026-10-ai-exchange"),
      hrefFb: m.portalEventHref("2026-09-ai-exchange", "feedback"),
      hrefCert: m.portalEventHref("2026-10-ai-exchange", "certificate"),
    };
  });
  eq(got.opens, "2026-09-15T13:00:00.000Z", "Sep 15 9:00 PM PHT");
  eq(got.closes, "2026-09-16T04:00:00.000Z", "Sep 16 12:00 noon PHT");
  eq(got.before, "locked", "before +1h");
  eq(got.atOpen, "open", "at +1h");
  eq(got.beforeNoon, "open", "before noon next day");
  eq(got.atNoon, "closed", "at noon next day");
  eq(got.octLocked, "locked", "October still locked");
  eq(got.href, "portal-events.html#event=2026-10-ai-exchange", "canonical");
  eq(got.hrefFb, "portal-events.html#event=2026-09-ai-exchange&tab=feedback", "feedback tab");
  eq(got.hrefCert, "portal-events.html#event=2026-10-ai-exchange&tab=certificate", "certificate tab");
  const extras = await p.evaluate(async () => {
    const m = await import("/assets/js/paaipe-portal-events.js");
    const oct = m.catalogEvent("2026-10-ai-exchange");
    const sep = m.catalogEvent("2026-09-ai-exchange");
    const liveAt = new Date("2026-10-13T20:30:00+08:00");
    return {
      reg: m.registerFromPortalHref(oct.registerHref, oct.id),
      gcal: m.googleCalendarHref(oct),
      share: m.shareAssets(oct).any,
      about: Boolean(oct.description && m.expectList(oct).length && m.programRows(oct).length),
      live: m.isEventLive(oct, liveAt),
      phaseLive: m.detailPhase(oct, { registered: true }, liveAt),
      phaseReg: m.detailPhase(oct, { registered: true }, new Date("2026-09-19T12:00:00+08:00")),
      past: m.headerStatus(sep, { registered: true }),
      statusLive: m.headerStatus(oct, { registered: true }, liveAt),
    };
  });
  eq(extras.reg, "register-2026-10-ai-exchange.html?from=portal&event=2026-10-ai-exchange", "portal register");
  ok(/calendar\.google\.com/.test(extras.gcal), "google calendar");
  ok(/20261013T120000Z\/20261013T133000Z/.test(extras.gcal), "google dates UTC");
  ok(extras.share, "October share banners");
  ok(extras.about, "public about/expect/program ported");
  eq(extras.live, true, "live during session");
  eq(extras.phaseLive, "live", "live wins over registered");
  eq(extras.phaseReg, "registered", "registered before start");
  eq(extras.past, "Past", "September past");
  eq(extras.statusLive, "Live", "Live pill");
  await ctx.close();
});

await T("certificate UI states — issued never inferred; both gates required", async () => {
  const { p, ctx } = await open("portal-events.html");
  const got = await p.evaluate(async () => {
    const m = await import("/assets/js/paaipe-portal-events.js");
    const S = m.CERT_STATES;
    return {
      notReg: m.certificateUiState({ registered: false, submitted: false, windowState: "open" }),
      wait: m.certificateUiState({ registered: true, submitted: false, windowState: "locked" }),
      open: m.certificateUiState({ registered: true, submitted: false, windowState: "open" }),
      issuing: m.certificateUiState({ registered: true, submitted: true, windowState: "closed" }),
      missed: m.certificateUiState({ registered: true, submitted: false, windowState: "closed" }),
      issued: m.certificateUiState({ registered: true, submitted: true, issued: true }),
      notIssued: m.certificateUiState({ registered: true, submitted: true, issued: false }),
      apiIssued: m.certificateUiState({ apiState: "issued", issued: true }),
      apiReady: m.certificateUiState({ apiState: "ready", issued: false }),
      S,
    };
  });
  eq(got.notReg, got.S.NOT_REGISTERED, "not registered");
  eq(got.wait, got.S.AWAITING_FEEDBACK_OPEN, "wait");
  eq(got.open, got.S.FEEDBACK_OPEN, "open feedback");
  eq(got.issuing, got.S.ISSUING, "submitted is issuing, not issued");
  eq(got.missed, got.S.CLOSED_NO_CERT, "missed window");
  eq(got.issued, got.S.ISSUED, "issued only when told");
  eq(got.notIssued, got.S.ISSUING, "submitted is not issued");
  eq(got.apiIssued, got.S.ISSUED, "API issued");
  eq(got.apiReady, got.S.ISSUING, "ready alias without cert → issuing");
  await ctx.close();
});

await T("click upcoming event stays in portal and writes #event=", async () => {
  const { p, ctx } = await open("portal-events.html");
  await p.locator('a[data-event-open="2026-10-ai-exchange"]').first().click();
  await p.waitForSelector("[data-ed-root]", { timeout: 9000 });
  ok(/portal-events/.test(p.url()), `still portal: ${p.url()}`);
  ok(/#event=2026-10-ai-exchange/.test(p.url()), `hash: ${p.url()}`);
  ok(!/event-2026-10/.test(p.url()), "not the marketing page");
  eq(await p.locator("[data-ed-tab].on").innerText(), "Overview", "Overview tab");
  ok(await p.locator("[data-partner-cta]").count(), "Partner CTA mount on Overview");
  ok(await p.locator("[data-ed-head]").count(), "header band");
  eq(await p.getAttribute("[data-ed-root]", "data-ed-phase"), "registered", "October listed registered");
  ok(await p.locator('[data-ed-sec="about"][data-ed-open="1"]').count(), "About expanded");
  ok(await p.locator('[data-ed-sec="schedule"][data-ed-open="1"]').count(), "Schedule expanded");
  ok(await p.locator('[data-ed-sec="partners"][data-ed-open="1"]').count(), "Partners expanded");
  ok(await p.locator('[data-ed-sec="share"][data-ed-open="1"]').count(), "Share when banners exist");
  ok(await p.locator('[data-ed-sec="calendar"][data-ed-open="1"]').count(), "Calendar expanded");
  ok(await p.locator("[data-ed-head] a[href*='from=portal']").count() === 0, "October has no Register");
  ok(/calendar\.google\.com/.test(await p.locator('[data-ed-sec="calendar"] a').first().getAttribute("href") || ""),
    "Google calendar in Overview");
  await ctx.close();
});

await T("tabs update hash; Back restores the list", async () => {
  const { p, ctx } = await open("portal-events.html");
  await p.locator('a[data-event-open="2026-10-ai-exchange"]').first().click();
  await p.waitForSelector("[data-ed-root]");
  await p.locator('button.ed-tab[data-ed-tab="feedback"]').click();
  await p.waitForFunction(() => /tab=feedback/.test(location.hash));
  ok(/tab=feedback/.test(p.url()), "feedback hash");
  await p.locator('button.ed-tab[data-ed-tab="certificate"]').click();
  await p.waitForFunction(() => /tab=certificate/.test(location.hash));
  ok(await p.locator("[data-cert-state]").count(), "certificate panel");
  await p.goBack();
  await p.waitForFunction(() => /tab=feedback/.test(location.hash));
  await p.goBack();
  await p.waitForFunction(() => /event=2026-10-ai-exchange/.test(location.hash) && !/tab=/.test(location.hash));
  await p.goBack();
  await p.waitForFunction(() => !location.hash.includes("event="));
  ok(await p.locator("[data-events-home]").isVisible(), "list visible");
  await ctx.close();
});

await T("refresh restores the same event + tab", async () => {
  const { p, ctx } = await open("portal-events.html#event=2026-11-ai-exchange&tab=certificate");
  await p.waitForSelector("[data-ed-root]", { timeout: 9000 });
  eq(await p.getAttribute("[data-ed-root]", "data-event-id"), "2026-11-ai-exchange", "id");
  eq(await p.getAttribute("[data-ed-root]", "data-ed-tab"), "certificate", "tab");
  eq(await p.getAttribute("[data-cert-state]", "data-cert-state"), "not_registered", "Nov not registered");
  await ctx.close();
});

await T("October feedback locked; September feedback closed; cert actions disabled", async () => {
  const { p, ctx } = await open("portal-events.html#event=2026-10-ai-exchange&tab=feedback");
  await p.waitForSelector("[data-feedback-window]");
  eq(await p.getAttribute("[data-feedback-window]", "data-feedback-window"), "locked", "Oct locked");
  ok(/one hour after/i.test(await p.locator("[data-ed-panel=feedback]").innerText()), "locked copy");
  await p.goto(`${BASE}/portal-events.html#event=2026-09-ai-exchange&tab=feedback`, { waitUntil: "load" });
  await p.waitForSelector("[data-feedback-window]");
  eq(await p.getAttribute("[data-feedback-window]", "data-feedback-window"), "closed", "Sep closed");
  await p.locator('[data-ed-tab="certificate"]').click();
  await p.waitForSelector("[data-cert-state]");
  eq(await p.getAttribute("[data-cert-state]", "data-cert-state"), "closed_no_cert", "no cert without feedback");
  eq(await p.getAttribute("[data-ed-root]", "data-cert-live"), "0", "cert GET 404 is not live");
  eq(await p.getAttribute("[data-ed-root]", "data-feedback-window-source"), "client", "window 404 → client math");
  ok(await p.locator("[data-cert-download]").isDisabled(), "Download disabled");
  ok(await p.locator("[data-cert-email]").isDisabled(), "Email disabled");
  await ctx.close();
});

await T("past recap Feedback/Certificate deep-link into Details tabs", async () => {
  const { p, ctx } = await open("portal-events.html");
  await p.locator('[data-recap-row="certificate"] a').click();
  await p.waitForSelector("[data-ed-root]");
  ok(/event=2026-09-ai-exchange/.test(p.url()), "september");
  ok(/tab=certificate/.test(p.url()), "certificate tab");
  await ctx.close();
});

await T("November header Register carries from=portal; sections stay open until clicked", async () => {
  const { p, ctx } = await open("portal-events.html#event=2026-11-ai-exchange");
  await p.waitForSelector("[data-ed-root]");
  eq(await p.getAttribute("[data-ed-root]", "data-ed-phase"), "upcoming", "not registered");
  const reg = p.locator("[data-ed-head] a", { hasText: "Register" });
  ok(await reg.count(), "Register gold in header");
  const href = await reg.getAttribute("href");
  ok(/from=portal/.test(href), `from=portal: ${href}`);
  ok(/event=2026-11-ai-exchange/.test(href), `event id: ${href}`);
  eq(await p.locator('[data-ed-sec="share"]').count(), 0, "no share without banners");
  const about = p.locator('[data-ed-sec="about"]');
  eq(await about.getAttribute("data-ed-open"), "1", "starts open");
  await about.locator("[data-ed-toggle]").click();
  eq(await about.getAttribute("data-ed-open"), "0", "click collapses");
  await about.locator("[data-ed-toggle]").click();
  eq(await about.getAttribute("data-ed-open"), "1", "click expands");
  await ctx.close();
});

await T("375px Events list + Details do not overflow horizontally", async () => {
  const { p, ctx } = await open("portal-events.html", { width: 375, height: 812 });
  const listOverflow = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  ok(!listOverflow, "list no horizontal overflow");
  await p.locator('a[data-event-open="2026-10-ai-exchange"]').first().click();
  await p.waitForSelector("[data-ed-root]");
  const detOverflow = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  ok(!detOverflow, "details no horizontal overflow");
  await ctx.close();
});

await T("draft routes are probed; 404 is not-wired; no issue/download/email POST", () => {
  ok(apiHits.some(u => /GET .*\/feedback\/window/.test(u)), "window GET probed");
  ok(apiHits.some(u => /GET .*\/me\/events\/.+\/certificate/.test(u)), "me certificate GET probed");
  ok(!apiHits.some(u => /POST .*\/certificate/.test(u)), "no email POST while 404");
  ok(!apiHits.some(u => /certificate\/(issue|download)/.test(u)), "no invented issue/download");
});

await T("feedbackCertificateFromResponse never invents; thank-you CTA writes tab=certificate", async () => {
  const { p, ctx } = await open("portal-events.html#event=2026-10-ai-exchange&tab=feedback");
  await p.waitForSelector("[data-ed-root]");
  const got = await p.evaluate(async () => {
    const m = await import("/assets/js/paaipe-portal-events.js");
    const none = [
      m.feedbackCertificateFromResponse(null),
      m.feedbackCertificateFromResponse({}),
      m.feedbackCertificateFromResponse({ certificate: null }),
      m.feedbackCertificateFromResponse({ certificate: "nope" }),
    ];
    const raw = { id: "cert-1", pdfUrl: "https://media.paaipe.org/certificates/c.pdf" };
    const pass = m.feedbackCertificateFromResponse({ certificate: raw });
    const dlgNull = m.openFeedbackThanks("2026-10-ai-exchange", null);
    const noFile = !dlgNull?.querySelector("[data-ed-thanks-file]");
    const primary = dlgNull?.querySelector("[data-ed-thanks-cert]")?.getAttribute("href") || "";
    const copy = dlgNull?.querySelector("#ed-thanks-copy")?.textContent || "";
    dlgNull?.close();
    const dlgFile = m.openFeedbackThanks("2026-10-ai-exchange", raw);
    const fileHref = dlgFile?.querySelector("[data-ed-thanks-file]")?.getAttribute("href") || "";
    dlgFile?.close();
    const dlgFake = m.openFeedbackThanks("2026-10-ai-exchange", { pdfUrl: "https://evil.example/c.pdf" });
    const noFake = !dlgFake?.querySelector("[data-ed-thanks-file]");
    dlgFake?.close();
    return { none, same: pass === raw, noFile, primary, copy, fileHref, noFake };
  });
  ok(got.none.every(v => v == null), "null/missing/non-object stay null");
  ok(got.same, "real certificate object is passed through");
  ok(got.noFile, "no file CTA when certificate is null");
  eq(got.primary, "portal-events.html#event=2026-10-ai-exchange&tab=certificate", "URL-sweep href");
  ok(/certificate/i.test(got.copy), "thank-you points at the certificate");
  eq(got.fileHref, "https://media.paaipe.org/certificates/c.pdf", "media URL only");
  ok(got.noFake, "non-media URL is not a secondary CTA");
  await p.evaluate(async () => {
    const m = await import("/assets/js/paaipe-portal-events.js");
    m.openFeedbackThanks("2026-10-ai-exchange", null);
  });
  ok(await p.locator("[data-ed-thanks]").evaluate(el => el.open), "dialog open");
  await p.keyboard.press("Escape");
  ok(!await p.locator("[data-ed-thanks]").evaluate(el => el.open), "Escape closes");
  eq(await p.getAttribute("[data-ed-root]", "data-ed-tab"), "feedback", "Escape stays on Feedback");
  await p.evaluate(async () => {
    const m = await import("/assets/js/paaipe-portal-events.js");
    m.openFeedbackThanks("2026-10-ai-exchange", null);
  });
  await p.locator("[data-ed-thanks-cert]").click();
  await p.waitForFunction(() => /tab=certificate/.test(location.hash));
  ok(/event=2026-10-ai-exchange/.test(p.url()), "same event");
  ok(/tab=certificate/.test(p.url()), "certificate tab after primary CTA");
  eq(await p.getAttribute("[data-ed-root]", "data-ed-tab"), "certificate", "panel");
  ok(!await p.locator("[data-ed-thanks]").evaluate(el => el.open).catch(() => false), "dialog closed");
  await ctx.close();
});

await T("feedback 201 with certificate:null still shows thank-you + Certificate CTA", async () => {
  const hits = [];
  let posted = false;
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    localStorage.setItem("paaipe.registrationReceipt.v1", JSON.stringify({
      "2026-10-ai-exchange": { registrationId: "reg-test-1", email: "agent@example.com", at: 1 },
    }));
  });
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: fbStub }));
  await p.route("**/assets/js/paaipe-events-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_DATA }));
  await p.route("**/assets/js/paaipe-events-data.js", r =>
    r.fulfill({ contentType: "text/javascript", body: dataStub }));
  await p.route("https://api.paaipe.org/**", async route => {
    const url = route.request().url();
    const method = route.request().method();
    hits.push(`${method} ${url}`);
    if (/\/feedback\/window/.test(url)) {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          state: "open",
          opensAt: "2026-10-13T13:00:00.000Z",
          closesAt: "2026-10-14T04:00:00.000Z",
          timezone: "Asia/Manila",
        }),
      });
      return;
    }
    if (/\/feedback\/questions/.test(url)) {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          questions: [{
            id: "2026-10-ai-exchange_overall",
            questionKey: "overall",
            prompt: "Overall, how was this session?",
            type: "1-5",
            required: true,
            active: true,
            order: 0,
          }],
        }),
      });
      return;
    }
    if (/\/feedback\/responses/.test(url) && method === "POST") {
      posted = true;
      await route.fulfill({
        status: 201, contentType: "application/json",
        body: JSON.stringify({
          id: "fb-1",
          registrationId: "reg-test-1",
          answers: { overall: 5 },
          certificate: null,
        }),
      });
      return;
    }
    if (/\/feedback\/responses/.test(url) && method === "GET") {
      await route.fulfill({
        status: posted ? 200 : 404,
        contentType: "application/json",
        body: posted
          ? JSON.stringify({
            id: "fb-1",
            registrationId: "reg-test-1",
            answers: { overall: 5 },
            submittedAt: "2026-10-13T14:00:00.000Z",
          })
          : "not found",
      });
      return;
    }
    await route.fulfill({ status: 404, body: "not found" });
  });
  await p.goto(`${BASE}/portal-events.html#event=2026-10-ai-exchange&tab=feedback`, { waitUntil: "load" });
  await p.waitForSelector("[data-efb-form]", { timeout: 9000 });
  await p.locator('[data-efb-choice][data-val="5"]').click();
  await p.locator("[data-efb-form] button[type=submit]").click();
  await p.waitForSelector("[data-ed-thanks][open]", { timeout: 9000 });
  ok(hits.some(u => /POST .*\/feedback\/responses/.test(u)), "member POST fired");
  ok(!await p.locator("[data-ed-thanks-file]").count(), "no file CTA when certificate is null");
  const href = await p.getAttribute("[data-ed-thanks-cert]", "href");
  eq(href, "portal-events.html#event=2026-10-ai-exchange&tab=certificate", "primary URL-sweep");
  await p.locator("[data-ed-thanks-cert]").click();
  await p.waitForFunction(() => /tab=certificate/.test(location.hash));
  eq(await p.getAttribute("[data-ed-root]", "data-ed-tab"), "certificate", "landed on Certificate");
  ok(!hits.some(u => /certificate\/(issue|download)/.test(u)), "submit did not invent issue/download");
  await ctx.close();
});

await T("live certificate GET enables media.paaipe.org download; email POST only then", async () => {
  const hits = [];
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: fbStub }));
  await p.route("**/assets/js/paaipe-events-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_DATA }));
  await p.route("**/assets/js/paaipe-events-data.js", r =>
    r.fulfill({ contentType: "text/javascript", body: dataStub }));
  await p.route("https://api.paaipe.org/**", async route => {
    const url = route.request().url();
    const method = route.request().method();
    hits.push(`${method} ${url}`);
    if (/\/feedback\/window/.test(url)) {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          opensAt: "2026-09-15T13:00:00.000Z",
          closesAt: "2026-09-16T04:00:00.000Z",
          state: "closed",
          timezone: "Asia/Manila",
        }),
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
    if (/\/me\/events\/.+\/certificate/.test(url) && method === "GET") {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          state: "issued",
          registered: true,
          feedbackSubmitted: true,
          feedbackWindow: { state: "closed", opensAt: "2026-09-15T13:00:00.000Z", closesAt: "2026-09-16T04:00:00.000Z", timezone: "Asia/Manila" },
          certificate: {
            id: "cert-1",
            issuedAt: "2026-09-16T04:05:00.000Z",
            pdfUrl: "https://media.paaipe.org/certificates/cert-1.pdf",
            pngUrl: "https://media.paaipe.org/certificates/cert-1.png",
            emailedAt: "2026-09-16T04:06:00.000Z",
          },
        }),
      });
      return;
    }
    if (/\/feedback\/questions/.test(url)) {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ questions: [] }),
      });
      return;
    }
    await route.fulfill({ status: 404, body: "not found" });
  });
  await p.goto(`${BASE}/portal-events.html#event=2026-09-ai-exchange&tab=certificate`, { waitUntil: "load" });
  await p.waitForSelector("[data-cert-state]");
  eq(await p.getAttribute("[data-cert-state]", "data-cert-state"), "issued", "issued from GET");
  eq(await p.getAttribute("[data-ed-root]", "data-cert-live"), "1", "200 is live");
  eq(await p.getAttribute("[data-ed-root]", "data-feedback-window-source"), "api", "window GET used");
  const href = await p.getAttribute("[data-cert-download]", "href");
  eq(href, "https://media.paaipe.org/certificates/cert-1.pdf", "download is media URL");
  ok(!await p.locator("[data-cert-email]").isDisabled(), "email enabled when issued + live");
  await p.locator("[data-cert-email]").click();
  await p.waitForFunction(() => /API accepted the re-send/i.test(document.querySelector("[data-cert-msg]")?.textContent || ""));
  ok(hits.some(u => /POST .*\/certificate\/email/.test(u)), "email POST only when live");
  ok(!hits.some(u => /certificate\/(issue|download)/.test(u)), "still no issue/download API");
  await ctx.close();
});

await br.close();
console.log(`==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
