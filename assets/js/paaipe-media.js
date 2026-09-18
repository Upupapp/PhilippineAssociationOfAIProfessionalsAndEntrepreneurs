/* PAAIPE media uploads — Linode Object Storage via media.paaipe.org.
 *
 * POST https://media.paaipe.org/upload
 *   Authorization: Bearer <Firebase ID token>
 *   multipart: file, kind, id   (id omitted for kind=photo)
 *   kind: photo | logo | poster | session | micro
 *   201: { url, path, kind }    url is https://media.paaipe.org/...
 *
 * Never invent a URL. A failed POST returns nothing and writes nothing.
 * Do not call Firebase Storage.
 */
export const MEDIA_UPLOAD_ENDPOINT = "https://media.paaipe.org/upload";

export const MEDIA_KIND = {
  PHOTO: "photo",
  LOGO: "logo",
  POSTER: "poster",
  SESSION: "session",
  MICRO: "micro",
};

const KINDS = new Set(Object.values(MEDIA_KIND));

export function isMediaKind(kind) {
  return KINDS.has(kind);
}

/** Multipart body. id is required for every kind except photo. */
export function buildMediaFormData({ file, kind, id } = {}) {
  if (!isMediaKind(kind)) {
    throw Object.assign(new Error("Unknown upload kind. Nothing was uploaded."), {
      code: "media/bad-kind",
    });
  }
  if (!file) {
    throw Object.assign(new Error("No file was chosen. Nothing was uploaded."), {
      code: "media/no-file",
    });
  }
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  if (kind !== MEDIA_KIND.PHOTO) {
    const ident = String(id || "").trim();
    if (!ident) {
      throw Object.assign(
        new Error("An id is required to upload that file. Nothing was uploaded."),
        { code: "media/no-id" }
      );
    }
    form.append("id", ident);
  }
  return form;
}

function statusError(status, bodyText) {
  const trimmed = String(bodyText || "").trim();
  let detail = "";
  if (status === 401) {
    detail = "Sign-in expired or missing.";
  } else if (status === 403) {
    detail = "You do not have permission to upload that.";
  } else if (trimmed && trimmed.length < 280 && !/^[\s{[]/.test(trimmed)) {
    detail = trimmed.replace(/\.?$/, ".");
  } else {
    detail = `Upload failed (${status}).`;
  }
  const err = new Error(`${detail} Nothing was uploaded.`);
  err.code = status === 401 ? "media/unauthorized"
    : status === 403 ? "media/forbidden"
    : "media/upload-failed";
  err.status = status;
  return err;
}

function invalidResponse() {
  return Object.assign(
    new Error("Upload did not return a media URL. Nothing was saved."),
    { code: "media/invalid-response" }
  );
}

/** True only for a URL the endpoint is contracted to return. */
export function isMediaPaaipeUrl(url) {
  return typeof url === "string" && url.startsWith("https://media.paaipe.org/");
}

/**
 * POST the file. Resolves to { url, path, kind } from the 201 body.
 * Throws on any other status or a body without url+path — never invents a URL.
 */
export async function postMediaUpload({
  file, kind, id, token, fetchImpl,
} = {}) {
  if (!token) {
    throw Object.assign(new Error("You need to be signed in to upload."), {
      code: "not-signed-in",
    });
  }
  const form = buildMediaFormData({ file, kind, id });
  const fetchFn = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!fetchFn) {
    throw Object.assign(new Error("Upload is unavailable in this browser. Nothing was uploaded."), {
      code: "media/no-fetch",
    });
  }
  let res;
  try {
    res = await fetchFn(MEDIA_UPLOAD_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch (e) {
    throw Object.assign(
      new Error("Could not reach media.paaipe.org. Nothing was uploaded."),
      { code: "media/network", cause: e }
    );
  }
  if (res.status !== 201) {
    let text = "";
    try { text = await res.text(); } catch { /* ignore */ }
    throw statusError(res.status, text);
  }
  let data;
  try { data = await res.json(); }
  catch {
    throw invalidResponse();
  }
  const url = typeof data?.url === "string" ? data.url.trim() : "";
  const path = typeof data?.path === "string" ? data.path.trim() : "";
  if (!url || !path || !isMediaPaaipeUrl(url)) throw invalidResponse();
  return { url, path, kind: data.kind || kind };
}

/** Wrap a crop blob so the multipart part has a filename and type. */
export function fileFromBlob(blob, filename, type) {
  if (blob instanceof File && blob.name) return blob;
  const name = filename || (blob && blob.name) || "upload.bin";
  const t = type || (blob && blob.type) || "application/octet-stream";
  return new File([blob], name, { type: t });
}
