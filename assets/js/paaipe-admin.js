/* PAAIPE — the admin console and its door.
 *
 * WHAT THIS FILE IS, AND WHAT IT IS NOT.
 *
 * It is not a security boundary, and nothing here should ever be mistaken for
 * one. paaipe.org is a static site: admin.html is a public file that anybody can
 * fetch, and every line of this script runs on the visitor's machine where they
 * can change it. A guard written in JavaScript can only decide what to SHOW.
 *
 * What actually protects PAAIPE's data is firestore.rules, deployed to Firebase,
 * where isAdmin() names the administrators. A person who strips this guard out
 * reaches an empty console: every read they attempt comes back
 * permission-denied. That is the design - the page is a viewer, the rules are
 * the lock.
 *
 * So this file never decides who is an admin. It ASKS, via isAdminNow(), which
 * measures what the deployed rules permit.
 */
import {
  currentAgent, signIn, signOutNow, resetPassword, friendlyAuthError,
  isAdminNow, listMembers, listRegistrations, confirmMember, setMemberStatus,
  countNewPartnerApplications,
  verifyResetCode, completePasswordReset, extractResetCode,
  STATUS,
} from "/assets/js/paaipe-firebase.js";
import { writeHash, readHash, onViewChange } from "/assets/js/paaipe-view-url.js";

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** A Firestore Timestamp, a plain {seconds} (what the REST API returns), a
 *  Date, or nothing. Never invents a date: a profile written before createdAt
 *  existed shows a dash, not today. */
