/* PAAIPE — Firebase client.
 *
 * ONE place to configure Firebase for paaipe.org. Fill in the values from the
 * Firebase console: Project settings -> Your apps -> the "PAAIPE web" app.
 *
 * IMPORTANT — this project is SHARED with PostFlow (project "PAAIPE and
 * POSTFLOW", id postflowit-autos). Register a SEPARATE web app for PAAIPE and
 * use ITS appId. Do not reuse PostFlow web's appId.
 *
 * These values are not secrets: a Firebase web config is public by design, and
 * Firestore security rules are what protect the data. See firestore.rules.
 *
 * Because the project is shared, every PAAIPE collection is prefixed `paaipe_`
 * so the rules can be scoped without touching PostFlow's.
 */
export const firebaseConfig = {
  apiKey:            "AIzaSyCeZ6CcSV79l9TPNK6UL0SV5d5b8EU11n8",
  authDomain:        "postflowit-autos.firebaseapp.com",
  projectId:         "postflowit-autos",
  storageBucket:     "postflowit-autos.firebasestorage.app",
  messagingSenderId: "558511325456",
  // "PAAIPE web" — NOT PostFlow web (…9550cdfa273af2368c6595).
  appId:             "1:558511325456:web:6f8f383eb10116db8c6595",
};

/** PAAIPE's own Firestore database (asia-southeast1). NOT the project default. */
export const DATABASE_ID = "paaipe";

/** The published version of each consent document. Bump these whenever
 *  terms-of-use.html or privacy-notice.html changes materially, so a record
 *  always says WHICH text the person agreed to. Consent you cannot evidence is
 *  not much use under RA 10173. */
export const DOC_VERSIONS = { terms: "1.0", privacy: "1.0" };

/** Membership status (owner, 2026-09-16): "all registrants are considered GUESTS
 *  at this point. They are pending AGENT confirmation. because in PAAIPE, only
 *  confirmed users become agents."
 *
 *  So signing up makes a GUEST, never an Agent. Promotion to "agent" is an
 *  administrative act done by PAAIPE, and the rules forbid a client writing or
 *  changing this field - otherwise anyone could promote themselves. Nothing in
 *  the UI may call a guest an Agent. */
export const STATUS = { GUEST: "guest", AGENT: "agent", SUSPENDED: "suspended" };

/** Derived membership states used by the UI. STORAGE keeps only
 *  guest | agent | suspended; whether a guest is "unverified" or "pending" comes
 *  from Firebase Auth's emailVerified, which is the single source of truth for
 *  that. Storing it twice would let the two disagree. */
export const MEMBERSHIP = {
  GUEST_UNVERIFIED: "guest_unverified",
  GUEST_PENDING:    "guest_pending",
  AGENT:            "agent",
  SUSPENDED:        "suspended",
};

/** Feature flag. While false, guests may use the whole portal and every
 *  "Agents only" affordance is a SIGNIFIER, not a lock. Flip to true to enforce.
 *  Every gated affordance checks this, so enforcing later needs no redesign. */
export const GATE_GUESTS = false;

/** THE one place membership state is decided. Everything in the UI derives from
 *  this, so a badge can never disagree with the account behind it. */
export function membershipStatus(agent) {
  if (!agent) return null;
  var stored = agent.status;
  var state =
    stored === STATUS.SUSPENDED ? MEMBERSHIP.SUSPENDED :
    stored === STATUS.AGENT     ? MEMBERSHIP.AGENT :
    agent.emailVerified         ? MEMBERSHIP.GUEST_PENDING :
                                  MEMBERSHIP.GUEST_UNVERIFIED;
  var isAgent = state === MEMBERSHIP.AGENT;
  return {
    state: state,
    isAgent: isAgent,
    isGuest: state === MEMBERSHIP.GUEST_UNVERIFIED || state === MEMBERSHIP.GUEST_PENDING,
    needsEmailVerification: state === MEMBERSHIP.GUEST_UNVERIFIED,
    // what the UI shows. No component invents its own wording.
    label:     isAgent ? "AGENT" : "GUEST",
    statusLine: isAgent
      ? ((agent.agentNumber ? "AGENT " + agent.agentNumber : "AGENT") + " · VERIFIED")
      : "GUEST · AWAITING CONFIRMATION",
    pill: isAgent ? "Verified Agent" : "Awaiting confirmation",
    subline: isAgent ? "Agent" : "Guest · awaiting Agent confirmation",
    agentNumber: agent.agentNumber || null,
    // the four steps shown on Home and Profile
    steps: [
      { label: "Signed up",              done: true },
      { label: "Email verified",         done: !!agent.emailVerified },
      { label: "Admin confirmation",     done: isAgent },
      { label: "Agent number assigned",  done: !!agent.agentNumber },
    ],
    gated: GATE_GUESTS && !isAgent,
  };
}

