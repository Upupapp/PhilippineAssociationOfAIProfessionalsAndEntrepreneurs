/* Agent profile photo — chrome camera badge, Profile section, crop modal.
 *
 * ONE pipeline, used by the sidebar/header avatars and by My Profile. Pick a
 * JPG/PNG, square-crop it in a modal, then try to upload and persist photoURL.
 *
 * Storage may not be writable (Clarence owns storage/rules; partner logos were
 * blocked for the same reason). The UI is always offered. A save that cannot
 * write MUST say so. Never paint a photo as saved when it was not.
 */
import {
  storageWritable, saveAgentPhotoBlob, clearAgentPhoto, explainPhotoError,
} from "/assets/js/paaipe-firebase.js";

export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png"];
const STAGE = 280;
const OUT = 512;
const CAM =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/>' +
  '<circle cx="12" cy="13" r="3.5"/></svg>';

const CSS = `
.av>img[data-agent-photo]{width:100%;height:100%;object-fit:cover;border-radius:50%;display:block}
.av-edit{position:relative;display:grid;place-items:center;padding:0;border:0;background:transparent;
  cursor:pointer;flex:none;width:36px;height:36px;border-radius:50%;font:inherit;color:inherit}
.av-edit .av{width:100%;height:100%}
.av-edit:focus-visible{outline:3px solid var(--cyan,#15BBEA);outline-offset:2px}
.av-cam{position:absolute;right:-2px;bottom:-2px;width:18px;height:18px;border-radius:50%;
  background:var(--navy,#002166);color:#fff;display:grid;place-items:center;
  box-shadow:0 0 0 2px #fff;pointer-events:none}
.side .me{overflow:visible}
.side .me .av-cam{box-shadow:0 0 0 2px #0A3F96}
.av-cam svg{width:10px;height:10px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.pp-block{display:flex;gap:18px;align-items:flex-start;margin:0 0 18px;padding:0 0 18px;border-bottom:1px solid var(--line,#d5e3f5)}
.pp-block>div label{display:block;margin-bottom:6px}
.pp-preview.av{width:112px;height:112px;font-size:36px;box-shadow:0 0 0 3px #fff,0 0 0 6px var(--gold,#F2A71B)}
.pp-acts{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.pp-help{font-size:12.5px;color:var(--muted,#4a5a7a);max-width:46ch;margin:0}
.pp-msg{font-size:13px;margin:8px 0 0}
.pp-msg.err{color:var(--amber-ink,#7a4a06)}
.pp-msg.ok{color:var(--green-ink,#0a5c3a)}
.pp-dlg{border:0;padding:0;border-radius:18px;width:min(420px,calc(100vw - 32px));
  background:#fff;color:var(--ink,#0f1e3d);box-shadow:0 30px 80px rgba(0,16,51,.35);overflow:hidden}
.pp-dlg::backdrop{background:rgba(3,15,45,.62);backdrop-filter:blur(4px)}
.pp-dlg .hd{padding:16px 18px 12px;border-bottom:1px solid var(--line,#d5e3f5)}
.pp-dlg .hd h2{font-size:17px;margin:0}
.pp-dlg .bd{padding:16px 18px 18px;display:flex;flex-direction:column;gap:12px}
.pp-stage{width:280px;height:280px;max-width:100%;aspect-ratio:1;position:relative;overflow:hidden;
  background:#0a1c3e;border-radius:14px;touch-action:none;cursor:grab;margin:0 auto;user-select:none}
.pp-stage:active{cursor:grabbing}
.pp-stage img{position:absolute;max-width:none;pointer-events:none;user-select:none}
.pp-stage .mask{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(circle at center,transparent 99px,rgba(3,27,82,.52) 101px)}
.pp-zoom{display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--muted,#4a5a7a)}
.pp-zoom input{flex:1}
.pp-dlg .acts{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:4px}
.pp-dlg .err{font-size:13px;color:var(--amber-ink,#7a4a06);margin:0}
@media(max-width:560px){.pp-block{flex-direction:column;align-items:flex-start}}
`;

let agentRef = null;
let crop = null; // {img, nw, nh, base, zoom, scale, x, y, url}

function $(sel, root) {
  return (root || document).querySelector(sel);
}
function $all(sel, root) {
  return Array.from((root || document).querySelectorAll(sel));
}

