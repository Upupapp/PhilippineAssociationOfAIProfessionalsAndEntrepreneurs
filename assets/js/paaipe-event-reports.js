/* PAAIPE admin — report surfaces (lean event-tab + Reports area).
 *
 * Live queries only. A missing source is named, never filled with a mock
 * figure. Waitlist, attendance, watch time and revenue have no source. */
import {
  listEventSponsors, listPartnerApplicationsFor, listAllRegistrations,
} from "/assets/js/paaipe-events-data.js";
import {
  listFeedbackQuestions, listFeedbackResponses, buildEventReport,
  figureText, figureNote, statCard, honestyBanner, notMeasuredBox,
  answerDisplay, submittedWhen, openReportExport, esc,
} from "/assets/js/paaipe-feedback.js";

export async function loadReportBundle(ev) {
  const settled = await Promise.allSettled([
    listAllRegistrations(),
    listEventSponsors(ev.id, { asAdmin: true }),
    listPartnerApplicationsFor(ev.id),
    listFeedbackQuestions(ev.id),
    listFeedbackResponses(ev.id),
  ]);
  const take = (i, reason) => {
    const s = settled[i];
    if (s.status === "fulfilled") return s.value;
    return Object.assign(new Error(s.reason?.message || reason), { failed: true, reason: s.reason?.message || reason });
  };
  const regs = take(0, "Registrations could not be read.");
  const sponsors = take(1, "Partners could not be read.");
  const apps = take(2, "Partner applications could not be read.");
  const questions = take(3, "Questions could not be read.");
  const feedback = take(4, "Feedback responses could not be read.");
  return {
    report: buildEventReport(ev, {
      regs: regs.failed ? [] : regs,
      regsOk: !regs.failed,
      regsReason: regs.failed ? regs.reason : "",
      sponsors: sponsors.failed ? [] : sponsors,
      sponsorsOk: !sponsors.failed,
      sponsorsReason: sponsors.failed ? sponsors.reason : "",
      apps: apps.failed ? [] : apps,
      appsOk: !apps.failed,
      appsReason: apps.failed ? apps.reason : "",
      questions: questions.failed ? { ok: false, rows: [], reason: questions.reason } : questions,
      feedback: feedback.failed ? { ok: false, rows: [], reason: feedback.reason } : feedback,
    }),
  };
}

function anyMissing(report) {
  return [report.registrations, report.feedback, report.partners, report.partnerApplications, report.responseRate]
    .some(c => c && !c.live);
}

export function leanReportHtml(report) {
  const missing = anyMissing(report);
  const rows = report.breakdown.live
    ? report.breakdown.value.map(b => {
        const bar = b.type === "1-5" && b.average != null
          ? `<div class="bar"><i style="width:${Math.round(b.fill * 100)}%"></i></div>` : "";
        return `<tr><td>${esc(b.prompt.replace(/\?$/, "") || b.prompt)}</td>
          <td><b>${esc(b.label)}</b>${bar}</td></tr>`;
      }).join("")
    : `<tr><td colspan="2" class="empty">${esc(figureNote(report.breakdown) || "No feedback breakdown yet.")}</td></tr>`;

  const n = report.feedback.live ? `${figureText(report.feedback)} response${report.feedback.value === 1 ? "" : "s"}` : "—";

  return `${missing ? honestyBanner("Live counts only. A figure that cannot be read is marked as not available — never filled in.") : ""}
    <div class="rstats">
      ${statCard("Status", report.status)}
      ${statCard("Registrations", report.registrations, report.registrations.live ? "from Registrations" : "")}
      ${statCard("Feedback responses", report.feedback, report.feedback.live ? "from Feedback" : "")}
      ${statCard("Partners on this event", report.partners, report.partners.live ? "from Event sponsors" : "")}
    </div>
    <div class="r-two" style="margin-top:14px">
      <section class="card">
        <div class="hd"><h2>Feedback</h2><span class="count">${esc(n)}</span></div>
        <div class="tbl bkdown"><table>
          <thead><tr><th>Question</th><th>Breakdown</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </section>
      <section class="card">
        <div class="hd"><h2>Not measured</h2></div>
        ${notMeasuredBox(`<b>Attendance, watch time, and revenue stay off this tab.</b>
          No source for them yet. This lean report only uses registrations, event
          status, partners, and feedback.`)}
      </section>
    </div>`;
}

