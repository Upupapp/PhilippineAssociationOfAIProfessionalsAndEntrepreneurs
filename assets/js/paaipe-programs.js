/* Portal Programs hub — Next Exchange from the live event records.
 *
 * The card in the hero must show a real upcoming AI Exchange, not a
 * decorative date. listEvents() is the same source the Events page and the
 * admin console read. If the query fails, whatever the HTML already says
 * stays on screen: a network fault must not blank the card.
 *
 * Status pills, waitlists and CTAs live in the markup and are left alone.
 * Nothing here invents XP, open seats, or a Mentorship band.
 */
import { listEvents, toDate, EVENT_STATUS } from "/assets/js/paaipe-events-data.js";

const $ = (s, r = document) => r.querySelector(s);

function isExchange(ev) {
  const t = `${ev?.title || ""} ${ev?.slug || ""} ${ev?.id || ""}`.toLowerCase();
  return t.includes("ai exchange") || t.includes("ai-exchange");
}

function whenOf(ev) {
  if (!ev) return null;
  const day = String(ev.date || "").slice(0, 10);
  const time = String(ev.startTime || "").trim();
  if (day) {
    const hhmm = /^\d{1,2}:\d{2}/.test(time) ? time.slice(0, 5) : "20:00";
    const d = new Date(`${day}T${hhmm}:00+08:00`);
    if (!isNaN(d)) return d;
  }
  const d = toDate(ev.date);
  return d && !isNaN(d) ? d : null;
}

export function nextUpcomingExchange(events, now = new Date()) {
  const skip = new Set([EVENT_STATUS.HELD, EVENT_STATUS.CANCELLED, EVENT_STATUS.DRAFT]);
  return (events || [])
    .filter(ev => isExchange(ev) && !skip.has(ev.status))
    .map(ev => ({ ev, when: whenOf(ev) }))
    .filter(x => x.when && x.when >= now)
    .sort((a, b) => a.when - b.when)[0] || null;
}

function formatDay(d) {
  return d.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Manila",
  }).replace(/,/g, "");
}

function clock(h, m) {
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = (h % 12) || 12;
  return `${h12}:${String(m || 0).padStart(2, "0")} ${ampm} PHT`;
}

function formatTime(ev) {
  const raw = String(ev?.startTime || "").trim();
  if (/^\d{1,2}:\d{2}/.test(raw)) {
    const [h, m] = raw.split(":").map(Number);
    return clock(h, m);
  }
  // Series cadence when the record has a date but no startTime.
  return "8:00 PM PHT";
}

function paint(card, row) {
  const day = $("[data-nx-when]", card);
  const time = $("[data-nx-time]", card);
  if (day) day.textContent = formatDay(row.when);
  if (time) time.textContent = formatTime(row.ev);
  card.hidden = false;
  card.setAttribute("data-nx-id", row.ev.id || row.ev.slug || "");
  card.setAttribute("data-nx-ready", "1");
}

(async () => {
  const card = $("[data-next-exchange]");
  if (!card) return;
  try {
    const row = nextUpcomingExchange(await listEvents());
    if (!row) { card.hidden = true; card.setAttribute("data-nx-ready", "1"); return; }
    paint(card, row);
  } catch {
    card.setAttribute("data-nx-ready", "1");
  }
})();
