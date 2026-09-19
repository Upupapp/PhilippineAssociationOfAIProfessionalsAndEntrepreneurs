/* ONE place a portal Agent is sent to "this event".
 *
 * LIVE (#37 / UI bar): Event Details on the Events list page
 *   portal-events.html#event=<id>
 *   portal-events.html#event=<id>&tab=feedback
 *
 * Aryhan: #event= or portal-event.html?id= — Engineering picked the hash
 * (already URL-sweep). Do not invent a dedicated page or a second IA here.
 * Register Back and in-portal deep links both call portalEventDetailHref
 * so a later swap is this file only.
 */
export const PORTAL_EVENT_DETAIL = {
  PAGE: "portal-events.html",
  ID_KEY: "event",
  // "hash" = #key=value  (live #37)
  // "query" = ?key=value (expected dedicated-page form)
  FORM: "hash",
};

function pairString(pairs) {
  return Object.entries(pairs)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

/** Canonical portal Event Details URL. tab is omitted for Overview. */
export function portalEventDetailHref(eventId, tab) {
  const page = PORTAL_EVENT_DETAIL.PAGE;
  const key = PORTAL_EVENT_DETAIL.ID_KEY;
  const id = String(eventId || "").trim();
  if (!id) return page;
  const pairs = { [key]: id };
  const t = String(tab || "").trim();
  if (t && t !== "overview") pairs.tab = t;
  const body = pairString(pairs);
  return PORTAL_EVENT_DETAIL.FORM === "query" ? `${page}?${body}` : `${page}#${body}`;
}