export function fullDashboardHtml(report) {
  const missing = anyMissing(report);
  const mixRows = [
    ["Registered", report.registered],
    ["Waitlist", report.waitlist],
    ["Cancelled", report.cancelled],
  ].map(([label, cell]) => {
    const fig = figureText(cell);
    const note = cell.live ? "" : figureNote(cell);
    return `<tr>
      <td>${esc(label)}</td>
      <td>${esc(fig)}${note && fig !== note ? ` <small>${esc(note)}</small>` : ""}</td>
    </tr>`;
  }).join("");

  const shortRows = report.breakdown.live
    ? report.breakdown.value.map(b => `<tr><td>${esc(b.prompt.replace(/\?$/, "") || b.prompt)}</td>
        <td>${esc(b.label)}</td></tr>`).join("")
    : `<tr><td colspan="2" class="empty">${esc(figureNote(report.breakdown) || "No feedback yet.")}</td></tr>`;

  return `${missing ? honestyBanner("Live counts only. A figure that cannot be read is marked as not available — never filled in.") : ""}
    <div class="rstats">
      ${statCard("Registrations", report.registrations, report.registrations.live ? "from Registrations" : "")}
      ${statCard("Partner applications", report.partnerApplications, report.partnerApplications.live ? "from Partner applications" : "")}
      ${statCard("Partners on this event", report.partners, report.partners.live ? "from Event sponsors" : "")}
      ${statCard("Feedback responses", report.feedback, report.feedback.live ? "once feedback exists" : "")}
      ${statCard("Response rate", report.responseRate, report.responseRate.live ? "responses / joined" : "")}
    </div>
    <div class="r-two" style="margin-top:14px">
      <section class="card">
        <div class="hd"><h2>Registration status</h2></div>
        <div class="tbl"><table><tbody>${mixRows}</tbody></table></div>
      </section>
      <section class="card">
        <div class="hd"><h2>Feedback, short</h2>
          <a href="#tab=feedback">Open the Feedback tab</a></div>
        <div class="tbl"><table><tbody>${shortRows}</tbody></table></div>
      </section>
    </div>
    ${notMeasuredBox(`<b>Not measured yet.</b> Attendance, watch time, and revenue have no source.
      They are named here so the gap is visible, not drawn as a chart.`)}`;
}

export function feedbackTabHtml(report) {
  const qs = report.questions.live ? report.questions.value : [];
  const missing = !report.responses.live;
  if (missing) {
    return `${honestyBanner("Live counts only. A figure that cannot be read is marked as not available — never filled in.")}
      <section class="card"><p class="note" style="margin-top:0">${esc(figureNote(report.responses))}</p></section>`;
  }
  const rows = report.responses.value;
  if (!rows.length) {
    return `<section class="card"><p class="note" style="margin-top:0">No one has sent feedback for this event yet.
      Example quotes are not shown.</p></section>`;
  }
  const head = ["When", ...qs.map(q => q.prompt.replace(/\?$/, "") || q.prompt)];
  const body = rows.map(r => `<tr>
      <td>${esc(submittedWhen(r) || "—")}</td>
      ${qs.map(q => `<td>${esc(answerDisplay(q, r.answers))}</td>`).join("")}
    </tr>`).join("");
  const breakdown = report.breakdown.live
    ? `<p class="note">${report.breakdown.value.map(b => `${esc(b.prompt)} — ${esc(b.label)}`).join(" · ")}</p>`
    : "";
  return `${honestyBanner("One row per joined attendee who responded. One response per registration.")}
    <section class="card">
      <div class="tbl"><table>
        <thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${body}</tbody>
      </table></div>
      ${breakdown}
    </section>`;
}

export function exportReport(ev, report, context) {
  return openReportExport({ ev, report, context });
}