export const COLLECTIONS = {
  registrations: "paaipe_event_registrations",
  agents:        "paaipe_agents",
};

/** True only when the config has been filled in. Nothing may claim success
 *  while this is false — see the "absent machinery" note in firestore.rules. */
export function isConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.appId && firebaseConfig.authDomain);
}

const SDK = "https://www.gstatic.com/firebasejs/12.19.0";
let _db = null;

async function db() {
  if (_db) return _db;
  if (!isConfigured()) throw new Error("PAAIPE Firebase is not configured yet.");
  const { initializeApp, getApps } = await import(`${SDK}/firebase-app.js`);
  const { getFirestore } = await import(`${SDK}/firebase-firestore.js`);
  // The project is shared: name the app so we never collide with PostFlow's.
  const app = getApps().find(a => a.name === "paaipe") || initializeApp(firebaseConfig, "paaipe");
  // NAMED database, not (default). PAAIPE's data lives in its own Firestore
  // database in asia-southeast1 (Singapore); the project's (default) database is
  // in nam5 (United States) and belongs to PostFlow. Passing DATABASE_ID is what
  // keeps PAAIPE's data in-region and under its own ruleset.
  _db = getFirestore(app, DATABASE_ID);
  return _db;
}

/**
 * Store one event registration.
 * Throws on failure — the caller MUST NOT show a confirmation unless this
 * resolves. Returns the new document id.
 */
export async function submitRegistration(fields) {
  const { collection, addDoc, serverTimestamp } = await import(`${SDK}/firebase-firestore.js`);
  const ref = await addDoc(collection(await db(), COLLECTIONS.registrations), {
    ...fields,
    privacyVersion: DOC_VERSIONS.privacy,
    createdAt: serverTimestamp(),
    source: "paaipe.org",
    userAgent: navigator.userAgent.slice(0, 300),
  });
  return ref.id;
}

/* ---------------------------------------------------------------------------
 * Authentication — PAAIPE Agents.
 *
 * NOTE ON AGENT NUMBERS (owner, 2026-09-16): "Agent numbering are labels, so
 * far we only have 5 agents." They are ADMINISTRATIVE LABELS, not an
 * auto-assigned identity, and only the five founding Agents have one. So a new
 * sign-up is given NO number: nothing here invents one, and the rules forbid a
 * client from setting `agentNumber` at all. The card shows `····` until somebody
 * assigns a label. Showing a made-up number would be the exact defect this
 * replaced — every new member was told they were Agent 0006.
 *
 * The Firebase project is shared with PostFlow and Auth is ONE user pool per
 * project, so a PAAIPE Agent and a PostFlow user share it. Accepted by the
 * owner, 2026-09-16. `paaipe_agents/{uid}` is what makes someone an AGENT; a
 * bare Auth account is not enough.
 * ------------------------------------------------------------------------- */

async function auth() {
  if (!isConfigured()) throw new Error("PAAIPE Firebase is not configured yet.");
  const { initializeApp, getApps } = await import(`${SDK}/firebase-app.js`);
  const { getAuth } = await import(`${SDK}/firebase-auth.js`);
  const app = getApps().find(a => a.name === "paaipe") || initializeApp(firebaseConfig, "paaipe");
  return getAuth(app);
}

