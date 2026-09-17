/* Reduce any link on this site to the ONE shape ?next= will accept: "page.html".
 *
 * WHY THIS EXISTS — a defect only the live site could show.
 *
 * Netlify's "pretty URLs" post-processing rewrites every internal href as it
 * serves the page: href="resources.html" goes out as href='/resources'. The
 * local test server does not do that, so the committed HTML and the served HTML
 * are DIFFERENT DOCUMENTS, and code that reads an href at runtime reads the
 * served one.
 *
 * The result, measured on paaipe.org: the recap button built
 * ?next=%2Fresources, the guard on the sign-up page refused it - correctly, it
 * has a leading slash and no .html - and the visitor who signed up to read the
 * recap was dropped in the Portal instead. The whole point of ?next= was to
 * stop exactly that.
 *
 * So a destination is NORMALISED here, where it is built, and still VALIDATED on
 * the page that consumes it. Two different jobs: this one makes a real link
 * usable, that one refuses anything it does not recognise. Neither replaces the
 * other, and the validator stays strict precisely because this is not the only
 * thing that can hand it a value - a hand-typed URL can too.
 *
 * Refused outright, rather than normalised: anything with a scheme
 * ("https:", "javascript:"), anything protocol-relative ("//evil.example"), and
 * any path climbing with "..". Those are not links to a page on this site, and
 * turning one into a page name would be inventing a destination nobody asked
 * for.
 */

/**
 * @param {string} href  any href from this site's markup, or a location.pathname
 * @param {string} fallback returned when there is no same-site page in it
 * @returns {string} "page.html", or the fallback
 */
export function samePage(href, fallback = "") {
  const raw = String(href || "").trim();
  if (!raw) return fallback;

  // A scheme or a protocol-relative prefix means it is somebody else's site.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return fallback;

  const path = raw.split(/[?#]/)[0];
  const segments = path.split("/");
  // "../.." is not a page on this site, and the last segment of it is a lie
  // about where the link goes.
  if (segments.some(s => s === "..")) return fallback;

  const last = segments.filter(Boolean).pop() || "";
  if (!last || last === ".") return fallback;

  const name = /\.html$/i.test(last) ? last : `${last}.html`;
  return /^[a-z0-9][a-z0-9-]*\.html$/i.test(name) ? name : fallback;
}