function injectCss() {
  if (document.getElementById("pp-photo-css")) return;
  const s = document.createElement("style");
  s.id = "pp-photo-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}

function ensureInput() {
  let input = $("[data-photo-file]");
  if (input) return input;
  input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png";
  input.hidden = true;
  input.setAttribute("data-photo-file", "");
  input.setAttribute("aria-hidden", "true");
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    input.value = "";
    if (file) openCrop(file);
  });
  document.body.appendChild(input);
  return input;
}

function ensureModal() {
  let dlg = $("[data-photo-crop]");
  if (dlg) return dlg;
  dlg = document.createElement("dialog");
  dlg.className = "pp-dlg";
  dlg.setAttribute("data-photo-crop", "");
  dlg.setAttribute("aria-labelledby", "pp-crop-title");
  dlg.innerHTML =
    '<div class="hd"><h2 id="pp-crop-title">Crop your photo</h2></div>' +
    '<div class="bd">' +
      '<div class="pp-stage" data-photo-stage>' +
        '<img alt="" data-photo-stage-img>' +
        '<span class="mask" aria-hidden="true"></span>' +
      "</div>" +
      '<label class="pp-zoom">Zoom <input type="range" min="1" max="3" step="0.01" value="1" data-photo-zoom></label>' +
      '<p class="err" data-photo-crop-err hidden></p>' +
      '<div class="acts">' +
        '<button type="button" class="btn btn-ghost" data-photo-crop-cancel>Cancel</button>' +
        '<button type="button" class="btn btn-gold" data-photo-crop-save>Save photo</button>' +
      "</div>" +
    "</div>";
  document.body.appendChild(dlg);

  const stage = $("[data-photo-stage]", dlg);
  let dragging = false, lx = 0, ly = 0;
  stage.addEventListener("pointerdown", (e) => {
    if (!crop) return;
    dragging = true;
    lx = e.clientX; ly = e.clientY;
    try { stage.setPointerCapture(e.pointerId); } catch {}
  });
  stage.addEventListener("pointermove", (e) => {
    if (!dragging || !crop) return;
    crop.x += e.clientX - lx;
    crop.y += e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    clampCrop();
    paintStage();
  });
  const stopDrag = () => { dragging = false; };
  stage.addEventListener("pointerup", stopDrag);
  stage.addEventListener("pointercancel", stopDrag);
  stage.addEventListener("wheel", (e) => {
    if (!crop) return;
    e.preventDefault();
    const z = $("[data-photo-zoom]", dlg);
    const next = Math.min(3, Math.max(1, crop.zoom + (e.deltaY < 0 ? 0.08 : -0.08)));
    z.value = String(next);
    setZoom(next);
  }, { passive: false });

  $("[data-photo-zoom]", dlg).addEventListener("input", (e) => setZoom(Number(e.target.value) || 1));
  $("[data-photo-crop-cancel]", dlg).addEventListener("click", () => closeCrop());
  $("[data-photo-crop-save]", dlg).addEventListener("click", () => saveCrop());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) closeCrop(); });
  dlg.addEventListener("close", () => releaseCropUrl());
  return dlg;
}

