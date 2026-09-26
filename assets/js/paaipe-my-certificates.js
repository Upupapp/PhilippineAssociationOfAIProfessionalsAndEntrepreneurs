/* My Certificates — Agent Portal.
 *
 * URL scheme (URL-sweep):
 *   portal-my-certificates.html
 *   #q=<search>                  omitted when empty
 *   #sort=date_desc|date_asc|title_asc|title_desc
 *                                date_desc is default and omitted
 *   #year=2026                   year chip → API year=
 *   #series=ai-exchange          series chip; client-side only (no series query)
 *   #collapsed=2026,2025         accordion groups (default expanded)
 *
 * API (Clarence, exact):
 *   GET /v1/me/certificates?q=&year=&sort=   Bearer
 *   Card: eventTitle, eventDate, year, series, pdfUrl, pngUrl,
 *         issuedAt, emailedAt, id?, eventId?
 *   Email-only issued rows (eventId / emailedAt, no pdf/png) stay as
 *   cards. emailedAt is shown so the card is not a blank issued stub.
 *   Prod is 404 until Paul deploys — honest empty, no invented rows.
 *   Local smoke: ?paaipe_api=http://127.0.0.1:8080
 *
 * Download → pdfUrl on media.paaipe.org.
 * View → pngUrl or pdfUrl on media.paaipe.org.
 * Email me → POST /v1/me/events/{eventId}/certificate/email when eventId
 * is on the card; otherwise honest not-wired.
 */
import { currentAgent, idTokenForRequest } from "/assets/js/paaipe-firebase.js";
import {
  getMeCertificates,
  postMeEventCertificateEmail,
  mediaFileUrl,
  ME_CERTIFICATES_SORTS,
} from "/assets/js/paaipe-api.js";
import { readHash, writeHash, onViewChange } from "/assets/js/paaipe-view-url.js";
import { bindCollapse, collapseChevron, setCollapsed } from "/assets/js/paaipe-collapse.js";

const $ = (s, r = document) => r.querySelector(s);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const CERT_SORTS = ME_CERTIFICATES_SORTS;
const SORT_SET = new Set(CERT_SORTS);
const SORT_LABEL = {
  date_desc: "Date · newest",
  date_asc: "Date · oldest",
  title_asc: "Event name · A–Z",
  title_desc: "Event name · Z–A",
};

