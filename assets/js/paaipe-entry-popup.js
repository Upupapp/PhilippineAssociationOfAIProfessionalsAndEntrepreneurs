/* PAAIPE Agent portal entry popup.
 *
 * First visit to portal Home, for every signed-in Agent — not a role subset.
 * Guests who are not signed in never see it (portal.js already sends them to
 * sign-in). The choice is stored per uid in localStorage so it does not return
 * on this browser. Firestore is not used: this must ship without a Firebase
 * deploy, and agent self-updates are already locked to a short allow-list.
 *
 * Skip for now and the close × are the same act: persist skip, stay on Home.
 *
 * Ericson signed the UI: Approve. Copy and routes are the signed ones. Do not
 * invent a second My Organization page; portal-organization.html is live.
 */
import { currentAgent, isConfigured } from "/assets/js/paaipe-firebase.js";
import { samePage } from "/assets/js/paaipe-samepage.js";

export const ENTRY_POPUP_STORAGE_PREFIX = "paaipe.entry-popup.v1:";

const COPY = {
  title: "Where do you want to start?",
  lead: "Four ways in. Pick the one that matches why you opened the portal. You can switch anytime.",
  footer: "Members start in Learnings. Organizations start in My Organization.",
  pill: "AI PORTAL",
  skip: "Skip for now",
};

const PATHS = [
  {
    choice: "sessions",
    href: "portal-sessions.html#tab=sessions",
    title: "Watch Sessions",
    desc: "Full recordings from AI Exchange and the association library.",
    route: "Sessions",
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 6 3-6 3z"/></svg>',
    focus: true,
  },
  {
    choice: "micros",
    href: "portal-sessions.html#tab=micros",
    title: "MicroLearning",
    desc: "Short vertical lessons you can finish between meetings.",
    route: "Micros",
    icon: '<svg viewBox="0 0 24 24"><rect x="8" y="2" width="8" height="20" rx="2"/><path d="M11 18h2"/></svg>',
  },
  {
    choice: "events",
    href: "portal-events.html",
    title: "Join Events",
    desc: "See the next AI Exchange and reserve your seat.",
    route: "Events",
    icon: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  },
  {
    choice: "organization",
    href: "portal-organization.html",
    title: "Become a Partner",
    desc: "Put your organization in front of the association.",
    route: "My Organization",
    icon: '<svg viewBox="0 0 24 24"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/></svg>',
  },
];

export function storageKey(uid) {
  return ENTRY_POPUP_STORAGE_PREFIX + String(uid || "");
}

export function readEntryChoice(uid) {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.choice === "string" && parsed.choice) return parsed;
  } catch { /* private mode or junk */ }
  return null;
}

export function persistEntryChoice(uid, choice) {
  if (!uid || !choice) return;
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify({
      choice: String(choice),
      at: new Date().toISOString(),
    }));
  } catch { /* private mode */ }
}

function isPortalHome() {
  if (document.documentElement.getAttribute("data-page") === "portal-home") return true;
  return samePage(location.pathname) === "portal.html";
}

function tileHtml(p) {
  return `<button type="button" class="pe-opt${p.focus ? " pe-focus" : ""}" data-pe-path="${p.choice}" data-pe-href="${p.href}">
      <span class="pe-ic" aria-hidden="true">${p.icon}</span>
      <span>
        <h3>${p.title}</h3>
        <div class="pe-desc">${p.desc}</div>
        <span class="pe-route"><span class="pe-route-dash"></span>${p.route}</span>
      </span>
    </button>`;
}

function mount(uid) {
  if (document.querySelector("[data-entry-popup]")) return;

  const host = document.createElement("div");
  host.className = "pe-entry";
  host.setAttribute("data-entry-popup", "on");
  host.setAttribute("data-pe-uid", uid);
  host.innerHTML = `
    <div class="pe-modal" role="dialog" aria-modal="true" aria-labelledby="pe-title" aria-describedby="pe-lead">
      <div class="pe-gridglow"></div>
      <div class="pe-head">
        <div>
          <div class="pe-mark">
            <img src="assets/img/paaipe-logo.png" alt="PAAIPE">
            <span class="pe-mark-pill">${COPY.pill}</span>
          </div>
          <h1 id="pe-title">${COPY.title}</h1>
          <p class="pe-lead" id="pe-lead">${COPY.lead}</p>
        </div>
        <button type="button" class="pe-x" data-pe-skip aria-label="Close">×</button>
      </div>
      <div class="pe-choices">
        ${PATHS.map(tileHtml).join("")}
      </div>
      <div class="pe-foot">
        <span>${COPY.footer}</span>
        <button type="button" class="pe-skip" data-pe-skip>${COPY.skip}</button>
      </div>
    </div>`;
  document.body.appendChild(host);
  document.body.style.overflow = "hidden";
  document.documentElement.setAttribute("data-entry-popup", "on");

  const modal = host.querySelector(".pe-modal");
  const previous = document.activeElement;

  function dismiss() {
    host.remove();
    document.body.style.overflow = "";
    document.documentElement.removeAttribute("data-entry-popup");
    if (previous && typeof previous.focus === "function") {
      try { previous.focus(); } catch { /* left the document */ }
    }
  }

  function skip() {
    persistEntryChoice(uid, "skip");
    dismiss();
  }

  function go(choice, href) {
    persistEntryChoice(uid, choice);
    if (href) {
      location.assign(href);
      return;
    }
    dismiss();
  }

  host.querySelectorAll("[data-pe-path]").forEach(btn => {
    btn.addEventListener("click", () => {
      go(btn.getAttribute("data-pe-path"), btn.getAttribute("data-pe-href"));
    });
  });
  host.querySelectorAll("[data-pe-skip]").forEach(btn => {
    btn.addEventListener("click", skip);
  });

  host.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      e.preventDefault();
      skip();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = [...host.querySelectorAll("button")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  const firstTile = host.querySelector("[data-pe-path='sessions']");
  if (firstTile) firstTile.focus();
  else if (modal) {
    modal.setAttribute("tabindex", "-1");
    modal.focus();
  }
}

(async () => {
  if (!isPortalHome()) return;
  if (!isConfigured()) return;
  let agent = null;
  try { agent = await currentAgent(); } catch { return; }
  if (!agent || !agent.uid) return;
  if (readEntryChoice(agent.uid)) return;
  mount(agent.uid);
})();
