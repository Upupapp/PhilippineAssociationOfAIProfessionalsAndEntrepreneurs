/* PAAIPE AI Portal — auth guard and identity.
 *
 * Every portal page is for signed-in Agents. Without this, the pages are open to
 * anyone who types the URL.
 *
 * The mockups shipped with a demo identity baked into the markup — "Maria
 * Santos, AGENT 0006" on all seven pages. None of it is kept. The markup now
 * carries neutral placeholders with data- hooks, and the real Agent's details
 * are written in here after Firebase confirms who they are.
 *
 * The Agent NUMBER is a label PAAIPE issues (owner, 2026-09-16: "Agent numbering
 * are labels, so far we only have 5 agents"). If the profile has no label, the
 * card keeps ···· . Nothing here invents one — that was the defect this replaces.
 */
import { currentAgent, signOutNow, isConfigured, setDirectoryVisible,
         membershipStatus, resendVerification, markConfirmationSeen,
         GATE_GUESTS } from "/assets/js/paaipe-firebase.js";

/* Guest / pending-confirmation signifiers.
 * Only an admin-confirmed user is an Agent; sign-up makes a GUEST. While
 * GATE_GUESTS is false a guest may use the whole portal - nothing is locked -
 * but the UI must never let them believe they are already an Agent. Every badge
 * derives from membershipStatus(), so a label cannot drift from the account. */
var AMBER_CSS =
  ".pg-banner{display:flex;align-items:flex-start;gap:12px;background:var(--amber-bg,#fdf1dd);" +
    "color:var(--amber-ink,#7a4a06);border-left:4px solid var(--gold,#F2A71B);padding:12px 20px;font-size:14px;line-height:1.5}" +
  ".pg-banner svg{width:18px;height:18px;flex:none;stroke:currentColor;fill:none;stroke-width:2;margin-top:2px}" +
  ".pg-banner .pg-actions{margin-left:auto;display:flex;gap:10px;align-items:center;flex:none}" +
  ".pg-banner button{font:inherit;font-weight:700;cursor:pointer;border-radius:999px;border:1px solid var(--gold,#F2A71B);" +
    "background:#fff;color:var(--amber-ink,#7a4a06);padding:6px 12px}" +
  ".pg-banner .pg-x{border:0;background:transparent;font-size:18px;line-height:1;padding:0 4px}" +
  "@media(max-width:700px){.pg-banner{flex-wrap:wrap}.pg-banner .pg-actions{margin-left:0;width:100%}}" +
  ".pg-guest .side .me .av{outline:2px dashed var(--gold,#F2A71B);outline-offset:2px}" +
  ".pg-dot{position:relative}" +
  ".pg-dot::after{content:'';position:absolute;right:-1px;top:-1px;width:10px;height:10px;border-radius:50%;" +
    "background:var(--gold,#F2A71B);border:2px solid #fff}" +
  ".pg-amber{color:var(--amber-ink,#7a4a06)!important;font-weight:700}" +
  ".pill.pg-pending{background:var(--amber-bg,#fdf1dd);color:var(--amber-ink,#7a4a06);border:1px solid #f0d9a8}" +
  // the Agent card is .acard on Home/Profile and .card in the sign-up modal, so
  // key the pending style on the added class alone
  ".pg-pending-card{background:linear-gradient(160deg,#20304f,#2c3f63)!important;border:2px dashed rgba(255,255,255,.55)!important}" +
  ".pg-pending-card .num,.pg-pending-card .nm{color:#fff}" +
  ".pg-steps{list-style:none;margin:10px 0 0;padding:0}" +
  ".pg-steps li{display:flex;align-items:center;gap:10px;padding:7px 0;font-size:14px;color:var(--muted,#4a5a7a)}" +
  ".pg-steps b{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:11px;flex:none;" +
    "background:var(--line,#c9dcf3);color:#fff}" +
  ".pg-steps li.done{color:var(--ink,#0f1e3d)}.pg-steps li.done b{background:var(--green-ink,#0a5c3a)}" +
  ".pg-note{display:block;font-size:12.5px;color:var(--amber-ink,#7a4a06);margin-top:6px}";
var CLOCK='<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';
var LOCK='<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>';
function icon(d){return '<svg viewBox="0 0 24 24">'+d+'</svg>';}
function steps(ms,compact){return '<ul class="pg-steps">'+ms.steps.map(function(s){
  return '<li class="'+(s.done?"done":"")+'"><b>'+(s.done?"✓":"·")+'</b>'+s.label+
         (s.done||compact?"":" <span style=\'opacity:.7\'>(pending)</span>")+'</li>';}).join("")+'</ul>';}

const initials = (name, email) => {
  const s = (name || "").trim();
  if (s) return s.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return (email || "?").slice(0, 2).toUpperCase();
};

const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

