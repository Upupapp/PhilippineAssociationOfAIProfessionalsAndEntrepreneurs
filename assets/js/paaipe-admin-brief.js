/* PAAIPE admin — the speaker brief.
 *
 * This is the page the data was already waiting for. Every registrant is asked
 * what they want to get out of the session and whether they have a question for
 * the speaker, and until now nobody could read a single one of those answers.
 * They are in Firestore; this puts them in front of the speaker.
 *
 * Everything here is quoted, counted or omitted. Nothing is summarised into
 * words the registrant did not write, because a brief that paraphrases is a
 * brief that can be wrong about what somebody asked.
 *
 * The mockup also showed an "AI levels" breakdown. THE FORM NEVER ASKS THAT, so
 * there is nothing to break down and the section is absent rather than invented.
 * If PAAIPE wants it, the registration form has to ask first.
 */
import {
  currentAgent, isAdminNow, signOutNow, listRegistrations, regStatusOf, REG_STATUS,
} from "/assets/js/paaipe-firebase.js";
import { renderAdminNav, renderAdminTop, renderCrumbs } from "/assets/js/paaipe-admin.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const has = v => String(v ?? "").trim() !== "";

let ALL = [], EVENT = "";

const forEvent = () => ALL.filter(r =>
  (!EVENT || r.event === EVENT) && regStatusOf(r) !== REG_STATUS.CANCELLED);

/** Counts by a field, commonest first. Blanks are counted separately and named,
 *  never folded into "other" - "12 did not say" is a fact; inventing a category
 *  for them is not. */
function mix(rows, key) {
  const out = new Map();
  let blank = 0;
  for (const r of rows) {
    const v = String(r[key] ?? "").trim();
    if (!v) { blank++; continue; }
    out.set(v, (out.get(v) || 0) + 1);
  }
  return { rows: [...out.entries()].sort((a, b) => b[1] - a[1]), blank, total: rows.length };
}

function renderMix(host, m) {
  if (!host) return;
  if (!m.rows.length) {
    host.innerHTML = `<p class="muted small">Nobody has answered this yet.</p>`;
    return;
  }
  host.innerHTML = m.rows.map(([label, n]) => `
    <div class="r"><span>${esc(label)}</span><b>${n}</b>
      <span class="bar"><i style="width:${Math.round(n / m.total * 100)}%"></i></span></div>`).join("")
    + (m.blank ? `<p class="muted small" style="margin-top:8px">${m.blank} did not say.</p>` : "");
}

/** The brief as plain text, for pasting into an email to the speaker. */
export function briefText(rows, eventName) {
  const qs = rows.filter(r => has(r.speaker_question));
  const ls = rows.filter(r => has(r.learn));
  const L = [];
  L.push(`PAAIPE speaker brief — ${eventName || "all events"}`);
  L.push(`${rows.length} registered.`);
  L.push("");
  L.push(`QUESTIONS FOR THE SPEAKER (${qs.length} of ${rows.length} asked one)`);
  L.push(qs.length ? "" : "  — none yet.");
  qs.forEach(r => {
    L.push(`  • ${String(r.speaker_question).trim()}`);
    L.push(`    — ${r.full_name || "a registrant"}${r.organization ? `, ${r.organization}` : ""}`);
  });
  L.push("");
  L.push(`WHAT THEY WANT TO GET OUT OF IT (${ls.length} of ${rows.length} answered)`);
  L.push(ls.length ? "" : "  — none yet.");
  ls.forEach(r => {
    L.push(`  • ${String(r.learn).trim()}`);
    L.push(`    — ${r.full_name || "a registrant"}${r.organization ? `, ${r.organization}` : ""}`);
  });
  return L.join("\n");
}

