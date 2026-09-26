/* PAAIPE admin — Telemetry. Fleet-wide offline rate from the daily rollup,
   read through the deployed telemetryReport Cloud Function. Aggregate only:
   this page never receives or shows a device id or any per-member data. */
import { currentAgent, isAdminNow, signOutNow } from "/assets/js/paaipe-firebase.js";
import { renderAdminNav, renderAdminTop, renderCrumbs } from "/assets/js/paaipe-admin.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const URL_KEY = "paaipe-admin-telemetry-url";
let ME = "";

function flash(msg, good = false) {
  const el = $("[data-flash]");
  if (!el) return;
  el.textContent = msg; el.hidden = !msg;
  el.classList.toggle("ok", !!good);
}

const pct = n => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);
const num = n => Number(n || 0).toLocaleString();

function renderEmpty(msg) {
  $("[data-tel-body]").innerHTML = `<div class="empty">${esc(msg)}</div>`;
}

function renderReport(report) {
  const days = Array.isArray(report?.days) ? report.days : [];
  const totals = report?.totals || {};
  const overall = report?.offlineRate;
  const attempts = num(totals.write_success) + " ok · " + num(totals.write_queued) +
    " queued · " + num(totals.write_failure) + " failed";

  const cards = `
    <div class="frow" style="gap:12px;flex-wrap:wrap">
      <section class="card" style="flex:1;min-width:180px">
        <div class="hd"><h2>Offline rate</h2></div>
        <p style="font-size:34px;font-weight:800;margin:4px 0">${pct(overall)}</p>
        <p class="note" style="margin:0">Share of registration writes that were queued offline or
          failed, across all reported days.</p>
      </section>
      <section class="card" style="flex:1;min-width:180px">
        <div class="hd"><h2>Devices reporting</h2></div>
        <p style="font-size:34px;font-weight:800;margin:4px 0">${num(totals.devices)}</p>
        <p class="note" style="margin:0">Anonymous device check-ins summed over the window.</p>
      </section>
      <section class="card" style="flex:1;min-width:180px">
        <div class="hd"><h2>Write attempts</h2></div>
        <p style="font-size:16px;font-weight:700;margin:8px 0">${attempts}</p>
        <p class="note" style="margin:0">Cancels: ${num(totals.cancel_success)} ok ·
          ${num(totals.cancel_failure)} failed.</p>
      </section>
    </div>`;

  const rows = days.length
    ? days.map(d => {
        const r = d.offlineRate;
        const w = r == null ? 0 : Math.round(r * 100);
        const tone = r == null ? "#94a3b8" : r >= 0.25 ? "#dc2626" : r >= 0.1 ? "#d97706" : "#16a34a";
        return `<tr>
          <td><b>${esc(d.date)}</b></td>
          <td style="min-width:160px">
            <div style="background:#eef2f7;border-radius:999px;height:12px;overflow:hidden">
              <div style="width:${w}%;height:100%;background:${tone}"></div>
            </div>
          </td>
          <td class="num">${pct(r)}</td>
          <td class="num">${num(d.devices)}</td>
          <td class="num">${num(d.write_success)}</td>
          <td class="num">${num(d.write_queued)}</td>
          <td class="num">${num(d.write_failure)}</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="7" class="empty">No telemetry has been recorded yet.</td></tr>`;

  $("[data-tel-body]").innerHTML = `
    ${cards}
    <div class="tbl" style="margin-top:16px"><table class="card" style="padding:8px 12px">
      <thead><tr>
        <th>Day</th><th>Offline rate</th><th>Rate</th><th>Devices</th><th>OK</th><th>Queued</th><th>Failed</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="note">A day with no write attempts shows “—”, not 0%, so an idle day is never read as a
      perfect day. Bars turn amber at 10% and red at 25% offline.</p>`;
}

async function loadReport() {
  const url = ($("[data-tel-url]").value || "").trim();
  if (!url) { flash("Paste the telemetryReport function URL first."); return; }
  if (!/^https?:\/\//i.test(url)) { flash("That does not look like a URL."); return; }
  localStorage.setItem(URL_KEY, url);
  flash("");
  renderEmpty("Loading…");
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderReport(data);
    flash("Report loaded.", true);
  } catch (ex) {
    renderEmpty("The report could not be loaded. This is not “no telemetry” — the endpoint did not answer.");
    flash(`Could not reach the report endpoint: ${ex?.message || ex}. Is telemetryReport deployed?`);
  }
}

(async function () {
  if (!$("[data-admin-telemetry]")) return;
  renderAdminNav("admin-telemetry.html");
  let me = null;
  try { me = await currentAgent(); } catch { me = null; }
  if (!me) { location.replace("admin.html"); return; }
  let ok = false;
  try { ok = await isAdminNow(); }
  catch {
    flash("PAAIPE could not be reached.");
    return;
  }
  if (!ok) { await signOutNow().catch(() => {}); location.replace("admin.html?denied=1"); return; }
  ME = me.email;
  renderAdminTop({ title: "Telemetry", subtitle: "Fleet-wide offline rate.", email: ME });
  renderCrumbs([["Dashboard", "admin.html"], "Telemetry"]);

  const saved = localStorage.getItem(URL_KEY) || "";
  if (saved) $("[data-tel-url]").value = saved;

  document.addEventListener("click", e => {
    if (e.target.closest("[data-admin-signout]")) {
      e.preventDefault(); signOutNow().catch(() => {}).then(() => location.replace("admin.html"));
    }
    if (e.target.closest("[data-tel-load]")) return loadReport();
    if (e.target.closest("[data-tel-clear]")) {
      localStorage.removeItem(URL_KEY);
      $("[data-tel-url]").value = "";
      renderEmpty("Set the report endpoint above to load the fleet-wide offline rate.");
      flash("Saved endpoint cleared.", true);
    }
  });

  if (saved) loadReport();
})();
