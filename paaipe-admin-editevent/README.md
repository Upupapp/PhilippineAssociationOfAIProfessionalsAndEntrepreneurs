# PAAIPE Admin Portal — mockups

Same shell as the member portal (left sidebar), with an ADMIN mark. Demo admin: Paul Espinas (Agent 001). All registration and sign-up rows are sample data.

Priority 1 — Events: `events.html` (list with status, registrations vs capacity, attendance; duplicate/edit), `event-edit.html` (basics, content, program rows, partners, registration settings incl. which questions to ask, confirmation email, publish panel with generated banner/.ics and history), `registrations.html` (per-event list with filters, detail panel showing every answer, mark attended / resend Zoom / cancel, import Zoom attendance, export CSV, add walk-in), `speaker-brief.html` (who's in the room, AI levels, themes, all questions for the speaker, what they want to learn; copy / PDF).
Priority 2 — People: `agents.html` (all sign-ups with verification, profile completeness, sessions; export, email selected), `agent-detail.html` (profile answers, events, programs, benefits, actions, admin notes, history), `verifications.html` (approval queue).
Priority 3: `benefits.html` (partners, benefit status, codes, claims log), `programs.html` (statuses + enrolment lists), `resources.html`, `announcements.html`, `communications.html` (segments, templates, sent log), `settings.html` (roles, Agent numbering, integrations).
`index.html` is the dashboard (next event, sign-ups, verifications pending, last attendance, recent registrations and sign-ups, quick actions).

## Prompt for Claude Code
Use `paaipe-admin/*.html` as the design reference for the admin area (route /admin, role-gated). Rebuild in our framework on the same sidebar
layout as the member portal. Data models: Event (basics, content, program, partners, registration settings, status), Registration (answers,
status, attendance), Agent (verification, profile, activity), Benefit/Partner (status, codes, claims), Program (status, lists), Resource, Post,
Email (segments, templates, log), Role. Implement CSV export, Zoom attendance import, the speaker brief export, and role-based access
(Admin, Event manager, Content editor, Viewer). Reference is for layout, content and behaviour only.
