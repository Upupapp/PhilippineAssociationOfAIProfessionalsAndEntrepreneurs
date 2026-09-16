/* PAAIPE — the public face of an event, rendered from the shared records.
 *
 * The event page, the registration page and the Partners page all read the same
 * documents the admin console writes. Confirm a sponsor in admin and its logo
 * appears here on the next page load; set it back to proposed and it goes. No
 * rebuild, no deploy, no Netlify build minute.
 *
 * WHAT A VISITOR NEVER SEES, and why it is not merely hidden:
 *   - a sponsorship that is only PROPOSED. firestore.rules refuses to serve it,
 *     so it is absent from the response rather than filtered out of a list the
 *     browser was handed. The Partners page's own notice forbids announcing a
 *     benefit or partner before it is agreed; this is that rule, enforced.
 *   - a DRAFT event. Same mechanism: unreadable, so the page says not found.
 *
 * The page keeps working if Firestore is unreachable: whatever the HTML already
 * says stays on screen. A network failure must never blank an event page - it is
 * the page people are trying to read to find out when to turn up.
 */
import {
  getEventBySlug, listEventSponsors, listOrganizations,
  groupSponsors, registrationState, TIER,
} from "/assets/js/paaipe-events-data.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** A logo, linked to the organization's own site. The mockup linked every logo
 *  to "#", so four partners who agreed to be credited got a dead link each. */
function logo(row, cls) {
  const o = row.organization;
  const img = `<img src="${esc(o.logoUrl)}" alt="${esc(o.name)}" loading="lazy">`;
  return o.website
    ? `<a class="${cls}" href="${esc(o.website)}" target="_blank" rel="noopener"
         title="${esc(o.name)}">${img}</a>`
    : `<span class="${cls}" title="${esc(o.name)}">${img}</span>`;
}

export function renderSponsors(host, rows) {
  if (!host) return;
  const g = groupSponsors(rows);
  if (!g.any) {
    // No confirmed sponsor is a fact, not an error, and not an empty box.
    host.innerHTML = "";
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const parts = [];

  if (g.presenting.length) {
    parts.push(`<div class="spon-presenting">
      <h3>Presented with</h3>
      <div class="spon-lead">${g.presenting.map(r => logo(r, "spon-big")).join("")}
        <b>${g.presenting.map(r => esc(r.organization.name)).join(", ")}</b></div></div>`);
  }
  if (g.supporting.length) {
    parts.push(`<div class="spon-supporting">
      <h3>With support from</h3>
      <div class="partners">${g.supporting.map(r => logo(r, "")).join("")}</div></div>`);
  }
  if (g.community.length) {
    parts.push(`<div class="spon-community">
      <h3>In partnership with</h3>
      <div class="partners partners-sm">${g.community.map(r => logo(r, "")).join("")}</div></div>`);
  }
  host.innerHTML = parts.join("");
}

/** The Register button, and what it says when there is nothing to press.
 *  Both come from the event's own status, so the page cannot offer a
 *  registration the form would refuse. */
export function renderRegisterCta(host, ev) {
  if (!host) return;
  const st = registrationState(ev);
  const href = host.dataset.registerHref || "";
  host.innerHTML = st.open && href
    ? `<a class="btn btn-gold" href="${esc(href)}">Register now</a>`
    : `<span class="btn btn-ghost" aria-disabled="true" data-cta-closed>${esc(st.label)}</span>`;
  host.setAttribute("data-cta-state", st.reason);
}

async function renderEventPage() {
  const root = $("[data-event-slug]");
  if (!root) return;
  const slug = root.dataset.eventSlug;
  let ev = null;
  try { ev = await getEventBySlug(slug); }
  catch { document.documentElement.setAttribute("data-event-view", "offline"); return; }

  if (!ev) {
    // Either there is no such event or it is a draft - and from out here those
    // are deliberately the same thing.
    document.documentElement.setAttribute("data-event-view", "not-found");
    return;
  }

  $$("[data-ev-title]").forEach(e => { e.textContent = ev.title; });
  renderRegisterCta($("[data-register-cta]"), ev);

  try {
    renderSponsors($("[data-sponsors]"), await listEventSponsors(ev.id));
  } catch { /* leave whatever the page already showed */ }

  document.documentElement.setAttribute("data-event-view", ev.status);
}

/** The Partners page, from the same organization records the event pages credit.
 *  Change a logo in admin and it updates in both places, because there is only
 *  one place it is stored. */
async function renderPartnerLogos() {
  const host = $("[data-partner-logos]");
  if (!host) return;
  let orgs = [];
  try { orgs = await listOrganizations(); } catch { return; }
  const live = orgs.filter(o => o.status === "active" && o.logoUrl);
  if (!live.length) return;
  $$("[data-org-logo]").forEach(img => {
    const o = live.find(x => x.id === img.dataset.orgLogo);
    if (o) { img.src = o.logoUrl; img.alt = o.name; }
  });
  document.documentElement.setAttribute("data-partner-logos", String(live.length));
}

renderEventPage();
renderPartnerLogos();