(async () => {
  if (!isConfigured()) return;            // never bounce anyone on a config fault
  let agent = null;
  try { agent = await currentAgent(); } catch { return; }

  if (!agent) {                            // not signed in: this page is not for you
    location.replace("signin.html");
    return;
  }

  const first = (agent.full_name || "").trim().split(/\s+/)[0] || "Agent";
  const set = (sel, text) => document.querySelectorAll(sel).forEach(e => { e.textContent = text; });

  set("[data-agent-name]", agent.full_name || agent.email || "Agent");
  set("[data-agent-initials]", initials(agent.full_name, agent.email));
  set("[data-agent-greeting]", `${greet()}, ${first}.`);
  set("[data-agent-email]", agent.email || "");
  // "Email verified · September 2026" was a fixed string. Say what is true.
  set("[data-email-verified]", agent.emailVerified ? "Email verified" : "Email not verified yet");

  // Only ever shown when PAAIPE has actually issued a label.
  if (agent.agentNumber) set("[data-agent-number]", agent.agentNumber);

  // "VERIFIED" must describe the account, not decorate it.
  set("[data-agent-status]", agent.emailVerified ? "VERIFIED" : "UNVERIFIED");

  // Membership status. A registrant is a GUEST until PAAIPE confirms them, so
  // nothing may call them an Agent before that (owner, 2026-09-16).
  set("[data-member-label]", agent.isAgent ? "AGENT" : "GUEST");
  set("[data-member-status]", agent.isAgent ? "Agent" : "Guest · pending confirmation");

  // The directory toggle: reflect the stored value, then persist changes.
  document.querySelectorAll("[data-directory-toggle]").forEach(function (el) {
    var input = el.matches("input") ? el : el.querySelector("input");
    if (!input) return;
    input.checked = agent.directoryVisible;
    // A guest is never listed however they set this, so say so rather than
    // letting the control imply something it cannot deliver yet.
    if (!agent.isAgent) {
      var note = document.querySelector("[data-directory-note]");
      if (note) note.textContent = "You will appear once PAAIPE confirms you as an Agent.";
    }
    input.addEventListener("change", async function () {
      var wanted = input.checked;
      input.disabled = true;
      try { await setDirectoryVisible(wanted); }
      catch (e) { input.checked = !wanted; }      // put it back if it did not save
      finally { input.disabled = false; }
    });
  });

  document.querySelectorAll("input[data-agent-field='full_name']")
    .forEach(i => { i.value = agent.full_name || ""; });
  document.querySelectorAll("input[data-agent-field='email']")
    .forEach(i => { i.value = agent.email || ""; });

  // ---------- membership signifiers (guest / pending confirmation) ----------
  // QA ONLY: ?membership=guest_unverified|guest_pending|agent overrides the
  // derived state so every signifier can be seen without changing real data.
  // It changes nothing in Firestore and never runs unless the param is present.
  var qa = new URLSearchParams(location.search).get('membership');
  if (qa === 'guest_unverified') { agent = Object.assign({}, agent, {status:'guest', emailVerified:false, agentNumber:null}); }
  else if (qa === 'guest_pending') { agent = Object.assign({}, agent, {status:'guest', emailVerified:true, agentNumber:null}); }
  else if (qa === 'agent') { agent = Object.assign({}, agent, {status:'agent', emailVerified:true, agentNumber: agent.agentNumber || '0006', confirmationSeen:true}); }
  var ms = membershipStatus(agent);
  applyMembership(agent, ms);

  document.querySelectorAll("[data-signout]").forEach(el =>
    el.addEventListener("click", async e => {
      e.preventDefault();
      try { await signOutNow(); } catch {}
      location.href = "signin.html";
    }));

  document.documentElement.setAttribute("data-agent-ready", "1");
})();

