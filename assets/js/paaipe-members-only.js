/* PAAIPE — pages only a signed-in member may read.
 *
 * Owner's ruling, 2026-09-17: "anyone in the portal guests and agents can
 * access it". So the test is SIGNED IN, not confirmed - a Guest awaiting
 * confirmation gets in, which is the same rule the Portal itself uses. A
 * SUSPENDED account does not: suspension is the act of withdrawing access, and a
 * benefit that survived it would make the act meaningless.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS, SAID PLAINLY, BECAUSE IT WOULD BE EASY TO OVERSTATE.
 *
 * paaipe.org is a static site. Netlify serves resources.html to anybody who asks
 * for it, and nothing here changes that: the HTML, the card titles, the
 * descriptions and every outbound link are in the response before this file
 * runs. `curl https://paaipe.org/resources.html` returns the lot, and the
 * materials themselves - a YouTube video and a Gamma deck - are on public URLs
 * that need no PAAIPE account at all.
 *
 * So this hides the LIBRARY from a visitor using a browser. It does not make the
 * materials secret, and nothing in the UI may say that it does. A real boundary
 * needs the content behind Firestore rules, the way drafts, proposed
 * sponsorships and the Zoom link already are - which is a different job, and a
 * bigger one, than a members-only page.
 *
 * It is still worth doing: it is the difference between a library PAAIPE gives
 * its members and a page anybody lands on from a search result, and it is the
 * moment a visitor has a reason to sign up.
 * ---------------------------------------------------------------------------
 *
 * HOW IT AVOIDS SHOWING THE PAGE FIRST. The page hides its own body in an inline
 * <style>, before a single byte is painted, and this file reveals it. A gate
 * that renders the content and then redirects has already shown it - and on a
 * slow connection it shows it for seconds. So the sequence is hide, check,
 * reveal; never render, check, hide.
 *
 * WITH JAVASCRIPT OFF, IT FAILS CLOSED and says so in a <noscript>. There is no
 * third option on a static host: the alternative is revealing the page to
 * everyone who turns JavaScript off, which is the same as not having a gate.
 */
import { currentAgent, isConfigured, membershipStatus, MEMBERSHIP } from "/assets/js/paaipe-firebase.js";

const SIGN_IN = "signin.html";

/** Where to come back to. Same shape the sign-in page will accept - a bare page
 *  on this site - so a path it would refuse never gets built in the first place. */
function returnTo() {
  const here = location.pathname.split("/").pop() || "index.html";
  return /^[a-z0-9][a-z0-9-]*\.html$/i.test(here) ? here : "";
}

function reveal() {
  document.documentElement.setAttribute("data-gate", "ok");
}

/** Shown instead of the page when we cannot establish membership WITHOUT
 *  bouncing - a network failure, or auth not configured. Bouncing on a fault
 *  would send a signed-in member to a sign-in page they do not need and cannot
 *  get past, which reads as "your account stopped working". */
function explain(title, body, retry = true) {
  const host = document.createElement("div");
  host.className = "gatepanel";
  host.setAttribute("data-gate-panel", "");
  host.innerHTML = `
    <div class="gp">
      <h1>${title}</h1>
      <p>${body}</p>
      <div class="gpacts">
        ${retry ? `<button type="button" class="btn btn-gold" data-gate-retry>Try again</button>` : ""}
        <a class="btn btn-ghost" href="index.html">Back to paaipe.org</a>
      </div>
    </div>`;
  document.body.appendChild(host);
  document.documentElement.setAttribute("data-gate", "panel");
  host.querySelector("[data-gate-retry]")?.addEventListener("click", () => location.reload());
}

const STYLE = `
.gatepanel{position:fixed;inset:0;display:grid;place-items:center;padding:24px;
  background:var(--bg,#FBF8F1);z-index:9999}
.gatepanel .gp{max-width:44ch;text-align:center}
.gatepanel h1{font-size:24px;color:var(--navy,#061A4A);margin:0 0 10px}
.gatepanel p{color:var(--muted,#5A6B8C);font-size:14.5px;line-height:1.65;margin:0 0 20px}
.gatepanel .gpacts{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}`;

export async function gateMembersPage() {
  if (!document.body.hasAttribute("data-members-page")) return;

  const s = document.createElement("style");
  s.textContent = STYLE;
  document.head.appendChild(s);

  if (!isConfigured()) {
    // Auth is not set up at all. Nobody can sign in, so redirecting would be a
    // loop; say what is wrong rather than showing a members-only page to all.
    explain("We can't check your membership right now",
            "PAAIPE sign-in isn't connected, so we can't confirm whether you're a member. " +
            "Nothing is wrong with your account.", false);
    return;
  }

  let agent = null;
  try {
    agent = await currentAgent();
  } catch {
    explain("We couldn't reach PAAIPE",
            "This page is for members, and we couldn't check your membership just now. " +
            "Check your connection and try again.");
    document.documentElement.setAttribute("data-gate-reason", "offline");
    return;
  }

  if (!agent) {
    const next = returnTo();
    location.replace(next ? `${SIGN_IN}?next=${encodeURIComponent(next)}` : SIGN_IN);
    return;
  }

  const m = membershipStatus(agent);
  if (m?.state === MEMBERSHIP.SUSPENDED) {
    // Not a redirect: sending them to sign in would suggest signing in again
    // fixes it, and it does not.
    explain("This page isn't available on your account",
            "Your PAAIPE membership is suspended, so the member library isn't available. " +
            "If you think that's a mistake, reply to any PAAIPE email and we'll look into it.",
            false);
    document.documentElement.setAttribute("data-gate-reason", "suspended");
    return;
  }

  // Guest or Agent. Both are "in the portal", and both get in.
  document.documentElement.setAttribute("data-gate-reason", m?.isAgent ? "agent" : "guest");
  reveal();
}

gateMembersPage();