function wrapChrome() {
  $all(".side .me > .av, header.top > .av").forEach((av) => {
    if (av.closest(".av-edit")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "av-edit";
    btn.setAttribute("data-change-photo", "");
    btn.setAttribute("aria-label", "Change profile photo");
    av.replaceWith(btn);
    btn.appendChild(av);
    const cam = document.createElement("span");
    cam.className = "av-cam";
    cam.setAttribute("aria-hidden", "true");
    cam.innerHTML = CAM;
    btn.appendChild(cam);
  });
}

function lettersOf(el, fallback) {
  return (el.getAttribute("data-initials") || el.textContent || fallback || "··").trim() || "··";
}

/** Paint every initials hook, and any dedicated preview, with photo or letters. */
export function refreshAgentPhotos(photoURL, initials) {
  const url = (photoURL || "").trim();
  $all("[data-agent-initials]").forEach((el) => {
    const letters = initials ? initials : lettersOf(el, "··");
    el.setAttribute("data-initials", letters);
    const img = el.querySelector("img[data-agent-photo]");
    if (url) {
      Array.from(el.childNodes).forEach((n) => {
        if (n.nodeType === 3) n.remove();
      });
      let pic = img;
      if (!pic) {
        pic = document.createElement("img");
        pic.setAttribute("data-agent-photo", "");
        pic.alt = "";
        el.appendChild(pic);
      }
      pic.onerror = () => {
        pic.remove();
        el.textContent = letters;
      };
      if (pic.getAttribute("src") !== url) pic.src = url;
    } else {
      el.textContent = letters;
    }
  });
  const upload = $("[data-photo-upload]");
  if (upload) upload.textContent = url ? "Change photo" : "Upload photo";
  const rm = $("[data-photo-remove]");
  if (rm) rm.disabled = !url;
}

function showMsg(text, kind) {
  $all("[data-photo-msg]").forEach((el) => {
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("err", "ok");
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle("err", kind === "err");
    el.classList.toggle("ok", kind === "ok");
  });
}

function applyHelper(agent, storageOk) {
  const help = $("[data-photo-help]");
  if (!help) return;
  const bits = ["JPG or PNG, up to 2 MB. A square crop works best."];
  const isAgent = !!(agent && (agent.status === "agent" || (agent.isAgent === true && agent.status !== "guest" && agent.status !== "suspended")));
  if (agent && !isAgent) {
    bits.push("You’re signed in as a Guest. You can still set a photo — it belongs to this account, including after confirmation.");
  }
  if (storageOk === false) {
    bits.push("Photos cannot be stored yet (file storage is not writable). You can still crop a picture; saving will say so rather than pretend it worked.");
  }
  help.textContent = bits.join(" ");
}

function onProfilePage() {
  const path = (location.pathname || "").replace(/\/+$/, "");
  return /(^|\/)portal-profile(?:\.html)?$/.test(path);
}

function openPicker() {
  // Same pipeline from chrome and from Profile. Never navigate — even when
  // the avatar is clicked on a page that is not My Profile, the crop modal
  // is the change-photo flow. On Profile this also must not re-enter the page.
  showMsg("");
  ensureInput().click();
}

function rejectFile(file) {
  const type = (file.type || "").toLowerCase();
  const name = file.name || "";
  if (type === "image/gif" || /\.gif$/i.test(name))
    return "GIFs are not supported. Please choose a JPG or PNG.";
  if (!PHOTO_TYPES.includes(type) && !/\.jpe?g$|\.png$/i.test(name))
    return "Please choose a JPG or PNG.";
  if (file.size > PHOTO_MAX_BYTES)
    return "That file is larger than 2 MB. Please choose a smaller JPG or PNG.";
  return "";
}

function openCrop(file) {
  const why = rejectFile(file);
  if (why) {
    showMsg(why, "err");
    return;
  }
  const dlg = ensureModal();
  const err = $("[data-photo-crop-err]", dlg);
  err.hidden = true;
  err.textContent = "";
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    crop = {
      img, url,
      nw: img.naturalWidth || img.width,
      nh: img.naturalHeight || img.height,
      zoom: 1, x: 0, y: 0, base: 1, scale: 1,
    };
    crop.base = Math.max(STAGE / crop.nw, STAGE / crop.nh);
    crop.scale = crop.base;
    crop.x = (STAGE - crop.nw * crop.scale) / 2;
    crop.y = (STAGE - crop.nh * crop.scale) / 2;
    const stageImg = $("[data-photo-stage-img]", dlg);
    stageImg.src = url;
    $("[data-photo-zoom]", dlg).value = "1";
    paintStage();
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    showMsg("That picture could not be read. Please choose a different JPG or PNG.", "err");
  };
  img.src = url;
}

function setZoom(z) {
  if (!crop) return;
  const cx = STAGE / 2, cy = STAGE / 2;
  const ix = (cx - crop.x) / crop.scale;
  const iy = (cy - crop.y) / crop.scale;
  crop.zoom = Math.min(3, Math.max(1, z));
  crop.scale = crop.base * crop.zoom;
  crop.x = cx - ix * crop.scale;
  crop.y = cy - iy * crop.scale;
  clampCrop();
  paintStage();
}

