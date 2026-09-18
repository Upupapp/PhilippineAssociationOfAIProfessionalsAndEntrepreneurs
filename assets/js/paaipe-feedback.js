/* PAAIPE — event feedback, against Clarence's locked schema.
 *
 *   paaipe_event_feedback_questions/{eventId}_{questionKey}
 *   paaipe_event_feedback_responses/{eventId}_{registrationId}
 *
 * Questions are not embedded on the event, are not questionsEnabled (that
 * toggle is the registration form), and are not sessions/micros. A failed
 * read is "not available", an empty read is "no documents yet", and those
 * two are different. Mock figures (48, 12, 4.2, 25%) are never used as data.
 *
 * Public join cannot be proven by listing registrations — those reads stay
 * admin-only. A new registration form keeps the id submitRegistration
 * returns. People who registered before that have no client path to their
 * id; the public block stays hidden rather than faking a lookup.
 */
import { firebaseConfig, DATABASE_ID, currentAgent, isAdminNow } from "/assets/js/paaipe-firebase.js";
import {
  COL, eventDateLong, eventDateTimeLine, formatTime12, eventStartAt,
  eventStatusShort,
} from "/assets/js/paaipe-events-data.js";

const SDK = "https://www.gstatic.com/firebasejs/12.19.0";
const RECEIPT_KEY = "paaipe.registrationReceipt.v1";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const Q_TYPE = { SCALE: "1-5", YESNO: "yes-no", SHORT: "short" };
export const Q_TYPE_LABEL = {
  [Q_TYPE.SCALE]: "1–5",
  [Q_TYPE.YESNO]: "Yes / No",
  [Q_TYPE.SHORT]: "Short text",
};

/** Starter four, one doc each, keys immutable. */
export const STARTER_QUESTIONS = [
  { questionKey: "overall",    prompt: "Overall, how was this session?",             type: Q_TYPE.SCALE, required: true,  order: 0 },
  { questionKey: "recommend",  prompt: "Would you recommend this to another Agent?", type: Q_TYPE.YESNO, required: true,  order: 1 },
  { questionKey: "mostUseful", prompt: "What was most useful?",                      type: Q_TYPE.SHORT, required: true,  order: 2 },
  { questionKey: "improve",    prompt: "What should we improve?",                    type: Q_TYPE.SHORT, required: false, order: 3 },
];

export const questionDocId = (eventId, questionKey) => `${eventId}_${questionKey}`;
export const responseDocId = (eventId, registrationId) => `${eventId}_${registrationId}`;

