/**
 * Pure, side-effect-free decision logic for the PAAIPE Cloud Functions.
 *
 * The trigger handlers in index.js are bound to the named `paaipe` Firestore
 * database, which the local emulator cannot serve (it only serves the default
 * database), so an end-to-end trigger test would never fire here. Keeping the
 * decisions — who gets a confirmation email, whether a queued mail row should be
 * sent again, how counts are tallied, how a mail row renders — in this
 * dependency-free module lets them be unit-tested directly and reused by the
 * handlers unchanged.
 */

/**
 * Whether a newly-created registration row should trigger a confirmation email.
 * New registrations have no status yet (or status:'registered'); a cancelled or
 * otherwise non-'registered' row must never produce a "you're registered" mail,
 * and a row with no email address cannot be mailed at all.
 */
export function shouldQueueRegistrationEmail(reg) {
  if (!reg || typeof reg !== "object") return false;
  if (reg.status && reg.status !== "registered") return false;
  if (!reg.email) return false;
  return true;
}

/** Build the paaipe_mail_queue payload for a registration (minus timestamps). */
export function buildRegistrationMail(reg, registrationId) {
  return {
    to: reg.email,
    template: "event-registered",
    data: {
      name: reg.full_name || "there",
      event: reg.event || "the event",
      eventId: reg.eventId || "",
      registrationId,
    },
    sent: false,
  };
}

/**
 * Whether a queued mail row should be sent. Idempotent: a row already marked
 * sent must never be sent again, even if the trigger fires more than once.
 */
export function shouldSendMailRow(row) {
  return Boolean(row) && row.sent !== true;
}

export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

/** Render a queued row into { subject, html }, or null if unknown template. */
export function renderMail(row) {
  const data = (row && row.data) || {};
  if (row && row.template === "event-registered") {
    const name = escapeHtml(data.name || "there");
    const eventName = escapeHtml(data.event || "the event");
    return {
      subject: `You're registered for ${data.event || "a PAAIPE event"}`,
      html: `<p>Hi ${name},</p>
<p>You're registered for <strong>${eventName}</strong>. Your ticket and QR code are in the PAAIPE app under Events.</p>
<p>We'll email you again with joining details closer to the date.</p>
<p>— PAAIPE</p>`,
    };
  }
  if (row && row.template === "agent-confirmed") {
    const name = escapeHtml(data.name || "there");
    const agentNumber = escapeHtml(data.agentNumber || "");
    return {
      subject: "Welcome — you're a confirmed PAAIPE Agent",
      html: `<p>Hi ${name},</p>
<p>Your PAAIPE membership is confirmed. Your Agent number is <strong>${agentNumber}</strong>.</p>
<p>— PAAIPE</p>`,
    };
  }
  // A row that carries its own subject/html can still be sent generically.
  if (row && typeof row.subject === "string" && typeof row.html === "string") {
    return { subject: row.subject, html: row.html };
  }
  return null;
}

/**
 * Tally per-event registered counts from raw registration rows. Cancelled rows
 * and rows without an eventId are ignored. Returns aggregate numbers only, never
 * a registrant's row (RA 10173).
 */
export function tallyRegistrationCounts(rows) {
  const counts = {};
  let total = 0;
  for (const d of rows || []) {
    if (!d || d.status === "cancelled") continue;
    const eventId = typeof d.eventId === "string" ? d.eventId : "";
    if (!eventId) continue;
    counts[eventId] = (counts[eventId] || 0) + 1;
    total += 1;
  }
  return { counts, total };
}

const TELEMETRY_COUNTERS = [
  "write_success",
  "write_failure",
  "write_queued",
  "queue_flush_settled",
  "cancel_success",
  "cancel_failure",
];

function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Share of registration write attempts that did not land immediately — i.e.
 * were queued offline or failed — out of all attempts. Returns null when there
 * were no attempts, so callers can show "no data" rather than a misleading 0%.
 */
export function offlineRate(counters) {
  const c = counters || {};
  const queued = toCount(c.write_queued);
  const failed = toCount(c.write_failure);
  const success = toCount(c.write_success);
  const attempts = queued + failed + success;
  if (attempts === 0) return null;
  return (queued + failed) / attempts;
}

/**
 * Build an aggregate, privacy-safe telemetry report from the daily rollup docs
 * (each shaped { id: 'YYYY-MM-DD', devices, write_success, ... }). Returns only
 * summed counters and derived rates — never anything that identifies a device or
 * member (RA 10173). Days are sorted newest-first.
 */
export function buildTelemetryReport(docs) {
  const days = (docs || [])
    .filter((d) => d && typeof d.id === "string")
    .map((d) => {
      const day = { date: d.id, devices: toCount(d.devices) };
      for (const key of TELEMETRY_COUNTERS) day[key] = toCount(d[key]);
      day.offlineRate = offlineRate(d);
      return day;
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const totals = { devices: 0 };
  for (const key of TELEMETRY_COUNTERS) totals[key] = 0;
  for (const day of days) {
    totals.devices += day.devices;
    for (const key of TELEMETRY_COUNTERS) totals[key] += day[key];
  }
  return { days, totals, offlineRate: offlineRate(totals) };
}