function clampCrop() {
  if (!crop) return;
  const w = crop.nw * crop.scale, h = crop.nh * crop.scale;
  crop.x = Math.min(0, Math.max(STAGE - w, crop.x));
  crop.y = Math.min(0, Math.max(STAGE - h, crop.y));
}

function paintStage() {
  if (!crop) return;
  const el = $("[data-photo-stage-img]");
  if (!el) return;
  el.style.width = crop.nw * crop.scale + "px";
  el.style.height = crop.nh * crop.scale + "px";
  el.style.left = crop.x + "px";
  el.style.top = crop.y + "px";
}

function releaseCropUrl() {
  if (crop && crop.url) URL.revokeObjectURL(crop.url);
  crop = null;
}

function closeCrop() {
  const dlg = $("[data-photo-crop]");
  if (dlg && dlg.open) dlg.close();
  else releaseCropUrl();
}

function blobFromCrop() {
  if (!crop) return Promise.reject(new Error("nothing-to-crop"));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = OUT;
  const ctx = canvas.getContext("2d");
  const sx = (0 - crop.x) / crop.scale;
  const sy = (0 - crop.y) / crop.scale;
  const sw = STAGE / crop.scale;
  const sh = STAGE / crop.scale;
  ctx.drawImage(crop.img, sx, sy, sw, sh, 0, 0, OUT, OUT);
  return new Promise((res, rej) => {
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("crop-failed"))), "image/jpeg", 0.9);
  });
}

async function saveCrop() {
  const dlg = $("[data-photo-crop]");
  const save = $("[data-photo-crop-save]", dlg);
  const err = $("[data-photo-crop-err]", dlg);
  err.hidden = true;
  err.textContent = "";
  save.disabled = true;
  const was = save.textContent;
  save.textContent = "Saving…";
  try {
    const blob = await blobFromCrop();
    const url = await saveAgentPhotoBlob(blob);
    if (agentRef) agentRef.photoURL = url;
    refreshAgentPhotos(url);
    closeCrop();
    showMsg("Photo updated.", "ok");
  } catch (e) {
    const text = explainPhotoError(e);
    err.hidden = false;
    err.textContent = text;
    showMsg(text, "err");
    // Deliberately no success path here. Chrome stays on the previous photo.
  } finally {
    save.disabled = false;
    save.textContent = was;
  }
}

async function onRemove() {
  showMsg("");
  const btn = $("[data-photo-remove]");
  if (btn) btn.disabled = true;
  try {
    await clearAgentPhoto();
    if (agentRef) agentRef.photoURL = "";
    refreshAgentPhotos("");
    showMsg("Photo removed. Your initials will show instead.", "ok");
  } catch (e) {
    if (e && e.cleared) {
      if (agentRef) agentRef.photoURL = "";
      refreshAgentPhotos("");
      showMsg(explainPhotoError(e), "err");
      return;
    }
    showMsg(explainPhotoError(e), "err");
    if (btn) btn.disabled = !(agentRef && agentRef.photoURL);
  }
}

function wire() {
  document.addEventListener("click", (e) => {
    const change = e.target.closest("[data-change-photo]");
    if (change) {
      e.preventDefault();
      // On Profile this must not navigate or reload; openPicker never assigns location.
      void onProfilePage();
      openPicker();
      return;
    }
    if (e.target.closest("[data-photo-upload]")) {
      e.preventDefault();
      openPicker();
      return;
    }
    if (e.target.closest("[data-photo-remove]")) {
      e.preventDefault();
      onRemove();
    }
  });
}

export function initProfilePhoto(agent) {
  agentRef = agent || null;
  injectCss();
  ensureInput();
  ensureModal();
  wrapChrome();
  const initials = (() => {
    const s = ((agent && agent.full_name) || "").trim();
    if (s) return s.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    return ((agent && agent.email) || "?").slice(0, 2).toUpperCase();
  })();
  refreshAgentPhotos(agent && agent.photoURL, initials);
  applyHelper(agent, null);
  storageWritable()
    .then((ok) => applyHelper(agent, ok))
    .catch(() => applyHelper(agent, false))
    .finally(() => document.documentElement.setAttribute("data-photo-ready", "1"));
  if (!document.documentElement.hasAttribute("data-photo-wired")) {
    document.documentElement.setAttribute("data-photo-wired", "1");
    wire();
  }
}