export function newQuestionKey(used) {
  const taken = new Set(used || []);
  let key = `q${Date.now().toString(36)}`;
  while (taken.has(key)) key = `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  return key;
}

function normalizeQuestion(q, i = 0) {
  if (!q || typeof q !== "object") return null;
  const type = Q_TYPE_LABEL[q.type] ? q.type : null;
  const questionKey = String(q.questionKey || "").trim();
  const prompt = String(q.prompt || "").trim();
  if (!type || !questionKey || !prompt) return null;
  const eventId = String(q.eventId || "").trim();
  return {
    id: q.id || (eventId ? questionDocId(eventId, questionKey) : questionKey),
    eventId,
    questionKey,
    prompt,
    type,
    required: q.required !== false,
    active: q.active !== false,
    order: Number.isFinite(q.order) ? q.order : i,
  };
}

/* ------------------------------------------------ registration receipt
 *
 * Written only after submitRegistration resolves, with the id it returned.
 * Never invented, never looked up from the registrations collection. */

export function rememberRegistrationReceipt(eventId, registrationId, email) {
  const eid = String(eventId || "").trim();
  const rid = String(registrationId || "").trim();
  if (!eid || !rid) return;
  const all = readJson(RECEIPT_KEY, {});
  all[eid] = { registrationId: rid, email: String(email || "").trim().toLowerCase(), at: Date.now() };
  try { localStorage.setItem(RECEIPT_KEY, JSON.stringify(all)); } catch { /* private mode */ }
}

export function registrationReceiptFor(eventId) {
  const eid = String(eventId || "").trim();
  if (!eid) return null;
  const row = readJson(RECEIPT_KEY, {})[eid];
  return row && row.registrationId ? row : null;
}

function readJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v && typeof v === "object" ? v : fallback;
  } catch { return fallback; }
}

export function emailsMatch(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase()
    && String(a || "").trim() !== "";
}

/* ------------------------------------------------ clock (client-side only) */

export function feedbackIsOpen(ev, now = new Date()) {
  const start = eventStartAt(ev);
  if (!start) return false;
  return now.getTime() >= start.getTime();
}

export function opensAtCopy(ev) {
  const start = eventStartAt(ev);
  if (!start) return null;
  const time = formatTime12(ev.startTime);
  const day = start.toLocaleDateString("en-PH", {
    month: "long", day: "numeric", timeZone: "Asia/Manila",
  });
  return { time, day, start };
}

export function whoSeesCopy(ev) {
  const open = opensAtCopy(ev);
  const when = open
    ? `This one opens ${eventDateLong(ev) || open.day} at ${open.time} PHT.`
    : "This event has no date and startTime on its record, so the form cannot open.";
  return {
    who: "On the public event page, only for people who joined this event. Hidden from everyone else.",
    when: `Not open until the event start. ${when} That clock comes from the event, not a fixed time.`,
    once: "One response per joined attendee. Drag to reorder. Remove is allowed. Existing answers stay tied to the question they answered.",
  };
}

/* ------------------------------------------------ Firestore */

async function db() {
  const { initializeApp, getApps } = await import(`${SDK}/firebase-app.js`);
  const { getFirestore } = await import(`${SDK}/firebase-firestore.js`);
  const app = getApps().find(a => a.name === "paaipe") || initializeApp(firebaseConfig, "paaipe");
  return getFirestore(app, DATABASE_ID);
}

function unavailable(reason) {
  return { ok: false, rows: [], reason: reason || "Not available yet." };
}

export async function listFeedbackQuestions(eventId) {
  if (!eventId) return unavailable("No event.");
  try {
    const F = await import(`${SDK}/firebase-firestore.js`);
    const snap = await F.getDocs(F.query(
      F.collection(await db(), COL.feedbackQuestions),
      F.where("eventId", "==", eventId)));
    const rows = snap.docs.map((d, i) => normalizeQuestion({ id: d.id, ...d.data() }, i)).filter(Boolean)
      .sort((a, b) => a.order - b.order);
    return { ok: true, rows, reason: "" };
  } catch (ex) {
    const code = ex?.code || "";
    if (code === "permission-denied" || code === "not-found")
      return unavailable("Feedback questions are not available yet. This is not an empty form.");
    return unavailable(`Questions could not be read: ${ex?.message || ex}`);
  }
}

export async function listFeedbackResponses(eventId) {
  if (!eventId) return unavailable("No event.");
  try {
    const F = await import(`${SDK}/firebase-firestore.js`);
    const snap = await F.getDocs(F.query(
      F.collection(await db(), COL.feedbackResponses),
      F.where("eventId", "==", eventId)));
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.submittedAt?.seconds || 0) - (b.submittedAt?.seconds || 0));
    return { ok: true, rows, reason: "" };
  } catch (ex) {
    const code = ex?.code || "";
    if (code === "permission-denied" || code === "not-found")
      return unavailable("Feedback storage is not connected yet. Nothing here is a count of zero.");
    return unavailable(`Feedback responses could not be read: ${ex?.message || ex}`);
  }
}

/** One response by known id. Public must not list the collection. */
export async function getFeedbackResponse(eventId, registrationId) {
  if (!eventId || !registrationId) return { ok: false, row: null, reason: "missing id" };
  try {
    const F = await import(`${SDK}/firebase-firestore.js`);
    const s = await F.getDoc(F.doc(await db(), COL.feedbackResponses, responseDocId(eventId, registrationId)));
    return { ok: true, row: s.exists() ? { id: s.id, ...s.data() } : null, reason: "" };
  } catch (ex) {
    return { ok: false, row: null, reason: ex?.message || String(ex) };
  }
}

/** Question document ids that appear as keys in any response.answers map. */
export function citedQuestionIds(responses) {
  const ids = new Set();
  for (const row of responses || []) {
    const answers = row?.answers;
    if (!answers || typeof answers !== "object") continue;
    for (const k of Object.keys(answers)) {
      if (k) ids.add(k);
    }
  }
  return ids;
}

export async function writeFeedbackQuestions(eventId, next, { citedIds } = {}) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const database = await db();
  const current = await listFeedbackQuestions(eventId);
  if (!current.ok) throw Object.assign(new Error(current.reason), { code: "unavailable" });

  const cited = citedIds instanceof Set ? citedIds : new Set(citedIds || []);
  const byKey = new Map(current.rows.map(q => [q.questionKey, q]));
  const seen = new Set();
  const usedKeys = new Set(current.rows.map(q => q.questionKey));

  for (let i = 0; i < next.length; i++) {
    const row = next[i];
    const prompt = String(row.prompt || "").trim();
    const type = Q_TYPE_LABEL[row.type] ? row.type : Q_TYPE.SHORT;
    const required = row.required !== false;
    if (!prompt) continue;

    let key = String(row.questionKey || "").trim();
    const existing = key ? byKey.get(key) : null;

    // A retired key stays retired. Do not reactivate it; mint a new key.
    if (existing && existing.active === false) {
      seen.add(existing.questionKey);
      key = newQuestionKey(usedKeys);
      usedKeys.add(key);
      const id = questionDocId(eventId, key);
      await F.setDoc(F.doc(database, COL.feedbackQuestions, id), {
        eventId, questionKey: key, prompt, type, required, active: true, order: i,
      });
      seen.add(key);
      continue;
    }

    const existingId = existing ? (existing.id || questionDocId(eventId, existing.questionKey)) : "";
    if (existing && existing.type !== type && cited.has(existingId)) {
      // Type is immutable once any answer cites this document id.
      await F.setDoc(F.doc(database, COL.feedbackQuestions, existing.id), { active: false, order: i }, { merge: true });
      seen.add(existing.questionKey);
      key = newQuestionKey(usedKeys);
      usedKeys.add(key);
      const id = questionDocId(eventId, key);
      await F.setDoc(F.doc(database, COL.feedbackQuestions, id), {
        eventId, questionKey: key, prompt, type, required, active: true, order: i,
      });
      seen.add(key);
      continue;
    }

    if (!existing) {
      if (!key || usedKeys.has(key)) { key = newQuestionKey(usedKeys); }
      usedKeys.add(key);
      const id = questionDocId(eventId, key);
      await F.setDoc(F.doc(database, COL.feedbackQuestions, id), {
        eventId, questionKey: key, prompt, type, required, active: true, order: i,
      });
      seen.add(key);
      continue;
    }

    await F.setDoc(F.doc(database, COL.feedbackQuestions, existing.id), {
      eventId, questionKey: existing.questionKey, prompt, type, required,
      active: true, order: i,
    }, { merge: true });
    seen.add(existing.questionKey);
  }

  for (const q of current.rows) {
    if (seen.has(q.questionKey)) continue;
    if (!q.active) continue;
    await F.setDoc(F.doc(database, COL.feedbackQuestions, q.id), { active: false }, { merge: true });
  }
}

export async function submitFeedbackResponse(eventId, registrationId, answers) {
  if (!eventId || !registrationId)
    throw Object.assign(new Error("missing-id"), { code: "missing-id" });
  const F = await import(`${SDK}/firebase-firestore.js`);
  const ref = F.doc(await db(), COL.feedbackResponses, responseDocId(eventId, registrationId));
  const existing = await F.getDoc(ref);
  if (existing.exists())
    throw Object.assign(new Error("already-exists"), { code: "already-exists" });
  await F.setDoc(ref, {
    eventId,
    registrationId,
    submittedAt: F.serverTimestamp(),
    answers,
  });
}

/* ------------------------------------------------ report figures
 *
 * Registrations counted by eventId only. A row with no eventId is excluded,
 * not treated as zero. Waitlist is not a status — never a number, never a
 * charted 0. Mix is registered vs cancelled only. attended / no_show stay
 * inside the joined denominator, not the mix. */

export function regsForEvent(regs, eventId) {
  return (regs || []).filter(r => r && r.eventId && r.eventId === eventId);
}

export function isCancelled(reg) {
  return (reg?.status || "") === "cancelled";
}

/** Mix bar "Registered": missing status or registered. Not attended / no_show. */
export function isRegisteredStatus(reg) {
  return !reg?.status || reg.status === "registered";
}

/** Joined denominator: missing, registered, attended, no_show. Not cancelled. */
export function isJoinedStatus(reg) {
  const s = reg?.status;
  return !s || s === "registered" || s === "attended" || s === "no_show";
}

export function joinedRegs(regs, eventId) {
  return regsForEvent(regs, eventId).filter(isJoinedStatus);
}

function live(value, source, extra = {}) {
  return { live: true, value, source, ...extra };
}
function stub(reason, source = "Not available", extra = {}) {
  return { live: false, value: null, source, reason, ...extra };
}

export function buildEventReport(ev, {
  regs = [], sponsors = [], apps = [], questions = null, feedback = null,
  regsOk = true, sponsorsOk = true, appsOk = true,
  regsReason = "", sponsorsReason = "", appsReason = "",
} = {}) {
  const mine = regsOk ? regsForEvent(regs, ev.id) : [];
  const joined = mine.filter(isJoinedStatus);
  const registered = mine.filter(isRegisteredStatus).length;
  const cancelled = mine.filter(isCancelled).length;
  const status = eventStatusShort(ev);
  const when = eventDateTimeLine(ev);

  const fb = feedback && feedback.ok
    ? live(feedback.rows.length, "Feedback")
    : stub(feedback?.reason || "Feedback storage is not connected yet.", "Feedback");

  let rate = stub("Response rate needs live feedback responses and a joined count.", "Responses / joined");
  if (fb.live && regsOk) {
    if (joined.length === 0)
      rate = stub("Not measured — no joined attendees to divide by.", "Responses / joined");
    else
      rate = live(fb.value / joined.length, "Responses / joined", {
        display: `${Math.round((fb.value / joined.length) * 100)}%`,
      });
  } else if (fb.live && !regsOk) {
    rate = stub("Not measured — joined count could not be read.", "Responses / joined");
  }

  const qs = questions && questions.ok ? questions.rows.filter(q => q.active) : [];
  const breakdown = fb.live && questions && questions.ok
    ? live(breakdownOf(qs, feedback.rows), "Feedback")
    : stub((feedback && !feedback.ok && feedback.reason)
        || (questions && !questions.ok && questions.reason)
        || "Feedback breakdown is not available yet.", "Feedback");

  return {
    ev,
    when: when ? live(when, "Event record") : stub("No date is on this event record.", "Event record"),
    status: status ? live(status, "Event record") : stub("No status is on this event record.", "Event record"),
    registrations: regsOk ? live(mine.length, "Registrations")
      : stub(regsReason || "Registrations could not be read. This is not a count of zero.", "Registrations"),
    registered: regsOk ? live(registered, "Registrations")
      : stub(regsReason || "Registrations could not be read.", "Registrations"),
    cancelled: regsOk ? live(cancelled, "Registrations")
      : stub(regsReason || "Registrations could not be read.", "Registrations"),
    waitlist: stub(
      "There is no waitlist status. waitlistEnabled is not a headcount.",
      "Not measured",
      { display: "Not measured" },
    ),
    joined: regsOk ? live(joined.length, "Registrations")
      : stub(regsReason || "Joined count could not be read.", "Registrations"),
    // Document count of paaipe_event_sponsors. Do not sum contributionType.
    partners: sponsorsOk ? live(sponsors.length, "Event sponsors")
      : stub(sponsorsReason || "Event sponsors could not be read. This is not a count of zero.", "Event sponsors"),
    // All paaipe_partner_applications for this eventId, every status including spam.
    partnerApplications: appsOk ? live(apps.length, "Partner applications")
      : stub(appsReason || "Partner applications could not be read. This is not a count of zero.", "Partner applications"),
    feedback: fb,
    responseRate: rate,
    breakdown,
    responses: fb.live ? live(feedback.rows, "Feedback") : stub(fb.reason, "Feedback"),
    questions: questions && questions.ok ? live(qs, "Feedback") : stub(questions?.reason || "Questions are not available yet.", "Feedback"),
    notMeasured: ["Attendance", "Watch time", "Revenue", "Waitlist"],
  };
}

export function breakdownOf(questions, rows) {
  return (questions || []).map(q => {
    const key = q.id;
    const values = (rows || []).map(r => r?.answers?.[key]).filter(v => v != null && v !== "");
    if (q.type === Q_TYPE.SCALE) {
      const nums = values.map(Number).filter(n => n >= 1 && n <= 5);
      const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      return { id: q.id, prompt: q.prompt, type: q.type, n: nums.length, average: avg,
        label: avg == null ? "No scores yet" : `Average ${avg.toFixed(1)}`,
        fill: avg == null ? 0 : avg / 5 };
    }
    if (q.type === Q_TYPE.YESNO) {
      const yes = values.filter(v => String(v).toLowerCase() === "yes").length;
      const no  = values.filter(v => String(v).toLowerCase() === "no").length;
      return { id: q.id, prompt: q.prompt, type: q.type, n: yes + no, yes, no,
        label: (yes + no) ? `Yes ${yes} · No ${no}` : "No answers yet" };
    }
    return { id: q.id, prompt: q.prompt, type: q.type, n: values.length,
      label: values.length ? `${values.length} short answer${values.length === 1 ? "" : "s"}` : "No answers yet" };
  });
}

export function figureText(cell) {
  if (!cell || cell.live !== true) return cell?.display || "—";
  if (cell.display) return cell.display;
  if (typeof cell.value === "number") return String(cell.value);
  return cell.value == null ? "—" : String(cell.value);
}

export function figureNote(cell) {
  if (!cell) return "Not available";
  if (cell.live) return "";
  return cell.reason || "Not available";
}

export function submittedWhen(row) {
  const d = row?.submittedAt?.toDate ? row.submittedAt.toDate()
          : Number.isFinite(row?.submittedAt?.seconds) ? new Date(row.submittedAt.seconds * 1000)
          : null;
  if (!d || isNaN(d)) return "";
  return d.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function answerDisplay(q, answers) {
  if (!q) return "";
  const v = answers?.[q.id];
  if (v == null || v === "") return "—";
  if (q.type === Q_TYPE.YESNO) return String(v).toLowerCase() === "yes" ? "Yes" : "No";
  return String(v);
}

/* ------------------------------------------------ Export (PDF via print) */

export function reportExportHtml({ ev, report, context = "Event report" }) {
  const title = ev?.title || "Event";
  const when = report.when.live ? report.when.value : "";
  const status = report.status.live ? report.status.value : "";
  const sub = [when, status].filter(Boolean).join(" · ");
  const tracked = [report.registrations, report.partners, report.partnerApplications, report.feedback, report.responseRate];
  const anyStub = tracked.some(c => c && !c.live);

  const rows = [
    ["Registrations",        report.registrations,       "Registrations"],
    ["Partner applications", report.partnerApplications, "Partner applications"],
    ["Partners on this event", report.partners,          "Event sponsors"],
    ["Feedback responses",   report.feedback,            "Feedback"],
    ["Response rate",        report.responseRate,        "Responses / joined"],
  ];
  if (report.breakdown.live) {
    for (const b of report.breakdown.value) {
      rows.push([b.prompt.replace(/\?$/, "") || b.prompt, { live: true, display: b.label }, "Feedback"]);
    }
  }

  const tr = rows.map(([metric, cell, source]) => {
    const fig = figureText(cell);
    const note = figureNote(cell);
    return `<tr>
      <td>${esc(metric)}</td>
      <td>${esc(fig)}${note ? ` <span class="ex">${esc(note)}</span>` : ""}</td>
      <td>${esc(cell?.live ? source : (cell?.source || "Not available"))}</td>
    </tr>`;
  }).join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)} — Event report</title>
<style>
  @page{size:A4;margin:18mm 16mm 18mm}
  html,body{margin:0;background:#E8EEF6}
  body{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#122040}
  .sheet{width:210mm;min-height:297mm;margin:24px auto;background:#fff;padding:22mm 18mm 20mm;
    box-shadow:0 18px 50px rgba(20,30,60,.12);box-sizing:border-box;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:18px}
  .top img{height:28px}
  .ctx{text-align:right;font-size:12.5px;color:#6B7793;line-height:1.45}
  .rule{height:3px;background:#F2A71B;border:0;margin:14px 0 16px}
  .banner{background:#FDF2DA;border:1px solid #F0DCA9;color:#8A5D06;border-radius:10px;
    padding:10px 14px;font-size:13px;margin:0 0 22px}
  h1{font-size:26px;color:#002166;margin:0 0 8px;letter-spacing:-.02em}
  .sub{color:#6B7793;font-size:14px;margin:0 0 22px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th{text-align:left;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#93A0B8;
    font-weight:800;padding:0 8px 10px;border-bottom:1px solid #E6E2D8}
  td{padding:12px 8px;border-bottom:1px solid #F0EDE5;color:#122040}
  td:first-child{color:#002166;font-weight:600}
  .ex{display:block;font-size:12px;color:#6B7793;font-weight:500;margin-top:2px}
  .gap{margin-top:22px;border:1.5px dashed #E6E2D8;border-radius:12px;padding:12px 14px;
    color:#6B7793;font-size:13.5px}
  .foot{margin-top:auto;padding-top:18px;border-top:1px solid #E6E2D8;display:flex;
    justify-content:space-between;gap:12px;font-size:12px;color:#4a5a7a}
  @media print{
    html,body{background:#fff}
    .sheet{margin:0;box-shadow:none;width:auto;min-height:auto;padding:0}
  }
</style></head><body>
<article class="sheet" data-export-sheet>
  <header class="top">
    <img src="assets/img/paaipe-logo.png" alt="PAAIPE">
    <div class="ctx"><div>${esc(context)}</div><div>${esc(title)}</div></div>
  </header>
  <hr class="rule">
  ${anyStub ? `<p class="banner">Live counts only. A figure that cannot be read is marked as not available — never filled in.</p>` : ""}
  <h1>${esc(title)}</h1>
  ${sub ? `<p class="sub">${esc(sub)}</p>` : `<p class="sub">Date and status come from the event record. This one does not have them.</p>`}
  <table>
    <thead><tr><th>Metric</th><th>Figure</th><th>Source</th></tr></thead>
    <tbody>${tr}</tbody>
  </table>
  <p class="gap">Not in this PDF: attendance, watch time, revenue, waitlist. No source.</p>
  <footer class="foot">
    <span>Philippine Association of AI Professionals and Entrepreneurs · paaipe.org</span>
    <span>1</span>
  </footer>
</article>
</body></html>`;
}

