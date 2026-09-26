# PAAIPE Cloud Functions

Server-side pieces for the `paaipe` Firestore database (asia-southeast1) in the
shared `postflowit-autos` project. Each one exists because it must either bypass
Firestore rules or hold a secret, so it cannot live in the static site or the
mobile app.

## Functions

| Function | Trigger | What it does |
| --- | --- | --- |
| `onRegistrationCreated` | Firestore create on `paaipe_event_registrations/{id}` | Enqueues a `event-registered` confirmation email into `paaipe_mail_queue`. Wires up the mail the rules note as "not wired yet". |
| `onMailQueued` | Firestore create on `paaipe_mail_queue/{id}` | Sends the row via Brevo's transactional API and stamps it `sent`. With no `BREVO_API_KEY` set, the row is left pending (and logged) rather than dropped. Idempotent: never sends a row twice. |
| `eventRegistrationCounts` | HTTPS (CORS) | Returns per-event **counts only** (`{ counts: { [eventId]: n }, total }`), reading just `eventId` + `status` with the Admin SDK. A member can't read others' registrations, so this is the only leak-free way to show real "N registered" numbers. Cancelled rows are excluded. |

## Deploy

```bash
# one-time: set the mail secret (and optionally the sender identity)
firebase functions:secrets:set BREVO_API_KEY --project postflowit-autos
firebase functions:config:set   # not needed; sender uses params with defaults

# deploy just these functions
firebase deploy --only functions --project postflowit-autos
```

`MAIL_SENDER_EMAIL` (default `noreply@paaipe.org`) and `MAIL_SENDER_NAME`
(default `PAAIPE`) are `defineString` params; the sender must be a verified
Brevo sender.

## Mobile consumption

The mobile app can call `eventRegistrationCounts` to show real registered
counts. Its URL is only known after deploy, so the app reads it from
`VITE_PAAIPE_COUNTS_URL` and simply shows nothing when that is unset — it never
fabricates a number.

## Note on running here

These are committed but not deployed from this environment: it has no Firebase
CLI login or service-account credentials for `postflowit-autos`. Deploy from a
machine that does.
