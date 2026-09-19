/* Seed the locked Playlist + Micro titles (Clarence / Aryhan).
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/seed-playlists.mjs [--commit]
 *
 * Without --commit it prints what it would write and writes nothing.
 *
 * Aryhan owns the console write. This script is the same payload so a second
 * pass is idempotent: it PATCHes the four live paaipe_micros docs (titles and
 * descriptions only — media fields are not sent) and creates or updates one
 * paaipe_playlists document by title+kind. Collection is auto-id.
 *
 * itemIds: micro-1, micro-2, micro-3, micro-4 (the four live published docs).
 */
import { readFileSync } from "fs";

const cfgSrc = readFileSync(new URL("../assets/js/paaipe-firebase.js", import.meta.url), "utf8");
const pick = k => cfgSrc.match(new RegExp(`${k}:\\s*"([^"]+)"`))?.[1];
const API_KEY = pick("apiKey"), PROJECT = pick("projectId");
const DATABASE_ID = cfgSrc.match(/DATABASE_ID\s*=\s*"([^"]+)"/)?.[1] || "paaipe";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE_ID}/documents`;

function fsValue(v) {
  if (v === null || v === undefined)   return { nullValue: null };
  if (typeof v === "boolean")          return { booleanValue: v };
  if (typeof v === "number")           return Number.isInteger(v)
                                         ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string")           return { stringValue: v };
  if (Array.isArray(v))                return { arrayValue: { values: v.map(fsValue) } };
  throw new Error(`cannot encode ${typeof v}`);
}
const fsFields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fsValue(v)]));

const COMMIT = process.argv.includes("--commit");

const MICRO_RETITLES = [
  {
    id: "micro-1",
    title: "Start with the question, not the dashboard",
    description: "Before you open a chart, name the decision you are trying to make.",
  },
  {
    id: "micro-2",
    title: "Signals vs noise",
    description: "What to trust in the data, and what to leave on the floor.",
  },
  {
    id: "micro-3",
    title: "From insight to a next step",
    description: "Turn a finding into one clear action your team can take this week.",
  },
  {
    id: "micro-4",
    title: "Keep the story honest",
    description: "How to brief others without overselling what the model saw.",
  },
];

const PLAYLIST_SEED = {
  title: "From Signals to Strategy",
  description: "Short lessons from Sven Bally’s AI Exchange session on turning data into decisions. Watch in order, or pick the cut you need.",
  kind: "micros",
  status: "published",
  itemIds: MICRO_RETITLES.map(m => m.id),
  displayOrder: 1,
};

const email = process.env.ADMIN_EMAIL, password = process.env.ADMIN_PASSWORD;
if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (a PAAIPE administrator).");
  console.error("Dry listing of the intended writes:\n");
  for (const m of MICRO_RETITLES) {
    console.error(`  paaipe_micros/${m.id}  title=${m.title}`);
  }
  console.error(`  paaipe_playlists (auto-id)  title=${PLAYLIST_SEED.title}  itemIds=${PLAYLIST_SEED.itemIds.join(",")}`);
  process.exit(1);
}

const signIn = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
  { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }) }).then(r => r.json());
if (signIn.error) { console.error("sign-in failed:", signIn.error.message); process.exit(1); }
console.log(`signed in as ${email}`);
const AUTH = { Authorization: `Bearer ${signIn.idToken}`, "content-type": "application/json" };

async function patch(col, id, data) {
  const fields = fsFields(data);
  const mask = Object.keys(fields).map(k => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  console.log(`  ${COMMIT ? "write" : "would write"}  ${col}/${id}`);
  if (!COMMIT) return;
  const r = await fetch(`${BASE}/${col}/${id}?${mask}`,
    { method: "PATCH", headers: AUTH, body: JSON.stringify({ fields }) });
  if (!r.ok) {
    console.error(`    FAILED ${r.status}: ${(await r.text()).slice(0, 300)}`);
    process.exitCode = 1;
  }
}

async function findPlaylistId() {
  const r = await fetch(`${BASE}:runQuery`, {
    method: "POST", headers: AUTH,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "paaipe_playlists" }],
        where: { compositeFilter: { op: "AND", filters: [
          { fieldFilter: { field: { fieldPath: "title" }, op: "EQUAL",
            value: { stringValue: PLAYLIST_SEED.title } } },
          { fieldFilter: { field: { fieldPath: "kind" }, op: "EQUAL",
            value: { stringValue: PLAYLIST_SEED.kind } } },
        ] } },
      },
    }),
  });
  const rows = await r.json();
  const name = Array.isArray(rows) && rows[0]?.document?.name;
  return name ? name.split("/").pop() : null;
}

async function createPlaylist(data) {
  console.log(`  ${COMMIT ? "create" : "would create"}  paaipe_playlists (auto-id)`);
  if (!COMMIT) return;
  const now = [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" },
               { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" },
               { fieldPath: "publishedAt", setToServerValue: "REQUEST_TIME" }];
  const r = await fetch(`${BASE}:commit`, {
    method: "POST", headers: AUTH,
    body: JSON.stringify({
      writes: [{
        update: {
          name: `projects/${PROJECT}/databases/${DATABASE_ID}/documents/paaipe_playlists/${crypto.randomUUID()}`,
          fields: fsFields(data),
        },
        updateTransforms: now,
      }],
    }),
  });
  if (!r.ok) {
    console.error(`    FAILED ${r.status}: ${(await r.text()).slice(0, 300)}`);
    process.exitCode = 1;
  }
}

console.log("\nmicros (titles + descriptions only; media untouched)");
for (const m of MICRO_RETITLES) {
  await patch("paaipe_micros", m.id, { title: m.title, description: m.description });
}

console.log("\nplaylist");
const existingId = await findPlaylistId().catch(() => null);
const payload = {
  title: PLAYLIST_SEED.title,
  description: PLAYLIST_SEED.description,
  kind: PLAYLIST_SEED.kind,
  itemIds: PLAYLIST_SEED.itemIds,
  status: PLAYLIST_SEED.status,
  displayOrder: PLAYLIST_SEED.displayOrder,
  updatedBy: email,
};
if (existingId) {
  await patch("paaipe_playlists", existingId, payload);
} else {
  await createPlaylist(payload);
}

console.log(COMMIT
  ? "\nDone. Confirm itemIds in the admin Playlists tab. Media fields were not sent."
  : "\nDry run. Nothing was written. Re-run with --commit to apply.");