export function openReportExport(opts) {
  const html = reportExportHtml(opts);
  const w = window.open("", "_blank", "noopener,width=900,height=1200");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* */ } }, 400);
  return true;
}

/* ------------------------------------------------ public page */

const PUBLIC_CSS = `
.efb{margin-top:36px;border:1px solid var(--line,#c9dcf3);border-radius:18px;padding:28px 28px 24px;background:#fff}
.efb h2{margin:0 0 8px;font-size:28px}
.efb .lede{color:var(--muted,#4a5a7a);font-size:15px;margin:0 0 18px}
.efb-lock{background:#FBF6EA;border:1px solid #F0E4C4;border-radius:14px;padding:20px 22px;color:var(--ink,#0f1e3d)}
.efb-lock b{display:block;color:var(--navy,#002166);font-size:18px;margin-bottom:8px}
.efb-lock p{margin:0;color:var(--muted,#4a5a7a);font-size:15px;max-width:54ch}
.efb-off{display:inline-flex;margin-top:18px;padding:12px 22px;border-radius:999px;border:0;
  background:#E6E2D8;color:#7A7468;font:inherit;font-weight:600;font-size:14.5px;cursor:not-allowed}
.efb-q{margin:0 0 18px}
.efb-q b{display:block;color:var(--navy,#002166);font-size:16px;margin-bottom:8px}
.efb-q b .opt{font-weight:500;color:var(--muted,#4a5a7a);font-size:13.5px;margin-left:6px}
.efb-scale,.efb-yn{display:flex;flex-wrap:wrap;gap:8px}
.efb-scale button,.efb-yn button{width:48px;height:48px;border-radius:14px;border:1.5px solid var(--line,#c9dcf3);
  background:#fff;color:var(--navy,#002166);font:inherit;font-weight:700;font-size:16px;cursor:pointer}
.efb-yn button{width:auto;padding:0 22px}
.efb-scale button[aria-pressed="true"],.efb-yn button[aria-pressed="true"]{
  background:var(--navy,#002166);border-color:var(--navy,#002166);color:#fff}
.efb-q input[type=text],.efb-q textarea{width:100%;padding:12px 16px;border-radius:14px;border:1.5px solid var(--line,#c9dcf3);
  font:inherit;font-size:15px;box-sizing:border-box;resize:vertical;min-height:48px}
.efb-q input[type=text]:focus,.efb-q textarea:focus{outline:0;border-color:var(--blue,#1E6FE8);box-shadow:0 0 0 3px rgba(30,111,232,.12)}
.efb-go{width:100%;margin-top:8px;padding:14px 22px;border:0;border-radius:14px;font:inherit;font-weight:700;
  font-size:15.5px;cursor:pointer;background:linear-gradient(90deg,#F2A71B,#F7B733);color:var(--navy,#002166)}
.efb-go:disabled{opacity:.55;cursor:not-allowed}
.efb-note{text-align:center;color:var(--muted,#4a5a7a);font-size:13px;margin:10px 0 0}
.efb-err{color:#A32D1C;font-size:13.5px;margin:10px 0 0}
`;

