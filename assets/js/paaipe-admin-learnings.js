/* PAAIPE admin — Learnings (Sessions + Micros + Playlists).
 *
 * Top-nav CONTENT · Learnings. Not event Media banners. Sessions = 16:9,
 * Micros = 9:16. Playlists group published items of one kind (Clarence lock:
 * paaipe_playlists). Sessions/Micros publish and reorder are unchanged.
 *
 * YouTube-first. File upload POSTs to media.paaipe.org (kind=session|micro)
 * and stores the returned path as storagePath. Poster is kind=poster.
 */
import { currentAgent, isAdminNow, signOutNow, idTokenForRequest } from "/assets/js/paaipe-firebase.js";
import { renderAdminNav, renderAdminTop, renderCrumbs } from "/assets/js/paaipe-admin.js";
import {
  LEARNING_SOURCE,
  LEARNINGS_UPLOAD_STORAGE_READY,
  learningsUploadStubMessage,
  youtubeIdFromUrl,
  youtubeEmbedSrc,
  listLearnings,
  saveLearning,
  deleteLearning,
  reorderLearnings,
  logLearningActivity,
} from "/assets/js/paaipe-learnings-data.js";
import { postMediaUpload, MEDIA_KIND } from "/assets/js/paaipe-media.js";
import { readHash, writeHash, onViewChange } from "/assets/js/paaipe-view-url.js";
import {
  PLAYLIST_KIND,
  PLAYLIST_STATUS,
  listPlaylists,
  savePlaylist,
  setPlaylistStatus,
  reorderPlaylists,
  normalizeItemIds,
} from "/assets/js/paaipe-playlists-data.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let ME = "";
let KIND = "sessions"; // sessions | micros | playlists
const STORE = { sessions: [], micros: [], playlists: [] };
let EDIT_ID = null; // null = closed; "" = new; id = edit
let PL_ITEMS = []; // ordered item ids while the Playlist editor is open

function flash(msg, good = false) {
  const el = $("[data-flash]");
  if (!el) return;
  el.textContent = msg;
  el.hidden = !msg;
  el.classList.toggle("ok", !!good);
}

function kindLabel(k = KIND) {
  return k === "micros" ? "Micro" : "Session";
}

function when(ts) {
  const d = ts?.toDate ? ts.toDate()
          : ts instanceof Date ? ts
          : Number.isFinite(ts?.seconds) ? new Date(ts.seconds * 1000)
          : null;
  if (!d || isNaN(d)) return "";
  return d.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" });
}

/* ----------------------------------------------------------------- tabs */

function syncLearnUrl({ push = true } = {}) {
  const params = { tab: KIND };
  if (EDIT_ID === "") params.new = "1";
  else if (EDIT_ID) params.id = EDIT_ID;
  writeHash(params, { push });
}

function showTab(name, { focus = false, push = true } = {}) {
  KIND = name === "micros" ? "micros" : name === "playlists" ? "playlists" : "sessions";
  $$("[data-learn-tab]").forEach(t => {
    const on = t.getAttribute("data-learn-tab") === KIND;
    t.setAttribute("aria-selected", on ? "true" : "false");
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  });
  $$("[data-learn-panel]").forEach(p => {
    p.hidden = p.getAttribute("data-learn-panel") !== KIND;
  });
  closeEditor({ silent: true });
  if (KIND === "playlists") renderPlaylists();
  else renderList(KIND);
  syncLearnUrl({ push });
}

function wireTabs() {
  const tabs = $$("[data-learn-tab]");
  tabs.forEach(t => {
    t.addEventListener("click", () => showTab(t.getAttribute("data-learn-tab")));
    t.addEventListener("keydown", e => {
      const i = tabs.indexOf(t);
      let next = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      if (next < 0) return;
      e.preventDefault();
      showTab(tabs[next].getAttribute("data-learn-tab"), { focus: true });
    });
  });
}

/* ----------------------------------------------------------------- list */

function sourceBadge(row) {
  if (row.source === LEARNING_SOURCE.UPLOAD) {
    return `<span class="pill warn">Upload</span>`;
  }
  return `<span class="pill info">YouTube</span>`;
}

function renderList(kind) {
  const body = $(`[data-rows="${kind}"]`);
  if (!body) return;
  const rows = STORE[kind] || [];
  const countEl = $(`[data-count-${kind}]`);
  if (countEl) countEl.textContent = String(rows.length);

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5" class="empty">No ${kind} yet.
      Add one with a YouTube URL or an mp4/webm upload.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map((r, i) => `
    <tr data-id="${esc(r.id)}" data-kind="${esc(kind)}" draggable="true" class="learn-row">
      <td class="drag" title="Drag to rearrange" aria-label="Drag to rearrange">
        <span class="drag-handle" aria-hidden="true">⋮⋮</span>
        <span class="ord">${i + 1}</span>
      </td>
      <td>
        <b>${esc(r.title || "—")}</b>
        ${r.description ? `<small>${esc(String(r.description).slice(0, 120))}</small>` : ""}
      </td>
      <td>${sourceBadge(r)}</td>
      <td>${r.published
        ? `<span class="pill ok">Published${when(r.publishedAt) ? ` · ${esc(when(r.publishedAt))}` : ""}</span>`
        : `<span class="pill warn">Draft</span>`}</td>
      <td class="act">
        <button type="button" class="btn btn-ghost btn-sm" data-edit>Edit</button>
        <button type="button" class="btn btn-ghost btn-sm danger" data-rm>Remove</button>
      </td>
    </tr>`).join("");
}

