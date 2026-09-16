/* The five founding Agents, as supplied by PAAIPE.
 *
 * This is the SOURCE for the Agent profile view. Every directory card links here
 * with ?agent=<number>; an unknown or missing number shows "profile not found"
 * rather than falling back to whoever happens to be first - the mockup linked
 * every card to one static page, so clicking "Paul Espinas" opened MJ Soriano.
 *
 * Only MJ Soriano has an About paragraph; the others have none, so that section
 * is HIDDEN for them rather than filled with someone else's words. Members who
 * sign up and opt in will come from Firestore, not from here.
 */
export const FOUNDING_AGENTS = {
  "001": {
    "name": "Paul Espinas",
    "number": "001",
    "location": "Manila",
    "role": "Founder & CEO, UpUp Technologies",
    "tags": [
      "Startups",
      "HR tech",
      "LGU digitization"
    ],
    "photo": "assets/img/agents/agent-001-paul-espinas.png",
    "founding": true
  },
  "002": {
    "name": "Melody Belza",
    "number": "002",
    "location": "Metro Manila",
    "role": "Founding Agent",
    "tags": [
      "Community"
    ],
    "photo": "assets/img/agents/agent-002-melody-belza.png",
    "founding": true
  },
  "003": {
    "name": "Diana Madayag",
    "number": "003",
    "location": "Metro Manila",
    "role": "Founding Agent",
    "tags": [
      "Community"
    ],
    "photo": "assets/img/agents/agent-003-diana-madayag.png",
    "founding": true
  },
  "004": {
    "name": "MJ Soriano",
    "number": "004",
    "location": "Antipolo, Rizal",
    "role": "Co-founder, MVJ Training Consultancy",
    "tags": [
      "Training",
      "L&D",
      "Digital products"
    ],
    "photo": "assets/img/agents/agent-004-mj-soriano.png",
    "about": "MJ co-founded MVJ Training Consultancy Services, a learning-and-development firm recognized by DICT for its work bridging industry, government and the education sector. She designs training programs and digital learning products that help organizations and small teams thrive in the digital economy, and hosts the PAAIPE AI Exchange.",
    "founding": true
  },
  "005": {
    "name": "Dennis Paguio",
    "number": "005",
    "location": "Bacoor, Cavite",
    "role": "Founder & CEO, DP Digital Solutions",
    "tags": [
      "Digital marketing",
      "Training",
      "AI strategy"
    ],
    "photo": "assets/img/agents/agent-005-dennis-paguio.png",
    "founding": true
  }
};