export async function viewerMaySeeFeedback(ev) {
  if (!ev?.id) return false;
  let me = null;
  try { me = await currentAgent(); } catch { me = null; }
  if (!me?.email) return false;
  const receipt = registrationReceiptFor(ev.id);
  if (!receipt) return false;
  return emailsMatch(receipt.email, me.email);
}

export async function mountPublicFeedback(host, ev, overrides = {}) {
  if (!host || !ev) return;
  const maySee = overrides.joined ?? await viewerMaySeeFeedback(ev);
  if (!maySee) {
    host.innerHTML = "";
    host.hidden = true;
    host.setAttribute("data-feedback-state", "hidden");
    return;
  }
  if (!document.querySelector("[data-feedback-styles]")) {
    const st = document.createElement("style");
    st.setAttribute("data-feedback-styles", "");
    st.textContent = PUBLIC_CSS;
    document.head.appendChild(st);
  }
  host.hidden = false;
  const receipt = overrides.receipt || registrationReceiptFor(ev.id);
  const existing = overrides.existing !== undefined
    ? overrides.existing
    : (receipt ? await getFeedbackResponse(ev.id, receipt.registrationId) : { ok: false, row: null });
  if (existing?.ok && existing.row) return paintSent(host, ev);

  const now = overrides.now || new Date();
  if (!feedbackIsOpen(ev, now)) {
    let admin = overrides.admin;
    if (admin === undefined) {
      try { admin = await isAdminNow(); } catch { admin = false; }
    }
    // Start gate is client-side (date YYYY-MM-DD + startTime HH:mm PHT).
    // Admin bypasses it. Join still hides the block from everyone else.
    if (!admin) return paintLocked(host, ev);
  }

  const qs = overrides.questions || await listFeedbackQuestions(ev.id);
  if (!qs.ok) return paintUnavailable(host, ev, qs.reason);
  const active = qs.rows.filter(q => q.active);
  if (!active.length) return paintUnavailable(host, ev,
    "No feedback questions have been published for this event yet.");
  paintOpen(host, ev, active, receipt || { registrationId: "" });
}