async function reload(kind = null) {
  const kinds = kind ? [kind] : ["sessions", "micros"];
  for (const k of kinds) {
    if (k === "playlists") {
      await reloadPlaylists();
      continue;
    }
    STORE[k] = await listLearnings(k, { asAdmin: true });
    renderList(k);
  }
  const cs = $("[data-count-sessions]");
  const cm = $("[data-count-micros]");
  if (cs) cs.textContent = String(STORE.sessions.length);
  if (cm) cm.textContent = String(STORE.micros.length);
}

function playlistStatusPill(status) {
  if (status === PLAYLIST_STATUS.PUBLISHED) return `<span class="pill ok">Published</span>`;
  if (status === PLAYLIST_STATUS.ARCHIVED) return `<span class="pill info">Archived</span>`;
  return `<span class="pill warn">Draft</span>`;
}

function renderPlaylists() {
  const body = $("[data-pl-rows]");
  if (!body) return;
  const rows = STORE.playlists || [];
  const countEl = $("[data-count-playlists]");
  if (countEl) countEl.textContent = String(rows.length);
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">No Playlists yet.
      Add one to group published Sessions or Micros for the portal.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((r, i) => `
    <tr data-pl-id="${esc(r.id)}" draggable="true" class="learn-row">
      <td class="drag" title="Drag to rearrange" aria-label="Drag to rearrange">
        <span class="drag-handle" aria-hidden="true">⋮⋮</span>
        <span class="ord">${i + 1}</span>
      </td>
      <td>
        <b>${esc(r.title || "—")}</b>
        ${r.description ? `<small>${esc(String(r.description).slice(0, 120))}</small>` : ""}
      </td>
      <td>${r.kind === PLAYLIST_KIND.MICROS ? "Micros" : "Sessions"}</td>
      <td>${normalizeItemIds(r.itemIds).length}</td>
      <td>${playlistStatusPill(r.status)}</td>
      <td class="act">
        <button type="button" class="btn btn-ghost btn-sm" data-pl-edit>Edit</button>
        ${r.status === PLAYLIST_STATUS.ARCHIVED
          ? `<button type="button" class="btn btn-ghost btn-sm" data-pl-restore>Restore</button>`
          : `<button type="button" class="btn btn-ghost btn-sm" data-pl-archive>Archive</button>`}
      </td>
    </tr>`).join("");
}

async function reloadPlaylists() {
  STORE.playlists = await listPlaylists({ asAdmin: true });
  renderPlaylists();
}

/* --------------------------------------------------------------- editor */

function closeEditor({ silent = false } = {}) {
  EDIT_ID = null;
  PL_ITEMS = [];
  const d = $("[data-editor]");
  if (d) { d.hidden = true; d.innerHTML = ""; }
  if (!silent) syncLearnUrl({ push: true });
}

function publishedItemsOf(kind) {
  return (STORE[kind] || []).filter(r => r.published);
}

function renderPlaylistItemRows(kind) {
  const host = $("[data-pl-item-list]");
  if (!host) return;
  const items = PL_ITEMS
    .map(id => (STORE[kind] || []).find(r => r.id === id))
    .filter(Boolean);
  if (!items.length) {
    host.innerHTML = `<p class="note">No items yet. Add published ${kind === "micros" ? "Micros" : "Sessions"} below. A Playlist cannot be published until every id exists and is published.</p>`;
    return;
  }
  host.innerHTML = items.map((r, i) => `
    <li data-pl-item="${esc(r.id)}" draggable="true" class="pl-item">
      <span class="drag-handle" aria-hidden="true">⋮⋮</span>
      <span class="ord">${i + 1}</span>
      <b>${esc(r.title || r.id)}</b>
      ${r.published ? "" : `<span class="pill warn">Not published</span>`}
      <button type="button" class="btn btn-ghost btn-sm" data-pl-item-rm="${esc(r.id)}">Remove</button>
    </li>`).join("");
}

function fillPlaylistAddSelect(kind) {
  const sel = $("[data-pl-add-select]");
  if (!sel) return;
  const taken = new Set(PL_ITEMS);
  const opts = publishedItemsOf(kind).filter(r => !taken.has(r.id));
  sel.innerHTML = opts.length
    ? `<option value="">Add a published ${kind === "micros" ? "Micro" : "Session"}…</option>` +
      opts.map(r => `<option value="${esc(r.id)}">${esc(r.title || r.id)}</option>`).join("")
    : `<option value="">No published ${kind === "micros" ? "Micros" : "Sessions"} left to add</option>`;
  sel.disabled = !opts.length;
}

