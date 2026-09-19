/* API client: api.paaipe.org default, public Learnings GETs, Bearer admin. */
import { readFileSync } from "fs";
import { pathToFileURL } from "url";
import { chromium } from "playwright";

const ROOT = process.env.PAAIPE_ROOT || process.cwd();
const BASE = process.env.PAAIPE_BASE || "http://127.0.0.1:8899";
let pass = 0, fail = 0;
const T = async (n, f) => {
  try { await f(); console.log(`  PASS  ${n}`); pass++; }
  catch (e) { console.log(`  FAIL  ${n}\n        ${e.message}`); fail++; }
};
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => {
  if (a !== b) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
};
const read = p => readFileSync(`${ROOT}/${p}`, "utf8");

const api = await import(pathToFileURL(`${ROOT}/assets/js/paaipe-api.js`).href);

const LIVE_SESSIONS = {
  sessions: [
    {
      id: "2026-09-presentation",
      title: "Part 1 — Presentation",
      description: "From Signals to Strategy.",
      source: "youtube",
      youtubeUrl: "https://www.youtube.com/watch?v=ePw_wlPqYUk",
      youtubeId: "ePw_wlPqYUk",
      storagePath: null,
      posterUrl: "https://paaipe.org/assets/img/ai-exchange-session.jpg",
      posterStoragePath: null,
      published: true,
      publishedAt: "2026-09-15T02:00:00.000Z",
      displayOrder: 1,
      aspect: "16:9",
    },
    {
      id: "2026-09-qa",
      title: "Part 2 — Q&A",
      source: "youtube",
      youtubeUrl: "https://www.youtube.com/watch?v=0PkiRVczWdQ",
      youtubeId: "0PkiRVczWdQ",
      storagePath: null,
      posterUrl: "https://paaipe.org/assets/img/ai-exchange-session.jpg",
      posterStoragePath: null,
      published: true,
      publishedAt: "2026-09-15T02:00:00.000Z",
      displayOrder: 2,
      aspect: "16:9",
    },
  ],
};

const LIVE_MICROS = {
  micros: [
    {
      id: "micro-1",
      title: "Start with the question, not the dashboard",
      description: "Before you open a chart, name the decision you are trying to make.",
      source: "upload",
      youtubeUrl: null,
      youtubeId: null,
      storagePath: null,
      posterUrl: null,
      posterStoragePath: null,
      published: true,
      publishedAt: "2026-09-19T01:46:17.151Z",
      displayOrder: 1,
      aspect: "9:16",
    },
  ],
};

const LIVE_PLAYLIST = {
  id: "v55ktOv1GGmUhecYo4L8",
  title: "From Signals to Strategy",
  description: "Short lessons from Sven Bally’s AI Exchange session.",
  kind: "micros",
  itemIds: ["micro-1", "micro-2", "micro-3", "micro-4"],
  status: "published",
  displayOrder: 1,
  publishedAt: "2026-09-19T02:07:00.000Z",
};

await T("source: default is https://api.paaipe.org; 8091 is an override only", () => {
  eq(api.PAAIPE_API_TUNNEL_BASE, "http://127.0.0.1:8091", "tunnel override");
  eq(api.PAAIPE_API_PROD_BASE, "https://api.paaipe.org", "prod");
  eq(api.PAAIPE_API_DEFAULT_BASE, api.PAAIPE_API_PROD_BASE, "default is prod");
  eq(api.resolvePaaipeApiBase({}), "https://api.paaipe.org", "resolver empty → prod");
  eq(api.PAAIPE_API_BASE, "https://api.paaipe.org", "module default");
  const src = read("assets/js/paaipe-api.js");
  ok(!/media\.paaipe\.org/.test(src.split("\n").filter(l =>
    !l.trim().startsWith("*") && !l.trim().startsWith("//")).join("\n")),
     "media.paaipe.org must not be used as an API base");
});

await T("one knob: query / window / localStorage, first non-empty wins", () => {
  eq(api.resolvePaaipeApiBase({ query: "tunnel" }), "http://127.0.0.1:8091", "query tunnel");
  eq(api.resolvePaaipeApiBase({ query: "prod" }), "https://api.paaipe.org", "query prod");
  eq(api.resolvePaaipeApiBase({ query: "https://example.test/api/" }),
     "https://example.test/api", "query absolute strips slash");
  eq(api.resolvePaaipeApiBase({
    query: "",
    windowValue: "https://api.paaipe.org",
    storageValue: "http://127.0.0.1:8091",
  }), "https://api.paaipe.org", "window beats storage");
  eq(api.resolvePaaipeApiBase({
    query: "",
    windowValue: "",
    storageValue: "https://api.paaipe.org",
  }), "https://api.paaipe.org", "storage when window empty");
});

await T("contract paths are exact — admin + public library", () => {
  eq(api.eventsPath(), "/v1/events", "public events");
  eq(api.adminEventsPath(), "/v1/admin/events", "admin events list");
  eq(api.adminEventPath("2026-10-ai-exchange"),
     "/v1/admin/events/2026-10-ai-exchange", "event PATCH path");
  eq(api.adminEventContentPath("2026-10-ai-exchange"),
     "/v1/admin/events/2026-10-ai-exchange/content", "event content PATCH");
  eq(api.adminEventDuplicatePath("2026-10-ai-exchange"),
     "/v1/admin/events/2026-10-ai-exchange/duplicate", "event duplicate");
  eq(api.adminEventCalendarPath("2026-10-ai-exchange"),
     "/v1/admin/events/2026-10-ai-exchange/calendar.ics", "admin calendar");
  eq(api.adminEventEmailsPath("2026-10-ai-exchange"),
     "/v1/admin/events/2026-10-ai-exchange/emails", "admin emails");
  eq(api.eventPath("event-2026-10-ai-exchange"),
     "/v1/events/event-2026-10-ai-exchange", "public event by slug");
  eq(api.adminEventRegistrationsPath("e-oct"),
     "/v1/admin/events/e-oct/registrations", "event regs");
  eq(api.adminEventRegistrationsPath("e-oct", { status: "attended" }),
     "/v1/admin/events/e-oct/registrations?status=attended", "optional status");
  eq(api.adminRegistrationPath("r1"), "/v1/admin/registrations/r1", "reg id");
  eq(api.eventFeedbackQuestionsPath("2026-10-ai-exchange"),
     "/v1/events/2026-10-ai-exchange/feedback/questions", "public questions");
  eq(api.eventFeedbackResponsesPath("2026-10-ai-exchange"),
     "/v1/events/2026-10-ai-exchange/feedback/responses", "member responses POST");
  eq(api.eventFeedbackResponsePath("2026-10-ai-exchange", "r1"),
     "/v1/events/2026-10-ai-exchange/feedback/responses/r1", "member one response");
  eq(api.adminEventFeedbackQuestionsPath("2026-10-ai-exchange"),
     "/v1/admin/events/2026-10-ai-exchange/feedback/questions", "admin PUT questions");
  eq(api.adminEventFeedbackResponsesPath("2026-10-ai-exchange"),
     "/v1/admin/events/2026-10-ai-exchange/feedback/responses", "admin responses list");
  eq(api.adminEventFeedbackResponsePath("2026-10-ai-exchange", "r1"),
     "/v1/admin/events/2026-10-ai-exchange/feedback/responses/r1", "admin one response");
  eq(api.sessionsPath(), "/v1/sessions", "sessions list");
  eq(api.sessionPath("2026-09-presentation"), "/v1/sessions/2026-09-presentation", "session id");
  eq(api.microsPath(), "/v1/micros", "micros list");
  eq(api.microPath("micro-1"), "/v1/micros/micro-1", "micro id");
  eq(api.playlistsPath("micros"), "/v1/playlists?kind=micros", "playlists micros");
  eq(api.playlistsPath("sessions"), "/v1/playlists?kind=sessions", "playlists sessions");
  eq(api.playlistPath("v55ktOv1GGmUhecYo4L8"),
     "/v1/playlists/v55ktOv1GGmUhecYo4L8", "playlist id");
  eq(api.playlistItemsPath("v55ktOv1GGmUhecYo4L8"),
     "/v1/playlists/v55ktOv1GGmUhecYo4L8/items", "playlist items");
  eq(api.adminPlaylistsPath(), "/v1/admin/playlists", "admin playlists");
  eq(api.adminPlaylistPath("v55ktOv1GGmUhecYo4L8"),
     "/v1/admin/playlists/v55ktOv1GGmUhecYo4L8", "admin playlist id");
  eq(api.adminSessionsPath(), "/v1/admin/sessions", "admin sessions POST");
  eq(api.adminSessionPath("2026-09-presentation"),
     "/v1/admin/sessions/2026-09-presentation", "admin session PATCH");
  eq(api.adminMicrosPath(), "/v1/admin/micros", "admin micros POST");
  eq(api.adminMicroPath("micro-1"), "/v1/admin/micros/micro-1", "admin micro PATCH");
  eq(api.organizationsPath(), "/v1/organizations", "public orgs");
  eq(api.organizationPath("dpdigital"), "/v1/organizations/dpdigital", "public org id");
  eq(api.eventPartnersPath("2026-09-ai-exchange"),
     "/v1/events/2026-09-ai-exchange/partners", "public event partners");
  eq(api.partnerApplicationsPath(), "/v1/partner-applications", "public apply");
  eq(api.meOrganizationsPath(), "/v1/me/organizations", "member orgs");
  eq(api.meOrganizationPath("o1"), "/v1/me/organizations/o1", "member org patch");
  eq(api.adminOrganizationsPath(), "/v1/admin/organizations", "admin orgs");
  eq(api.adminOrganizationPath("dpdigital"),
     "/v1/admin/organizations/dpdigital", "admin org id");
  eq(api.adminPartnersPath(), "/v1/admin/partners", "admin partners");
  eq(api.adminEventPartnersPath("2026-09-ai-exchange"),
     "/v1/admin/events/2026-09-ai-exchange/partners", "admin event partners");
  eq(api.adminPartnerApplicationsPath(),
     "/v1/admin/partner-applications", "admin applications");
  eq(api.adminPartnerApplicationPath("a1"),
     "/v1/admin/partner-applications/a1", "admin application id");
  eq(api.adminContactsPath(), "/v1/admin/contacts", "admin contacts");
  eq(api.adminContactPath("c1"), "/v1/admin/contacts/c1", "admin contact id");
  eq(api.eventFeedbackWindowPath("2026-10-ai-exchange"),
     "/v1/events/2026-10-ai-exchange/feedback/window", "feedback window");
  eq(api.meEventCertificatePath("2026-10-ai-exchange"),
     "/v1/me/events/2026-10-ai-exchange/certificate", "me certificate");
  eq(api.meEventCertificateEmailPath("2026-10-ai-exchange"),
     "/v1/me/events/2026-10-ai-exchange/certificate/email", "me certificate email");
  ok(api.isDraftRouteLive(200) && api.isDraftRouteLive(401), "200/401 are live");
  ok(!api.isDraftRouteLive(404) && !api.isDraftRouteLive(403), "404/403 are not live");
  let threw = false;
  try { api.playlistsPath(); }
  catch (e) { threw = true; eq(e.code, "api/bad-kind", "kind required"); }
  ok(threw, "playlistsPath refuses a missing kind — bare GET /v1/playlists is 400");
});