function paintLocked(host, ev) {
  const open = opensAtCopy(ev);
  const when = open
    ? `The form opens at ${open.time} on ${open.day}. Questions stay hidden until then, and nothing here is clickable.`
    : "The form opens at this event’s start time. That time is not on the event record yet, so the questions stay hidden.";
  const btn = open ? `Feedback opens at ${open.time}` : "Feedback is not open yet";
  host.innerHTML = `<section class="efb" data-feedback-card data-state="locked">
    <h2>Feedback</h2>
    <div class="efb-lock">
      <b>Not open yet</b>
      <p>${esc(when)}</p>
    </div>
    <button type="button" class="efb-off" disabled tabindex="-1">${esc(btn)}</button>
  </section>`;
  host.setAttribute("data-feedback-state", "locked");
}

function paintSent(host, ev) {
  host.innerHTML = `<section class="efb" data-feedback-card data-state="sent">
    <h2>Feedback</h2>
    <p class="lede">How was ${esc(ev.title || "this event")}?</p>
    <p class="efb-note">You have already sent feedback for this event. One response.</p>
  </section>`;
  host.setAttribute("data-feedback-state", "sent");
}

function paintUnavailable(host, ev, reason) {
  host.innerHTML = `<section class="efb" data-feedback-card data-state="unavailable">
    <h2>Feedback</h2>
    <p class="lede">How was ${esc(ev.title || "this event")}?</p>
    <p class="efb-note">${esc(reason || "Feedback is not available yet.")}</p>
  </section>`;
  host.setAttribute("data-feedback-state", "unavailable");
}