function setPlaylistKind(kind) {
  const d = $("[data-editor]");
  if (!d) return;
  const next = kind === PLAYLIST_KIND.MICROS ? PLAYLIST_KIND.MICROS : PLAYLIST_KIND.SESSIONS;
  $("[data-f-pl-kind]", d).value = next;
  $$("[data-pl-kind]", d).forEach(c => {
    c.classList.toggle("on", c.getAttribute("data-pl-kind") === next);
  });
  renderPlaylistItemRows(next);
  fillPlaylistAddSelect(next);
  wirePlaylistItemDrag($("[data-pl-item-list]"));
}

function openPlaylistEditor(id, { push = true } = {}) {
  KIND = "playlists";
  showTab("playlists", { push: false });
  EDIT_ID = id == null ? "" : id;
  const existing = id ? (STORE.playlists || []).find(r => r.id === id) : null;
  const isNew = !existing;
  const d = $("[data-editor]");
  if (!d) return;
  const kind = existing?.kind === PLAYLIST_KIND.MICROS ? PLAYLIST_KIND.MICROS : PLAYLIST_KIND.SESSIONS;
  const status = existing?.status === PLAYLIST_STATUS.PUBLISHED
    ? PLAYLIST_STATUS.PUBLISHED
    : existing?.status === PLAYLIST_STATUS.ARCHIVED
      ? PLAYLIST_STATUS.ARCHIVED
      : PLAYLIST_STATUS.DRAFT;
  PL_ITEMS = normalizeItemIds(existing?.itemIds);

  d.innerHTML = `
    <div class="dhead">
      <div>
        <b>${isNew ? "Add Playlist" : "Edit Playlist"}</b>
        <small>kind is a field, not part of the title · portal shows published only</small>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-close>Close</button>
    </div>

    <div class="f"><label for="pl-title">Title <span class="sub">required</span></label>
      <input id="pl-title" data-f-pl-title maxlength="200" value="${esc(existing?.title || "")}" required></div>
    <div class="f"><label for="pl-desc">Description <span class="sub">optional · 2000</span></label>
      <textarea id="pl-desc" data-f-pl-desc maxlength="2000" rows="3">${esc(existing?.description || "")}</textarea></div>

    <h3 class="ehead">Kind</h3>
    <div class="chips" role="group" aria-label="Playlist kind">
      <button type="button" class="chip${kind === PLAYLIST_KIND.SESSIONS ? " on" : ""}"
        data-pl-kind="${PLAYLIST_KIND.SESSIONS}">Sessions</button>
      <button type="button" class="chip${kind === PLAYLIST_KIND.MICROS ? " on" : ""}"
        data-pl-kind="${PLAYLIST_KIND.MICROS}">Micros</button>
    </div>
    <input type="hidden" data-f-pl-kind value="${esc(kind)}">
    <p class="note">Never mixed in v1. Changing kind clears the item list.</p>

    <h3 class="ehead">Items <span class="sub">published ${kind === "micros" ? "Micros" : "Sessions"} in order</span></h3>
    <ol class="pl-items" data-pl-item-list></ol>
    <div class="f pl-add">
      <label for="pl-add">Add published item</label>
      <select id="pl-add" data-pl-add-select></select>
    </div>

    <h3 class="ehead">Status</h3>
    <div class="chips" role="radiogroup" aria-label="Playlist status">
      <button type="button" class="chip${status === PLAYLIST_STATUS.DRAFT ? " on" : ""}"
        data-pl-status="${PLAYLIST_STATUS.DRAFT}">Draft</button>
      <button type="button" class="chip${status === PLAYLIST_STATUS.PUBLISHED ? " on" : ""}"
        data-pl-status="${PLAYLIST_STATUS.PUBLISHED}">Published</button>
      <button type="button" class="chip${status === PLAYLIST_STATUS.ARCHIVED ? " on" : ""}"
        data-pl-status="${PLAYLIST_STATUS.ARCHIVED}">Archived</button>
    </div>
    <input type="hidden" data-f-pl-status value="${esc(status)}">
    <p class="note">Published Playlists appear on portal Learnings. Archived stays here for restore.</p>

    <div class="dacts">
      <button type="button" class="btn btn-gold btn-sm" data-pl-save>Save</button>
      <button type="button" class="btn btn-ghost btn-sm" data-close>Cancel</button>
    </div>`;
  d.hidden = false;
  d.dataset.kind = "playlists";
  d.scrollIntoView({ behavior: "smooth", block: "nearest" });
  setPlaylistKind(kind);
  $("[data-f-pl-title]", d)?.focus();
  syncLearnUrl({ push });
}

