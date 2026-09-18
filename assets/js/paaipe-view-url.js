/* In-page view URLs for this static Netlify site.
 *
 * Pages are real HTML files, so moving between them already changes the path.
 * Tabs, filters, drawers and popups used to change the screen while the address
 * bar stayed put — Back skipped the view, and a pasted link could not open it.
 *
 * Hash form: #key=value&key2=value2
 * That is the scheme already live for Learnings (#tab=sessions|#tab=micros) and
 * the admin event workspace (#event=…&tab=…). Query params already in use
 * (?session=, ?rec=, ?agent=, ?id=, ?new=, ?next=, ?event=) stay query params.
 * Nothing here invents a path router: pretty URLs and the *.html → /:splat
 * redirects in netlify.toml keep working.
 */

/** Parse a hash or search string into a { key: value } map. */
export function parsePairs(raw) {
  const out = {};
  const s = String(raw || "").replace(/^[#?]/, "");
  if (!s) return out;
  for (const part of s.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const keySrc = eq < 0 ? part : part.slice(0, eq);
    const valSrc = eq < 0 ? "" : part.slice(eq + 1);
    let k = "";
    let v = "";
    try { k = decodeURIComponent(keySrc.replace(/\+/g, " ")).trim(); }
    catch { k = keySrc.trim(); }
    try { v = decodeURIComponent(valSrc.replace(/\+/g, " ")).trim(); }
    catch { v = valSrc.trim(); }
    if (k) out[k] = v;
  }
  return out;
}

/** Serialize params as a hash fragment, or "" when there is nothing to say. */
export function formatHash(params = {}) {
  const parts = [];
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `#${parts.join("&")}` : "";
}

export function readHash(hash = typeof location !== "undefined" ? location.hash : "") {
  return parsePairs(hash);
}

export function readSearch(search = typeof location !== "undefined" ? location.search : "") {
  return parsePairs(search);
}

/** Hash wins over search for the same key — the in-page view is the screen. */
export function readView() {
  return { ...readSearch(), ...readHash() };
}

function currentHref() {
  return location.pathname + location.search + (location.hash || "");
}

function hrefWithHash(params) {
  return location.pathname + location.search + formatHash(params);
}

/**
 * Write the hash. push=true (default) creates a history entry so Back works.
 * replace=true (or push=false) canonicalises without adding a step.
 * Returns true when the address bar actually changed.
 */
export function writeHash(params, { push = true } = {}) {
  const next = hrefWithHash(params);
  if (next === currentHref()) return false;
  if (push) history.pushState({ paaipeView: 1 }, "", next);
  else history.replaceState({ paaipeView: 1 }, "", next);
  return true;
}

/** Merge a patch into the current hash. Empty/null values drop the key. */
export function patchHash(patch, opts) {
  const cur = readHash();
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") delete cur[k];
    else cur[k] = String(v);
  }
  return writeHash(cur, opts);
}

/**
 * Write the query string (pathname + search), keeping any hash.
 * Used by pages that already document ?id= / ?new= / ?session= as the contract.
 */
export function writeSearch(params, { push = true } = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    sp.set(k, String(v));
  }
  const q = sp.toString();
  const next = location.pathname + (q ? `?${q}` : "") + (location.hash || "");
  if (next === currentHref()) return false;
  if (push) history.pushState({ paaipeView: 1 }, "", next);
  else history.replaceState({ paaipeView: 1 }, "", next);
  return true;
}

/** Subscribe to Back/Forward and to hash links. Returns an unsubscribe.
 *  popstate and hashchange both fire when the hash changes via Back; those
 *  are coalesced so a listener runs once per actual address-bar change.
 */
export function onViewChange(fn) {
  let tok = 0;
  const run = () => {
    const id = ++tok;
    queueMicrotask(() => { if (id === tok) fn(readView()); });
  };
  window.addEventListener("hashchange", run);
  window.addEventListener("popstate", run);
  return () => {
    window.removeEventListener("hashchange", run);
    window.removeEventListener("popstate", run);
  };
}

/**
 * Wire a chip/tab strip whose buttons carry data-filter.
 * The default (fallback) is omitted from the hash so /events stays /events.
 * Clicking another chip writes #filter=…; Back restores it.
 */
export function bindFilterChips({
  chips,
  apply,
  key = "filter",
  fallback = "all",
  allowed,
} = {}) {
  const list = [...(chips || [])];
  const ok = v => {
    if (!v) return false;
    if (!allowed) return true;
    return Array.isArray(allowed) ? allowed.includes(v) : allowed.has(v);
  };
  const fromLoc = () => {
    const v = readView()[key];
    return ok(v) ? v : fallback;
  };
  const paint = name => {
    const f = ok(name) ? name : fallback;
    list.forEach(c => {
      const on = c.getAttribute("data-filter") === f;
      c.classList.toggle("on", on);
      if (c.hasAttribute("aria-pressed")) c.setAttribute("aria-pressed", on ? "true" : "false");
    });
    apply(f);
  };
  list.forEach(ch => {
    ch.addEventListener("click", () => {
      const f = ch.getAttribute("data-filter");
      paint(f);
      const params = readHash();
      if ((ok(f) ? f : fallback) === fallback) delete params[key];
      else params[key] = f;
      writeHash(params, { push: true });
    });
  });
  paint(fromLoc());
  onViewChange(() => paint(fromLoc()));
}
