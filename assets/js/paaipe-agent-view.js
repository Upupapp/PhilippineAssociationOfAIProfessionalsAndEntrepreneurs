/* Agent profile view.
 *
 * The mockup was a single static page showing MJ Soriano, and every directory
 * card linked to it - so clicking "Paul Espinas" would have opened MJ's profile.
 * Showing the wrong person's details is worse than a dead link, so this page
 * renders whoever ?agent= names, and says "profile not found" when it cannot.
 */
import { FOUNDING_AGENTS } from "/assets/js/paaipe-agents.js";

(function () {
  var id = new URLSearchParams(location.search).get("agent");
  var a = id ? FOUNDING_AGENTS[id] : null;
  var set = function (sel, text) {
    document.querySelectorAll(sel).forEach(function (e) { e.textContent = text; });
  };

  if (!a) {
    // No guessing. An unknown id gets an honest empty state.
    var main = document.querySelector("main.content");
    if (main) {
      main.innerHTML =
        '<div class="crumbs"><a href="portal-directory.html">Agent Directory</a>' +
        '<span>&rsaquo;</span><span>Profile not found</span></div>' +
        '<div class="card" style="text-align:center;padding:48px 24px">' +
        '<h1 style="font-size:22px;margin-bottom:8px">That Agent profile is not available</h1>' +
        '<p style="color:var(--muted);font-size:15px;margin:0 0 18px">' +
        (id ? "We could not find an Agent with that reference."
            : "No Agent was specified.") +
        ' Profiles appear here for confirmed Agents who have opted into the directory.</p>' +
        '<a class="btn btn-gold" href="portal-directory.html">Back to the Agent Directory</a></div>';
    }
    document.documentElement.setAttribute("data-agent-view", "not-found");
    return;
  }

  document.title = a.name + " — PAAIPE AI Portal";
  set("[data-av-name]", a.name);
  set("[data-av-crumb]", a.name);
  set("[data-av-number]", "Agent " + a.number);
  set("[data-av-role]", a.role || "");
  set("[data-av-location]", a.location || "");

  document.querySelectorAll("[data-av-photo]").forEach(function (img) {
    img.src = a.photo; img.alt = a.name;
  });

  // tags, rebuilt from this Agent's own list
  document.querySelectorAll("[data-av-tags]").forEach(function (host) {
    host.innerHTML = (a.tags || []).map(function (t) {
      return "<span>" + t + "</span>";
    }).join("");
    host.closest("[data-av-section='tags']") &&
      (host.closest("[data-av-section='tags']").style.display =
         (a.tags || []).length ? "" : "none");
  });

  // Every card that states something ABOUT this person is hidden unless we hold
  // that data for THEM. The mockup's numbers - "1 Exchanges, 1 Hosted, 2 Threads",
  // threads "Started by Agent 004", MJ's About and Links - would otherwise be
  // presented as facts about whoever's profile is open. Those are real people.
  var supplied = {
    about:    !!a.about,
    aiwork:   !!a.about,     // the extended detail was supplied as one piece
    links:    !!a.about,
    activity: false,         // no attendance or posting data exists for anyone yet
    recent:   false,
    badges:   !!a.founding,  // "Founding Agent" is true of these five
  };
  document.querySelectorAll("[data-av-section]").forEach(function (sec) {
    var key = sec.getAttribute("data-av-section");
    if (key === "tags") return;                      // handled above
    if (key === "about" && a.about) set("[data-av-about]", a.about);
    if (!supplied[key]) sec.style.display = "none";
  });
  // the badge card keeps only what is true of this Agent
  document.querySelectorAll('[data-av-section="badges"] .bdg > *').forEach(function (b) {
    if (!/founding/i.test(b.textContent)) b.style.display = "none";
  });

  document.documentElement.setAttribute("data-agent-view", a.number);
})();