async function savePlaylistFromEditor() {
  const d = $("[data-editor]");
  if (!d || EDIT_ID === null || d.dataset.kind !== "playlists") return;
  const input = {
    title: $("[data-f-pl-title]", d)?.value,
    description: $("[data-f-pl-desc]", d)?.value,
    kind: $("[data-f-pl-kind]", d)?.value,
    status: $("[data-f-pl-status]", d)?.value,
    itemIds: PL_ITEMS.slice(),
    displayOrder: (() => {
      if (EDIT_ID) {
        const ex = STORE.playlists.find(r => r.id === EDIT_ID);
        return ex?.displayOrder ?? (STORE.playlists.length + 1);
      }
      return STORE.playlists.length + 1;
    })(),
  };
  const btns = $$("button", d);
  btns.forEach(b => b.disabled = true);
  try {
    await savePlaylist(EDIT_ID || null, input, { actor: ME });
    await logLearningActivity(
      EDIT_ID ? "playlist.update" : "playlist.create",
      `${input.kind}: ${input.title}`,
      { actor: ME, kind: "playlists" }
    );
    await reloadPlaylists();
    flash(`Playlist saved${input.status === PLAYLIST_STATUS.PUBLISHED ? " and published to the portal" : input.status === PLAYLIST_STATUS.ARCHIVED ? " as archived" : " as draft"}.`, true);
    closeEditor();
  } catch (ex) {
    btns.forEach(b => b.disabled = false);
    flash(ex?.code === "permission-denied"
      ? "The rules refused that change. Your account may no longer be an administrator."
      : (ex?.message || String(ex)));
  }
}

async function archiveOrRestorePlaylist(id, nextStatus) {
  const row = (STORE.playlists || []).find(r => r.id === id);
  const title = row?.title || id;
  try {
    await setPlaylistStatus(id, nextStatus, { actor: ME });
    await logLearningActivity(
      nextStatus === PLAYLIST_STATUS.ARCHIVED ? "playlist.archive" : "playlist.restore",
      title,
      { actor: ME, kind: "playlists" }
    );
    if (EDIT_ID === id) closeEditor();
    await reloadPlaylists();
    flash(nextStatus === PLAYLIST_STATUS.ARCHIVED
      ? `Archived “${title}”. Restore any time from this tab.`
      : `Restored “${title}” as a draft.`, true);
  } catch (ex) {
    flash(ex?.code === "permission-denied"
      ? "The rules refused that change."
      : (ex?.message || String(ex)));
  }
}

let plDragId = null;

function wirePlaylistDrag(body) {
  if (!body || body.dataset.plDragWired) return;
  body.dataset.plDragWired = "1";
  body.addEventListener("dragstart", e => {
    const tr = e.target.closest("tr[data-pl-id]");
    if (!tr || e.target.closest("button,a,input")) {
      e.preventDefault();
      return;
    }
    plDragId = tr.getAttribute("data-pl-id");
    tr.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", plDragId);
  });
  body.addEventListener("dragend", e => {
    e.target.closest("tr")?.classList.remove("dragging");
    $$("tr.drag-over", body).forEach(r => r.classList.remove("drag-over"));
    plDragId = null;
  });
  body.addEventListener("dragover", e => {
    const tr = e.target.closest("tr[data-pl-id]");
    if (!tr || !plDragId) return;
    e.preventDefault();
    $$("tr.drag-over", body).forEach(r => r.classList.remove("drag-over"));
    if (tr.getAttribute("data-pl-id") !== plDragId) tr.classList.add("drag-over");
  });
  body.addEventListener("drop", async e => {
    const tr = e.target.closest("tr[data-pl-id]");
    if (!tr || !plDragId) return;
    e.preventDefault();
    const ids = STORE.playlists.map(r => r.id);
    const from = ids.indexOf(plDragId);
    const to = ids.indexOf(tr.getAttribute("data-pl-id"));
    if (from < 0 || to < 0 || from === to) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    STORE.playlists = ids.map((id, i) => {
      const row = STORE.playlists.find(r => r.id === id);
      return { ...row, displayOrder: i + 1 };
    });
    renderPlaylists();
    try {
      await reorderPlaylists(ids, { actor: ME });
      flash("Playlist order updated — portal Learnings will follow this sequence.", true);
    } catch (ex) {
      flash(ex?.code === "permission-denied"
        ? "The rules refused the reorder."
        : `Could not save order: ${ex?.message || ex}`);
      await reloadPlaylists();
    }
  });
}

function wirePlaylistItemDrag(list) {
  if (!list || list.dataset.plItemDragWired) return;
  list.dataset.plItemDragWired = "1";
  let itemDrag = null;
  list.addEventListener("dragstart", e => {
    const li = e.target.closest("[data-pl-item]");
    if (!li || e.target.closest("button")) {
      e.preventDefault();
      return;
    }
    itemDrag = li.getAttribute("data-pl-item");
    li.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", itemDrag);
  });
  list.addEventListener("dragend", e => {
    e.target.closest("[data-pl-item]")?.classList.remove("dragging");
    $$(".drag-over", list).forEach(r => r.classList.remove("drag-over"));
    itemDrag = null;
  });
  list.addEventListener("dragover", e => {
    const li = e.target.closest("[data-pl-item]");
    if (!li || !itemDrag) return;
    e.preventDefault();
    $$(".drag-over", list).forEach(r => r.classList.remove("drag-over"));
    if (li.getAttribute("data-pl-item") !== itemDrag) li.classList.add("drag-over");
  });
  list.addEventListener("drop", e => {
    const li = e.target.closest("[data-pl-item]");
    if (!li || !itemDrag) return;
    e.preventDefault();
    const from = PL_ITEMS.indexOf(itemDrag);
    const to = PL_ITEMS.indexOf(li.getAttribute("data-pl-item"));
    if (from < 0 || to < 0 || from === to) return;
    PL_ITEMS.splice(to, 0, PL_ITEMS.splice(from, 1)[0]);
    const kind = $("[data-f-pl-kind]")?.value || PLAYLIST_KIND.SESSIONS;
    renderPlaylistItemRows(kind);
  });
}

