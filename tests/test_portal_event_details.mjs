/* Portal Event Details: in-portal tabs, #event= URL, recap order, cert UI-only. */
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
  const labels = [...recap.matchAll(/<li[^>]*>[\s\S]*?<b>([^<]+)<\/b>/g)].map(m => m[1]);
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
  ok(!/\/v1\/.*certificat/.test(js), "no invented cert endpoints in portal module");
  ok(js.includes("not wired"), "honest disabled copy");
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
    apiHits.push(route.request().url());
    const url = route.request().url();
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
      ready: m.certificateUiState({ registered: true, submitted: true, windowState: "closed" }),
      missed: m.certificateUiState({ registered: true, submitted: false, windowState: "closed" }),
      issued: m.certificateUiState({ registered: true, submitted: true, issued: true }),
      notIssued: m.certificateUiState({ registered: true, submitted: true, issued: false }),
      S,
    };
  });
  eq(got.notReg, got.S.NOT_REGISTERED, "not registered");
  eq(got.wait, got.S.REGISTERED_LOCKED, "wait");
  eq(got.open, got.S.REGISTERED_OPEN, "open feedback");
  eq(got.ready, got.S.READY, "eligible");
  eq(got.missed, got.S.CLOSED_UNSUBMITTED, "missed window");
  eq(got.issued, got.S.ISSUED, "issued only when told");
  eq(got.notIssued, got.S.READY, "submitted is not issued");
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
  await ctx.close();
});

await T("tabs update hash; Back restores the list", async () => {
  const { p, ctx } = await open("portal-events.html");
  await p.locator('a[data-event-open="2026-10-ai-exchange"]').first().click();
  await p.waitForSelector("[data-ed-root]");
  await p.locator('[data-ed-tab="feedback"]').click();
  await p.waitForFunction(() => /tab=feedback/.test(location.hash));
  ok(/tab=feedback/.test(p.url()), "feedback hash");
  await p.locator('[data-ed-tab="certificate"]').click();
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
  eq(await p.getAttribute("[data-cert-state]", "data-cert-state"), "closed_unsubmitted", "no cert without feedback");
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

await T("no certificate API was called during portal details", () => {
  ok(!apiHits.some(u => /certificat/i.test(u)), `cert API hits: ${apiHits.filter(u => /certificat/i.test(u))}`);
});

await br.close();
console.log(`==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
