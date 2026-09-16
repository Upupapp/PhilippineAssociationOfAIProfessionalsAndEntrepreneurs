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
  apiKey:            "",                     // <- paste
  authDomain:        "",                     // <- paste (e.g. postflowit-autos.firebaseapp.com)
  projectId:         "postflowit-autos",
  storageBucket:     "",                     // <- paste
  messagingSenderId: "558511325456",
  appId:             "",                     // <- paste the PAAIPE web app id
};

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
  _db = getFirestore(app);
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
    createdAt: serverTimestamp(),
    source: "paaipe.org",
    userAgent: navigator.userAgent.slice(0, 300),
  });
  return ref.id;
}