function openEditor(kind, id, { push = true } = {}) {
  KIND = kind;
  showTab(kind, { push: false });
  EDIT_ID = id == null ? "" : id;
  const existing = id ? (STORE[kind] || []).find(r => r.id === id) : null;
  const isNew = !existing;
  const d = $("[data-editor]");
  if (!d) return;

  const source = existing?.source || LEARNING_SOURCE.YOUTUBE;
  const published = existing ? !!existing.published : false;
  const uploadReady = LEARNINGS_UPLOAD_STORAGE_READY;

  d.innerHTML = `
    <div class="dhead">
      <div>
        <b>${isNew ? `Add ${kindLabel(kind).toLowerCase()}` : `Edit ${kindLabel(kind).toLowerCase()}`}</b>
        <small>${kind === "micros" ? "9:16 vertical" : "16:9 landscape"} · portal order is the list order</small>
      </div>
      <button type="button" class="btn btn-ghost btn-sm" data-close>Close</button>
    </div>

    <div class="learn-aspect-preview ${kind === "micros" ? "portrait" : "landscape"}" data-preview>
      <div class="ph" data-preview-ph>Preview appears when a YouTube id is set</div>
    </div>

    <div class="f"><label for="ln-title">Title <span class="sub">required</span></label>
      <input id="ln-title" data-f-title maxlength="200" value="${esc(existing?.title || "")}" required></div>
    <div class="f"><label for="ln-desc">Description</label>
      <textarea id="ln-desc" data-f-desc maxlength="4000" rows="3">${esc(existing?.description || "")}</textarea></div>

    <h3 class="ehead">Source</h3>
    <div class="chips" data-source-chips role="group" aria-label="Source">
      <button type="button" class="chip${source === LEARNING_SOURCE.YOUTUBE ? " on" : ""}"
        data-source="${LEARNING_SOURCE.YOUTUBE}">YouTube URL</button>
      <button type="button" class="chip${source === LEARNING_SOURCE.UPLOAD ? " on" : ""}"
        data-source="${LEARNING_SOURCE.UPLOAD}" ${uploadReady ? "" : 'title="Storage is not wired"'}>File upload</button>
    </div>
    <input type="hidden" data-f-source value="${esc(source)}">

    <div data-source-panel="youtube" ${source === LEARNING_SOURCE.YOUTUBE ? "" : "hidden"}>
      <div class="f"><label for="ln-yt">YouTube URL</label>
        <input id="ln-yt" data-f-youtube maxlength="300"
          placeholder="https://www.youtube.com/watch?v=… or youtu.be/…"
          value="${esc(existing?.youtubeUrl || "")}">
        <p class="note" data-yt-id-note>${existing?.youtubeId
          ? `Video id: <code>${esc(existing.youtubeId)}</code> (derived on save)`
          : "The video id is derived on save. Playback is in-portal — no “Open on YouTube”."}</p>
      </div>
    </div>

    <div data-source-panel="upload" ${source === LEARNING_SOURCE.UPLOAD ? "" : "hidden"}>
      ${uploadReady ? `
        <div class="f"><label>Upload file</label>
          <input type="file" data-f-file accept="video/mp4,video/webm">
        </div>` : `
        <div class="flash" style="position:static;margin:0 0 12px" data-upload-stub>
          <b>File upload is disabled.</b> ${esc(learningsUploadStubMessage())}
          Switch to YouTube URL — that path works in v1.
        </div>
        <div class="f"><label>Upload file</label>
          <input type="file" data-f-file disabled accept="video/mp4,video/webm,video/quicktime">
          <p class="note">storagePath is reserved in the schema for when Storage is wired.</p>
        </div>`}
    </div>

    <div class="f"><label for="ln-poster">Poster URL <span class="sub">optional</span></label>
      <input id="ln-poster" data-f-poster maxlength="300"
        placeholder="assets/img/… or https://…"
        value="${esc(existing?.posterUrl || "")}">
      ${uploadReady ? `<input type="file" data-f-poster-file accept="image/jpeg,image/png,image/webp">` : ""}
      <p class="note">${uploadReady
        ? "Optional poster. Leave blank to use the YouTube thumbnail when available."
        : "Poster upload is not wired either — paste a path or URL. Leave blank to use the YouTube thumbnail when available."}</p>
    </div>

    <div class="f" style="display:flex;align-items:center;gap:10px;margin-top:8px">
      <input type="checkbox" id="ln-pub" data-f-published ${published ? "checked" : ""}>
      <label for="ln-pub" style="margin:0">Published — show on portal Learnings</label>
    </div>

    <div class="dacts">
      <button type="button" class="btn btn-gold btn-sm" data-save>Save</button>
      <button type="button" class="btn btn-ghost btn-sm" data-close>Cancel</button>
      ${isNew ? "" : `<span class="grow"></span>
        <button type="button" class="btn btn-ghost btn-sm danger" data-rm-edit>Remove</button>`}
    </div>`;
  d.hidden = false;
  d.dataset.kind = kind;
  d.scrollIntoView({ behavior: "smooth", block: "nearest" });
  paintPreview();
  $("[data-f-title]", d)?.focus();
  syncLearnUrl({ push });
}