function quoteList(host, rows, key, countEl, label) {
  const said = rows.filter(r => has(r[key]));
  if (countEl) countEl.textContent = `${said.length} of ${rows.length} ${label}`;
  if (!host) return;
  host.innerHTML = said.length
    ? said.map(r => `<div class="qa"><p>${esc(String(r[key]).trim())}</p>
        <cite>${esc(r.full_name || "a registrant")}${r.organization ? ` · ${esc(r.organization)}` : ""}</cite></div>`).join("")
    : `<p class="muted">Nobody has answered this yet.</p>`;
}

function render() {
  const rows = forEvent();
  $("[data-total]").textContent = String(rows.length);
  $("[data-event-name]").textContent = EVENT || "All events";

  quoteList($("[data-questions]"), rows, "speaker_question", $("[data-q-count]"), "asked a question");
  quoteList($("[data-learn]"),     rows, "learn",            $("[data-l-count]"), "said what they want");
  renderMix($("[data-mix-profile]"), mix(rows, "profile"));
  renderMix($("[data-mix-org]"),     mix(rows, "organization"));

  const empty = rows.length === 0;
  $("[data-empty]").hidden = !empty;
  $("[data-body]").hidden = empty;
  document.documentElement.setAttribute("data-admin-brief", String(rows.length));
}

(async function () {
  if (!$("[data-admin-brief]")) return;
  renderAdminNav("admin-speaker-brief.html");

  let me = null;
  try { me = await currentAgent(); } catch { me = null; }
  if (!me) { location.replace("admin.html"); return; }
  let ok = false;
  try { ok = await isAdminNow(); } catch {
    $("[data-flash]").textContent = "PAAIPE could not be reached, so nothing is shown — an empty brief would read as 'nobody registered'.";
    $("[data-flash]").hidden = false;
    document.documentElement.setAttribute("data-admin-brief", "offline");
    return;
  }
  if (!ok) { await signOutNow().catch(() => {}); location.replace("admin.html?denied=1"); return; }

  renderAdminTop({ title: 'Speaker brief', subtitle: 'What the room actually asked for', email: me.email });
  renderCrumbs([["Dashboard","admin.html"],["Registrations","admin-registrations.html"],"Speaker brief"]);
  document.addEventListener("click", e => {
    if (e.target.closest("[data-admin-signout]")) {
      e.preventDefault(); signOutNow().catch(() => {}).then(() => location.replace("admin.html"));
    }
  });

  try { ALL = await listRegistrations(); }
  catch (ex) {
    $("[data-flash]").textContent = `Could not load registrations: ${ex?.message || ex}`;
    $("[data-flash]").hidden = false;
    document.documentElement.setAttribute("data-admin-brief", "error");
    return;
  }

  const events = [...new Set(ALL.map(r => r.event).filter(Boolean))].sort();
  // Default to the event of the MOST RECENT registration - the one being worked
  // on. Alphabetical order opened on whichever name happened to sort first,
  // which for PAAIPE meant September rather than the October event people are
  // registering for now.
  EVENT = (ALL[0] && ALL[0].event) || events[0] || "";
  const sel = $("[data-f-event]");
  sel.innerHTML = `<option value="">All events</option>` +
    events.map(e => `<option value="${esc(e)}"${e === EVENT ? " selected" : ""}>${esc(e)}</option>`).join("");
  sel.addEventListener("change", e => { EVENT = e.target.value; render(); });

  $("[data-copy]")?.addEventListener("click", async () => {
    const btn = $("[data-copy]"), was = btn.textContent;
    try {
      await navigator.clipboard.writeText(briefText(forEvent(), EVENT));
      btn.textContent = "Copied";
    } catch {
      // clipboard can be refused; say so rather than claim a copy that never happened
      btn.textContent = "Press Ctrl/Cmd+C";
      const ta = $("[data-fallback]");
      ta.value = briefText(forEvent(), EVENT); ta.hidden = false; ta.select();
    }
    setTimeout(() => { btn.textContent = was; }, 2200);
  });

  // Printing is a real way to make a PDF; a "Download PDF" button with no PDF
  // writer behind it would not be.
  $("[data-print]")?.addEventListener("click", () => window.print());

  render();
})();