await T("settings payload sends only Clarence's fields", () => {
  const body = api.eventSettingsPayload({
    title: "must not go",
    registrationOpensAt: "2026-10-01T08:00",
    registrationClosesAt: "",
    whoCanRegister: "members_only",
    waitlistEnabled: true,
    questionsEnabled: ["organization"],
    status: "registration_open",
    confirmationEmailText: "must not go",
  });
  eq(JSON.stringify(Object.keys(body).sort()),
     JSON.stringify(["questionsEnabled","registrationClosesAt","registrationOpensAt","status","waitlistEnabled","whoCanRegister"]),
     "keys");
  eq(body.registrationClosesAt, null, "blank close → null");
  eq(body.waitlistEnabled, true, "waitlist bool");
  ok(!("title" in body) && !("confirmationEmailText" in body), "no extra fields");
  ok(!("capacity" in body) && !("hasZoom" in body), "six-key settings only");
});

await T("content payload is the event record, not settings", () => {
  const body = api.eventContentPayload({
    title: "AI Exchange — October 2026",
    slug: "event-2026-10-ai-exchange",
    series: "AI Exchange",
    topic: "To be announced",
    description: "A practical session.",
    whatToExpect: ["Q&A"],
    date: "2026-10-13",
    startTime: "20:00",
    endTime: "21:30",
    format: "zoom",
    speakers: [{ name: "Sven Bally", title: "Founder", photoUrl: "x.jpg" }],
    program: [{ time: "20:00", item: "Welcome" }],
    gallery: [{ url: "g.jpg", alt: "Room", order: 0 }],
    coverUrl: "cover.jpg",
    bannerSquareUrl: "sq.jpg",
    bannerWideUrl: "wide.jpg",
    confirmationEmailText: "You're registered.",
    capacity: 500,
    status: "registration_open",
    hasZoom: true,
    registrationOpensAt: "2026-10-01T08:00",
    whoCanRegister: "members_only",
    waitlistEnabled: true,
    questionsEnabled: ["organization"],
  });
  eq(body.title, "AI Exchange — October 2026", "title");
  eq(body.slug, "event-2026-10-ai-exchange", "slug");
  eq(body.speakers[0].name, "Sven Bally", "speakers");
  eq(body.gallery[0].alt, "Room", "gallery");
  eq(body.confirmationEmailText, "You're registered.", "email wording");
  eq(body.capacity, 500, "capacity rides with Details content");
  ok(!("status" in body) && !("hasZoom" in body),
     "six-key settings stay out of content");
  ok(!("registrationOpensAt" in body) && !("whoCanRegister" in body),
     "registration settings stay out of content");

  const created = api.eventCreatePayload({
    id: "2026-10-ai-exchange",
    title: "AI Exchange — October 2026",
    capacity: 500,
    status: "draft",
    zoomLink: "must-not-go",
  });
  eq(created.id, "2026-10-ai-exchange", "create may send id");
  eq(created.title, "AI Exchange — October 2026", "create content");
  eq(created.capacity, 500, "create settings");
  eq(created.status, "draft", "create status");
  ok(!("zoomLink" in created), "Zoom link is not an event field");
});

await T("PATCH event request: Bearer + JSON body to api.paaipe.org", async () => {
  let captured;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  await api.patchAdminEvent("2026-10-ai-exchange", {
    whoCanRegister: "members_and_guests",
    waitlistEnabled: false,
    questionsEnabled: [],
    status: "published",
    title: "must not go",
    capacity: 500,
    hasZoom: true,
  }, { token: "tok-admin", fetchImpl });
  eq(captured.url, "https://api.paaipe.org/v1/admin/events/2026-10-ai-exchange", "url");
  eq(captured.opts.method, "PATCH", "method");
  eq(captured.opts.headers.Authorization, "Bearer tok-admin", "Authorization");
  eq(captured.opts.headers["Content-Type"], "application/json", "json");
  const body = JSON.parse(captured.opts.body);
  eq(body.whoCanRegister, "members_and_guests", "who");
  eq(body.status, "published", "status");
  ok(!("title" in body) && !("capacity" in body) && !("hasZoom" in body),
     "settings PATCH is the six keys only");
});

const LIVE_ADMIN_EVENT = {
  id: "2026-10-ai-exchange",
  slug: "event-2026-10-ai-exchange",
  title: "AI Exchange — October 2026",
  status: "registration_open",
  capacity: 500,
  date: "2026-10-13",
  startTime: "20:00",
  endTime: "21:30",
  format: "zoom",
  hasZoom: false,
  series: "AI Exchange",
  topic: "To be announced",
};

