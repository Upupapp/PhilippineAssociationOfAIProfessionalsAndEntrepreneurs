/* Agent profile view.
 *
 * Directory cards link here with ?agent=<number> (founding Agents from
 * paaipe-agents.js). My Profile → "Preview my profile" opens ?preview=1
 * (alias ?agent=self) and reuses this same chrome for the signed-in Agent's
 * public fields — no third layout.
 *
 * Unknown ids get an honest empty state. Sections without data stay hidden
 * rather than borrowing another Agent's copy.
 */
import { FOUNDING_AGENTS } from "/assets/js/paaipe-agents.js";
import { currentAgent, isConfigured } from "/assets/js/paaipe-firebase.js";

const params = new URLSearchParams(location.search);
const isPreview =
  params.get("preview") === "1" ||
  params.get("agent") === "self";

function set(sel, text) {
  document.querySelectorAll(sel).forEach((e) => {
    e.textContent = text;
  });
}

function hide(el) {
  if (el) el.style.display = "none";
}

function notFound(id) {
  const main = document.querySelector("main.content");
  if (main) {
    main.innerHTML =
      '<div class="crumbs"><a href="portal-directory.html">Agent Directory</a>' +
      "<span>&rsaquo;</span><span>Profile not found</span></div>" +
      '<div class="card" style="text-align:center;padding:48px 24px">' +
      '<h1 style="font-size:22px;margin-bottom:8px">That Agent profile is not available</h1>' +
      '<p style="color:var(--muted);font-size:15px;margin:0 0 18px">' +
      (id
        ? "We could not find an Agent with that reference."
        : "No Agent was specified.") +
      " Profiles appear here for confirmed Agents who have opted into the directory.</p>" +
      '<a class="btn btn-gold" href="portal-directory.html">Back to the Agent Directory</a></div>';
  }
  document.documentElement.setAttribute("data-agent-view", "not-found");
}

/** Shape the signed-in profile into the same view model founding Agents use. */
function fromSelf(agent) {
  const number = agent.agentNumber
    ? String(agent.agentNumber).padStart(3, "0")
    : null;
  const founding =
    number && FOUNDING_AGENTS[number] ? FOUNDING_AGENTS[number] : null;
  // Prefer saved profile fields; enrich from founding catalog only when the
  // signed-in Agent is one of those five (same public facts Directory shows).
  return {
    name: agent.full_name || founding?.name || agent.email || "Agent",
    number: number || "····",
    location: founding?.location || "",
    role: founding?.role || "",
    tags: founding?.tags || [],
    photo: agent.photoUrl || founding?.photo || "",
    about: founding?.about || "",
    founding: !!(founding && founding.founding),
    directoryVisible: agent.directoryVisible === true,
    isAgent: agent.isAgent === true,
    _self: true,
  };
}

function fromFounding(id) {
  const a = FOUNDING_AGENTS[id];
  if (!a) return null;
  return {
    name: a.name,
    number: a.number,
    location: a.location || "",
    role: a.role || "",
    tags: a.tags || [],
    photo: a.photo || "",
    about: a.about || "",
    founding: !!a.founding,
    directoryVisible: true,
    isAgent: true,
    _self: false,
  };
}

function applyPreviewChrome(a) {
  document.documentElement.setAttribute("data-agent-preview", "1");
  const note = document.querySelector("[data-av-preview-note]");
  if (!note) return;
  const bits = [];
  if (!a.directoryVisible) {
    bits.push(
      "You’re hidden from the Agent Directory — only you can open this preview."
    );
  }
  if (!a.isAgent) {
    bits.push(
      "You’re still a Guest; Directory listing waits on PAAIPE confirmation."
    );
  }
  note.textContent = bits.join(" ");
}

function render(a) {
  document.title = a.name + " — PAAIPE AI Portal";
  set("[data-av-name]", a.name);
  set("[data-av-crumb]", a.name);
  set(
    "[data-av-number]",
    a.number && a.number !== "····"
      ? "Agent " + a.number
      : "Agent number pending"
  );
  set("[data-av-role]", a.role || "");
  set("[data-av-location]", a.location || "");

  document.querySelectorAll("[data-av-photo]").forEach((img) => {
    if (a.photo) {
      img.src = a.photo;
      img.alt = a.name;
      img.style.display = "";
    } else {
      // No portrait on file — hide rather than keep another Agent's face.
      hide(img);
    }
  });

  document.querySelectorAll("[data-av-tags]").forEach((host) => {
    host.innerHTML = (a.tags || [])
      .map((t) => "<span>" + t + "</span>")
      .join("");
    const sec = host.closest("[data-av-section='tags']");
    if (sec) sec.style.display = (a.tags || []).length ? "" : "none";
  });

  // Hide every "about this person" card unless we hold that fact for THEM.
  const supplied = {
    about: !!a.about,
    aiwork: !!a.about,
    links: !!a.about,
    activity: false,
    recent: false,
    badges: !!a.founding,
  };
  document.querySelectorAll("[data-av-section]").forEach((sec) => {
    const key = sec.getAttribute("data-av-section");
    if (key === "tags") return;
    if (key === "about" && a.about) set("[data-av-about]", a.about);
    if (!supplied[key]) sec.style.display = "none";
  });
  document
    .querySelectorAll('[data-av-section="badges"] .bdg > *')
    .forEach((b) => {
      if (!/founding/i.test(b.textContent || "")) b.style.display = "none";
    });

  // Verified / Founding pills: only claim what is true.
  document.querySelectorAll(".phead .pill").forEach((pill) => {
    const t = (pill.textContent || "").trim();
    if (/^Verified$/i.test(t) && !a.isAgent) hide(pill);
    if (/Founding Agent/i.test(t) && !a.founding) hide(pill);
  });

  if (a._self) {
    applyPreviewChrome(a);
    // Connect-as-self: hide (markup also carries data-av-self-hide).
    document
      .querySelectorAll("[data-av-self-hide], [data-agents-only]")
      .forEach((el) => {
        hide(el);
      });
  }

  document.documentElement.setAttribute(
    "data-agent-view",
    a._self ? "preview" : a.number
  );
}

(async function () {
  if (isPreview) {
    if (!isConfigured()) {
      notFound("self");
      return;
    }
    let agent = null;
    try {
      agent = await currentAgent();
    } catch {
      agent = null;
    }
    if (!agent) {
      location.replace("signin.html");
      return;
    }
    render(fromSelf(agent));
    return;
  }

  const id = params.get("agent");
  const a = id ? fromFounding(id) : null;
  if (!a) {
    notFound(id);
    return;
  }
  render(a);
})();