function paintOpen(host, ev, questions, receipt) {
  const fields = questions.map(q => {
    const req = q.required ? "" : ` <span class="opt">Optional</span>`;
    if (q.type === Q_TYPE.SCALE) {
      const btns = [1, 2, 3, 4, 5].map(n =>
        `<button type="button" data-efb-choice="${esc(q.id)}" data-val="${n}" aria-pressed="false">${n}</button>`).join("");
      return `<div class="efb-q" data-efb-q="${esc(q.id)}" data-type="${q.type}" data-required="${q.required ? "1" : "0"}">
        <b>${esc(q.prompt)}${req}</b><div class="efb-scale">${btns}</div></div>`;
    }
    if (q.type === Q_TYPE.YESNO) {
      return `<div class="efb-q" data-efb-q="${esc(q.id)}" data-type="${q.type}" data-required="${q.required ? "1" : "0"}">
        <b>${esc(q.prompt)}${req}</b>
        <div class="efb-yn">
          <button type="button" data-efb-choice="${esc(q.id)}" data-val="yes" aria-pressed="false">Yes</button>
          <button type="button" data-efb-choice="${esc(q.id)}" data-val="no" aria-pressed="false">No</button>
        </div></div>`;
    }
    return `<div class="efb-q" data-efb-q="${esc(q.id)}" data-type="${q.type}" data-required="${q.required ? "1" : "0"}">
      <b>${esc(q.prompt)}${req}</b>
      <textarea data-efb-text="${esc(q.id)}" maxlength="2000" rows="3" autocomplete="off"></textarea></div>`;
  }).join("");

  host.innerHTML = `<section class="efb" data-feedback-card data-state="open">
    <h2>Feedback</h2>
    <p class="lede">How was ${esc(ev.title || "this event")}?</p>
    <form data-efb-form novalidate>${fields}
      <button class="efb-go" type="submit">Submit feedback</button>
      <p class="efb-note">One response for this event. You can send it once.</p>
      <p class="efb-err" data-efb-err hidden></p>
    </form>
  </section>`;
  host.setAttribute("data-feedback-state", "open");

  host.addEventListener("click", e => {
    const b = e.target.closest("[data-efb-choice]");
    if (!b) return;
    const id = b.dataset.efbChoice;
    $$(`[data-efb-choice="${id}"]`, host).forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
  });

  $("[data-efb-form]", host)?.addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("[data-efb-err]", host);
    const show = m => { if (err) { err.textContent = m; err.hidden = !m; } };
    show("");
    const answers = {};
    for (const q of questions) {
      const wrap = $(`[data-efb-q="${q.id}"]`, host);
      let val = "";
      if (q.type === Q_TYPE.SHORT) val = $(`[data-efb-text="${q.id}"]`, wrap)?.value?.trim() || "";
      else val = $(`[data-efb-choice="${q.id}"][aria-pressed="true"]`, wrap)?.dataset.val || "";
      if (q.required && !val) {
        show("Please answer the required questions before sending.");
        return;
      }
      if (!val) continue; // optional blank: omit the key
      if (q.type === Q_TYPE.SHORT) {
        if (val.length > 2000) {
          show("A short answer can be at most 2,000 characters.");
          return;
        }
        answers[q.id] = val;
        continue;
      }
      answers[q.id] = q.type === Q_TYPE.SCALE ? Number(val) : val;
    }
    const btn = $(".efb-go", host);
    if (btn) btn.disabled = true;
    try {
      await submitFeedbackResponse(ev.id, receipt.registrationId, answers);
      paintSent(host, ev);
    } catch (ex) {
      if (btn) btn.disabled = false;
      if (ex?.code === "already-exists" || ex?.code === "permission-denied") {
        show("Feedback could not be stored. Either a response already exists for this registration, or storage refused the write. Nothing new was sent.");
        return;
      }
      show(`Could not send feedback: ${ex?.message || ex}. Nothing was stored.`);
    }
  });
}