function applyMembership(agent, ms) {
  if (!ms) return;
  var css = document.createElement("style"); css.textContent = AMBER_CSS;
  document.head.appendChild(css);

  document.documentElement.setAttribute("data-membership", ms.state);
  document.documentElement.setAttribute("data-gate-guests", String(GATE_GUESTS));
  document.body.classList.toggle("pg-guest", ms.isGuest);

  var set = function (sel, text) {
    document.querySelectorAll(sel).forEach(function (e) { e.textContent = text; });
  };
  set("[data-member-label]", ms.label);                      // 2
  // two different strings: the sidebar carries the full membership line,
  // the pill carries the short badge. One hook for both made them identical.
  set("[data-member-status]", ms.statusLine);
  set("[data-member-pill]", ms.pill);
  set("[data-member-subline]", ms.subline);                  // 4
  document.querySelectorAll("[data-member-status]").forEach(function (e) {
    e.classList.toggle("pg-amber", ms.isGuest);
  });

  // 4: green "Verified Agent" pill becomes an amber "Awaiting confirmation"
  document.querySelectorAll(".pill").forEach(function (pill) {
    if (!pill.querySelector("[data-member-pill]")) return;
    pill.classList.toggle("ok", ms.isAgent);
    pill.classList.toggle("pg-pending", ms.isGuest);
    var svg = pill.querySelector("svg");
    if (svg && ms.isGuest) svg.innerHTML = CLOCK;
  });

  // 3: amber dot on the top-bar avatar
  document.querySelectorAll("header .av").forEach(function (av) {
    av.classList.toggle("pg-dot", ms.isGuest);
    if (ms.isGuest) av.setAttribute("title", "Guest — awaiting Agent confirmation");
    else av.removeAttribute("title");
  });

  // 5: PENDING variant of the Agent card
  // the Agent card is .acard on Home/Profile and .card in the sign-up modal
  document.querySelectorAll(".acard .num, .card .num").forEach(function (num) {
    var card = num.closest(".acard") || num.closest(".card");
    if (!card || !ms.isGuest) return;
    card.classList.add("pg-pending-card");
    num.innerHTML = 'AGENT <span data-agent-number>PENDING</span>';
    var foot = card.querySelector(".ft") || card.querySelector(".foot");
    if (foot && !foot.dataset.pgFoot) {
      foot.dataset.pgFoot = "1";
      foot.innerHTML = "<span>Agent number assigned on confirmation</span>";
    }
  });

  // 6 + 10: the four-step progress list
  document.querySelectorAll("[data-member-steps]").forEach(function (h) { h.innerHTML = steps(ms); });
  if (ms.isGuest) {
    document.querySelectorAll("[data-agent-stats]").forEach(function (h) {
      h.innerHTML = '<p style="color:var(--muted);font-size:14px;margin:0">Available once you’re confirmed.</p>' + steps(ms, true);
    });
  }

  // 7 + 8: Agents-only affordances. Signifiers while GATE_GUESTS is false.
  if (ms.isGuest) {
    document.querySelectorAll("[data-agents-only]").forEach(function (btn) {
      btn.innerHTML = icon(LOCK) + " Agents only";
      btn.setAttribute("title", "Available after your Agent confirmation.");
      if (ms.gated) { btn.setAttribute("disabled", "disabled"); return; }
      btn.removeAttribute("disabled");
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        if (btn.parentNode.querySelector(".pg-note")) return;
        var s = document.createElement("span");
        s.className = "pg-note";
        s.textContent = "Available after your Agent confirmation.";
        btn.parentNode.appendChild(s);
      });
    });
    document.querySelectorAll("[data-guest-notice]").forEach(function (el) {
      el.textContent = el.getAttribute("data-guest-notice") || "";
      el.classList.add("pg-note");
    });
    banner(ms);                                              // 1
  }

  // 12: one-time celebration when confirmation lands
  if (ms.isAgent && agent.agentNumber && !agent.confirmationSeen) celebrate(agent);
}

function banner(ms) {
  if (sessionStorage.getItem("pg-banner-dismissed") === "1") return;
  var head = document.querySelector("header");
  if (!head || document.querySelector(".pg-banner")) return;
  var b = document.createElement("div");
  b.className = "pg-banner";
  b.setAttribute("role", "status");
  b.setAttribute("data-membership-banner", ms.state);
  b.innerHTML = icon(CLOCK) + "<div>" + (ms.needsEmailVerification
    ? "You’re signed in as a <b>Guest</b>. Verify your email to continue your Agent confirmation."
    : "You’re signed in as a <b>Guest</b>. Your Agent confirmation is pending — PAAIPE reviews new accounts and will " +
      "email you when you’re confirmed. Meanwhile, explore sessions, resources and programs.")
    + "</div><div class='pg-actions'></div>";
  var acts = b.querySelector(".pg-actions");
  if (ms.needsEmailVerification) {
    var send = document.createElement("button");
    send.type = "button"; send.textContent = "Resend verification email";
    send.setAttribute("data-resend-verification", "");
    send.addEventListener("click", function () {
      send.disabled = true; send.textContent = "Sending…";
      resendVerification().then(function () { send.textContent = "Sent — check your inbox"; })
        .catch(function () { send.textContent = "Could not send — try again later"; send.disabled = false; });
    });
    acts.appendChild(send);
  } else {
    var a = document.createElement("a");
    a.href = "portal-profile.html"; a.textContent = "What happens next";
    a.style.cssText = "font-weight:700;text-decoration:underline;color:inherit";
    acts.appendChild(a);
  }
  var x = document.createElement("button");
  x.type = "button"; x.className = "pg-x"; x.setAttribute("aria-label", "Dismiss"); x.textContent = "×";
  // dismissed for THIS SESSION only - it returns on the next sign-in
  x.addEventListener("click", function () {
    sessionStorage.setItem("pg-banner-dismissed", "1"); b.remove();
  });
  acts.appendChild(x);
  head.insertAdjacentElement("afterend", b);
}

function celebrate(agent) {
  var modal = document.getElementById("congrats");
  markConfirmationSeen().catch(function () {});
  if (!modal) return;
  var t = modal.querySelector("#ct");
  if (t) t.textContent = "Congratulations, Agent " + agent.agentNumber + ".";
  modal.classList.add("on");
  document.body.style.overflow = "hidden";
}
