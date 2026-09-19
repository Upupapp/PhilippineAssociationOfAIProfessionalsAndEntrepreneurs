/* ONE place a portal Agent is sent to "this event".
 *
 * LIVE — Ericson UI bar unlocked (#37 + #43):
 *   portal-events.html#event=<id>
 *   portal-events.html#event=<id>&tab=feedback
 *
 * DEDICATED — only if another agent actually ships that page:
 *   portal-event.html?id=<id>
 *
 * Do not invent portal-event.html here. Register Back and in-portal
 * portalEventHref() both call portalEventDetailHref so the swap is this
 * file only. Flip to dedicated with PAAIPE_PORTAL_EVENT_PAGE = true, or
 * when adoptDedicatedPortalEventPageIfPresent() sees that HTML.
 */
export const PORTAL_EVENT_DETAIL_LIVE = {
  PAGE: "portal-events.html",
  ID_KEY: "event",
  FORM: "hash",
};

export const PORTAL_EVENT_DETAIL_DEDICATED = {
  PAGE: "portal-event.html",
  ID_KEY: "id",
  FORM: "query",
};

/** Default / documented live spec (#37 Event Details). */
export const PORTAL_EVENT_DETAIL = PORTAL_EVENT_DETAIL_LIVE;

export function portalEventDetailSpec() {
  if (globalThis.PAAIPE_PORTAL_EVENT_PAGE === true) return PORTAL_EVENT_DETAIL_DEDICATED;
  if (globalThis.PAAIPE_PORTAL_EVENT_PAGE === false) return PORTAL_EVENT_DETAIL_LIVE;
  return PORTAL_EVENT_DETAIL;
}

function pairString(pairs) {
  return Object.entries(pairs)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

/** Canonical portal Event Details URL. tab is omitted for Overview. */
export function portalEventDetailHref(eventId, tab, spec) {
  const s = spec || portalEventDetailSpec();
  const page = s.PAGE;
  const key = s.ID_KEY;
  const id = String(eventId || "").trim();
  if (!id) return page;
  const pairs = { [key]: id };
  const t = String(tab || "").trim();
  if (t && t !== "overview") pairs.tab = t;
  const body = pairString(pairs);
  return s.FORM === "query" ? `${page}?${body}` : `${page}#${body}`;
}

/** If portal-event.html is on this host, use it. Otherwise stay on #37. */
export async function adoptDedicatedPortalEventPageIfPresent() {
  if (globalThis.PAAIPE_PORTAL_EVENT_PAGE === true) return true;
  if (globalThis.PAAIPE_PORTAL_EVENT_PAGE === false) return false;
  try {
    const r = await fetch(PORTAL_EVENT_DETAIL_DEDICATED.PAGE, { method: "GET", cache: "no-store" });
    if (!r.ok) return false;
    globalThis.PAAIPE_PORTAL_EVENT_PAGE = true;
    return true;
  } catch {
    return false;
  }
}