/* ------------------------------------------------ admin question list */

export function questionRowHtml(q, { typeLocked = false } = {}) {
  const type = Q_TYPE_LABEL[q.type] || q.type;
  const archived = q.active === false;
  return `<div class="fq${archived ? " archived" : ""}" data-fq draggable="${archived ? "false" : "true"}"
      data-fq-id="${esc(q.id || "")}" data-fq-key="${esc(q.questionKey)}"${archived ? " hidden" : ""}>
    <button type="button" class="fq-handle" data-fq-handle title="Drag to reorder" aria-label="Drag to reorder">⋮⋮</button>
    <div class="fq-main">
      <b data-fq-prompt>${esc(q.prompt)}</b>
      <div class="fq-meta">
        <span class="fq-type">${esc(type)}</span>
        <span class="fq-req ${q.required ? "on" : ""}">${q.required ? "Required" : "Optional"}</span>
      </div>
    </div>
    <button type="button" class="btn btn-ghost btn-sm" data-fq-edit>Edit</button>
    <div class="fq-edit" hidden>
      <div class="f"><label>Question</label>
        <input data-fq-prompt-in maxlength="200" value="${esc(q.prompt)}"></div>
      <div class="frow">
        <div class="f"><label>Type</label>
          <select data-fq-type${typeLocked ? " disabled" : ""}>
            <option value="${Q_TYPE.SCALE}"${q.type === Q_TYPE.SCALE ? " selected" : ""}>1–5</option>
            <option value="${Q_TYPE.YESNO}"${q.type === Q_TYPE.YESNO ? " selected" : ""}>Yes / No</option>
            <option value="${Q_TYPE.SHORT}"${q.type === Q_TYPE.SHORT ? " selected" : ""}>Short text</option>
          </select>
          ${typeLocked ? `<p class="note" style="margin:8px 0 0">Type is locked because an answer cites this question. Archive it and add a new key to change type.</p>` : ""}</div>
        <div class="f"><label>Required</label>
          <select data-fq-req>
            <option value="1"${q.required ? " selected" : ""}>Required</option>
            <option value="0"${q.required ? "" : " selected"}>Optional</option>
          </select></div>
      </div>
      <div class="dacts">
        <button type="button" class="btn btn-ghost btn-sm" data-fq-done>Done</button>
        <button type="button" class="btn btn-ghost btn-sm danger" data-fq-rm>Remove</button>
      </div>
    </div>
  </div>`;
}