/** Create an Agent account, verify the address, and store the profile. */
export async function signUp({ full_name, email, password, updates }) {
  const A = await import(`${SDK}/firebase-auth.js`);
  const F = await import(`${SDK}/firebase-firestore.js`);
  const a = await auth();
  const cred = await A.createUserWithEmailAndPassword(a, email, password);
  try { await A.updateProfile(cred.user, { displayName: full_name }); } catch {}
  try { await A.sendEmailVerification(cred.user); } catch {}
  // No agentNumber: it is a label, assigned by PAAIPE, never by the client.
  await F.setDoc(F.doc(await db(), COLLECTIONS.agents, cred.user.uid), {
    full_name, email, updates: Boolean(updates),
    // A registrant is a GUEST until PAAIPE confirms them. The client may only
    // ever write "guest"; the rules reject anything else on create.
    status: STATUS.GUEST,
    // Opt-IN, not opt-out: nobody is listed in the directory until they ask.
    directoryVisible: false,
    createdAt: F.serverTimestamp(), source: "paaipe.org",
    // WHICH text they agreed to, and when. Without the version a consent record
    // cannot say what was actually accepted once the documents change.
    termsVersion: DOC_VERSIONS.terms,
    privacyVersion: DOC_VERSIONS.privacy,
    consentedAt: F.serverTimestamp(),
  });
  return cred.user;
}

export async function signIn(email, password) {
  const A = await import(`${SDK}/firebase-auth.js`);
  return (await A.signInWithEmailAndPassword(await auth(), email, password)).user;
}

export async function signInWithGoogle() {
  const A = await import(`${SDK}/firebase-auth.js`);
  const a = await auth();
  const cred = await A.signInWithPopup(a, new A.GoogleAuthProvider());
  const F = await import(`${SDK}/firebase-firestore.js`);
  const ref = F.doc(await db(), COLLECTIONS.agents, cred.user.uid);
  // First Google sign-in also creates the profile - as a GUEST, with no number.
  // Consent is recorded here too: the button sits under the same Terms and
  // Privacy Notice as the form, so the same versions apply.
  if (!(await F.getDoc(ref)).exists()) {
    await F.setDoc(ref, {
      full_name: cred.user.displayName || "", email: cred.user.email || "",
      updates: false, status: STATUS.GUEST, directoryVisible: false,
      termsVersion: DOC_VERSIONS.terms,
      privacyVersion: DOC_VERSIONS.privacy,
      consentedAt: F.serverTimestamp(),
      createdAt: F.serverTimestamp(), source: "paaipe.org/google",
    });
  }
  return cred.user;
}

export async function resetPassword(email) {
  const A = await import(`${SDK}/firebase-auth.js`);
  return A.sendPasswordResetEmail(await auth(), email);
}

/* Completing a password reset.
 *
 * Firebase emails a LINK containing a one-time `oobCode`. There is no short
 * numeric PIN: issuing one would mean a server to generate it, store it, expire
 * it and rate-limit attempts against it, and PAAIPE has no server. The oobCode
 * is the code - single-use, expiring, and issued by Google rather than by us.
 *
 * These two are separate on purpose. verifyResetCode() tells us WHOSE account
 * the code is for before anyone types a new password, so the screen can name the
 * account and a stale or reused code fails before rather than after.
 */

/** Resolves with the email address the code belongs to, or throws. */
export async function verifyResetCode(code) {
  const A = await import(`${SDK}/firebase-auth.js`);
  return A.verifyPasswordResetCode(await auth(), code);
}

/** Sets the new password and spends the code. */
export async function completePasswordReset(code, newPassword) {
  const A = await import(`${SDK}/firebase-auth.js`);
  return A.confirmPasswordReset(await auth(), code, newPassword);
}

/** People paste the whole link from the email as often as they paste the code.
 *  Accept either rather than telling them they did it wrong. */
export function extractResetCode(pasted) {
  const s = String(pasted || "").trim();
  if (!s) return "";
  try { return new URL(s).searchParams.get("oobCode") || s; }
  catch { return s; }
}

export async function signOutNow() {
  const A = await import(`${SDK}/firebase-auth.js`);
  return (await import(`${SDK}/firebase-auth.js`)).signOut(await auth());
}

/** Resolves with the signed-in Agent's profile, or null. Waits for Firebase to
 *  restore any persisted session before answering — otherwise a guard would
 *  bounce a signed-in member on every reload. */
