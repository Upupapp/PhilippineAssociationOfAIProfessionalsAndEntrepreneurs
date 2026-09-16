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
import { currentAgent, signOutNow, isConfigured } from "/assets/js/paaipe-firebase.js";

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

  // Only ever shown when PAAIPE has actually issued a label.
  if (agent.agentNumber) set("[data-agent-number]", agent.agentNumber);

  // "VERIFIED" must describe the account, not decorate it.
  set("[data-agent-status]", agent.emailVerified ? "VERIFIED" : "UNVERIFIED");

  document.querySelectorAll("input[data-agent-field='full_name']")
    .forEach(i => { i.value = agent.full_name || ""; });
  document.querySelectorAll("input[data-agent-field='email']")
    .forEach(i => { i.value = agent.email || ""; });

  document.querySelectorAll("[data-signout]").forEach(el =>
    el.addEventListener("click", async e => {
      e.preventDefault();
      try { await signOutNow(); } catch {}
      location.href = "signin.html";
    }));

  document.documentElement.setAttribute("data-agent-ready", "1");
})();