await T("admin event list / create / content / duplicate; public list has no Bearer", async () => {
  const hits = [];
  const fetchImpl = async (url, opts) => {
    hits.push({ url, opts: opts || {} });
    if (String(url).endsWith("/v1/admin/events") && (opts?.method || "GET") === "GET") {
      return new Response(JSON.stringify({ events: [LIVE_ADMIN_EVENT] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (String(url).endsWith("/v1/admin/events") && opts?.method === "POST") {
      return new Response(JSON.stringify({
        ...LIVE_ADMIN_EVENT, id: "2026-01-ai-exchange", title: "New Exchange", status: "draft",
      }), { status: 201, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/content") && opts?.method === "PATCH") {
      return new Response(JSON.stringify({ ...LIVE_ADMIN_EVENT, title: "Renamed" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (String(url).endsWith("/duplicate") && opts?.method === "POST") {
      return new Response(JSON.stringify({
        event: { ...LIVE_ADMIN_EVENT, id: "2026-10-ai-exchange-copy", status: "draft",
          title: "AI Exchange — October 2026 (copy)" },
      }), { status: 201, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/v1/events")) {
      return new Response(JSON.stringify({ events: [LIVE_ADMIN_EVENT] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return new Response("missing", { status: 404 });
  };

  const listed = await api.listAdminEvents({ token: "tok-admin", fetchImpl });
  eq(listed.length, 1, "admin list unwraps { events }");
  eq(listed[0].id, "2026-10-ai-exchange", "admin id");
  eq(hits[0].url, "https://api.paaipe.org/v1/admin/events", "admin list url");
  eq(hits[0].opts.headers.Authorization, "Bearer tok-admin", "admin list Bearer");
  eq(hits[0].opts.method || "GET", "GET", "admin list GET");

  const created = await api.postAdminEvent({
    title: "New Exchange", slug: "event-2026-01-ai-exchange", status: "draft",
    zoomLink: "must-not-go",
  }, { token: "tok-admin", fetchImpl });
  eq(created.id, "2026-01-ai-exchange", "create id");
  eq(hits[1].opts.method, "POST", "create POST");
  const createBody = JSON.parse(hits[1].opts.body);
  eq(createBody.title, "New Exchange", "create title");
  eq(createBody.status, "draft", "create status");
  ok(!("zoomLink" in createBody), "create does not send Zoom link");

  await api.patchAdminEventContent("2026-10-ai-exchange", {
    title: "Renamed",
    capacity: 999,
    status: "held",
  }, { token: "tok-admin", fetchImpl });
  eq(hits[2].url, "https://api.paaipe.org/v1/admin/events/2026-10-ai-exchange/content", "content url");
  eq(hits[2].opts.method, "PATCH", "content PATCH");
  eq(hits[2].opts.headers.Authorization, "Bearer tok-admin", "content Bearer");
  const contentBody = JSON.parse(hits[2].opts.body);
  eq(contentBody.title, "Renamed", "content title");
  eq(contentBody.capacity, 999, "capacity on content");
  ok(!("status" in contentBody), "content PATCH strips six-key settings");

  const copy = await api.postAdminEventDuplicate("2026-10-ai-exchange", {
    token: "tok-admin", fetchImpl,
  });
  eq(copy.id, "2026-10-ai-exchange-copy", "duplicate unwraps { event }");
  eq(copy.status, "draft", "duplicate draft");
  eq(hits[3].url, "https://api.paaipe.org/v1/admin/events/2026-10-ai-exchange/duplicate", "dup url");
  eq(hits[3].opts.method, "POST", "dup POST");
  eq(hits[3].opts.body, undefined, "duplicate sends no invented body");

  const pub = await api.listApiEvents({ fetchImpl });
  eq(pub.length, 1, "public list");
  eq(pub[0].id, "2026-10-ai-exchange", "public id");
  ok(!("Authorization" in (hits[4].opts.headers || {})), "public GET /v1/events has no Bearer");

  const ics = await api.getAdminEventCalendarIcs("2026-10-ai-exchange", {
    token: "tok-admin",
    fetchImpl: async (url, opts) => {
      hits.push({ url, opts: opts || {} });
      return new Response("BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR\n", {
        status: 200, headers: { "content-type": "text/calendar" },
      });
    },
  });
  eq(hits[5].url, "https://api.paaipe.org/v1/admin/events/2026-10-ai-exchange/calendar.ics", "ics url");
  eq(hits[5].opts.headers.Authorization, "Bearer tok-admin", "ics Bearer");
  ok(/BEGIN:VCALENDAR/.test(ics), "ics is text, not JSON");

  const one = await api.getApiEventBySlug("event-2026-10-ai-exchange", {
    fetchImpl: async (url, opts) => {
      hits.push({ url, opts: opts || {} });
      return new Response(JSON.stringify(LIVE_ADMIN_EVENT), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
  });
  eq(one.id, "2026-10-ai-exchange", "public slug");
  eq(hits[6].url, "https://api.paaipe.org/v1/events/event-2026-10-ai-exchange", "slug url");
  ok(!("Authorization" in (hits[6].opts.headers || {})), "slug GET has no Bearer");
});

await T("GET registrations + PATCH status; unknown status is refused", async () => {
  let captured = [];
  const fetchImpl = async (url, opts) => {
    captured.push({ url, opts });
    if (String(url).endsWith("/registrations")) {
      return new Response(JSON.stringify([
        { id: "r1", full_name: "Ada", email: "a@x.com", status: "registered" },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  const rows = await api.listAdminEventRegistrations("e-oct", {
    token: "tok", fetchImpl,
  });
  eq(rows.length, 1, "one row");
  eq(rows[0].id, "r1", "id kept");
  eq(rows[0].eventId, "e-oct", "eventId from path hint");
  eq(captured[0].opts.headers.Authorization, "Bearer tok", "list bearer");

  await api.patchAdminRegistration("r1", "attended", {
    token: "tok", fetchImpl,
  });
  const patch = captured[1];
  eq(patch.url, "https://api.paaipe.org/v1/admin/registrations/r1", "patch url");
  eq(patch.opts.method, "PATCH", "patch method");
  eq(patch.opts.body, JSON.stringify({ status: "attended" }), "status only");

  let threw = false;
  try { await api.patchAdminRegistration("r1", "maybe", { token: "tok", fetchImpl }); }
  catch (e) { threw = true; eq(e.code, "api/bad-status", "code"); }
  ok(threw, "unknown status refused");
});

await T("public library GETs unwrap live shapes and send no Bearer", async () => {
  const hits = [];
  const fetchImpl = async (url, opts) => {
    hits.push({ url, headers: opts.headers || {} });
    if (url.endsWith("/v1/sessions")) {
      return new Response(JSON.stringify(LIVE_SESSIONS), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/sessions/2026-09-presentation")) {
      return new Response(JSON.stringify(LIVE_SESSIONS.sessions[0]), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/micros")) {
      return new Response(JSON.stringify(LIVE_MICROS), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/playlists?kind=micros")) {
      return new Response(JSON.stringify({ playlists: [LIVE_PLAYLIST] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/playlists?kind=sessions")) {
      return new Response(JSON.stringify({ playlists: [] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/playlists/v55ktOv1GGmUhecYo4L8")) {
      return new Response(JSON.stringify(LIVE_PLAYLIST), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/playlists/v55ktOv1GGmUhecYo4L8/items")) {
      return new Response(JSON.stringify({ items: LIVE_MICROS.micros }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return new Response("missing", { status: 404 });
  };

  const sessions = await api.listApiSessions({ fetchImpl });
  eq(sessions.length, 2, "two sessions");
  eq(sessions[0].id, "2026-09-presentation", "session id");
  eq(sessions[0].youtubeId, "ePw_wlPqYUk", "youtubeId");
  eq(sessions[0].posterUrl, "https://paaipe.org/assets/img/ai-exchange-session.jpg", "posterUrl");
  ok(!("Authorization" in hits[0].headers), "sessions list has no Bearer");

  const one = await api.getApiSession("2026-09-presentation", { fetchImpl });
  eq(one.title, "Part 1 — Presentation", "session get");
  eq(one.aspect, "16:9", "aspect");

  const micros = await api.listApiMicros({ fetchImpl });
  eq(micros.length, 1, "one micro");
  eq(micros[0].aspect, "9:16", "micro aspect");
  eq(micros[0].source, "upload", "upload source");

  const microsPl = await api.listApiPlaylists("micros", { fetchImpl });
  eq(microsPl.length, 1, "one micros playlist");
  eq(microsPl[0].id, "v55ktOv1GGmUhecYo4L8", "seed id");
  eq(microsPl[0].itemIds.join(","), "micro-1,micro-2,micro-3,micro-4", "itemIds");

  const sessionsPl = await api.listApiPlaylists("sessions", { fetchImpl });
  eq(sessionsPl.length, 0, "kind=sessions is honestly empty");

  const both = await api.listApiPlaylists(null, { fetchImpl });
  eq(both.length, 1, "combined list keeps the micros seed only");
  ok(hits.some(h => h.url.endsWith("/v1/playlists?kind=micros")), "combined uses kind=micros");
  ok(hits.some(h => h.url.endsWith("/v1/playlists?kind=sessions")), "combined uses kind=sessions");
  ok(!hits.some(h => /\/v1\/playlists$/.test(h.url)), "never calls bare GET /v1/playlists");

  const pl = await api.getApiPlaylist("v55ktOv1GGmUhecYo4L8", { fetchImpl });
  eq(pl.title, "From Signals to Strategy", "playlist get");
  const items = await api.listApiPlaylistItems("v55ktOv1GGmUhecYo4L8", { fetchImpl });
  eq(items.length, 1, "hydrated items");
  eq(items[0].id, "micro-1", "item id");

  ok(hits.every(h => !h.headers.Authorization), "no public GET sends Bearer");
  ok(hits.every(h => h.url.startsWith("https://api.paaipe.org/v1/")), "prod host");
});

await T("kind=sessions failure does not drop a successful kind=micros list", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("kind=sessions")) {
      return new Response("boom", { status: 500 });
    }
    if (String(url).includes("kind=micros")) {
      return new Response(JSON.stringify({ playlists: [LIVE_PLAYLIST] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return new Response("nope", { status: 404 });
  };
  const rows = await api.listApiPlaylists(null, { fetchImpl });
  eq(rows.length, 1, "micros playlist kept");
  eq(rows[0].id, "v55ktOv1GGmUhecYo4L8", "seed id");
});

await T("401 / 404 / missing token fail honestly and do not invent rows", async () => {
  const fetch401 = async () => new Response("nope", { status: 401 });
  let e401;
  try {
    await api.listAdminEventRegistrations("e-oct", { token: "x", fetchImpl: fetch401 });
  } catch (e) { e401 = e; }
  ok(e401 && e401.status === 401, "401 thrown");
  ok(/sign-in expired or missing/i.test(e401.message), `401 message: ${e401.message}`);

  const fetch404 = async () => new Response("missing", { status: 404 });
  let e404;
  try {
    await api.listAdminEventRegistrations("e-oct", { token: "x", fetchImpl: fetch404 });
  } catch (e) { e404 = e; }
  ok(e404 && e404.code === "api/not-found", "404 code");
  ok(/404/.test(e404.message), "404 said");

  let ePub;
  try {
    await api.listApiSessions({ fetchImpl: fetch404 });
  } catch (e) { ePub = e; }
  ok(ePub && ePub.code === "api/not-found", "public 404 code");

  let eTok;
  try { await api.paaipeApiRequest("/v1/admin/events/x", { method: "PATCH", body: {} }); }
  catch (e) { eTok = e; }
  eq(eTok?.code, "not-signed-in", "no token");

  let eList;
  try { await api.listAdminEvents({ token: "x", fetchImpl: fetch401 }); }
  catch (e) { eList = e; }
  ok(eList && eList.status === 401, "admin events list 401");
  ok(/sign-in expired or missing/i.test(eList.message), "admin list 401 message");

  let eDup;
  try { await api.postAdminEventDuplicate("2026-10-ai-exchange", { token: "x", fetchImpl: fetch401 }); }
  catch (e) { eDup = e; }
  ok(eDup && eDup.status === 401, "duplicate 401");
  ok(/nothing was changed/i.test(eDup.message), "duplicate 401 is a write");

  let eIcs;
  try { await api.getAdminEventCalendarIcs("2026-10-ai-exchange", { token: "x", fetchImpl: fetch401 }); }
  catch (e) { eIcs = e; }
  ok(eIcs && eIcs.status === 401, "calendar 401");
  ok(/sign-in expired or missing/i.test(eIcs.message), "calendar 401 message");
});

await T("feedback helpers: public GET, admin PUT, member POST, no invented routes", async () => {
  const Q = {
    questions: [{
      eventId: "2026-10-ai-exchange",
      questionKey: "overall",
      prompt: "Overall, how was this session?",
      type: "1-5",
      required: true,
      active: true,
      order: 0,
    }],
  };
  const hits = [];
  const fetchImpl = async (url, opts) => {
    hits.push({ url, method: opts.method, headers: opts.headers || {}, body: opts.body });
    if (url.endsWith("/v1/events/2026-10-ai-exchange/feedback/questions") && opts.method === "GET") {
      return new Response(JSON.stringify(Q), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/v1/admin/events/2026-10-ai-exchange/feedback/questions") && opts.method === "PUT") {
      return new Response(JSON.stringify(Q), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/v1/events/2026-10-ai-exchange/feedback/responses") && opts.method === "POST") {
      return new Response(JSON.stringify({
        eventId: "2026-10-ai-exchange", registrationId: "r1", answers: { "2026-10-ai-exchange_overall": 5 },
      }), { status: 201, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/v1/events/2026-10-ai-exchange/feedback/responses/r1")) {
      return new Response(JSON.stringify({
        eventId: "2026-10-ai-exchange", registrationId: "r1",
        answers: { "2026-10-ai-exchange_overall": 5 },
        submittedAt: "2026-10-13T12:00:00.000Z",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/v1/admin/events/2026-10-ai-exchange/feedback/responses")) {
      return new Response(JSON.stringify({
        responses: [{
          eventId: "2026-10-ai-exchange", registrationId: "r1",
          answers: { "2026-10-ai-exchange_overall": 5 },
          submittedAt: "2026-10-13T12:00:00.000Z",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("missing", { status: 404 });
  };

  const qs = await api.listApiFeedbackQuestions("2026-10-ai-exchange", { fetchImpl });
  eq(qs.length, 1, "one question");
  eq(qs[0].id, "2026-10-ai-exchange_overall", "synthesized id");
  eq(qs[0].questionKey, "overall", "key");
  ok(!("Authorization" in hits[0].headers), "public questions GET has no Bearer");

  const empty = await api.listApiFeedbackQuestions("2026-10-ai-exchange", {
    fetchImpl: async (url, opts) => {
      hits.push({ url, method: opts.method, headers: opts.headers || {} });
      return new Response(JSON.stringify({ questions: [] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
  });
  eq(empty.length, 0, "empty questions is honest empty");

  await api.putAdminFeedbackQuestions("2026-10-ai-exchange", Q.questions, {
    token: "tok-admin", fetchImpl,
  });
  const put = hits.find(h => h.method === "PUT");
  eq(put.url, "https://api.paaipe.org/v1/admin/events/2026-10-ai-exchange/feedback/questions", "PUT admin path");
  eq(put.headers.Authorization, "Bearer tok-admin", "PUT Bearer");
  const putBody = JSON.parse(put.body);
  eq(JSON.stringify(Object.keys(putBody.questions[0]).sort()),
     JSON.stringify(["active","eventId","order","prompt","questionKey","required","type"]),
     "PUT sends Clarence fields only");
  ok(!("displayOrder" in putBody.questions[0]), "never displayOrder");
  ok(!("id" in putBody.questions[0]), "id is derived, not sent");

  await api.postEventFeedbackResponse("2026-10-ai-exchange", {
    registrationId: "r1",
    answers: { "2026-10-ai-exchange_overall": 5 },
    submittedAt: "must-not-go",
  }, { token: "tok-member", fetchImpl });
  const post = hits.find(h => h.method === "POST");
  eq(post.url, "https://api.paaipe.org/v1/events/2026-10-ai-exchange/feedback/responses", "POST member path");
  eq(post.headers.Authorization, "Bearer tok-member", "POST Bearer");
  eq(post.body, JSON.stringify({
    registrationId: "r1", answers: { "2026-10-ai-exchange_overall": 5 },
  }), "POST body is registrationId + answers");

  const mine = await api.getApiFeedbackResponse("2026-10-ai-exchange", "r1", {
    token: "tok-member", fetchImpl,
  });
  eq(mine.registrationId, "r1", "own response");
  eq(mine.answers["2026-10-ai-exchange_overall"], 5, "answer keyed by question id");

  const none = await api.getApiFeedbackResponse("2026-10-ai-exchange", "missing", {
    token: "tok-member",
    fetchImpl: async () => new Response("nope", { status: 404 }),
  });
  eq(none, null, "member 404 is no row, not a failure");

  const listed = await api.listAdminFeedbackResponses("2026-10-ai-exchange", {
    token: "tok-admin", fetchImpl,
  });
  eq(listed.length, 1, "admin list");
  eq(listed[0].id, "2026-10-ai-exchange_r1", "response id");
  ok(hits.some(h => h.url.endsWith("/v1/admin/events/2026-10-ai-exchange/feedback/responses")
    && (h.method === "GET" || !h.method || h.method === "GET")), "admin list path");

  ok(!hits.some(h => /\/v1\/admin\/events\/[^/]+\/feedback\/questions$/.test(h.url) && h.method === "GET"),
     "never GET admin questions (404 on live)");
  ok(!hits.some(h => /\/v1\/events\/[^/]+\/feedback\/responses$/.test(h.url) && (h.method === "GET" || !h.method)),
     "never GET public responses list (404 on live)");
  ok(!hits.some(h => h.method === "DELETE"), "never DELETE");

  const body = api.feedbackQuestionWritePayload({
    questionKey: "overall", prompt: "Overall?", type: "1-5", required: true,
    displayOrder: 9, id: "must-not-go", extra: true,
  }, "2026-10-ai-exchange", 0);
  ok(!("displayOrder" in body) && !("id" in body) && !("extra" in body), "write payload strips extras");
  eq(body.order, 0, "order not displayOrder");

  let e409;
  try {
    await api.postEventFeedbackResponse("2026-10-ai-exchange", { registrationId: "r1", answers: {} }, {
      token: "tok",
      fetchImpl: async () => new Response("exists", { status: 409 }),
    });
  } catch (e) { e409 = e; }
  eq(e409?.code, "already-exists", "409 create-once");
  ok(/already exists/i.test(e409.message), "409 message");
  ok(/nothing was changed/i.test(e409.message), "409 is a write");

  let e401;
  try {
    await api.putAdminFeedbackQuestions("2026-10-ai-exchange", Q.questions, {
      token: "x",
      fetchImpl: async () => new Response("nope", { status: 401 }),
    });
  } catch (e) { e401 = e; }
  eq(e401?.status, 401, "PUT 401");
  ok(/sign-in expired or missing/i.test(e401.message), "PUT 401 message");
});

await T("feedback JS hard-cuts questions/responses off Firestore", () => {
  const feed = read("assets/js/paaipe-feedback.js");
  const ev = read("assets/js/paaipe-admin-events.js");
  const reports = read("assets/js/paaipe-event-reports.js");
  ok(/listApiFeedbackQuestions/.test(feed), "questions GET → API");
  ok(/putAdminFeedbackQuestions/.test(feed), "questions PUT → admin API");
  ok(/listAdminFeedbackResponses/.test(feed), "admin responses GET → API");
  ok(/getApiFeedbackResponse/.test(feed), "member one response → API");
  ok(/postEventFeedbackResponse/.test(feed), "member POST → API");
  ok(!/firebase-firestore/.test(feed), "feedback.js has no Firestore");
  ok(!/paaipe_event_feedback_questions/.test(feed), "no questions collection name");
  ok(!/paaipe_event_feedback_responses/.test(feed), "no responses collection name");
  ok(!/displayOrder/.test(feed), "order, never displayOrder");
  const load = ev.slice(ev.indexOf("async function loadFeedbackTab"),
                        ev.indexOf("function whoSeesCard"));
  ok(/listFeedbackQuestions/.test(load) && /listFeedbackResponses/.test(load),
     "Feedback tab still goes through the feedback helper");
  const save = ev.slice(ev.indexOf("async function saveFeedbackForm"),
                        ev.indexOf("async function loadReportsTab"));
  ok(/writeFeedbackQuestions/.test(save), "Save form PUTs through writeFeedbackQuestions");
  ok(/listFeedbackQuestions/.test(reports) && /listFeedbackResponses/.test(reports),
     "Reports stay FE-computed from the feedback helper");
  ok(!/\/v1\/admin\/events\/.*\/feedback\/reports/.test(feed + reports + ev),
     "no invented reports table");
});

await T("admin JS hard-cuts Settings + Registrations off Firestore", () => {
  const ev = read("assets/js/paaipe-admin-events.js");
  const regs = read("assets/js/paaipe-admin-registrations.js");
  const save = ev.slice(ev.indexOf("async function saveEvent"), ev.indexOf("async function setStatus"));
  eq(JSON.stringify([...api.EVENT_SETTINGS_FIELDS].sort()),
     JSON.stringify(["questionsEnabled","registrationClosesAt","registrationOpensAt","status","waitlistEnabled","whoCanRegister"]),
     "settings stay the original six keys");
  ok(/patchAdminEvent/.test(save), "save PATCHes settings");
  ok(/patchAdminEventContent/.test(save), "save PATCHes content");
  ok(!/patchAdminEvent\(id,\s*\{\s*hasZoom/.test(save),
     "save must not invent a hasZoom settings PATCH");
  ok(/eventContentPayload/.test(save) && /eventSettingsPayload/.test(save),
     "save splits content vs settings");
  ok(!/COL\.events/.test(save) && !/withoutSettings/.test(save),
     "content save must not write Firestore paaipe_events");
  ok(/paaipe_event_private/.test(save), "Zoom link stays on Firestore private");
  const statusFn = ev.slice(ev.indexOf("async function setStatus"), ev.indexOf("const ACTION_LABEL"));
  ok(/patchAdminEvent/.test(statusFn), "status is settings PATCH");
  ok(!/COL\.events/.test(statusFn) && !/setDoc/.test(statusFn),
     "status must not write Firestore events");
  const dup = ev.slice(ev.indexOf("async function duplicateEvent"), ev.indexOf("function showList"));
  ok(/postAdminEventDuplicate/.test(dup), "duplicate uses POST …/duplicate");
  ok(!/COL\.events/.test(dup) && !/setDoc/.test(dup),
     "duplicate must not write Firestore events");
  ok(/listAdminEvents/.test(ev), "workspace list uses GET /v1/admin/events");
  ok(!/listEvents\(\s*\{\s*asAdmin/.test(ev),
     "workspace must not list Firestore events");
  ok(!/COL\.events/.test(ev), "admin events JS must not touch COL.events");
  ok(/getAdminEventCalendarIcs/.test(ev), "calendar download uses GET …/calendar.ics");
  ok(!/function icsFor/.test(ev), "client-built ICS must not remain");
  const email = read("assets/js/paaipe-event-email.js");
  ok(/localStorage/.test(email), "email drafts stay in this browser");
  ok(!/adminEventEmailsPath|\/v1\/admin\/events\/.*\/emails/.test(email),
     "email tab must not invent an emails* cutover — it never wrote Firestore");
  ok(!/adminEventEmailsPath/.test(ev),
     "admin-events does not call emails* (send is still 501)");
  const data = read("assets/js/paaipe-events-data.js");
  const pubList = data.slice(data.indexOf("export async function listEvents"),
                             data.indexOf("export async function getEventBySlug"));
  ok(/firebase-firestore/.test(pubList) || /COL\.events/.test(pubList),
     "public/shared listEvents stays on Firestore for queue item (3)");
  const load = ev.slice(ev.indexOf("async function loadRegistrationsTab"),
                        ev.indexOf("async function loadEmailTab"));
  ok(/listAdminEventRegistrations/.test(load), "regs tab uses API");
  ok(!/listAllRegistrations/.test(load), "regs tab must not read Firestore");
  const link = ev.slice(ev.indexOf("async function linkRegistration"),
                        ev.indexOf("function exportEventRegistrations"));
  ok(!/firebase-firestore/.test(link) && !/COL\.registrations/.test(link),
     "link must not write Firestore");
  ok(/listAdminEventRegistrations/.test(regs), "list page uses API");
  ok(/getAdminRegistration/.test(regs) && /patchAdminRegistration/.test(regs),
     "detail + status use API");
  ok(!/listRegistrations\(/.test(regs) && !/setRegistrationStatus/.test(regs),
     "list page must not call the Firestore helpers");
});

await T("admin Learnings POST/PATCH send Bearer and camelCase only", async () => {
  const hits = [];
  const fetchImpl = async (url, opts) => {
    hits.push({ url, opts });
    return new Response(JSON.stringify({ id: "new-1", title: "T" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  const created = await api.postAdminSession({
    title: "Part 1",
    source: "youtube",
    youtubeUrl: "https://www.youtube.com/watch?v=ePw_wlPqYUk",
    youtubeId: "ePw_wlPqYUk",
    published: true,
    displayOrder: 1,
    updatedBy: "paul@moveup.app",
    createdAt: "must-not-go",
  }, { token: "tok-admin", fetchImpl });
  eq(created, "new-1", "create id");
  eq(hits[0].url, "https://api.paaipe.org/v1/admin/sessions", "POST sessions");
  eq(hits[0].opts.method, "POST", "method");
  eq(hits[0].opts.headers.Authorization, "Bearer tok-admin", "Bearer");
  const body = JSON.parse(hits[0].opts.body);
  eq(body.youtubeId, "ePw_wlPqYUk", "youtubeId");
  eq(body.aspect, "16:9", "session aspect");
  ok(!("createdAt" in body), "no invented createdAt");

  await api.patchAdminMicro("micro-1", {
    title: "Signals vs noise",
    published: true,
    displayOrder: 2,
  }, { token: "tok-admin", fetchImpl });
  eq(hits[1].url, "https://api.paaipe.org/v1/admin/micros/micro-1", "PATCH micro");
  eq(hits[1].opts.method, "PATCH", "patch method");
  eq(JSON.parse(hits[1].opts.body).aspect, "9:16", "micro aspect");

  await api.postAdminPlaylist({
    title: "From Signals to Strategy",
    kind: "micros",
    itemIds: ["micro-1"],
    status: "published",
    displayOrder: 1,
  }, { token: "tok", fetchImpl });
  eq(hits[2].url, "https://api.paaipe.org/v1/admin/playlists", "POST playlist");
  eq(JSON.parse(hits[2].opts.body).itemIds[0], "micro-1", "itemIds");

  const listed = await api.listAdminPlaylists({
    token: "tok",
    fetchImpl: async (url, opts) => {
      hits.push({ url, opts });
      return new Response(JSON.stringify({ playlists: [LIVE_PLAYLIST] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
  });
  eq(listed[0].id, "v55ktOv1GGmUhecYo4L8", "admin list");
  eq(hits[3].url, "https://api.paaipe.org/v1/admin/playlists", "GET admin playlists");
  eq(hits[3].opts.headers.Authorization, "Bearer tok", "admin list Bearer");
});

const LIVE_ORGS = {
  organizations: [
    {
      id: "dpdigital",
      name: "DP Digital Solutions",
      logoUrl: "assets/img/partners/logo-dpdigital.png",
      website: "https://www.facebook.com/DPDigitalSolutions/",
      type: "sponsor",
      status: "active",
    },
    {
      id: "gethired",
      name: "GetHired Online",
      logoUrl: "assets/img/partners/logo-gethired.png",
      website: "https://www.facebook.com/gethiredonline.com.ph/",
      type: "sponsor",
      status: "active",
    },
  ],
};

const LIVE_EVENT_PARTNERS = {
  partners: [
    {
      id: "2026-09-gethired",
      eventId: "2026-09-ai-exchange",
      organizationId: "gethired",
      tier: "community",
      status: "confirmed",
      displayOrder: 1,
      note: null,
    },
  ],
};

const LIVE_APPLICATIONS = {
  applications: [
    {
      id: "a1",
      eventId: "2026-10-ai-exchange",
      companyName: "Northwind Analytics",
      contactName: "Rosa",
      email: "rosa@example.com",
      status: "new",
      createdAt: "2026-09-18T14:55:37.858Z",
    },
  ],
};

const LIVE_CONTACTS = {
  contacts: [
    {
      id: "c1",
      email: "rosa@example.com",
      name: "Rosa Villanueva",
      companyName: "Northwind",
      createdAt: "2026-09-18T14:55:37.858Z",
    },
  ],
};

await T("orgs / partners / contacts helpers use the live contract", async () => {
  const hits = [];
  const fetchImpl = async (url, opts = {}) => {
    hits.push({ url, method: opts.method || "GET", headers: opts.headers || {}, body: opts.body });
    if (url.endsWith("/v1/organizations")) {
      return new Response(JSON.stringify(LIVE_ORGS), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/organizations/dpdigital")) {
      return new Response(JSON.stringify(LIVE_ORGS.organizations[0]), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/events/2026-09-ai-exchange/partners")) {
      return new Response(JSON.stringify(LIVE_EVENT_PARTNERS), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/partner-applications")) {
      return new Response(JSON.stringify({ id: "new-app", reference: "PA-2026-NEW1" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/me/organizations")) {
      return new Response(JSON.stringify({ organizations: [LIVE_ORGS.organizations[0]] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/admin/organizations")) {
      return new Response(JSON.stringify({ organizations: LIVE_ORGS.organizations }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/admin/partners")) {
      const payload = (opts.method || "GET") === "PUT"
        ? LIVE_EVENT_PARTNERS.partners[0]
        : LIVE_EVENT_PARTNERS;
      return new Response(JSON.stringify(payload), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/admin/events/2026-09-ai-exchange/partners")) {
      return new Response(JSON.stringify(LIVE_EVENT_PARTNERS), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/admin/partner-applications")) {
      return new Response(JSON.stringify(LIVE_APPLICATIONS), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/admin/partner-applications/a1")) {
      return new Response(JSON.stringify(LIVE_APPLICATIONS.applications[0]), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/admin/contacts")) {
      return new Response(JSON.stringify(LIVE_CONTACTS), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/admin/contacts/c1")) {
      return new Response(JSON.stringify(LIVE_CONTACTS.contacts[0]), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/v1/admin/organizations/dpdigital")
        || url.endsWith("/v1/admin/partner-applications/a1")) {
      return new Response("{}", {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return new Response("missing", { status: 404 });
  };

  const orgs = await api.listApiOrganizations({ fetchImpl });
  eq(orgs.length, 2, "two orgs");
  eq(orgs[0].id, "dpdigital", "sorted by name");
  ok(!("Authorization" in hits[0].headers), "public orgs have no Bearer");

  const one = await api.getApiOrganization("dpdigital", { fetchImpl });
  eq(one.name, "DP Digital Solutions", "org get");

  const partners = await api.listApiEventPartners("2026-09-ai-exchange", { fetchImpl });
  eq(partners[0].organizationId, "gethired", "event partner");
  eq(partners[0].tier, "community", "tier");

  let badApp = false;
  try { api.partnerApplicationWritePayload({ companyName: "Acme" }); }
  catch (e) { badApp = true; eq(e.code, "api/bad-application", "required fields"); }
  ok(badApp, "POST payload refuses a missing eventId");

  const posted = await api.postPartnerApplication({
    eventId: "2026-10-ai-exchange",
    companyName: "Northwind",
    contactName: "Rosa",
  }, { fetchImpl });
  eq(posted.id, "new-app", "apply id");
  eq(posted.reference, "PA-2026-NEW1", "apply reference");
  const applyHit = hits.find(h => h.url.endsWith("/v1/partner-applications"));
  eq(applyHit.method, "POST", "apply POST");
  ok(!("Authorization" in applyHit.headers), "public apply has no Bearer");

  const mine = await api.listMeOrganizations({ token: "tok-me", fetchImpl });
  eq(mine[0].id, "dpdigital", "me orgs");
  const meHit = hits.find(h => h.url.endsWith("/v1/me/organizations") && h.method === "GET");
  eq(meHit.headers.Authorization, "Bearer tok-me", "me Bearer");

  await api.postMeOrganization({ name: "Mine", website: "mine.example" }, {
    token: "tok-me",
    fetchImpl: async (url, opts) => {
      hits.push({ url, method: opts.method, headers: opts.headers, body: opts.body });
      return new Response(JSON.stringify({ id: "mine-1" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
  });
  const mePost = hits.find(h => h.url.endsWith("/v1/me/organizations") && h.method === "POST");
  eq(JSON.parse(mePost.body).name, "Mine", "member create name");

  const adminOrgs = await api.listAdminOrganizations({ token: "tok-admin", fetchImpl });
  eq(adminOrgs.length, 2, "admin orgs");
  const adminOrgHit = hits.find(h => h.url.endsWith("/v1/admin/organizations") && h.method === "GET");
  eq(adminOrgHit.headers.Authorization, "Bearer tok-admin", "admin org Bearer");

  await api.patchAdminOrganization("dpdigital", { name: "DP", status: "active" }, {
    token: "tok-admin", fetchImpl,
  });
  const orgPatch = hits.find(h => h.url.endsWith("/v1/admin/organizations/dpdigital"));
  eq(orgPatch.method, "PATCH", "org PATCH");
  eq(JSON.parse(orgPatch.body).name, "DP", "org name sent");

  const apps = await api.listAdminPartnerApplications({ token: "tok-admin", fetchImpl });
  eq(apps[0].companyName, "Northwind Analytics", "application list");
  await api.patchAdminPartnerApplication("a1", { status: "accepted", organizationId: "o1" }, {
    token: "tok-admin", fetchImpl,
  });
  const appPatch = hits.find(h => h.url.endsWith("/v1/admin/partner-applications/a1"));
  eq(appPatch.method, "PATCH", "accept PATCH");
  eq(JSON.parse(appPatch.body).status, "accepted", "accept status");

  const contacts = await api.listAdminContacts({ token: "tok-admin", fetchImpl });
  eq(contacts[0].email, "rosa@example.com", "contact email");
  eq(contacts[0].displayName, "Rosa Villanueva", "contact name");
  const oneContact = await api.getAdminContact("c1", { token: "tok-admin", fetchImpl });
  eq(oneContact.id, "c1", "contact get");

  const listed = await api.listAdminPartners({ token: "tok-admin", fetchImpl });
  eq(listed[0].organizationId, "gethired", "admin partners list");
  const adminPartnersGet = hits.find(h => h.url.endsWith("/v1/admin/partners") && h.method === "GET");
  eq(adminPartnersGet.headers.Authorization, "Bearer tok-admin", "admin partners Bearer");

  const put = await api.putAdminPartners({
    id: "2026-09-gethired",
    eventId: "2026-09-ai-exchange",
    organizationId: "gethired",
    tier: "community",
    status: "confirmed",
    displayOrder: 1,
    contributionType: "cash",
    deliverablesDone: [0],
    order: 7,
  }, { token: "tok-admin", fetchImpl });
  eq(put.organizationId, "gethired", "PUT partner returned");
  const putHit = hits.find(h => h.url.endsWith("/v1/admin/partners") && h.method === "PUT");
  eq(putHit.method, "PUT", "partners write is PUT");
  eq(putHit.headers.Authorization, "Bearer tok-admin", "PUT Bearer");
  const putBody = JSON.parse(putHit.body);
  eq(putBody.id, "2026-09-gethired", "PUT id");
  eq(putBody.eventId, "2026-09-ai-exchange", "PUT eventId");
  eq(putBody.organizationId, "gethired", "PUT organizationId");
  eq(putBody.tier, "community", "PUT tier");
  eq(putBody.status, "confirmed", "PUT status");
  eq(putBody.displayOrder, 1, "PUT displayOrder");
  ok(!("contributionType" in putBody), "PUT must not invent contributionType");
  ok(!("deliverablesDone" in putBody), "PUT must not invent deliverablesDone");
  ok(!("order" in putBody), "PUT maps order → displayOrder only");

  const scoped = await api.listAdminEventPartners("2026-09-ai-exchange", {
    token: "tok-admin", fetchImpl,
  });
  eq(scoped[0].id, "2026-09-gethired", "admin event partners GET");

  const mapped = api.eventPartnerWritePayload({
    eventId: "e1", organizationId: "o1", tier: "presenting", status: "proposed", order: 20,
  });
  eq(mapped.displayOrder, 20, "order maps to displayOrder");
  eq(Object.keys(mapped).sort().join(","),
     "displayOrder,eventId,organizationId,status,tier", "GET-shape keys only");

  const src = read("assets/js/paaipe-api.js");
  ok(!/\/v1\/admin\/partner-applications\/.+\/accept/.test(src), "no invented accept sub-route");
  ok(!/adminPartnersPath\(\),\s*\{\s*method:\s*"POST"/.test(src),
     "no invented POST /v1/admin/partners");
  ok(!/adminPartnersPath\(\),\s*\{\s*method:\s*"PATCH"/.test(src),
     "no invented PATCH /v1/admin/partners");
  ok(!/\/v1\/admin\/partners\/\$\{/.test(src), "no invented per-id partners path");
});

await T("portal + admin data modules hard-cut off Firestore", () => {
  const learn = read("assets/js/paaipe-learnings-data.js");
  const pl = read("assets/js/paaipe-playlists-data.js");
  const view = read("assets/js/paaipe-session-view.js");
  const admin = read("assets/js/paaipe-admin-learnings.js");
  const pubLearn = learn.slice(
    learn.indexOf("export async function listPublishedSessions"),
    learn.indexOf("export function buildLearningPayload")
  );
  ok(/listApiSessions/.test(pubLearn), "listPublishedSessions → API");
  ok(/listApiMicros/.test(pubLearn), "listPublishedMicros → API");
  ok(/getApiSession|getApiMicro/.test(pubLearn), "getLearning → API");
  ok(!/getDocs|getDoc/.test(pubLearn), "published get/list must not call Firestore");
  ok(!/firebase-firestore/.test(learn), "learnings-data has no Firestore");
  ok(/postAdminSession|patchAdminSession/.test(learn), "session writes use admin API");
  ok(/postAdminMicro|patchAdminMicro/.test(learn), "micro writes use admin API");
  ok(!/firebase-firestore/.test(pl), "playlists-data has no Firestore");
  ok(/listAdminPlaylists/.test(pl) && /postAdminPlaylist/.test(pl), "playlist admin API");
  ok(/listPublishedPlaylists/.test(view), "hub fetches playlists");
  ok(/function loadOne/.test(view), "hub isolates fetches");
  ok(/listLearnings|saveLearning|savePlaylist/.test(admin), "admin chrome still uses data modules");
  ok(!/firebase-firestore/.test(admin), "admin learnings JS has no Firestore");
});

await T("orgs / partners / contacts modules hard-cut off Firestore", () => {
  const evData = read("assets/js/paaipe-events-data.js");
  const orgs = read("assets/js/paaipe-admin-orgs.js");
  const partners = read("assets/js/paaipe-admin-partners.js");
  const contacts = read("assets/js/paaipe-admin-contacts.js");
  const events = read("assets/js/paaipe-admin-events.js");
  const saveOrg = evData.slice(
    evData.indexOf("export async function saveMyOrganization"),
    evData.indexOf("export async function listEventSponsors")
  );
  const listOrgs = evData.slice(
    evData.indexOf("export async function listOrganizations"),
    evData.indexOf("export async function listMyOrganizations")
  );
  const submit = evData.slice(
    evData.indexOf("export async function submitPartnerApplication"),
    evData.indexOf("export async function listPartnerApplicationsFor")
  );
  const listApps = evData.slice(
    evData.indexOf("export async function listPartnerApplicationsFor"),
    evData.indexOf("export async function listAllRegistrations")
  );
  ok(/listApiOrganizations|listAdminOrganizations/.test(listOrgs), "listOrganizations → API");
  ok(!/getDocs|collection\(/.test(listOrgs), "org list must not query Firestore");
  ok(/patchMeOrganization|postMeOrganization/.test(saveOrg), "member save → API");
  ok(/postPartnerApplication/.test(submit), "apply POSTs the API");
  ok(!/setDoc|COL\.partners/.test(submit), "apply must not write Firestore");
  ok(/listAdminPartnerApplications/.test(listApps), "admin apps → API");
  const listSponsors = evData.slice(
    evData.indexOf("export async function listEventSponsors"),
    evData.indexOf("export async function getRecording")
  );
  ok(/listApiEventPartners/.test(listSponsors), "public event partners → API");
  ok(/listAdminEventPartners/.test(listSponsors), "admin event partners → API");
  ok(!/getDocs|COL\.sponsors/.test(listSponsors), "sponsors list must not query Firestore");
  ok(/patchAdminOrganization/.test(orgs), "orgs page PATCHes the API");
  ok(/putAdminPartners/.test(orgs), "orgs page PUTs /v1/admin/partners");
  ok(!/COL\.organizations/.test(orgs), "orgs page must not write the orgs collection");
  ok(!/COL\.sponsors/.test(orgs), "orgs page must not write the sponsors collection");
  ok(!/putAdminEventPartners/.test(orgs), "orgs writes must not use the 404 event-scoped PUT");
  ok(/listAdminPartnerApplications/.test(partners), "partners inbox lists via API");
  ok(/patchAdminPartnerApplication/.test(partners), "partners inbox PATCHes via API");
  ok(!/COL\.partners/.test(partners), "partners inbox must not write the applications collection");
  ok(/listAdminContacts/.test(contacts), "contacts lists via API");
  ok(!/firebase-firestore/.test(contacts), "contacts JS has no Firestore");
  ok(!/listMembers|listRegistrations|listAll\(/.test(contacts), "contacts must not join Firestore collections");
  const createOrg = events.slice(
    events.indexOf("async function createOrgAndSponsor"),
    events.indexOf("async function writeSponsor")
  );
  ok(/postAdminOrganization/.test(createOrg), "event org create uses API");
  ok(!/COL\.organizations/.test(createOrg), "event org create must not write Firestore orgs");
  const writeSp = events.slice(
    events.indexOf("async function writeSponsor"),
    events.indexOf("async function saveSponsorRow")
  );
  ok(/putAdminPartners/.test(writeSp), "writeSponsor PUTs /v1/admin/partners");
  ok(!/COL\.sponsors|addDoc/.test(writeSp), "writeSponsor must not write Firestore sponsors");
  ok(!/putAdminEventPartners/.test(writeSp), "writeSponsor must not use the 404 event-scoped PUT");
  const saveSp = events.slice(
    events.indexOf("async function saveSponsorRow"),
    events.indexOf("async function removeSponsorRow")
  );
  ok(/putAdminPartners/.test(saveSp), "saveSponsorRow PUTs /v1/admin/partners");
  ok(!/setDoc|COL\.sponsors/.test(saveSp), "saveSponsorRow must not write Firestore sponsors");
  ok(!/contributionType|deliverablesDone/.test(saveSp), "save must not invent Firestore-only fields");
  const remSp = events.slice(
    events.indexOf("async function removeSponsorRow"),
    events.indexOf("async function linkRegistration")
  );
  ok(!/deleteDoc|COL\.sponsors/.test(remSp), "remove must not invent DELETE");
  ok(/404/.test(remSp), "remove is honest about missing DELETE");
  const loadApps = events.slice(
    events.indexOf("async function loadApplicationsTab"),
    events.indexOf("async function loadRegistrationsTab")
  );
  ok(/listPartnerApplicationsFor/.test(loadApps), "applications tab uses the API helper");
  const loadCounts = events.slice(
    events.indexOf("async function loadTabCounts"),
    events.indexOf("let EVENT_REPORT")
  );
  ok(/listAdminPartnerApplications/.test(loadCounts), "application badge uses API");
  ok(/listAdminEventPartners/.test(loadCounts), "sponsor badge uses API");
  ok(!/COL\.partners/.test(loadCounts), "application badge must not count Firestore");
  ok(!/COL\.sponsors/.test(loadCounts), "sponsor badge must not count Firestore");
});

const REAL_FB = read("assets/js/paaipe-firebase.js");
const REAL_DATA = read("assets/js/paaipe-events-data.js");
const fbStub = `
  export * from '/assets/js/paaipe-firebase-real.js';
  export async function currentAgent(){return {uid:'a1',email:'admin@upupapp.asia',status:'guest'}}
  export async function isAdminNow(){return true}
  export async function signOutNow(){}
  export async function idTokenForRequest(){ return 'test-id-token' }`;
const dataStub = `
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function listEvents(){ return [{id:'e-oct',title:'AI Exchange — October 2026',status:'registration_open'}] }
  export async function listOrganizations(){ return [] }
  export async function listEventSponsors(){ return [] }
  export async function listPartnerApplicationsFor(){ return [] }
  export async function listAllRegistrations(){ throw new Error('Firestore registrations must not be read') }`;

const br = await chromium.launch();

await T("admin-registrations 401 is an error, not an empty list", async () => {
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
  await p.route("https://api.paaipe.org/**", route =>
    route.fulfill({ status: 401, contentType: "text/plain", body: "missing bearer" }));
  await p.goto(`${BASE}/admin-registrations.html`, { waitUntil: "load" });
  await p.waitForSelector('html[data-admin-regs="error"]', { timeout: 9000 });
  const flash = await p.locator("[data-flash]").innerText();
  ok(/could not load registrations/i.test(flash), `flash: ${flash}`);
  ok(/sign-in expired or missing/i.test(flash), `401 explained: ${flash}`);
  const table = await p.locator("[data-rows]").innerText();
  ok(/could not be loaded/i.test(table), `table: ${table}`);
  ok(!/no registration has been submitted yet/i.test(table), "must not read as none");
  await ctx.close();
});

await T("admin-registrations 404 is an error, not an empty list", async () => {
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
  await p.route("https://api.paaipe.org/**", route =>
    route.fulfill({ status: 404, contentType: "text/plain", body: "not found" }));
  await p.goto(`${BASE}/admin-registrations.html`, { waitUntil: "load" });
  await p.waitForSelector('html[data-admin-regs="error"]', { timeout: 9000 });
  const flash = await p.locator("[data-flash]").innerText();
  ok(/could not load registrations/i.test(flash), `flash: ${flash}`);
  ok(/404/.test(flash), `404 explained: ${flash}`);
  const table = await p.locator("[data-rows]").innerText();
  ok(/could not be loaded/i.test(table), `table: ${table}`);
  ok(!/no registration has been submitted yet/i.test(table), "must not read as none");
  await ctx.close();
});

await T("admin-registrations lists rows from GET /v1/admin/events/{id}/registrations", async () => {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  let hit = "";
  let auth = "";
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: fbStub }));
  await p.route("**/assets/js/paaipe-events-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_DATA }));
  await p.route("**/assets/js/paaipe-events-data.js", r =>
    r.fulfill({ contentType: "text/javascript", body: dataStub }));
  await p.route("https://api.paaipe.org/**", async route => {
    hit = route.request().url();
    auth = route.request().headers().authorization || "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "r1", full_name: "Ada Lovelace", email: "ada@x.com",
        organization: "PAAIPE", profile: "Founder", status: "registered" }]),
    });
  });
  await p.goto(`${BASE}/admin-registrations.html`, { waitUntil: "load" });
  await p.waitForSelector('html[data-admin-regs="1"]', { timeout: 9000 });
  ok(/\/v1\/admin\/events\/e-oct\/registrations/.test(hit), `path: ${hit}`);
  eq(auth, "Bearer test-id-token", "Authorization Bearer");
  ok(/Ada Lovelace/.test(await p.locator("[data-rows]").innerText()), "row shown");
  await ctx.close();
});

const orgDataStub = `
  export * from '/assets/js/paaipe-events-data-real.js';
  export async function listEvents(){ return [{id:'e-oct',title:'AI Exchange — October 2026',status:'registration_open'}] }
  export async function listEventSponsors(){ return [] }
  export async function listPartnerApplicationsFor(){ return [] }
  export async function listAllRegistrations(){ throw new Error('Firestore registrations must not be read') }`;

await T("admin-organizations lists rows from GET /v1/admin/organizations", async () => {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const hits = [];
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: fbStub }));
  await p.route("**/assets/js/paaipe-events-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_DATA }));
  await p.route("**/assets/js/paaipe-events-data.js", r =>
    r.fulfill({ contentType: "text/javascript", body: orgDataStub }));
  await p.route("https://api.paaipe.org/**", async route => {
    hits.push({
      url: route.request().url(),
      auth: route.request().headers().authorization || "",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        organizations: [{
          id: "dpdigital", name: "DP Digital Solutions",
          website: "https://example.com", type: "sponsor", status: "active",
        }],
      }),
    });
  });
  await p.goto(`${BASE}/admin-organizations.html`, { waitUntil: "load" });
  await p.waitForSelector('html[data-admin-orgs="1"]', { timeout: 9000 });
  ok(hits.some(h => /\/v1\/admin\/organizations$/.test(h.url)), `path: ${hits.map(h => h.url).join(",")}`);
  ok(hits.every(h => h.auth === "Bearer test-id-token"), "Authorization Bearer");
  ok(/DP Digital Solutions/.test(await p.locator("[data-orgs]").innerText()), "row shown");
  await ctx.close();
});

await T("admin-organizations 401 is an error, not an empty list", async () => {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: fbStub }));
  await p.route("**/assets/js/paaipe-events-data-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_DATA }));
  await p.route("**/assets/js/paaipe-events-data.js", r =>
    r.fulfill({ contentType: "text/javascript", body: orgDataStub }));
  await p.route("https://api.paaipe.org/**", route =>
    route.fulfill({ status: 401, contentType: "text/plain", body: "missing bearer" }));
  await p.goto(`${BASE}/admin-organizations.html`, { waitUntil: "load" });
  await p.waitForSelector('html[data-admin-orgs="error"]', { timeout: 9000 });
  const flash = await p.locator("[data-flash]").innerText();
  ok(/could not load/i.test(flash), `flash: ${flash}`);
  const table = await p.locator("[data-orgs]").innerText();
  ok(/could not be loaded/i.test(table), `table: ${table}`);
  ok(!/no organization has been added yet/i.test(table), "must not read as none");
  await ctx.close();
});

await T("admin-contacts lists rows from GET /v1/admin/contacts and stays read-only", async () => {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  let hit = "";
  let auth = "";
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: fbStub }));
  await p.route("https://api.paaipe.org/**", async route => {
    hit = route.request().url();
    auth = route.request().headers().authorization || "";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        contacts: [{
          id: "c1", email: "rosa@example.com", name: "Rosa Villanueva",
          companyName: "Northwind", createdAt: "2026-09-18T14:55:37.858Z",
        }],
      }),
    });
  });
  await p.goto(`${BASE}/admin-contacts.html`, { waitUntil: "load" });
  await p.waitForSelector('html[data-admin-contacts-state="1"]', { timeout: 9000 });
  ok(/\/v1\/admin\/contacts$/.test(hit) || /\/v1\/admin\/contacts/.test(hit), `path: ${hit}`);
  eq(auth, "Bearer test-id-token", "Authorization Bearer");
  ok(/Rosa Villanueva/.test(await p.locator("[data-rows]").innerText()), "row shown");
  await p.locator("tr[data-email]").first().click();
  const detail = await p.locator("[data-detail]").innerText();
  ok(/read-only/i.test(detail), `detail says read-only: ${detail}`);
  ok(!(await p.locator("[data-confirm]").count()), "no confirm write");
  ok(!(await p.locator("[data-mark]").count()), "no registration write");
  await ctx.close();
});

await T("admin-contacts 401 is an error, not an empty list", async () => {
  const ctx = await br.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.route("**/assets/js/paaipe-firebase-real.js", r =>
    r.fulfill({ contentType: "text/javascript", body: REAL_FB }));
  await p.route("**/assets/js/paaipe-firebase.js", r =>
    r.fulfill({ contentType: "text/javascript", body: fbStub }));
  await p.route("https://api.paaipe.org/**", route =>
    route.fulfill({ status: 401, contentType: "text/plain", body: "missing bearer" }));
  await p.goto(`${BASE}/admin-contacts.html`, { waitUntil: "load" });
  await p.waitForSelector('html[data-admin-contacts-state="error"]', { timeout: 9000 });
  const flash = await p.locator("[data-flash]").innerText();
  ok(/could not load contacts/i.test(flash), `flash: ${flash}`);
  const table = await p.locator("[data-rows]").innerText();
  ok(/could not load/i.test(table), `table: ${table}`);
  ok(!/no one is here yet/i.test(table), "must not read as none");
  await ctx.close();
});

await T("draft window + certificate: 200/401 live, 404 not-wired, media URLs only", async () => {
  const src = read("assets/js/paaipe-api.js");
  ok(/\/v1\/me\/events\/\$\{encodeURIComponent\(eventId\)\}\/certificate/.test(src),
    "documented me certificate GET");
  ok(/\/certificate\/email/.test(src), "documented email POST");
  ok(!/certificate\/issue/.test(src), "no POST issue");
  ok(!/certificate\/download/.test(src), "no download API");
  ok(!/\/v1\/admin\/events\/.+\/feedback/.test(src.split("\n").filter(l =>
    !l.trim().startsWith("*") && !l.trim().startsWith("//")).join("\n")),
    "portal client does not call admin PUT questions");
  eq(api.mediaFileUrl("https://media.paaipe.org/certificates/a.pdf"),
    "https://media.paaipe.org/certificates/a.pdf", "media ok");
  eq(api.mediaFileUrl("https://api.paaipe.org/v1/me/events/x/certificate/download"), "", "no api download");
  eq(api.mediaFileUrl("http://media.paaipe.org/x.pdf"), "", "https only");
  eq(api.certificateDownloadUrl({ pdfUrl: "https://evil.example/x.pdf", pngUrl: "https://media.paaipe.org/x.png" }),
    "https://media.paaipe.org/x.png", "png fallback if pdf is foreign");

  const readyIssued = api.normalizeMeCertificate({
    state: "ready",
    registered: true,
    feedbackSubmitted: true,
    feedbackWindow: { state: "closed", opensAt: "t1", closesAt: "t2", timezone: "Asia/Manila" },
    certificate: { id: "c1", pdfUrl: "https://media.paaipe.org/c1.pdf", pngUrl: "", issuedAt: "t", emailedAt: null },
  });
  eq(readyIssued.state, "issued", "ready + cert → issued");
  eq(readyIssued.certificate.id, "c1", "cert id");

  const readyIssuing = api.normalizeMeCertificate({
    state: "ready", registered: true, feedbackSubmitted: true,
    feedbackWindow: { state: "open", opensAt: "t1", closesAt: "t2" },
  });
  eq(readyIssuing.state, "issuing", "ready without cert → issuing");

  const badWin = api.normalizeFeedbackWindow({ state: "maybe" });
  eq(badWin, null, "unknown window state is not invented");

  const hits = [];
  const fetchImpl = async (url, opts) => {
    hits.push({ url, method: opts.method, headers: opts.headers || {}, body: opts.body });
    if (url.endsWith("/feedback/window") && url.includes("missing")) {
      return new Response("not found", { status: 404 });
    }
    if (url.endsWith("/feedback/window")) {
      return new Response(JSON.stringify({
        opensAt: "2026-09-15T13:00:00.000Z",
        closesAt: "2026-09-16T04:00:00.000Z",
        state: "open",
        timezone: "Asia/Manila",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/certificate/email")) {
      return new Response(JSON.stringify({ emailedAt: "2026-09-16T05:00:00.000Z" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url.endsWith("/certificate") && url.includes("gone")) {
      return new Response("not found", { status: 404 });
    }
    if (url.endsWith("/certificate") && url.includes("auth")) {
      return new Response("missing bearer", { status: 401 });
    }
    if (url.endsWith("/certificate")) {
      return new Response(JSON.stringify({
        state: "issued",
        registered: true,
        feedbackSubmitted: true,
        feedbackWindow: { state: "closed", opensAt: "a", closesAt: "b", timezone: "Asia/Manila" },
        certificate: { id: "c1", pdfUrl: "https://media.paaipe.org/c1.pdf", pngUrl: "", issuedAt: "t", emailedAt: null },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("missing", { status: 404 });
  };

  const liveWin = await api.getEventFeedbackWindow("2026-09-ai-exchange", { fetchImpl });
  eq(liveWin.live, true, "window 200 live");
  eq(liveWin.window.state, "open", "window state");
  ok(!("Authorization" in hits[0].headers), "window GET is public");

  const missingWin = await api.getEventFeedbackWindow("missing", { fetchImpl });
  eq(missingWin.live, false, "window 404 not live");
  eq(missingWin.window, null, "no invented window");

  const liveCert = await api.getMeEventCertificate("2026-09-ai-exchange", { token: "tok", fetchImpl });
  eq(liveCert.live, true, "cert 200 live");
  eq(liveCert.certificate.state, "issued", "issued");
  eq(hits.find(h => h.url.endsWith("/certificate")).headers.Authorization, "Bearer tok", "cert Bearer");

  const gone = await api.getMeEventCertificate("gone", { token: "tok", fetchImpl });
  eq(gone.live, false, "cert 404 not live");
  eq(gone.certificate, null, "no invented cert");

  const unauth = await api.getMeEventCertificate("auth", { token: "tok", fetchImpl });
  eq(unauth.live, true, "401 means the route is deployed");
  eq(unauth.certificate, null, "401 has no body state");

  const emailed = await api.postMeEventCertificateEmail("2026-09-ai-exchange", { token: "tok", fetchImpl });
  eq(emailed.emailedAt, "2026-09-16T05:00:00.000Z", "emailedAt from 200");
  eq(hits.find(h => h.url.endsWith("/certificate/email")).method, "POST", "email POST");
});

await br.close();
console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
