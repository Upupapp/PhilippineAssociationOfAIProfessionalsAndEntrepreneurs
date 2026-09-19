/* Test-only signed-in Agent. Import-mapped over paaipe-firebase.js. */
export {
  firebaseConfig, DATABASE_ID,
  signOutNow, setDirectoryVisible, membershipStatus, resendVerification,
  markConfirmationSeen, GATE_GUESTS, idTokenForRequest, persistAgentPhotoUrl,
  explainPhotoError,
} from "/assets/js/paaipe-firebase.js?real=1";

export function isConfigured() { return true; }

export async function currentAgent() {
  return {
    uid: "u1",
    email: "member@example.com",
    full_name: "Rosa Villanueva",
    status: "agent",
    isAgent: true,
    emailVerified: true,
    directoryVisible: false,
    agentNumber: "0006",
    confirmationSeen: true,
  };
}
