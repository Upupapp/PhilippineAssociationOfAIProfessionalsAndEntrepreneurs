# PAAIPE Cloud Functions

Server-side pieces for the `paaipe` Firestore database (asia-southeast1) in the
shared `postflowit-autos` project. Each one exists because it must either bypass
Firestore rules or hold a secret, so it cannot live in the static site or the
mobile app.

## Functions

| Function | Trigger | What it does |
| --- | --- | --- |
| `onRegistrationCreated` | Firestore create on `paaipe_event_registrations/{id}` | Enqueues a `event-registered` confirmation email into `paaipe_mail_queue`. Wires up the mail the rules note as "not wired yet". |
| `onMailQueued` | Firestore create on `paaipe_mail_queue/{id}` | Sends the row via SendGrid's mail-send API and stamps it `sent`. With no `SENDGRID_API_KEY` set, the row is left pending (and logged) rather than dropped. Idempotent: never sends a row twice. |
| `eventRegistrationCounts` | HTTPS (CORS) | Returns per-event **counts only** (`{ counts: { [eventId]: n }, total }`), reading just `eventId` + `status` with the Admin SDK. A member can't read others' registrations, so this is the only leak-free way to show real "N registered" numbers. Cancelled rows are excluded. |
| `telemetryIngest` | HTTPS (CORS, POST) | Folds anonymous offline-write counters posted by the app into a per-day rollup in `paaipe_telemetry_daily/{YYYY-MM-DD}` (`FieldValue.increment`), so the fleet-wide offline rate is visible server-side. No personal data is stored — only counts and a device tally. The collection is server-only (denied to clients by the rules catch-all). |
| `telemetryReport` | HTTPS (CORS, GET) | Reads that rollup back with the Admin SDK and returns **aggregate only** (`{ days: [...], totals, offlineRate }`) — summed counters plus the derived offline rate per day and overall, never a device id. `?days=N` bounds the window (default 30, max 180). The admin **Telemetry** page charts it. |

## Testing

Pure decision logic (skip rules, mail idempotency, rendering/escaping, count
tally) lives in `lib/logic.js` and is unit-tested — the trigger handlers bind to
the named `paaipe` database, which the local emulator can't serve, so a
dependency-free logic module is the testable seam:

```bash
cd functions && npm test        # node --test, no emulator needed
```

The Firestore rules (own-row read/cancel, server-only mail queue) are covered by
`tests/emulator/registration_rules.mjs` against the emulator:

```bash
sh tests/emulator/run.sh
```

## Deploy

```bash
# one-time: set the mail secret (and optionally the sender identity)
firebase functions:secrets:set SENDGRID_API_KEY --project postflowit-autos
firebase functions:config:set   # not needed; sender uses params with defaults

# deploy just these functions
firebase deploy --only functions --project postflowit-autos
```

`MAIL_SENDER_EMAIL` (default `noreply@paaipe.org`) and `MAIL_SENDER_NAME`
(default `PAAIPE`) are `defineString` params; the sender must be a verified
SendGrid sender (Single Sender or authenticated domain).

## Mobile consumption

The mobile app can call `eventRegistrationCounts` to show real registered
counts. Its URL is only known after deploy, so the app reads it from
`VITE_PAAIPE_COUNTS_URL` and simply shows nothing when that is unset — it never
fabricates a number. Likewise the app posts anonymous telemetry to
`telemetryIngest` when `VITE_PAAIPE_TELEMETRY_URL` is set, and keeps telemetry
on-device only when it is not.

The admin **Telemetry** page (`admin-telemetry.html`) reads `telemetryReport` to
chart the fleet-wide offline rate. Its URL is likewise only known after deploy,
so the page takes it as a pasted endpoint (remembered per-browser) and shows an
explicit "not deployed / could not reach" state rather than a fake chart.

## Note on running here

These are committed but not deployed from this environment: it has no Firebase
CLI login or service-account credentials for `postflowit-autos`. Deploy from a
machine that does.
