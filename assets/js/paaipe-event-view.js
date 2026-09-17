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
  groupSponsors, registrationState, TIER, coverFor, galleryOf,
} from "/assets/js/paaipe-events-data.js";
import { currentAgent } from "/assets/js/paaipe-firebase.js";
import { samePage } from "/assets/js/paaipe-samepage.js";

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

/* ------------------------------------------------------------- the pictures */

const GALLERY_CSS = `
.pgal{margin-top:40px}
.pgal h2{margin-bottom:6px}
.pgal .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:16px}
@media (min-width:760px){.pgal .grid{grid-template-columns:repeat(3,1fr)}}
.pgal figure{margin:0;border-radius:14px;overflow:hidden;background:var(--pale,#EAF3FC);cursor:zoom-in;
  border:0;padding:0;display:block;width:100%;text-align:left}
.pgal figure img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;transition:transform .25s}
.pgal figure:hover img{transform:scale(1.03)}
.pgal figcaption{font-size:12.5px;color:var(--muted,#4a5a7a);padding:8px 10px;line-height:1.45}
.plb{border:0;padding:0;background:transparent;max-width:none;width:100vw;height:100vh;max-height:none}
.plb::backdrop{background:rgba(3,15,45,.88)}
.plb .in{display:grid;place-items:center;height:100%;padding:24px}
.plb img{max-width:min(1100px,92vw);max-height:78vh;object-fit:contain;border-radius:12px;display:block}
.plb .cap{color:#EAF3FC;font-size:14px;margin-top:14px;text-align:center;max-width:60ch}
.plb .x{position:fixed;top:18px;right:18px;width:42px;height:42px;border-radius:12px;border:1px solid rgba(255,255,255,.3);
  background:rgba(255,255,255,.1);color:#fff;font-size:22px;line-height:1;cursor:pointer}
.plb .nav{position:fixed;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;
  border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1);color:#fff;font-size:20px;cursor:pointer}
.plb .prev{left:18px}.plb .next{right:18px}`;

/* A lightbox, opened from the gallery. Esc and the backdrop close it, the arrow
 * keys move, and focus returns to the photo that opened it - a viewer who came
 * in by keyboard must not be dropped at the top of the page on the way out. */
