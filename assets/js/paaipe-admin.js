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
  STATUS,
} from "/assets/js/paaipe-firebase.js";

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

/* ---------------------------------------------------------------- the door */

async function wireSignIn() {
  const form = $("[data-admin-signin]");
  if (!form) return;
  const err = $("[data-admin-error]");
  const btn = form.querySelector("button[type=submit]");
  const show = m => { if (err) { err.textContent = m; err.hidden = !m; } };

  // arriving here after being turned away from the console
  if (new URLSearchParams(location.search).get("denied") === "1")
    show("That account is not a PAAIPE administrator.");

  // already signed in AND actually an admin? go straight through.
  try {
    if (await currentAgent() && await isAdminNow()) {
      location.replace("admin.html"); return;
    }
  } catch { /* offline: fall through and let them try to sign in */ }
  document.documentElement.setAttribute("data-admin-door", "ready");

  form.addEventListener("submit", async e => {
    e.preventDefault();
    show("");
    const email = form.email.value.trim(), password = form.password.value;
    if (!email || !password) return show("Enter your email and password.");
    btn.disabled = true; btn.dataset.busy = "1";
    try {
      await signIn(email, password);
      // Signing in proves WHO they are. It says nothing about whether they may
      // be here - that is the rules' answer, and we do not open the door until
      // we have it.
      if (!(await isAdminNow())) {
        await signOutNow();
        return show("That account is not a PAAIPE administrator.");
      }
      location.replace("admin.html");
    } catch (ex) {
      show(friendlyAuthError(ex));
    } finally {
      btn.disabled = false; delete btn.dataset.busy;
    }
  });

  const forgot = $("[data-admin-forgot]");
  forgot?.addEventListener("click", async e => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (!email) return show("Type your email address first, then choose Forgot password.");
    try {
      await resetPassword(email);
      show("");
      const note = $("[data-admin-note]");
      if (note) { note.textContent = `If ${email} has an account, a reset link is on its way.`; note.hidden = false; }
    } catch (ex) { show(friendlyAuthError(ex)); }
  });
}

/* ------------------------------------------------------------- the console */

function renderMembers(list, adminEmail) {
  const body = $("[data-members]");
  if (!body) return;
  const pending = list.filter(m => statusOf(m) === STATUS.GUEST);
  const countEl = $("[data-members-count]");
  if (countEl) countEl.textContent =
    plural(list.length, "member", "members");
  const pendEl = $("[data-pending-count]");
  if (pendEl) pendEl.textContent = plural(pending.length, "member is", "members are");
  const pendWrap = $("[data-pending-wrap]");
  if (pendWrap) pendWrap.hidden = pending.length === 0;

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
  const [members, regs] = await Promise.all([
    listMembers().catch(e => { throw e; }),
    // registrations are secondary: a failure there must not blank the members
    listRegistrations().catch(() => null),
  ]);
  renderMembers(members, adminEmail);
  if (regs === null) {
    const b = $("[data-registrations]");
    if (b) b.innerHTML = `<tr><td colspan="4" class="empty">Registrations could not be loaded.</td></tr>`;
  } else {
    renderRegistrations(regs);
  }
  document.documentElement.setAttribute("data-admin-ready", String(members.length));
}

async function wireConsole() {
  if (!$("[data-admin-console]")) return;

  let me = null;
  try { me = await currentAgent(); } catch { /* treated as signed out */ }
  if (!me) { location.replace("admin-signin.html"); return; }

  let allowed = false;
  try { allowed = await isAdminNow(); }
  catch {
    // Could not reach Firebase. Say so; do NOT show an empty console, which
    // would read as "there are no members".
    document.body.innerHTML =
      `<div class="offline"><h1>PAAIPE could not be reached</h1>` +
      `<p>The console needs a connection to load. Please try again.</p>` +
      `<p><a href="admin.html">Retry</a></p></div>`;
    return;
  }
  if (!allowed) {
    // Signed in, but not staff. Do not leave them holding a session on a page
    // they cannot use.
    await signOutNow().catch(() => {});
    location.replace("admin-signin.html?denied=1");
    return;
  }

  $$("[data-admin-email]").forEach(e => { e.textContent = me.email; });
  wireMemberActions(me.email);
  $("[data-admin-signout]")?.addEventListener("click", async e => {
    e.preventDefault();
    await signOutNow().catch(() => {});
    location.replace("admin-signin.html");
  });

  try {
    await refresh(me.email);
  } catch (ex) {
    flash(`Could not load the console: ${ex?.message || ex}`);
    document.documentElement.setAttribute("data-admin-ready", "error");
  }
}

wireSignIn();
wireConsole();