export function readQuestionsFrom(host) {
  return $$("[data-fq]", host).filter(row => !row.hidden).map((row, i) => ({
    id: row.dataset.fqId || "",
    questionKey: row.dataset.fqKey,
    prompt: $("[data-fq-prompt-in]", row)?.value || $("[data-fq-prompt]", row)?.textContent,
    type: $("[data-fq-type]", row)?.value || Q_TYPE.SHORT,
    required: $("[data-fq-req]", row)?.value !== "0",
    active: true,
    order: i,
  }));
}

export function bindQuestionList(host) {
  if (!host || host.dataset.fqBound) return;
  host.dataset.fqBound = "1";
  host.addEventListener("click", e => {
    const row = e.target.closest("[data-fq]");
    if (!row) return;
    if (e.target.closest("[data-fq-edit]")) {
      const box = $(".fq-edit", row);
      if (box) box.hidden = !box.hidden;
      return;
    }
    if (e.target.closest("[data-fq-done]")) {
      const prompt = $("[data-fq-prompt-in]", row)?.value?.trim() || "";
      const type = $("[data-fq-type]", row)?.value;
      const req = $("[data-fq-req]", row)?.value !== "0";
      const t = $("[data-fq-prompt]", row);
      if (t) t.textContent = prompt || t.textContent;
      const ty = $(".fq-type", row);
      if (ty) ty.textContent = Q_TYPE_LABEL[type] || type;
      const rq = $(".fq-req", row);
      if (rq) { rq.textContent = req ? "Required" : "Optional"; rq.classList.toggle("on", req); }
      const box = $(".fq-edit", row);
      if (box) box.hidden = true;
      return;
    }
    if (e.target.closest("[data-fq-rm]")) {
      row.hidden = true;
      row.dataset.fqRemoved = "1";
      return;
    }
  });

  let drag = null;
  host.addEventListener("dragstart", e => {
    const row = e.target.closest("[data-fq]");
    if (!row || row.hidden) return;
    drag = row;
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", row.dataset.fqKey || ""); } catch { /* */ }
  });
  host.addEventListener("dragend", () => {
    if (drag) drag.classList.remove("dragging");
    drag = null;
    $$(".drag-over", host).forEach(el => el.classList.remove("drag-over"));
  });
  host.addEventListener("dragover", e => {
    e.preventDefault();
    const over = e.target.closest("[data-fq]");
    if (!over || over === drag || over.hidden) return;
    $$("[data-fq]", host).forEach(el => el.classList.toggle("drag-over", el === over));
  });
  host.addEventListener("drop", e => {
    e.preventDefault();
    const over = e.target.closest("[data-fq]");
    if (!drag || !over || drag === over || over.hidden) return;
    const rect = over.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    host.insertBefore(drag, before ? over : over.nextSibling);
    over.classList.remove("drag-over");
  });
}

export function statCard(label, cell, hint) {
  const v = figureText(cell);
  const note = cell?.live ? (hint || "") : (figureNote(cell) || "not available");
  return `<div class="rstat${cell?.live ? "" : " stub"}">
    <div class="k">${esc(label)}</div>
    <div class="v">${esc(v)}</div>
    ${note ? `<div class="s">${esc(note)}</div>` : ""}
  </div>`;
}

export function notMeasuredBox(copy) {
  return `<div class="r-gap">${copy}</div>`;
}

export function honestyBanner(text) {
  return `<div class="banner r-honest">${esc(text)}</div>`;
}

export { eventDateTimeLine, eventStatusShort };