function currentSource() {
  return $("[data-f-source]")?.value === LEARNING_SOURCE.UPLOAD
    ? LEARNING_SOURCE.UPLOAD
    : LEARNING_SOURCE.YOUTUBE;
}

function setSource(src) {
  const d = $("[data-editor]");
  if (!d) return;
  $("[data-f-source]", d).value = src;
  $$("[data-source-chips] .chip", d).forEach(c => {
    c.classList.toggle("on", c.getAttribute("data-source") === src);
  });
  $$("[data-source-panel]", d).forEach(p => {
    p.hidden = p.getAttribute("data-source-panel") !== src;
  });
  paintPreview();
}

function paintPreview() {
  const ph = $("[data-preview-ph]");
  const box = $("[data-preview]");
  if (!ph || !box) return;
  const src = currentSource();
  if (src !== LEARNING_SOURCE.YOUTUBE) {
    const f = $("[data-f-file]")?.files?.[0];
    ph.innerHTML = f
      ? `<span class="muted">${esc(f.name)}</span>`
      : `<span class="muted">Choose an mp4 or webm file</span>`;
    return;
  }
  const id = youtubeIdFromUrl($("[data-f-youtube]")?.value || "");
  const note = $("[data-yt-id-note]");
  if (note) {
    note.innerHTML = id
      ? `Video id: <code>${esc(id)}</code> (derived on save)`
      : "The video id is derived on save. Playback is in-portal — no “Open on YouTube”.";
  }
  if (!id) {
    ph.textContent = "Preview appears when a YouTube id is set";
    return;
  }
  const embed = youtubeEmbedSrc(id, { controls: true });
  ph.innerHTML = `<iframe src="${esc(embed)}" title="Preview" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>`;
}

