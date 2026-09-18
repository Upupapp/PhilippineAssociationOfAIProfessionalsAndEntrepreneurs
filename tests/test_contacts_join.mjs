/* Contacts join. One row per email from collections the admin pages already read.
 * No invented names. The Admin chip is the firestore.rules allow-list, copied
 * here only so the page can paint it; the rules remain the lock. */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  ADMIN_ALLOWLIST, joinContacts, filterContacts, registrationStatus,
} from "../assets/js/paaipe-contacts-join.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
let pass = 0, fail = 0;
const T = (n, f) => {
  try { f(); console.log(`  PASS  ${n}`); pass++; }
  catch (e) { console.log(`  FAIL  ${n}\n        ${e.message}`); fail++; }
};
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
};

const ts = s => ({ seconds: s });

T("the Admin chip list is the rules allow-list, nothing else", () => {
  const rules = readFileSync(join(ROOT, "firestore.rules"), "utf8");
  const start = rules.indexOf("function isAdmin()");
  const end = rules.indexOf("function isWellFormed", start);
  const block = rules.slice(start, end);
  const listed = [...block.matchAll(/'([^']+@[^']+)'/g)].map(m => m[1]);
  eq(listed, ["admin@upupapp.asia"], "rules");
  eq(ADMIN_ALLOWLIST, listed, "page copy");
});

T("one row per email, case-insensitive, name falls back in order", () => {
  const people = joinContacts({
    agents: [{ uid: "u1", email: "Ada@x.com", full_name: "Ada Lovelace", status: "agent", createdAt: ts(30) }],
    registrations: [
      { id: "r1", email: "ada@x.com", full_name: "Not This", event: "October", createdAt: ts(20) },
      { id: "r2", email: "ben@x.com", full_name: "", createdAt: ts(10) },
    ],
    applications: [
      { id: "a1", email: "ADA@x.com", contactName: "Also Not", companyName: "Analytical", phone: "0917", createdAt: ts(25) },
      { id: "a2", email: "cara@x.com", contactName: "Cara", companyName: "Engines", createdAt: ts(5) },
    ],
    adminEmails: [],
  });
  eq(people.map(p => p.emailKey), ["ada@x.com", "ben@x.com", "cara@x.com"], "order newest first");
  const ada = people[0];
  eq(ada.name, "Ada Lovelace", "agent name wins");
  eq(ada.displayName, "Ada Lovelace", "display");
  eq(ada.types, ["agent", "registrant", "applicant"], "chips");
  eq(ada.events, ["October"], "event from registration only");
  eq(ada.companies, ["Analytical"], "company from application");
  eq(ada.phones, ["0917"], "phone from application");
  eq(ada.addedMs, 20 * 1000, "earliest created");
  eq(people[1].name, "", "no invented name");
  eq(people[1].displayName, "ben@x.com", "email stands in");
  eq(people[1].registrations[0].status, "registered", "missing status is registered");
  eq(people[2].name, "Cara", "application name when no agent");
});

T("registration organization free text is not a company", () => {
  const [p] = joinContacts({
    registrations: [{ id: "r", email: "ada@x.com", full_name: "Ada", organization: "Typed Free Text", event: "May" }],
    adminEmails: [],
  });
  eq(p.companies, [], "blank company");
  eq(p.events, ["May"], "event");
  ok(!p.types.includes("agent"), "not an agent");
  ok(p.types.includes("registrant"), "registrant");
});

T("Partner needs an active linked org and a confirmed or delivered sponsor", () => {
  const orgs = [
    { id: "o1", name: "Active Confirmed", status: "active", ownerEmail: "Ada@x.com" },
    { id: "o2", name: "Active Proposed", status: "active", ownerEmail: "ben@x.com" },
    { id: "o3", name: "Inactive Delivered", status: "inactive", ownerEmail: "cara@x.com" },
    { id: "o4", name: "Linked By App", status: "active", createdByUserId: "nobody" },
  ];
  const people = joinContacts({
    agents: [{ uid: "u9", email: "dan@x.com", full_name: "Dan", status: "guest" }],
    applications: [{ id: "app", email: "eve@x.com", contactName: "Eve", organizationId: "o4", companyName: "" }],
    organizations: orgs,
    sponsors: [
      { id: "s1", organizationId: "o1", status: "confirmed" },
      { id: "s2", organizationId: "o2", status: "proposed" },
      { id: "s3", organizationId: "o3", status: "delivered" },
      { id: "s4", organizationId: "o4", status: "delivered" },
    ],
    adminEmails: [],
  });
  const by = Object.fromEntries(people.map(p => [p.emailKey, p]));
  ok(by["ada@x.com"].types.includes("partner"), "confirmed active");
  eq(by["ada@x.com"].partnerOrgs.map(o => o.name), ["Active Confirmed"], "org name");
  eq(by["ada@x.com"].companies, ["Active Confirmed"], "linked org is the company");
  ok(!by["ben@x.com"].types.includes("partner"), "proposed is not partner");
  eq(by["ben@x.com"].companies, ["Active Proposed"], "linked company still shows");
  ok(!by["cara@x.com"].types.includes("partner"), "inactive is not partner");
  ok(by["eve@x.com"].types.includes("partner") && by["eve@x.com"].types.includes("applicant"), "application link");
  ok(by["dan@x.com"].types.includes("guest") && !by["dan@x.com"].types.includes("partner"), "guest is not partner");
  ok(!people.some(p => p.types.includes("suspended")), "no invented suspended");
});

T("createdByUserId links an agent to their organization", () => {
  const [p] = joinContacts({
    agents: [{ uid: "u1", email: "ada@x.com", full_name: "Ada", status: "suspended" }],
    organizations: [{ id: "o", name: "Mine", status: "active", createdByUserId: "u1" }],
    sponsors: [{ organizationId: "o", status: "confirmed" }],
    adminEmails: [],
  });
  eq(p.types, ["suspended", "partner"], "chips");
  eq(p.companies, ["Mine"], "company");
});

T("unknown agent status is not a chip; filters are OR", () => {
  const people = joinContacts({
    agents: [
      { email: "ada@x.com", full_name: "Ada", status: "pending" },
      { email: "ben@x.com", status: "agent" },
    ],
    registrations: [{ id: "r", email: "ada@x.com", eventId: "e1" }],
    events: [{ id: "e1", title: "AI Exchange" }],
    adminEmails: ["Admin@upupapp.asia"],
  });
  const ada = people.find(p => p.emailKey === "ada@x.com");
  eq(ada.types, ["registrant"], "pending is not a chip");
  eq(ada.events, ["AI Exchange"], "event title from id");
  const admin = people.find(p => p.emailKey === "admin@upupapp.asia");
  eq(admin.types, ["admin"], "allow-list row");
  eq(admin.name, "", "no invented admin name");
  eq(filterContacts(people, { types: ["guest", "registrant"] }).map(p => p.emailKey), ["ada@x.com"], "OR");
  eq(filterContacts(people, { types: ["all"] }).length, people.length, "all");
  eq(filterContacts(people, { query: "exchange" }).map(p => p.emailKey), [], "search does not use event");
  eq(filterContacts(people, { query: "ada" }).map(p => p.emailKey), ["ada@x.com"], "search name");
});

T("a missing registration status stays registered, not a type chip", () => {
  eq(registrationStatus({}), "registered", "default");
  eq(registrationStatus({ status: "attended" }), "attended", "kept");
  eq(registrationStatus({ status: "mystery" }), "registered", "unknown");
});

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