export async function currentAgent() {
  const A = await import(`${SDK}/firebase-auth.js`);
  const a = await auth();
  const user = await new Promise(res => {
    const un = A.onAuthStateChanged(a, u => { un(); res(u); });
  });
  if (!user) return null;
  let profile = {};
  try {
    const F = await import(`${SDK}/firebase-firestore.js`);
    const s = await F.getDoc(F.doc(await db(), COLLECTIONS.agents, user.uid));
    if (s.exists()) profile = s.data();
  } catch {}
  return {
    uid: user.uid,
    email: user.email || profile.email || "",
    full_name: profile.full_name || user.displayName || "",
    emailVerified: user.emailVerified,
    // null, never invented. The UI must render a placeholder, not a number.
    agentNumber: profile.agentNumber ?? null,
    // Anything not yet confirmed by PAAIPE is a guest, including a profile
    // written before this field existed.
    status: profile.status === STATUS.AGENT ? STATUS.AGENT
          : profile.status === STATUS.SUSPENDED ? STATUS.SUSPENDED : STATUS.GUEST,
    isAgent: profile.status === STATUS.AGENT,
    directoryVisible: profile.directoryVisible === true,
    // null for a guest; set by confirmUser() when PAAIPE confirms them
    confirmedAt: profile.confirmed_at || null,
    confirmedBy: profile.confirmed_by || null,
    // so the one-time celebration can be shown exactly once
    confirmationSeen: profile.confirmation_seen === true,
  };
}

/** Send the verification email again. Guests who never verified are stuck at
 *  the first step, and the banner offers this. */
export async function resendVerification() {
  const A = await import(`${SDK}/firebase-auth.js`);
  const a = await auth();
  const user = await new Promise(res => { const un = A.onAuthStateChanged(a, u => { un(); res(u); }); });
  if (!user) throw new Error("not-signed-in");
  if (user.emailVerified) return false;
  await A.sendEmailVerification(user);
  return true;
}

/** Mark the one-time "you are now an Agent" celebration as seen. */
export async function markConfirmationSeen() {
  const A = await import(`${SDK}/firebase-auth.js`);
  const F = await import(`${SDK}/firebase-firestore.js`);
  const a = await auth();
  const user = await new Promise(res => { const un = A.onAuthStateChanged(a, u => { un(); res(u); }); });
  if (!user) return;
  await F.updateDoc(F.doc(await db(), COLLECTIONS.agents, user.uid), { confirmation_seen: true });
}

/** Set whether this member appears in the Agent Directory. The member controls
 *  it; being listed also requires PAAIPE to have confirmed them as an Agent,
 *  which is why the directory filters on BOTH. */
export async function setDirectoryVisible(visible) {
  const A = await import(`${SDK}/firebase-auth.js`);
  const F = await import(`${SDK}/firebase-firestore.js`);
  const a = await auth();
  const user = await new Promise(res => { const un = A.onAuthStateChanged(a, u => { un(); res(u); }); });
  if (!user) throw new Error("not-signed-in");
  await F.updateDoc(F.doc(await db(), COLLECTIONS.agents, user.uid),
                    { directoryVisible: Boolean(visible) });
  return Boolean(visible);
}

/** Confirmed Agents who have opted in. A guest is never listed, however they
 *  set their own toggle. */
export async function listDirectory() {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const q = F.query(F.collection(await db(), COLLECTIONS.agents),
                    F.where("status", "==", STATUS.AGENT),
                    F.where("directoryVisible", "==", true));
  const snap = await F.getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}

/* ---------------------------------------------------------------------------
 * ADMINISTRATORS
 *
 * Who is an administrator is stated in firestore.rules and NOWHERE ELSE - see
 * isAdmin() there. Deliberately, this file keeps no list of admin emails: a copy
 * here would be a second source of truth that can drift from the real one, and
 * it would protect nothing anyway, because anything this file says about the
 * person using it is something that person can edit in their own browser.
 *
 * So adminness is not asserted, it is MEASURED: we ask Firestore to do an
 * admin-only thing and see whether it is allowed. The answer comes from the
 * deployed rules, which is the only answer that means anything.
 * ------------------------------------------------------------------------- */