function newLearningId() {
  return (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : `learn-${Date.now().toString(36)}`;
}

async function saveFromEditor() {
  const d = $("[data-editor]");
  if (!d || EDIT_ID === null) return;
  const kind = d.dataset.kind || KIND;
  const source = currentSource();
  const existing = EDIT_ID ? (STORE[kind] || []).find(r => r.id === EDIT_ID) : null;
  const file = $("[data-f-file]", d)?.files?.[0];
  const posterFile = $("[data-f-poster-file]", d)?.files?.[0];
  const input = {
    title: $("[data-f-title]", d)?.value,
    description: $("[data-f-desc]", d)?.value,
    source,
    youtubeUrl: $("[data-f-youtube]", d)?.value,
    posterUrl: $("[data-f-poster]", d)?.value,
    published: !!$("[data-f-published]", d)?.checked,
    displayOrder: (() => {
      if (EDIT_ID) {
        const ex = STORE[kind].find(r => r.id === EDIT_ID);
        return ex?.displayOrder ?? (STORE[kind].length + 1);
      }
      return STORE[kind].length + 1;
    })(),
  };

  if (source === LEARNING_SOURCE.UPLOAD && !LEARNINGS_UPLOAD_STORAGE_READY) {
    return flash(learningsUploadStubMessage());
  }
  if (source === LEARNING_SOURCE.UPLOAD && !file && !existing?.storagePath) {
    return flash("Choose an mp4 or webm file to upload.");
  }

  const btns = $$("button", d);
  btns.forEach(b => b.disabled = true);
  try {
    let id = EDIT_ID || null;
    if ((file || posterFile) && !id) id = newLearningId();

    if (file) {
      const token = await idTokenForRequest();
      const up = await postMediaUpload({
        file,
        kind: kind === "micros" ? MEDIA_KIND.MICRO : MEDIA_KIND.SESSION,
        id,
        token,
      });
      input.storagePath = up.path;
    }
    if (posterFile) {
      const token = await idTokenForRequest();
      const up = await postMediaUpload({
        file: posterFile,
        kind: MEDIA_KIND.POSTER,
        id,
        token,
      });
      input.posterStoragePath = up.path;
      input.posterUrl = up.url;
    }

    const savedId = await saveLearning(kind, id, input, { actor: ME });
    await logLearningActivity(
      EDIT_ID ? "learning.update" : "learning.create",
      `${kind}: ${input.title}`,
      { actor: ME, kind }
    );
    await reload(kind);
    flash(`${kindLabel(kind)} saved${input.published ? " and published to the portal" : " as draft"}.`, true);
    closeEditor();
    void savedId;
  } catch (ex) {
    btns.forEach(b => b.disabled = false);
    flash(ex?.code === "permission-denied"
      ? "The rules refused that change. Your account may no longer be an administrator."
      : (ex?.message || String(ex)));
  }
}

async function removeRow(kind, id) {
  const row = (STORE[kind] || []).find(r => r.id === id);
  const title = row?.title || id;
  if (!confirm(`Remove “${title}”?\n\nThis deletes the ${kindLabel(kind).toLowerCase()} from admin and the portal. This cannot be undone from here.`))
    return;
  try {
    await deleteLearning(kind, id);
    await logLearningActivity("learning.delete", `${kind}: ${title}`, { actor: ME, kind });
    if (EDIT_ID === id) closeEditor();
    await reload(kind);
    flash(`Removed “${title}”.`, true);
  } catch (ex) {
    flash(ex?.code === "permission-denied"
      ? "The rules refused to remove that."
      : `Could not remove: ${ex?.message || ex}`);
  }
}

/* ---------------------------------------------------------- drag reorder */

let dragId = null;

function wireDrag(body) {
  body.addEventListener("dragstart", e => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr || e.target.closest("button,a,input")) {
      e.preventDefault();
      return;
    }
    dragId = tr.dataset.id;
    tr.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragId);
  });
  body.addEventListener("dragend", e => {
    e.target.closest("tr")?.classList.remove("dragging");
    $$("tr.drag-over", body).forEach(r => r.classList.remove("drag-over"));
    dragId = null;
  });
  body.addEventListener("dragover", e => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr || !dragId) return;
    e.preventDefault();
    $$("tr.drag-over", body).forEach(r => r.classList.remove("drag-over"));
    if (tr.dataset.id !== dragId) tr.classList.add("drag-over");
  });
  body.addEventListener("drop", async e => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr || !dragId) return;
    e.preventDefault();
    const kind = tr.dataset.kind || KIND;
    const ids = STORE[kind].map(r => r.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(tr.dataset.id);
    if (from < 0 || to < 0 || from === to) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    STORE[kind] = ids.map((id, i) => {
      const row = STORE[kind].find(r => r.id === id);
      return { ...row, displayOrder: i + 1 };
    });
    renderList(kind);
    try {
      await reorderLearnings(kind, ids, { actor: ME });
      flash("Order updated — portal Learnings will follow this sequence.", true);
    } catch (ex) {
      flash(ex?.code === "permission-denied"
        ? "The rules refused the reorder."
        : `Could not save order: ${ex?.message || ex}`);
      await reload(kind);
    }
  });
}

/* ----------------------------------------------------------------- boot */

