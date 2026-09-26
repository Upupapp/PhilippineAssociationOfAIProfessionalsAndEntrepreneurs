/**
 * Unit tests for the pure Cloud Function decision logic (functions/lib/logic.js).
 *
 * These cover the behaviour that matters for correctness and cost:
 *   - onRegistrationCreated skip logic — a cancelled/non-'registered' row or a
 *     row with no email must NOT queue a confirmation email;
 *   - onMailQueued idempotency — a row already marked sent must NOT be sent again;
 *   - mail rendering (including HTML escaping of user-supplied values);
 *   - eventRegistrationCounts tally (aggregate only, cancelled rows excluded).
 *
 * Run:  npm test    (inside functions/)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldQueueRegistrationEmail,
  buildRegistrationMail,
  shouldSendMailRow,
  renderMail,
  tallyRegistrationCounts,
} from "../lib/logic.js";

test("onRegistrationCreated skip logic", () => {
  // Queues for a fresh registration (no status) and an explicit 'registered'.
  assert.equal(shouldQueueRegistrationEmail({ email: "a@b.co" }), true);
  assert.equal(shouldQueueRegistrationEmail({ email: "a@b.co", status: "registered" }), true);
  // Skips cancelled, attended, and any other non-'registered' status.
  assert.equal(shouldQueueRegistrationEmail({ email: "a@b.co", status: "cancelled" }), false);
  assert.equal(shouldQueueRegistrationEmail({ email: "a@b.co", status: "attended" }), false);
  // Skips a row that carries no email address.
  assert.equal(shouldQueueRegistrationEmail({ status: "registered" }), false);
  assert.equal(shouldQueueRegistrationEmail({}), false);
  assert.equal(shouldQueueRegistrationEmail(null), false);
});

test("buildRegistrationMail fills the queue payload", () => {
  const row = buildRegistrationMail(
    { email: "a@b.co", full_name: "Ada", event: "AI Exchange", eventId: "e1" },
    "reg-1",
  );
  assert.equal(row.to, "a@b.co");
  assert.equal(row.template, "event-registered");
  assert.equal(row.sent, false);
  assert.deepEqual(row.data, {
    name: "Ada",
    event: "AI Exchange",
    eventId: "e1",
    registrationId: "reg-1",
  });
  // Falls back to safe defaults when fields are missing.
  const bare = buildRegistrationMail({ email: "x@y.co" }, "reg-2");
  assert.equal(bare.data.name, "there");
  assert.equal(bare.data.event, "the event");
  assert.equal(bare.data.eventId, "");
});

test("onMailQueued idempotency", () => {
  assert.equal(shouldSendMailRow({ sent: false }), true);
  assert.equal(shouldSendMailRow({}), true); // no flag yet -> send
  assert.equal(shouldSendMailRow({ sent: true }), false); // already sent -> skip
  assert.equal(shouldSendMailRow(null), false);
});

test("renderMail templates and HTML escaping", () => {
  const registered = renderMail({
    template: "event-registered",
    data: { name: "Ada", event: "AI Exchange" },
  });
  assert.match(registered.subject, /You're registered for AI Exchange/);
  assert.match(registered.html, /<strong>AI Exchange<\/strong>/);

  // User-supplied values are escaped so a queued row cannot inject markup.
  const xss = renderMail({
    template: "event-registered",
    data: { name: "<script>alert(1)</script>", event: "AI & Robots" },
  });
  assert.doesNotMatch(xss.html, /<script>/);
  assert.match(xss.html, /&lt;script&gt;/);
  assert.match(xss.html, /AI &amp; Robots/);

  const agent = renderMail({ template: "agent-confirmed", data: { name: "Ben", agentNumber: "0142" } });
  assert.match(agent.subject, /confirmed PAAIPE Agent/);
  assert.match(agent.html, /0142/);

  // A row carrying its own subject/html sends generically.
  const generic = renderMail({ subject: "Hi", html: "<p>Hi</p>" });
  assert.deepEqual(generic, { subject: "Hi", html: "<p>Hi</p>" });

  // Unknown template with nothing to render returns null (left pending).
  assert.equal(renderMail({ template: "mystery" }), null);
  assert.equal(renderMail({}), null);
});

test("tallyRegistrationCounts aggregates and excludes cancelled", () => {
  const rows = [
    { eventId: "e1", status: "registered" },
    { eventId: "e1" }, // no status counts as active
    { eventId: "e2", status: "registered" },
    { eventId: "e1", status: "cancelled" }, // excluded
    { status: "registered" }, // no eventId -> ignored
    null, // ignored
  ];
  const { counts, total } = tallyRegistrationCounts(rows);
  assert.deepEqual(counts, { e1: 2, e2: 1 });
  assert.equal(total, 3);
  // Never returns a registrant row — only aggregate numbers.
  assert.equal(typeof counts.e1, "number");
});