/** True only if the DEPLOYED RULES let this account read registrations, which
 *  only an administrator may do. An empty collection still answers "yes" - an
 *  allowed query over nothing returns an empty result, while a refused one
 *  throws permission-denied. */
export async function isAdminNow() {
  try {
    const F = await import(`${SDK}/firebase-firestore.js`);
    await F.getDocs(F.query(F.collection(await db(), COLLECTIONS.registrations), F.limit(1)));
    return true;
  } catch (e) {
    if (e && e.code === "permission-denied") return false;
    throw e;   // a network failure is NOT "you are not an admin"
  }
}

/** Every member, guests included. Admin-only; throws permission-denied
 *  otherwise. Ordered newest first, with no ordering claimed when a profile
 *  predates createdAt. */
export async function listMembers() {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const snap = await F.getDocs(F.collection(await db(), COLLECTIONS.agents));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

/** Every event registration. Admin-only. */
export async function listRegistrations() {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const snap = await F.getDocs(F.collection(await db(), COLLECTIONS.registrations));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

/** Confirm a Guest as an Agent. The owner's rule: "only confirmed users become
 *  agents", and confirmation happens here.
 *
 *  agentNumber is a LABEL the association issues, not a counter - the owner's
 *  words, 2026-09-16: "Agent numbering are labels so far we only have 5 agents".
 *  So the admin types it, and nothing generates one.
 *
 *  confirmed_at and confirmed_by are stamped by the rules, not by us: the server
 *  clock and the admin's own token email, so a confirmation cannot be backdated
 *  or credited to someone else. */
export async function confirmMember(uid, agentNumber, adminEmail) {
  const F = await import(`${SDK}/firebase-firestore.js`);
  const patch = {
    status: STATUS.AGENT,
    confirmed_at: F.serverTimestamp(),
    confirmed_by: adminEmail,
  };
  const n = String(agentNumber || "").trim();
  if (n) patch.agentNumber = n;
  await F.updateDoc(F.doc(await db(), COLLECTIONS.agents, uid), patch);
}

/** Move a member back to guest, or suspend them. Nothing else about the profile
 *  may be touched - the rules enforce that, not this function. */
export async function setMemberStatus(uid, status) {
  if (![STATUS.GUEST, STATUS.AGENT, STATUS.SUSPENDED].includes(status))
    throw new Error(`refusing to write an unknown status: ${status}`);
  const F = await import(`${SDK}/firebase-firestore.js`);
  await F.updateDoc(F.doc(await db(), COLLECTIONS.agents, uid), { status });
}

/** Firebase error codes are not for humans. */
export function friendlyAuthError(e) {
  const c = (e && e.code) || "";
  return {
    "auth/email-already-in-use": "That email already has a PAAIPE account. Try signing in instead.",
    "auth/invalid-email":        "That email address does not look right.",
    "auth/weak-password":        "Please choose a password of at least 8 characters.",
    "auth/invalid-credential":   "That email and password do not match.",
    "auth/wrong-password":       "That email and password do not match.",
    "auth/user-not-found":       "That email and password do not match.",
    "auth/too-many-requests":    "Too many attempts. Please wait a few minutes and try again.",
    "auth/network-request-failed":"Network problem. Please check your connection and try again.",
    "auth/popup-closed-by-user": "The Google window was closed before sign-in finished.",
    "auth/popup-blocked":        "Your browser blocked the Google pop-up. Allow pop-ups and try again.",
    "auth/operation-not-allowed":"Google sign-in is not switched on for PAAIPE yet. Please use your email and password.",
    // Firebase only permits OAuth from domains on its authorized list. Until
    // paaipe.org is added there, Google sign-in fails with exactly this code -
    // a generic "something went wrong" would hide a one-setting fix.
    "auth/unauthorized-domain":"Google sign-in is not available on this site yet. Please use your email and password.",
    // Signed up with a password, now trying Google with the same address.
    "auth/account-exists-with-different-credential":
      "That email already has a PAAIPE account. Sign in with your password instead.",
    "auth/cancelled-popup-request":"Only one sign-in window at a time — try again.",
  }[c] || "Something went wrong. Please try again.";
}
