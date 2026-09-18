/* PAAIPE admin — Learnings (Sessions + Micros).
 *
 * Top-nav CONTENT · Learnings. Not event Media banners. Two tabs with aspect
 * cues: Sessions = 16:9 landscape, Micros = 9:16 vertical.
 *
 * YouTube-first. LEARNINGS_UPLOAD_STORAGE_READY=false disables the file input
 * and shows an honest stub; paste a YouTube URL and Save still works.
 */
import { currentAgent, isAdminNow, signOutNow } from "/assets/js/paaipe-firebase.js";
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

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let ME = "";
let KIND = "sessions"; // sessions | micros
const STORE = { sessions: [], micros: [] };
let EDIT_ID = null; // null = closed; "" = new; id = edit

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

function showTab(name, { focus = false } = {}) {
  KIND = name === "micros" ? "micros" : "sessions";
  $$("[data-learn-tab]").forEach(t => {
    const on = t.getAttribute("data-learn-tab") === KIND;
    t.setAttribute("aria-selected", on ? "true" : "false");
    t.tabIndex = on ? 0 : -1;
    if (on && focus) t.focus();
  });
  $$("[data-learn-panel]").forEach(p => {
    p.hidden = p.getAttribute("data-learn-panel") !== KIND;
  });
  closeEditor();
  renderList(KIND);
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
      Add one with a YouTube URL — file upload is not wired.</td></tr>`;
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
    STORE[k] = await listLearnings(k, { asAdmin: true });
    renderList(k);
  }
  const cs = $("[data-count-sessions]");
  const cm = $("[data-count-micros]");
  if (cs) cs.textContent = String(STORE.sessions.length);
  if (cm) cm.textContent = String(STORE.micros.length);
}

/* --------------------------------------------------------------- editor */

function closeEditor() {
  EDIT_ID = null;
  const d = $("[data-editor]");
  if (d) { d.hidden = true; d.innerHTML = ""; }
}

function openEditor(kind, id) {
  KIND = kind;
  showTab(kind);
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
          <input type="file" data-f-file accept="video/mp4,video/webm,video/quicktime,image/*">
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
      <p class="note">Poster upload is not wired either — paste a path or URL. Leave blank to use the YouTube thumbnail when available.</p>
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
    ph.innerHTML = `<span class="muted">Upload preview unavailable until Storage is wired</span>`;
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

async function saveFromEditor() {
  const d = $("[data-editor]");
  if (!d || EDIT_ID === null) return;
  const kind = d.dataset.kind || KIND;
  const source = currentSource();
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

  const btns = $$("button", d);
  btns.forEach(b => b.disabled = true);
  try {
    const id = await saveLearning(kind, EDIT_ID || null, input, { actor: ME });
    await logLearningActivity(
      EDIT_ID ? "learning.update" : "learning.create",
      `${kind}: ${input.title}`,
      { actor: ME, kind }
    );
    await reload(kind);
    flash(`${kindLabel(kind)} saved${input.published ? " and published to the portal" : " as draft"}.`, true);
    closeEditor();
    // reopen? no — list is enough
    void id;
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
    document.documentElement.setAttribute("data-admin-learnings", "offline");
    return;
  }
  if (!ok) { await signOutNow().catch(() => {}); location.replace("admin.html?denied=1"); return; }

  ME = me.email;
  renderAdminTop({
    title: "Learnings",
    subtitle: "Sessions (16:9) and Micros (9:16) for the member portal",
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

  $$("[data-rows]").forEach(wireDrag);

  document.addEventListener("click", e => {
    const add = e.target.closest("[data-add]");
    if (add) return openEditor(add.getAttribute("data-add"), null);

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
    if (e.target.matches("[data-f-youtube]")) paintPreview();
  });

  showTab("sessions");
  document.documentElement.setAttribute(
    "data-admin-learnings",
    String(STORE.sessions.length + STORE.micros.length)
  );
})();
