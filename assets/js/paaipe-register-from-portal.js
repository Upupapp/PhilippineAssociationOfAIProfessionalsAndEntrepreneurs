/* Prefill a public event registration form from a persisted Firebase session,
 * and send a portal Agent back to Event Details instead of the public page.
 *
 * AUTH, NOT A QUERY PARAM. A signed-in Agent opening the form without
 * ?from=portal still gets their account email and name. A public visitor sees
 * a blank form. Nothing here forces a sign-in.
 *
 * PORTAL BACK IS DETERMINISTIC. Portal Register CTAs pass ?from=portal&event=
 * so "Back to the event" can land on portalEventDetailHref(id) — today the
 * #37 Event Details view (portal-events.html#event=<id>). When Ericson lands
 * a dedicated page, that helper is the one swap. Without the portal hint the
 * public event page stays the back target, including a signed-in Agent who
 * arrived from the public site.
 *
 * Readonly, never disabled: a disabled field is dropped from FormData, and
 * the write would then go out without the account email.
 */
import { currentAgent } from "/assets/js/paaipe-firebase.js";
import { portalEventDetailHref } from "/assets/js/paaipe-portal-event-url.js";

function queryOf(search = location.search) {
  return new URLSearchParams(String(search || "").replace(/^\?/, ""));
}

function docOf(root) {
  return root?.ownerDocument || (root?.nodeType === 9 ? root : document);
}

/** True when a portal Register CTA (or an equivalent typed hint) sent them. */
export function isPortalRegisterContext(search = location.search) {
  return queryOf(search).get("from") === "portal";
}

/** Prefer ?event=, then the form's hidden event_id, then data-register-slug. */
export function eventIdFromRegisterPage(root = document, search = location.search) {
  const fromQuery = (queryOf(search).get("event") || "").trim();
  if (fromQuery) return fromQuery;
  const scope = root?.querySelector ? root : document;
  const hidden = scope.querySelector?.('[name="event_id"]');
  const fromForm = String(hidden?.value || "").trim();
  if (fromForm) return fromForm;
  const body = docOf(scope).body;
  const slug = body?.getAttribute?.("data-register-slug") || "";
  return slug.replace(/^event-/, "").trim();
}

/** Register Back target. Delegates so a later dedicated page is one swap. */
export function portalBackHref(eventId) {
  return portalEventDetailHref(eventId);
}

export function lockAccountField(input, value, title) {
  if (!input || !value) return false;
  input.value = value;
  input.readOnly = true;
  input.setAttribute("aria-readonly", "true");
  input.classList.add("account-locked");
  if (title) input.title = title;
  input.style.background = "var(--pale)";
  input.style.cursor = "not-allowed";
  return true;
}

export function applyRegisterAccountPrefill(root, agent) {
  const html = docOf(root).documentElement;
  if (!agent) {
    html.setAttribute("data-register-prefill", "visitor");
    return false;
  }
  const email = String(agent.email || "").trim();
  const name = String(agent.full_name || agent.displayName || "").trim();
  const em = root.querySelector("#em") || root.querySelector('[name="email"]');
  const fn = root.querySelector("#fn") || root.querySelector('[name="full_name"]');
  if (email && em) {
    lockAccountField(em, email, "Your sign-in email. Contact PAAIPE to change it.");
    const help = em.closest(".f")?.querySelector(".help");
    if (help) help.textContent = "Confirmation and Zoom access details go to this account email.";
  }
  if (name && fn) {
    lockAccountField(fn, name, "Your account name.");
  }
  html.setAttribute("data-register-prefill", "signed-in");
  return true;
}

export function applyRegisterBackLink(root, { fromPortal, eventId } = {}) {
  const a = docOf(root).querySelector("[data-register-back], nav a.back");
  if (!a) return "";
  if (!fromPortal) {
    a.setAttribute("data-register-back-to", "public");
    return a.getAttribute("href") || "";
  }
  const href = portalBackHref(eventId);
  a.setAttribute("href", href);
  a.setAttribute("data-register-back-to", "portal");
  return href;
}

(async function () {
  const form = document.getElementById("reg");
  if (!form) return;
  const fromPortal = isPortalRegisterContext();
  const eventId = eventIdFromRegisterPage(document, location.search);
  applyRegisterBackLink(document, { fromPortal, eventId });
  document.documentElement.setAttribute("data-register-from", fromPortal ? "portal" : "public");
  let agent = null;
  try { agent = await currentAgent(); }
  catch { agent = null; }
  applyRegisterAccountPrefill(form, agent);
})();