(async function () {
  if (!$("[data-admin-learnings]")) return;
  renderAdminNav("admin-learnings.html");
  wireTabs();

  let me = null;
  try { me = await currentAgent(); } catch { me = null; }
  if (!me) { location.replace("admin.html"); return; }
  let ok = false;
  try { ok = await isAdminNow(); }
  catch {
    flash("PAAIPE could not be reached. Nothing is shown rather than an empty list.");
    ["sessions", "micros"].forEach(k => {
      const b = $(`[data-rows="${k}"]`);
      if (b) b.innerHTML = `<tr><td colspan="5" class="empty">Could not be loaded. This is not "none".</td></tr>`;
    });
    const pb = $("[data-pl-rows]");
    if (pb) pb.innerHTML = `<tr><td colspan="6" class="empty">Could not be loaded. This is not "none".</td></tr>`;
    document.documentElement.setAttribute("data-admin-learnings", "offline");
    return;
  }
  if (!ok) { await signOutNow().catch(() => {}); location.replace("admin.html?denied=1"); return; }

  ME = me.email;
  renderAdminTop({
    title: "Learnings",
    subtitle: "Sessions, Micros, and Playlists for the member portal",
    email: me.email,
  });
  renderCrumbs([["Dashboard", "admin.html"], "Learnings"]);
  document.addEventListener("click", e => {
    if (e.target.closest("[data-admin-signout]")) {
      e.preventDefault();
      signOutNow().catch(() => {}).then(() => location.replace("admin.html"));
    }
  });

  try {
    await reload();
  } catch (ex) {
    flash(`Could not load Learnings: ${ex?.message || ex}`);
    document.documentElement.setAttribute("data-admin-learnings", "error");
    return;
  }
  try {
    await reloadPlaylists();
  } catch (ex) {
    const pb = $("[data-pl-rows]");
    if (pb) pb.innerHTML = `<tr><td colspan="6" class="empty">Playlists could not be loaded. Sessions and Micros are unaffected.</td></tr>`;
    flash(`Could not load Playlists: ${ex?.message || ex}`);
  }

  $$("[data-rows]").forEach(wireDrag);
  wirePlaylistDrag($("[data-pl-rows]"));

  document.addEventListener("click", e => {
    const add = e.target.closest("[data-add]");
    if (add) {
      const kind = add.getAttribute("data-add");
      if (kind === "playlists") return openPlaylistEditor(null);
      return openEditor(kind, null);
    }

    if (e.target.closest("[data-close]")) return closeEditor();

    const edit = e.target.closest("[data-edit]");
    if (edit) {
      const tr = edit.closest("tr[data-id]");
      return openEditor(tr.dataset.kind, tr.dataset.id);
    }

    const rm = e.target.closest("[data-rm]");
    if (rm) {
      const tr = rm.closest("tr[data-id]");
      return removeRow(tr.dataset.kind, tr.dataset.id);
    }

    if (e.target.closest("[data-rm-edit]")) {
      const d = $("[data-editor]");
      return removeRow(d?.dataset.kind || KIND, EDIT_ID);
    }

    if (e.target.closest("[data-save]")) return saveFromEditor();

    if (e.target.closest("[data-pl-save]")) return savePlaylistFromEditor();

    const plEdit = e.target.closest("[data-pl-edit]");
    if (plEdit) {
      const tr = plEdit.closest("tr[data-pl-id]");
      return openPlaylistEditor(tr?.getAttribute("data-pl-id"));
    }
    const plArchive = e.target.closest("[data-pl-archive]");
    if (plArchive) {
      const tr = plArchive.closest("tr[data-pl-id]");
      return archiveOrRestorePlaylist(tr?.getAttribute("data-pl-id"), PLAYLIST_STATUS.ARCHIVED);
    }
    const plRestore = e.target.closest("[data-pl-restore]");
    if (plRestore) {
      const tr = plRestore.closest("tr[data-pl-id]");
      return archiveOrRestorePlaylist(tr?.getAttribute("data-pl-id"), PLAYLIST_STATUS.DRAFT);
    }
    const plKind = e.target.closest("[data-pl-kind]");
    if (plKind) {
      const next = plKind.getAttribute("data-pl-kind");
      const current = $("[data-f-pl-kind]")?.value;
      if (next !== current && PL_ITEMS.length) {
        if (!confirm("Change kind? The item list will be cleared — Sessions and Micros are never mixed."))
          return;
        PL_ITEMS = [];
      }
      return setPlaylistKind(next);
    }
    const plStatus = e.target.closest("[data-pl-status]");
    if (plStatus) {
      const d = $("[data-editor]");
      const status = plStatus.getAttribute("data-pl-status");
      if (!d) return;
      $("[data-f-pl-status]", d).value = status;
      $$("[data-pl-status]", d).forEach(c => {
        c.classList.toggle("on", c.getAttribute("data-pl-status") === status);
      });
      return;
    }
    const plRm = e.target.closest("[data-pl-item-rm]");
    if (plRm) {
      const id = plRm.getAttribute("data-pl-item-rm");
      PL_ITEMS = PL_ITEMS.filter(x => x !== id);
      const kind = $("[data-f-pl-kind]")?.value || PLAYLIST_KIND.SESSIONS;
      renderPlaylistItemRows(kind);
      fillPlaylistAddSelect(kind);
      return;
    }

    const srcBtn = e.target.closest("[data-source]");
    if (srcBtn) {
      const src = srcBtn.getAttribute("data-source");
      if (src === LEARNING_SOURCE.UPLOAD && !LEARNINGS_UPLOAD_STORAGE_READY) {
        setSource(LEARNING_SOURCE.UPLOAD); // show the stub panel
        flash(learningsUploadStubMessage());
        return;
      }
      return setSource(src);
    }
  });

  document.addEventListener("input", e => {
    if (e.target.matches("[data-f-youtube], [data-f-file]")) paintPreview();
  });
  document.addEventListener("change", e => {
    if (!e.target.matches("[data-pl-add-select]")) return;
    const id = e.target.value;
    if (!id || PL_ITEMS.includes(id)) return;
    PL_ITEMS.push(id);
    const kind = $("[data-f-pl-kind]")?.value || PLAYLIST_KIND.SESSIONS;
    renderPlaylistItemRows(kind);
    fillPlaylistAddSelect(kind);
    const list = $("[data-pl-item-list]");
    wirePlaylistItemDrag(list);
  });

  showTab("sessions", { push: false });
  function applyLearnFromLocation() {
    const v = readHash();
    const tab = v.tab === "micros" ? "micros"
      : v.tab === "playlists" ? "playlists"
      : "sessions";
    if (tab === "playlists") {
      if (v.new === "1") { openPlaylistEditor(null, { push: false }); return; }
      if (v.id) { openPlaylistEditor(v.id, { push: false }); return; }
      showTab("playlists", { push: false });
      return;
    }
    if (v.new === "1") { openEditor(tab, null, { push: false }); return; }
    if (v.id) { openEditor(tab, v.id, { push: false }); return; }
    showTab(tab, { push: false });
  }
  applyLearnFromLocation();
  onViewChange(applyLearnFromLocation);
  document.documentElement.setAttribute(
    "data-admin-learnings",
    String(STORE.sessions.length + STORE.micros.length)
  );
})();