export function seriesKey(series) {
  return String(series || "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function cardYear(card) {
  if (card?.year) return String(card.year);
  const raw = String(card?.eventDate || card?.issuedAt || card?.emailedAt || "");
  const m = raw.match(/\d{4}/);
  return m ? m[0] : "";
}

export function formatCertDate(value) {
  if (value == null || value === "") return "";
  const s = String(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const d = iso
    ? new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00`)
    : new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function seriesLine(card) {
  const series = card?.series;
  const raw = String(card?.eventDate || card?.issuedAt || card?.emailedAt || "");
  const iso = /^(\d{4})-(\d{2})/.exec(raw);
  let monthYear = "";
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-01T12:00:00`);
    if (!isNaN(d)) {
      monthYear = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
  }
  if (series && monthYear) return `${series} · ${monthYear}`;
  if (series) return series;
  return monthYear;
}

export function filterBySeries(items, key) {
  if (!key) return items;
  return items.filter(c => seriesKey(c.series) === key);
}

export function groupByYear(items) {
  const map = new Map();
  for (const card of items) {
    const y = cardYear(card) || "Undated";
    if (!map.has(y)) map.set(y, []);
    map.get(y).push(card);
  }
  const keys = [...map.keys()].sort((a, b) => {
    if (a === "Undated") return 1;
    if (b === "Undated") return -1;
    return b.localeCompare(a);
  });
  return keys.map(year => ({ year, items: map.get(year) }));
}

export function chipModel(items) {
  const years = new Map();
  const series = new Map();
  for (const card of items) {
    const y = cardYear(card);
    if (y) years.set(y, (years.get(y) || 0) + 1);
    const label = card.series;
    const key = seriesKey(label);
    if (key) {
      const cur = series.get(key) || { key, label, n: 0 };
      cur.n += 1;
      series.set(key, cur);
    }
  }
  return {
    total: items.length,
    years: [...years.entries()].sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, n]) => ({ year, n })),
    series: [...series.values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export function parseCollapsed(raw) {
  return String(raw || "").split(",").map(s => s.trim()).filter(Boolean);
}

export function viewFromHash(hash = typeof location !== "undefined" ? location.hash : "") {
  const v = typeof hash === "object" && hash ? hash : readHash(hash);
  const sort = SORT_SET.has(v.sort) ? v.sort : "date_desc";
  const year = String(v.year || "").trim();
  const series = String(v.series || "").trim();
  return {
    q: String(v.q || "").trim(),
    sort,
    year,
    series,
    collapsed: parseCollapsed(v.collapsed),
  };
}

export function hashParamsFromView(view) {
  const params = {};
  if (view.q) params.q = view.q;
  if (view.sort && view.sort !== "date_desc") params.sort = view.sort;
  if (view.year) params.year = view.year;
  if (view.series) params.series = view.series;
  if (view.collapsed?.length) params.collapsed = view.collapsed.join(",");
  return params;
}

function thumbHtml(card) {
  const src = mediaFileUrl(card.pngUrl) || "";
  const img = src
    ? `<img src="${esc(src)}" alt="Certificate preview" data-mc-thumb>`
    : "";
  return `<div class="mc-thumb">${img}<span class="seal">CERTIFICATE OF PARTICIPATION</span></div>`;
}

function cardActions(card) {
  const pdf = mediaFileUrl(card.pdfUrl);
  const view = mediaFileUrl(card.pngUrl) || pdf;
  const dl = pdf
    ? `<a class="btn btn-gold" data-mc-download href="${esc(pdf)}" target="_blank" rel="noopener">Download PDF</a>`
    : `<button type="button" class="btn btn-ghost" data-mc-download disabled
      title="No media.paaipe.org PDF URL was returned. Download stays disabled.">Download PDF</button>`;
  const email = card.eventId
    ? `<button type="button" class="btn btn-ghost" data-mc-email data-event-id="${esc(card.eventId)}">Email me</button>`
    : `<button type="button" class="btn btn-ghost" data-mc-email disabled
      title="Email is not wired for this card — no eventId on the payload.">Email me</button>`;
  const vw = view
    ? `<a class="btn btn-ghost" data-mc-view href="${esc(view)}" target="_blank" rel="noopener">View</a>`
    : `<button type="button" class="btn btn-ghost" data-mc-view disabled
      title="No media.paaipe.org file URL was returned.">View</button>`;
  return `<div class="mc-acts">${dl}${email}${vw}</div>`;
}

export function cardHtml(card) {
  const eventDate = formatCertDate(card.eventDate);
  const issued = formatCertDate(card.issuedAt);
  const emailed = formatCertDate(card.emailedAt);
  const line = seriesLine(card);
  return `<article class="mc-card" data-mc-card
    data-year="${esc(cardYear(card))}" data-series="${esc(seriesKey(card.series))}"
    data-event-id="${esc(card.eventId)}" data-id="${esc(card.id)}">
    ${thumbHtml(card)}
    <div class="mc-body">
      ${line ? `<p class="mc-series">${esc(line)}</p>` : ""}
      <h2>${esc(card.eventTitle || "Certificate of Participation")}</h2>
      <div class="mc-row">
        <span class="mc-pill">Issued</span>
        ${eventDate ? `<span class="mc-date">Event · ${esc(eventDate)}</span>` : ""}
        ${issued ? `<span class="mc-date">Issued · ${esc(issued)}</span>` : ""}
        ${emailed ? `<span class="mc-date" data-mc-emailed>Emailed · ${esc(emailed)}</span>` : ""}
      </div>
      <p class="mc-msg" data-mc-msg hidden></p>
    </div>
    ${cardActions(card)}
  </article>`;
}

export function emptyHtml({ notWired = false } = {}) {
  const copy = notWired
    ? "When you register for an AI Exchange event and submit feedback, your Certificate of Participation will show up here."
    : "When you register for an AI Exchange event and submit feedback, your Certificate of Participation will show up here.";
  return `<div class="mc-empty" data-mc-empty>
    <h2>No certificates yet</h2>
    <p>${copy}</p>
    <a class="btn btn-gold" href="portal-events.html">Browse upcoming events</a>
  </div>`;
}

export function holdNote({ status, live, filtered = false } = {}) {
  if (status === 404 || live === false) {
    return "The certificate list (GET /v1/me/certificates) is not on this host yet (404). Certificates already issued stay on Event Details. Nothing was assumed issued.";
  }
  if (status === 401) {
    return "Sign-in is required to load certificates.";
  }
  if (filtered) return "";
  return "";
}

function chipsHtml(model, view) {
  const onAll = !view.year && !view.series;
  const parts = [
    `<button type="button" class="mc-chip${onAll ? " on" : ""}" data-filter="all" aria-pressed="${onAll ? "true" : "false"}">All <span class="n">${model.total}</span></button>`,
  ];
  for (const y of model.years) {
    const on = view.year === y.year && !view.series;
    parts.push(`<button type="button" class="mc-chip${on ? " on" : ""}" data-filter="year" data-year="${esc(y.year)}" aria-pressed="${on ? "true" : "false"}">${esc(y.year)} <span class="n">${y.n}</span></button>`);
  }
  for (const s of model.series) {
    const on = view.series === s.key;
    parts.push(`<button type="button" class="mc-chip${on ? " on" : ""}" data-filter="series" data-series="${esc(s.key)}" aria-pressed="${on ? "true" : "false"}">${esc(s.label)} <span class="n">${s.n}</span></button>`);
  }
  return parts.join("");
}

function metaHtml(shown, view, { loading = false } = {}) {
  const n = shown.length;
  const noun = n === 1 ? "certificate" : "certificates";
  const sort = SORT_LABEL[view.sort] || SORT_LABEL.date_desc;
  const filtered = Boolean(view.q || view.year || view.series);
  const right = loading
    ? "Loading…"
    : filtered
      ? `Filtered · ${sort}`
      : `Showing all · sorted by date (${view.sort === "date_asc" ? "oldest first" : "newest first"})`;
  const left = loading ? "…" : `${n} ${noun}`;
  return `<b>${esc(left)}</b><span>${esc(right)}</span>`;
}

export function listHtml(items, view) {
  if (!items.length) return emptyHtml();
  const groups = groupByYear(items);
  const collapsed = new Set(view.collapsed || []);
  return groups.map(g => {
    const key = g.year;
    const isCol = collapsed.has(key);
    const n = g.items.length;
    const noun = n === 1 ? "certificate" : "certificates";
    return `<section class="mc-group paaipe-collapse${isCol ? " is-collapsed" : ""}" data-collapse data-group="${esc(key)}">
      <button type="button" class="paaipe-collapse-hd" data-collapse-hd aria-expanded="${isCol ? "false" : "true"}">
        <h3>${esc(key)} · ${n} ${noun}</h3>
        ${collapseChevron()}
      </button>
      <div class="paaipe-collapse-body mc-group-body">
        ${g.items.map(cardHtml).join("")}
      </div>
    </section>`;
  }).join("");
}

function shownItems(items, view) {
  if (view.series) return filterBySeries(items, view.series);
  return items;
}

export function paint(root, {
  items = [],
  chipItems,
  view,
  hold = "",
  loading = false,
  state = "",
} = {}) {
  if (!root) return;
  const chipsFrom = chipItems || items;
  const shown = shownItems(items, view);
  const chips = $("[data-mc-chips]", root);
  const meta = $("[data-mc-meta]", root);
  const holdEl = $("[data-mc-hold]", root);
  const list = $("[data-mc-list]", root);
  const q = $("[data-mc-q]", root);
  const sort = $("[data-mc-sort]", root);
  if (q && q.value !== view.q) q.value = view.q;
  if (sort && sort.value !== view.sort) sort.value = view.sort;
  if (chips) chips.innerHTML = chipsHtml(chipModel(chipsFrom), view);
  if (meta) meta.innerHTML = metaHtml(shown, view, { loading });
  if (holdEl) {
    holdEl.hidden = !hold;
    holdEl.textContent = hold;
  }
  if (list) list.innerHTML = loading
    ? `<p class="mc-hold">Loading certificates…</p>`
    : listHtml(shown, view);
  root.dataset.mcState = state || (loading ? "loading" : shown.length ? "list" : "empty");
  root.querySelectorAll("img[data-mc-thumb]").forEach(img => {
    img.addEventListener("error", () => img.remove());
  });
  bindCollapse(root, {
    onToggle: () => syncCollapsed(root),
  });
}

function currentViewFromDom(root) {
  const q = $("[data-mc-q]", root)?.value || "";
  const sort = $("[data-mc-sort]", root)?.value || "date_desc";
  const on = root.querySelector(".mc-chip.on");
  let year = "";
  let series = "";
  if (on?.dataset.filter === "year") year = on.dataset.year || "";
  if (on?.dataset.filter === "series") series = on.dataset.series || "";
  const collapsed = [...root.querySelectorAll("[data-group].is-collapsed")]
    .map(g => g.dataset.group).filter(Boolean);
  return viewFromHash({ q, sort, year, series, collapsed: collapsed.join(",") });
}

function syncCollapsed(root) {
  const view = { ...viewFromHash(readHash()), collapsed: [...root.querySelectorAll("[data-group].is-collapsed")]
    .map(g => g.dataset.group).filter(Boolean) };
  writeHash(hashParamsFromView(view), { push: true });
}

function writeView(view, { push = true } = {}) {
  writeHash(hashParamsFromView(view), { push });
}

async function sendEmail(root, eventId, btn) {
  const card = btn.closest("[data-mc-card]");
  const note = card?.querySelector("[data-mc-msg]");
  const show = (m, kind) => {
    if (!note) return;
    note.hidden = false;
    note.textContent = m;
    note.classList.toggle("ok", kind === "ok");
    note.classList.toggle("err", kind === "err");
  };
  if (!eventId) {
    show("Email is not wired for this card — no eventId on the payload.", "err");
    return;
  }
  btn.disabled = true;
  try {
    const token = await idTokenForRequest();
    const result = await postMeEventCertificateEmail(eventId, { token });
    const when = result?.emailedAt ? formatCertDate(result.emailedAt) : "";
    show(when
      ? `The API accepted the re-send (${when}). Inbox delivery is not wired yet — nothing was assumed delivered.`
      : "The API accepted the re-send. Inbox delivery is not wired yet — nothing was assumed delivered.", "ok");
  } catch (e) {
    btn.disabled = false;
    if (e?.status === 409) show("This certificate is not issued yet. Nothing was emailed.", "err");
    else if (e?.status === 404) show("No certificate is available to email.", "err");
    else if (e?.status === 501 || e?.status === 502) {
      show("Certificate email delivery is not wired yet. Nothing was sent.", "err");
    } else show(e?.message || "Could not email the certificate. Nothing was assumed sent.", "err");
  }
}

export async function loadCertificates(view, { token } = {}) {
  const year = view.year || "";
  return getMeCertificates({
    q: view.q,
    year,
    sort: view.sort,
    token,
  });
}

export async function initMyCertificates(root = $("[data-mc-root]")) {
  if (!root) return;
  let chipSource = [];
  let lastKey = "";
  let applying = false;

  const apply = async ({ push = false, fromHash = false } = {}) => {
    const view = fromHash ? viewFromHash(readHash()) : currentViewFromDom(root);
    if (!fromHash) writeView(view, { push });
    const token = await idTokenForRequest().catch(() => "");
    paint(root, { items: [], chipItems: chipSource, view, loading: true, state: "loading" });
    let result;
    try {
      result = await loadCertificates(view, { token });
    } catch (e) {
      const hold = e?.message || "Certificates could not be read. Nothing was assumed issued.";
      paint(root, { items: [], chipItems: chipSource, view, hold, state: "error" });
      return;
    }
    const key = `${view.q}|${view.sort}`;
    if (!view.year || key !== lastKey) {
      if (!view.year) chipSource = result.items;
      lastKey = key;
    }
    if (!view.year) chipSource = result.items;
    const hold = holdNote({
      status: result.status,
      live: result.live,
      filtered: Boolean(view.q || view.year || view.series),
    });
    const state = result.status === 404 || result.live === false
      ? "not-wired"
      : result.items.length ? "list" : "empty";
    paint(root, {
      items: result.items,
      chipItems: view.year ? (chipSource.length ? chipSource : result.items) : result.items,
      view,
      hold,
      state,
    });
    // Restore collapse from hash after paint
    for (const key of view.collapsed) {
      const g = root.querySelector(`[data-group="${CSS.escape(key)}"]`);
      if (g) setCollapsed(g, true);
    }
  };

  root.addEventListener("input", e => {
    if (!e.target.closest("[data-mc-q]")) return;
    if (applying) return;
    applying = true;
    apply({ push: false }).finally(() => { applying = false; });
  });
  root.addEventListener("change", e => {
    if (!e.target.closest("[data-mc-sort]")) return;
    apply({ push: true });
  });
  root.addEventListener("click", e => {
    const chip = e.target.closest(".mc-chip");
    if (chip) {
      const view = viewFromHash(readHash());
      view.collapsed = [];
      if (chip.dataset.filter === "all") {
        view.year = "";
        view.series = "";
      } else if (chip.dataset.filter === "year") {
        view.year = chip.dataset.year || "";
        view.series = "";
      } else if (chip.dataset.filter === "series") {
        view.series = chip.dataset.series || "";
        view.year = "";
      }
      writeView(view, { push: true });
      apply({ fromHash: true });
      return;
    }
    const email = e.target.closest("[data-mc-email]");
    if (email && !email.disabled) {
      sendEmail(root, email.dataset.eventId || "", email);
    }
  });

  onViewChange(() => apply({ fromHash: true }));
  await currentAgent().catch(() => null);
  await apply({ fromHash: true });
}

const boot = $("[data-mc-root]");
if (boot && !boot.closest("[data-mc-fixture]")) {
  initMyCertificates(boot);
}