function when(ts) {
  const d = ts?.toDate ? ts.toDate()
          : ts instanceof Date ? ts
          : Number.isFinite(ts?.seconds) ? new Date(ts.seconds * 1000)
          : null;
  if (!d || isNaN(d)) return "—";
  return d.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" });
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const PILL = {
  [STATUS.AGENT]:     ['pill ok',   'Agent'],
  [STATUS.GUEST]:     ['pill warn', 'Guest · awaiting confirmation'],
  [STATUS.SUSPENDED]: ['pill err',  'Suspended'],
};

function statusOf(m) {
  return m.status === STATUS.AGENT ? STATUS.AGENT
       : m.status === STATUS.SUSPENDED ? STATUS.SUSPENDED
       : STATUS.GUEST;
}

/* ----------------------------------------------------------------- the shell */

/* The admin sidebar, in ONE place.
 *
 * The mockup ships the same <aside> pasted into eleven files. Pasted navigation
 * is how a link ends up correct on ten pages and dead on the eleventh, so it is
 * rendered from this list instead and every page gets the same one.
 *
 * `built: false` marks a destination the mockup drew but PAAIPE cannot yet fill
 * with anything true - there is no Event store, no benefit or claim data, no
 * role model, and no way to send mail. Those appear, greyed, saying what they
 * are waiting for, rather than linking to a page of invented rows. Showing the
 * gap is honest; hiding it would make the console look finished.
 */
/* The admin sidebar, in ONE place, grouped the way the design groups it.
 *
 * `built: false` marks a destination the design draws but PAAIPE cannot yet fill
 * with anything true. Those appear, greyed and not clickable, saying what they
 * are waiting for. Six pages of sample rows would make the console look
 * finished; naming the gap says where the work actually is.
 *
 * `badge` is a COUNT, filled in at render time from real data. It is never a
 * hardcoded number: a badge saying 38 next to an empty list is a lie with a
 * very short shelf life.
 */
export const ADMIN_NAV = [
  { href: "admin.html",               label: "Dashboard",         icon: "home",   built: true },
  { sec: "EVENTS" },
  { href: "admin-events.html",        label: "Events",            icon: "cal",    built: true },
  { href: "admin-reports.html",       label: "Reports",           icon: "chart",  built: true },
  { href: "admin-contacts.html#types=registrant", label: "Registrations", icon: "check", built: true, badge: "registrations" },
  { href: "admin-partners.html",      label: "Partner applications", icon: "hand", built: true, badge: "partners" },
  { href: "admin-speaker-brief.html", label: "Speaker brief",     icon: "doc",    built: true },
  { sec: "PEOPLE" },
  { href: "admin-contacts.html",       label: "Contacts",         icon: "people", built: true },
  { href: "admin-contacts.html#types=guest", label: "Verifications", icon: "shield", built: true, badge: "pending" },
  { sec: "CONTENT" },
  { href: "admin-learnings.html",     label: "Learnings",         icon: "play",   built: true },
  { href: "admin-organizations.html", label: "Organizations",     icon: "org",    built: true },
  { label: "Benefits",       icon: "ticket", waiting: "no benefit, code or claim data exists" },
  { label: "Programs",       icon: "compass", waiting: "no enrolment data exists" },
  { label: "Resources",      icon: "book",   waiting: "resources are a static page" },
  { label: "Announcements",  icon: "mega",   waiting: "no announcement data exists" },
  { label: "Communications", icon: "mail",   waiting: "sending mail needs an SMTP provider" },
  { sec: "SYSTEM" },
  { href: "admin-telemetry.html", label: "Telemetry",  icon: "chart",  built: true },
  { label: "Roles & Settings", icon: "cog",  waiting: "there is one administrator, named in firestore.rules" },
];

const ICONS = {
  home:   '<path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  cal:    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  check:  '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="m8 12 3 3 5-6"/>',
  doc:    '<path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6"/>',
  people: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M14 20a4.5 4.5 0 0 1 8 0"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  org:    '<rect x="3" y="7" width="8" height="14" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/><path d="M6 11h2M6 15h2M16 7h2M16 11h2M16 15h2"/>',
  ticket: '<path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 0 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z"/><path d="M13 5v14"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  play:   '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 6 3-6 3z"/>',
  book:   '<path d="M4 5.5C4 4.1 5.1 3 6.5 3H12v18H6.5C5.1 21 4 19.9 4 18.5z"/><path d="M20 5.5C20 4.1 18.9 3 17.5 3H12v18h5.5c1.4 0 2.5-1.1 2.5-2.5z"/>',
  mega:   '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  mail:   '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  hand:   '<path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11"/><path d="M10 10.5V5a1.5 1.5 0 0 1 3 0v5.5"/><path d="M13 10.5V7a1.5 1.5 0 0 1 3 0v6"/><path d="M16 11.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a7 7 0 0 1-7-7v-2.5a1.5 1.5 0 0 1 3 0"/>',
  cog:    '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  chart:  '<path d="M4 19V5M4 19h16"/><path d="M8 16v-5M12 16V8M16 16v-8"/>',
};
const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k] || ICONS.doc}</svg>`;

/** Counts for the sidebar badges. Set by whichever page knows them; a badge with
 *  no count simply does not render, because an empty badge is a question mark
 *  where a fact should be. */
const BADGES = {};
export function setNavBadge(key, n) {
  BADGES[key] = n;
  document.querySelectorAll(`[data-badge="${key}"]`).forEach(el => {
    el.textContent = n > 0 ? String(n) : "";
    el.hidden = !(n > 0);
  });
}


function navItemOn(item, current) {
  if (!item.href) return false;
  const hashAt = item.href.indexOf("#");
  const path = hashAt < 0 ? item.href : item.href.slice(0, hashAt);
  if (path !== current) return false;
  const itemHash = hashAt < 0 ? "" : item.href.slice(hashAt + 1);
  const now = typeof location !== "undefined" ? String(location.hash || "").replace(/^#/, "") : "";
  const haveTypes = new URLSearchParams(now).get("types") || "";
  if (!itemHash) {
    const claimed = ADMIN_NAV.some(o => {
      if (!o.href) return false;
      const i = o.href.indexOf("#");
      if (i < 0 || o.href.slice(0, i) !== current) return false;
      const t = new URLSearchParams(o.href.slice(i + 1)).get("types") || "";
      return Boolean(t) && t === haveTypes;
    });
    return !claimed;
  }
  const wantTypes = new URLSearchParams(itemHash).get("types") || "";
  return Boolean(wantTypes) && wantTypes === haveTypes;
}

export function renderAdminNav(current) {
  const host = document.querySelector("[data-admin-nav]");
  if (!host) return;
  host.innerHTML = ADMIN_NAV.map(i => {
    if (i.sec) return `<li class="sec">${esc(i.sec)}</li>`;
    const badge = i.badge
      ? `<span class="nbadge" data-badge="${esc(i.badge)}" hidden></span>` : "";
    if (i.built) {
      const on = navItemOn(i, current) ? ' class="on"' : "";
      return `<li><a${on} href="${esc(i.href)}">${svg(i.icon)}<span>${esc(i.label)}</span>${badge}</a></li>`;
    }
    // The reason lives in the tooltip, not inline: spelling it out under every
    // row doubled the height of the sidebar. The dot is the signal that the
    // destination is not built; hovering says why.
    return `<li><span class="soon" title="Not built yet — ${esc(i.waiting)}">${svg(i.icon)}` +
           `<span>${esc(i.label)}</span><i class="soondot" aria-hidden="true"></i>` +
           `<span class="sr">Not built yet: ${esc(i.waiting)}</span></span></li>`;
  }).join("");
  Object.entries(BADGES).forEach(([k, n]) => setNavBadge(k, n));
}

function adminBurgerHtml() {
  return `<button type="button" class="aburger" data-admin-burger aria-label="Menu" aria-expanded="false" aria-controls="admin-aside"><span></span></button>`;
}

/** The topbar: page title, subtitle, search and the bell. One renderer, because
 *  five pages pasting the same header is five places for it to drift.
 *
 *  The search box is PRESENTATIONAL and says so in its placeholder - there is no
 *  search index yet. It is rendered disabled rather than as a box that swallows
 *  what you type. */
export function renderAdminTop({ title, subtitle = "", email = "" }) {
  const host = document.querySelector("[data-admin-top]");
  if (!host) return;
  host.innerHTML = `
    ${adminBurgerHtml()}
    <div class="ttl"><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>
    <div class="tools">
      <label class="search" title="Search is not built yet — there is no index to search.">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input disabled placeholder="Search is not built yet"
               style="border:0;background:none;padding:0;height:auto;font-size:13.5px">
      </label>
      <span class="who">Signed in as <b data-admin-email>${esc(email)}</b>
        <a href="#" data-admin-signout>Sign out</a></span>
    </div>`;
  wireAdminAside();
}

/** Stamp thead labels onto tbody cells so phone card-rows can show them. */
export function stampAdminTableLabels(root = document) {
  root.querySelectorAll(".tbl table").forEach(table => {
    const labels = [...table.querySelectorAll("thead th")].map(th =>
      (th.textContent || "").replace(/\s+/g, " ").trim());
    table.querySelectorAll("tbody tr").forEach(tr => {
      const cells = [...tr.children];
      if (cells.some(td => td.hasAttribute("colspan"))) {
        cells.forEach(td => td.removeAttribute("data-label"));
        return;
      }
      cells.forEach((td, i) => {
        if (labels[i]) td.setAttribute("data-label", labels[i]);
        else td.removeAttribute("data-label");
      });
    });
  });
}

function watchAdminTables() {
  if (watchAdminTables.bound || !document.body) return;
  watchAdminTables.bound = true;
  stampAdminTableLabels();
  const mo = new MutationObserver(() => stampAdminTableLabels());
  mo.observe(document.body, { childList: true, subtree: true });
}

function isAsideOpen() {
  return document.body.classList.contains("aside-open");
}

export function setAdminAsideOpen(open) {
  const next = !!open;
  document.body.classList.toggle("aside-open", next);
  document.body.classList.toggle("aside-lock", next);
  document.querySelectorAll("[data-admin-burger]").forEach(btn => {
    btn.setAttribute("aria-expanded", next ? "true" : "false");
    btn.setAttribute("aria-label", next ? "Close menu" : "Menu");
  });
  const backdrop = document.querySelector("[data-aside-backdrop]");
  if (backdrop) backdrop.hidden = !next;
  if (next) {
    const focusable = document.querySelector(".aside a, .aside button");
    try { focusable?.focus({ preventScroll: true }); } catch { focusable?.focus(); }
  }
}

/** Off-canvas admin rail ≤900. Hamburger, backdrop, Esc. Desktop rail unchanged. */
export function wireAdminAside() {
  const aside = document.querySelector(".aside");
  if (!aside) return;
  if (!aside.id) aside.id = "admin-aside";

  let burger = document.querySelector("[data-admin-burger]");
  if (!burger) {
    const top = document.querySelector("[data-admin-top], .top");
    if (top) {
      top.insertAdjacentHTML("afterbegin", adminBurgerHtml());
      burger = top.querySelector("[data-admin-burger]");
    }
  }

  let backdrop = document.querySelector("[data-aside-backdrop]");
  if (!backdrop) {
    backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "aside-backdrop";
    backdrop.setAttribute("data-aside-backdrop", "");
    backdrop.setAttribute("aria-label", "Close menu");
    backdrop.hidden = true;
    document.body.appendChild(backdrop);
  }

  watchAdminTables();
  if (wireAdminAside.bound) return;
  wireAdminAside.bound = true;

  document.addEventListener("click", e => {
    if (e.target.closest("[data-admin-burger]")) {
      e.preventDefault();
      setAdminAsideOpen(!isAsideOpen());
      return;
    }
    if (e.target.closest("[data-aside-backdrop]")) {
      setAdminAsideOpen(false);
      document.querySelector("[data-admin-burger]")?.focus();
      return;
    }
    if (isAsideOpen() && e.target.closest(".aside a")) setAdminAsideOpen(false);
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && isAsideOpen()) {
      e.preventDefault();
      setAdminAsideOpen(false);
      document.querySelector("[data-admin-burger]")?.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900 && isAsideOpen()) setAdminAsideOpen(false);
  });
}

/** Breadcrumbs. Each entry is [label, href] or just a label for the last one. */
export function renderCrumbs(items) {
  const host = document.querySelector("[data-crumbs]");
  if (!host) return;
  host.innerHTML = items.map((it, i) => {
    const last = i === items.length - 1;
    const [label, href] = Array.isArray(it) ? it : [it, null];
    const node = href && !last
      ? `<a href="${esc(href)}">${esc(label)}</a>` : `<span>${esc(label)}</span>`;
    return node + (last ? "" : '<span class="sep">›</span>');
  }).join("");
}

/** The green/amber/red state chip under the crumbs. */
export function renderStateChip(text, kind = "ok") {
  const host = document.querySelector("[data-state-chip]");
  if (!host) return;
  const tick = kind === "ok"
    ? '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>' : "";
  host.className = `statechip ${kind === "ok" ? "" : kind}`.trim();
  host.innerHTML = tick + `<span>${esc(text)}</span>`;
  host.hidden = false;
}

/* ---------------------------------------------------------------- the door */

/* /admin is ONE entrance. The sign-in, the password reset and the console all
 * live at this URL, and the door stays up until the deployed rules confirm the
 * account is an administrator.
 *
 * To be plain about what that does and does not achieve: this page is a public
 * file and anyone can read it. Hiding the door would hide nothing. What the door
 * is for is making sure nobody is left holding a session on a console they
 * cannot use, and that a member who lands here is sent somewhere that works.
 */

const PANELS = ["loading", "signin", "forgot", "code", "newpass", "done"];
let resetCode = "";     // the oobCode, once verified
let resetEmail = "";    // whose account it belongs to

function panel(name, { push = false } = {}) {
  PANELS.forEach(p => {
    const el = $(`[data-panel="${p}"]`);
    if (el) el.hidden = p !== name;
  });
  const first = $(`[data-panel="${name}"] input`);
  if (first) { try { first.focus({ preventScroll: true }); } catch { first.focus(); } }
  if (name === "forgot" || name === "code" || name === "newpass" || name === "done") {
    writeHash({ door: name }, { push });
  } else if (name === "signin") {
    writeHash({}, { push });
  }
}

const errBox  = () => $("[data-admin-error]");
const noteBox = () => $("[data-admin-note]");
function showErr(m)  { const e = errBox();  if (e) { e.textContent = m; e.hidden = !m; } if (m) showNote(""); }
function showNote(m) { const e = noteBox(); if (e) { e.textContent = m; e.hidden = !m; } }

/** Firebase's reset-code failures need their own words: friendlyAuthError()
 *  speaks about signing in, and "that email and password do not match" is a
 *  baffling thing to read after pasting a code. */
function friendlyCodeError(e) {
  return {
    "auth/invalid-action-code": "That code is not valid. It may have been used already, or a newer one may have replaced it — send another and use the newest email.",
    "auth/expired-action-code": "That code has expired. Send another one.",
    "auth/user-disabled":       "That account is disabled. Contact PAAIPE.",
    "auth/user-not-found":      "That account no longer exists.",
    "auth/weak-password":       "Please choose a password of at least 8 characters.",
  }[(e && e.code) || ""] || friendlyAuthError(e);
}

async function busy(btn, fn) {
  if (btn) { btn.disabled = true; btn.dataset.busy = "1"; }
  try { return await fn(); }
  finally { if (btn) { btn.disabled = false; delete btn.dataset.busy; } }
}

/** Show the new-password step for a code we have just verified. */
async function useCode(code, btn) {
  const clean = extractResetCode(code);
  if (!clean) return showErr("Paste the code from the email first.");
  try {
    resetEmail = await busy(btn, () => verifyResetCode(clean));
    resetCode = clean;
    showErr("");
    const f = $("[data-reset-for]");
    if (f) f.textContent = `For ${resetEmail}.`;
    panel("newpass", { push: true });
  } catch (ex) {
    showErr(friendlyCodeError(ex));
  }
}

function wireDoor() {
  const door = $("[data-door]");
  if (!door) return;

  door.addEventListener("click", e => {
    const go = e.target.closest("[data-go]");
    if (!go) return;
    e.preventDefault();
    showErr(""); showNote("");
    panel(go.dataset.go, { push: true });
  });

  onViewChange(() => {
    if (!$("[data-door]") || !$("[data-console]")?.hidden) return;
    const door = readHash().door;
    if (door === "forgot" || door === "code") panel(door);
    else if (!door) panel("signin");
  });

  // --- sign in -------------------------------------------------------------
  $('[data-form="signin"]')?.addEventListener("submit", async e => {
    e.preventDefault();
    showErr("");
    const f = e.currentTarget;
    const email = f.email.value.trim(), password = f.password.value;
    if (!email || !password) return showErr("Enter your email and password.");
    let user;
    try {
      user = await busy(f.querySelector("button[type=submit]"), async () => {
        const u = await signIn(email, password);
        // Signing in proves WHO they are. Whether they may be here is the
        // rules' answer, and the door does not open until we have it.
        if (!(await isAdminNow())) {
          await signOutNow();
          throw Object.assign(new Error("not-admin"), { notAdmin: true });
        }
        return u;
      });
    } catch (ex) {
      return showErr(ex?.notAdmin
        ? "That account is not a PAAIPE administrator."
        : friendlyAuthError(ex));
    }
    await openConsole(user && user.email ? { uid: user.uid, email: user.email } : null);
  });

  // --- send the code -------------------------------------------------------
  $('[data-form="forgot"]')?.addEventListener("submit", async e => {
    e.preventDefault();
    showErr("");
    const f = e.currentTarget;
    const email = f.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return showErr("That email address does not look right.");
    try {
      await busy(f.querySelector("button[type=submit]"), () => resetPassword(email));
    } catch (ex) {
      // Deliberately not surfaced per-address: saying whether an account exists
      // is account enumeration. A genuine outage still needs reporting.
      if (ex?.code === "auth/network-request-failed" || ex?.code === "auth/too-many-requests")
        return showErr(friendlyAuthError(ex));
    }
    const s = $("[data-sent-to]");
    if (s) s.textContent = `If ${email} has a PAAIPE account, a code is on its way. Check Spam and Promotions too.`;
    const c = $('[data-form="code"]');
    if (c) c.code.value = "";
    panel("code", { push: true });
  });

  // --- use the code --------------------------------------------------------
  $('[data-form="code"]')?.addEventListener("submit", e => {
    e.preventDefault();
    useCode(e.currentTarget.code.value, e.currentTarget.querySelector("button[type=submit]"));
  });

  // --- set the new password ------------------------------------------------
  $('[data-form="newpass"]')?.addEventListener("submit", async e => {
    e.preventDefault();
    showErr("");
    const f = e.currentTarget;
    const p1 = f.p1.value, p2 = f.p2.value;
    if (p1.length < 8) return showErr("Please choose a password of at least 8 characters.");
    if (p1 !== p2)     return showErr("Those two passwords do not match.");
    if (!resetCode)    return showErr("That code is no longer valid. Send another one.");
    try {
      await busy(f.querySelector("button[type=submit]"),
                 () => completePasswordReset(resetCode, p1));
    } catch (ex) {
      return showErr(friendlyCodeError(ex));
    }
    // the code is single-use and now spent; do not keep it around
    const was = resetEmail;
    resetCode = ""; resetEmail = "";
    f.p1.value = f.p2.value = "";
    const d = $("[data-done-for]");
    if (d) d.textContent = `You can now sign in as ${was} with your new password.`;
    const si = $('[data-form="signin"]');
    if (si) { si.email.value = was; si.password.value = ""; }
    panel("done", { push: true });
  });
}

/* ------------------------------------------------------------- the console */

function renderMembers(list, adminEmail) {
  // Counts FIRST. The dashboard shows the numbers without the table, and an
  // early return on the missing tbody would skip the counts along with it.
  const pending = list.filter(m => statusOf(m) === STATUS.GUEST);
  const countEl = $("[data-members-count]");
  if (countEl) countEl.textContent =
    plural(list.length, "member", "members");
  const pendEl = $("[data-pending-count]");
  if (pendEl) pendEl.textContent = plural(pending.length, "member is", "members are");
  const pendWrap = $("[data-pending-wrap]");
  if (pendWrap) pendWrap.hidden = pending.length === 0;
  setNavBadge("pending", pending.length);
  const sm = $("[data-stat-members]"); if (sm) sm.textContent = String(list.length);
  const sp = $("[data-stat-pending]"); if (sp) sp.textContent = String(pending.length);

  const recentM = $("[data-recent-members]");
  if (recentM) recentM.innerHTML = list.length
    ? list.slice(0, 5).map(m => {
        const [cls, label] = PILL[statusOf(m)];
        return `<tr><td><b>${esc(m.full_name || "\u2014")}</b><small>${esc(m.email || "\u2014")}</small></td>
          <td><span class="${cls}">${esc(label)}</span></td>
          <td class="num">${esc(when(m.createdAt))}</td></tr>`;
      }).join("")
    : `<tr><td colspan="3" class="empty">No member has signed up yet.</td></tr>`;

  const body = $("[data-members]");
  if (!body) return;

  if (!list.length) {
    body.innerHTML = `<tr><td colspan="5" class="empty">No member has signed up yet.</td></tr>`;
    return;
  }

  // a suggestion, not a counter: the owner's rule is that Agent numbers are
  // labels PAAIPE issues, so the admin types the real one and may change this
  const used = list.map(m => parseInt(m.agentNumber, 10)).filter(Number.isFinite);
  const next = String((used.length ? Math.max(...used) : 0) + 1).padStart(3, "0");

  body.innerHTML = list.map(m => {
    const s = statusOf(m);
    const [cls, label] = PILL[s];
    const isGuest = s === STATUS.GUEST;
    return `<tr data-uid="${esc(m.uid)}">
      <td><b>${esc(m.full_name || "—")}</b><small>${esc(m.email || "—")}</small></td>
      <td><span class="${cls}">${esc(label)}</span></td>
      <td class="num">${m.agentNumber ? esc(m.agentNumber) : '<span class="dash">—</span>'}</td>
      <td class="num">${esc(when(m.createdAt))}</td>
      <td class="act">${
        isGuest
          ? `<span class="confirm"><input type="text" size="4" value="${esc(next)}"
               data-number aria-label="Agent number for ${esc(m.full_name || m.email)}">
             <button class="btn btn-gold btn-sm" data-confirm>Confirm as Agent</button></span>`
          : s === STATUS.AGENT
            ? `<button class="btn btn-ghost btn-sm" data-suspend>Suspend</button>`
            : `<button class="btn btn-ghost btn-sm" data-restore>Restore to Guest</button>`
      }</td></tr>`;
  }).join("");

}

/** One delegated listener for the life of the page. It must NOT be attached per
 *  render: re-attaching stacks duplicate handlers, and attaching with
 *  { once: true } is worse - a click that lands between the buttons consumes the
 *  listener and every control in the table goes quietly dead. */
function wireMemberActions(adminEmail) {
  const body = $("[data-members]");
  if (!body) return;

  const act = async (tr, fn, verb) => {
    const btns = $$("button", tr);
    btns.forEach(b => b.disabled = true);
    try { await fn(); await refresh(adminEmail); }
    catch (ex) {
      btns.forEach(b => b.disabled = false);
      flash(ex?.code === "permission-denied"
        ? `The rules refused to ${verb} this member. Your account may no longer be an administrator.`
        : `Could not ${verb} this member: ${ex?.message || ex}`);
    }
  };

  body.addEventListener("click", async e => {
    const tr = e.target.closest("tr[data-uid]");
    if (!tr) return;
    const uid = tr.dataset.uid;
    if (e.target.matches("[data-confirm]")) {
      const n = $("[data-number]", tr)?.value.trim();
      if (!n) return flash("Give the Agent a number before confirming.");
      await act(tr, () => confirmMember(uid, n, adminEmail), "confirm");
    } else if (e.target.matches("[data-suspend]")) {
      await act(tr, () => setMemberStatus(uid, STATUS.SUSPENDED), "suspend");
    } else if (e.target.matches("[data-restore]")) {
      await act(tr, () => setMemberStatus(uid, STATUS.GUEST), "restore");
    }
  });
}

function renderRegistrations(list) {
  setNavBadge("registrations", list.length);
  const sr = $("[data-stat-regs]"); if (sr) sr.textContent = String(list.length);
  const recentR = $("[data-recent-regs]");
  if (recentR) recentR.innerHTML = list.length
    ? list.slice(0, 5).map(r => `<tr>
        <td><b>${esc(r.full_name || "\u2014")}</b><small>${esc(r.email || "\u2014")}</small></td>
        <td>${esc(r.event || "\u2014")}</td>
        <td class="num">${esc(when(r.createdAt))}</td></tr>`).join("")
    : `<tr><td colspan="3" class="empty">No registration has been submitted yet.</td></tr>`;

  const body = $("[data-registrations]");
  if (!body) return;
  const c = $("[data-reg-count]");
  if (c) c.textContent = plural(list.length, "registration", "registrations");
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty">No registration has been submitted yet.</td></tr>`;
    return;
  }
  body.innerHTML = list.map(r => `<tr>
      <td><b>${esc(r.full_name || "—")}</b><small>${esc(r.email || "—")}</small></td>
      <td>${esc(r.event || "—")}${r.organization ? `<small>${esc(r.organization)}</small>` : ""}</td>
      <td class="num">${esc(when(r.createdAt))}</td>
      <td class="num">${r.updates === true ? "Yes" : "No"}</td>
    </tr>`).join("");
}