function openLightbox(rows, start, opener) {
  let i = start;
  const d = document.createElement("dialog");
  d.className = "plb";
  // Focusable, and re-focused after every repaint. Replacing the contents
  // destroys whatever had focus, which drops it to <body> - and <body> is not
  // inside the dialog, so the arrow keys stopped reaching this handler after the
  // first move. Caught by the test for it.
  d.tabIndex = -1;
  const paint = () => {
    const g = rows[i];
    d.innerHTML = `<button class="x" type="button" data-x aria-label="Close">&times;</button>
      ${rows.length > 1 ? `<button class="nav prev" type="button" data-prev aria-label="Previous">&#8249;</button>
        <button class="nav next" type="button" data-next aria-label="Next">&#8250;</button>` : ""}
      <div class="in"><div><img src="${esc(g.url)}" alt="${esc(g.alt)}">
        ${g.caption ? `<p class="cap">${esc(g.caption)}</p>` : ""}</div></div>`;
    d.focus();
  };
  paint();
  document.body.appendChild(d);
  const move = n => { i = (i + n + rows.length) % rows.length; paint(); };
  d.addEventListener("click", e => {
    if (e.target.closest("[data-x]") || e.target === d) return d.close();
    if (e.target.closest("[data-prev]")) return move(-1);
    if (e.target.closest("[data-next]")) return move(1);
  });
  d.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") move(-1);
    if (e.key === "ArrowRight") move(1);
  });
  d.addEventListener("close", () => { d.remove(); opener?.focus(); }, { once: true });
  d.showModal();
}

/** The Photos section, from the record. Hidden entirely when there is nothing -
 *  an empty gallery is not a thing to show. */
export function renderGallery(host, ev) {
  if (!host) return 0;
  const rows = galleryOf(ev);
  if (!rows.length) { host.innerHTML = ""; host.hidden = true; return 0; }
  if (!document.querySelector("[data-gallery-styles]")) {
    const st = document.createElement("style");
    st.setAttribute("data-gallery-styles", "");
    st.textContent = GALLERY_CSS;
    document.head.appendChild(st);
  }
  host.hidden = false;
  host.className = "pgal";
  host.innerHTML = `<h2>Photos</h2>
    <div class="grid">${rows.map((g, i) => `
      <figure role="button" tabindex="0" data-ph-open="${i}" aria-label="${esc(g.alt)} — open larger">
        <img src="${esc(g.url)}" alt="${esc(g.alt)}" loading="lazy">
        ${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ""}
      </figure>`).join("")}</div>`;
  const open = el => openLightbox(rows, Number(el.dataset.phOpen), el);
  $$("[data-ph-open]", host).forEach(el => {
    el.addEventListener("click", () => open(el));
    el.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(el); }
    });
  });
  return rows.length;
}

/** The picture at the top of the page, from the record.
 *
 *  THE SHARE CARD IS NOT DONE HERE, and cannot be. og:image is read by
 *  crawlers - Facebook, LinkedIn, Messenger - which do not run JavaScript, so
 *  rewriting the meta tag from here would change nothing a sharer ever sees
 *  while looking, in a browser, exactly like it worked. It stays in the page's
 *  HTML, and the admin Media tab says which line to paste and why. */
function renderCover(ev) {
  const img = $("[data-cover] img") || $(".cover img");
  const url = coverFor(ev);
  // A missing picture must never blank a page that already had one.
  if (img && url) img.setAttribute("src", url);
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
    //
    // RETURNING HERE WAS A BUG. The page then kept whatever its HTML said, and
    // the HTML says "Register now" - so an UNPUBLISHED event went on inviting
    // registrations, and the form would have taken them. Falling back to the
    // markup is right when the network fails and wrong when the answer is "this
    // is not public": those are different cases and only one of them means the
    // page was telling the truth a moment ago.
    const cta = $("[data-register-cta]");
    if (cta) {
      cta.innerHTML = `<span class="btn btn-ghost" aria-disabled="true" data-cta-closed>This event is not available</span>`;
      cta.setAttribute("data-cta-state", "not-found");
    }
    const spon = $("[data-sponsors]");
    if (spon) { spon.innerHTML = ""; spon.hidden = true; }
    const gal = $("[data-gallery-mount]");
    if (gal) { gal.innerHTML = ""; gal.hidden = true; }
    document.documentElement.setAttribute("data-event-view", "not-found");
    return;
  }

  $$("[data-ev-title]").forEach(e => { e.textContent = ev.title; });
  renderRegisterCta($("[data-register-cta]"), ev);
  renderCover(ev);
  const shots = renderGallery($("[data-gallery-mount]"), ev);
  document.documentElement.setAttribute("data-gallery", String(shots));

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

/* MEMBERS-ONLY LINKS ON A PUBLIC PAGE.
 *
 * "Recap resources" on a held event is a member benefit, so a visitor who is not
 * signed in is sent to sign up instead of to the materials.
 *
 * THE LABEL CHANGES WITH THE DESTINATION. A button that still said "Recap
 * resources" while landing on a sign-up form would be a bait-and-switch - the
 * visitor clicked for one thing and got another. So when the destination becomes
 * the sign-up page the button says so, and the click delivers exactly what it
 * offered. It goes back to the plain label for anyone who is signed in.
 *
 * THIS IS A PROMPT, NOT A LOCK, and it must not be described as one. Resources
 * is a public page reachable from the main navigation, so nothing here withholds
 * anything; it puts the sign-up in front of the person most likely to want it.
 * Making it a real gate means gating resources.html itself, which is a separate
 * decision about whether those materials are members-only at all.
 *
 * The markup keeps the real href, so the link works with no JavaScript and for
 * anybody who clicks before currentAgent() resolves - which lands them on the
 * same public page they could have reached from the nav.
 */
async function gateMembersLinks() {
  const links = $$("[data-members-only]");
  if (!links.length) return;
  let signedIn = false;
  try { signedIn = Boolean(await currentAgent()); }
  catch { /* cannot tell: leave the plain public link alone */ 
    document.documentElement.setAttribute("data-members-links", "unknown");
    return;
  }
  for (const a of links) {
    if (signedIn) { a.setAttribute("data-members-state", "member"); continue; }
    // NOT the raw attribute. Netlify rewrites href="resources.html" to
    // "/resources" as it serves the page, and ?next=%2Fresources is refused by
    // the guard on the sign-up page - so the visitor signed up and landed in
    // the Portal. Measured on the live site; the local server never rewrites.
    const dest = samePage(a.getAttribute("href"));
    a.setAttribute("href", dest ? `signup.html?next=${encodeURIComponent(dest)}` : "signup.html");
    const label = a.dataset.membersLabel;
    if (label) a.textContent = label;
    a.setAttribute("data-members-state", "prompt");
  }
  document.documentElement.setAttribute("data-members-links", signedIn ? "member" : "prompt");
}

renderEventPage();
renderPartnerLogos();
gateMembersLinks();