function flash(msg) {
  const el = $("[data-admin-flash]");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

async function refresh(adminEmail) {
  const [members, regs, partners] = await Promise.all([
    listMembers().catch(e => { throw e; }),
    // registrations are secondary: a failure there must not blank the members
    listRegistrations().catch(() => null),
    countNewPartnerApplications().catch(() => null),
  ]);
  renderMembers(members, adminEmail);
  if (regs === null) {
    const b = $("[data-registrations]");
    if (b) b.innerHTML = `<tr><td colspan="4" class="empty">Registrations could not be loaded.</td></tr>`;
  } else {
    renderRegistrations(regs);
  }
  renderPartnerStat(partners);
  document.documentElement.setAttribute("data-admin-ready", String(members.length));
}

/** null means the count could not be loaded. It must NOT read as zero - "no new
 *  applications" and "we could not ask" are different, and only one of them
 *  means nobody is waiting for a reply. */
function renderPartnerStat(n) {
  setNavBadge("partners", n === null ? 0 : n);
  const el = $("[data-stat-partners]");
  if (el) el.textContent = n === null ? "—" : String(n);
  const note = $("[data-stat-partners-note]");
  if (note) note.textContent = n === null
    ? "Could not be loaded just now — this is not a count of zero."
    : n === 0 ? "Nobody is waiting for a reply."
              : `Waiting for a first reply. Open Partner applications.`;
  const wrap = $("[data-partner-banner]");
  if (wrap) {
    wrap.hidden = !(n > 0);
    const c = $("[data-partner-count]", wrap);
    if (c) c.textContent = n === 1 ? "1 company is" : `${n} companies are`;
  }
}

function showConsoleChrome(on) {
  $$("[data-console]").forEach(e => { e.hidden = !on; });
  const d = $("[data-door]");
  if (d) d.hidden = on;
}

/** `who` is the account we already have in hand - signIn() hands one back, so
 *  asking Firebase again for something we were just told is a wasted round trip
 *  and one more thing that can fail between the two. */
async function openConsole(who) {
  let me = who || null;
  if (!me) { try { me = await currentAgent(); } catch { me = null; } }
  if (!me) return panel("signin");

  showConsoleChrome(true);
  const page = location.pathname.split("/").pop() || "admin.html";
  renderAdminNav(page);
  renderAdminTop(page === "admin-agents.html"
    ? { title: "Sign-ups (Agents)", subtitle: "People who created a PAAIPE account", email: me.email }
    : { title: "Dashboard", subtitle: "What needs attention today", email: me.email });
  renderCrumbs(page === "admin-agents.html"
    ? [["Dashboard", "admin.html"], "Sign-ups"] : ["Dashboard"]);
  $$("[data-admin-email]").forEach(e => { e.textContent = me.email; });
  $("[data-admin-signout]")?.addEventListener("click", async e => {
    e.preventDefault();
    await signOutNow().catch(() => {});
    location.replace("admin.html");
  }, { once: true });
  wireMemberActions(me.email);

  try {
    await refresh(me.email);
  } catch (ex) {
    flash(`Could not load the console: ${ex?.message || ex}`);
    document.documentElement.setAttribute("data-admin-ready", "error");
  }
}

async function boot() {
  // Pages other than /admin carry no door - the sign-in and the reset live at
  // the one entrance. They still need guarding, so they take the same checks and
  // are sent back to /admin instead of being shown a second sign-in form.
  // Returning early here left admin-agents.html completely ungated: the guard
  // never ran and the page simply never loaded its data.
  if (!$("[data-door]")) {
    if (!$("[data-admin-console]") && !document.body.hasAttribute("data-admin-console")) return;
    let me = null;
    try { me = await currentAgent(); } catch { me = null; }
    if (!me) { location.replace("admin.html"); return; }
    let allowed = false;
    try { allowed = await isAdminNow(); }
    catch {
      flash("PAAIPE could not be reached. Reload to try again — nothing is shown rather than an empty list.");
      showConsoleChrome(true);
      document.documentElement.setAttribute("data-admin-ready", "offline");
      return;
    }
    if (!allowed) { await signOutNow().catch(() => {}); location.replace("admin.html?denied=1"); return; }
    await openConsole(me);
    return;
  }

  panel("loading");

  // A reset link from the email lands here with the code already in the URL.
  // Take it and go straight to the password step - making someone copy a code
  // out of a link they just clicked would be a step for its own sake.
  const q = new URLSearchParams(location.search);
  const oob = q.get("oobCode");
  const mode = q.get("mode");
  if (oob && (!mode || mode === "resetPassword")) {
    document.documentElement.setAttribute("data-admin-door", "ready");
    // drop the code from the address bar: it is a single-use credential and
    // does not belong in history, bookmarks or a referrer header
    history.replaceState(null, "", location.pathname);
    await useCode(oob, null);
    return;
  }

  // turned away from the console a moment ago
  if (q.get("denied") === "1")
    showErr("That account is not a PAAIPE administrator.");

  let me = null;
  try { me = await currentAgent(); } catch { me = null; }
  if (!me) {
    document.documentElement.setAttribute("data-admin-door", "ready");
    const door = readHash().door;
    if (door === "forgot" || door === "code") return panel(door);
    return panel("signin");
  }

  let allowed = false;
  try { allowed = await isAdminNow(); }
  catch {
    // Could not reach Firebase. Say so; do NOT show an empty console, which
    // would read as "there are no members".
    showErr("PAAIPE could not be reached. Check your connection and reload.");
    document.documentElement.setAttribute("data-admin-door", "ready");
    return panel("signin");
  }

  if (!allowed) {
    // Signed in, but not staff. Do not leave them holding a session on a page
    // they cannot use.
    await signOutNow().catch(() => {});
    showErr("That account is not a PAAIPE administrator.");
    document.documentElement.setAttribute("data-admin-door", "ready");
    return panel("signin");
  }

  document.documentElement.setAttribute("data-admin-door", "ready");
  await openConsole();
}

wireAdminAside();
wireDoor();
boot();
