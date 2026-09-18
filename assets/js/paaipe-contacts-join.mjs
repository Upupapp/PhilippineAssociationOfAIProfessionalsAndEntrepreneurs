/* Join the people PAAIPE already has, one row per email.
 *
 * Sources, and only these: paaipe_agents, paaipe_event_registrations,
 * paaipe_partner_applications, paaipe_organizations (owner / linked id),
 * paaipe_event_sponsors (Partner chip only), and the admin allow-list that
 * firestore.rules already names. No new collection. No invented names.
 *
 * A missing field stays an empty string or an empty list. Callers must not
 * paint a dash over that.
 */

export const ADMIN_ALLOWLIST = ["admin@upupapp.asia"];

export const TYPE_ORDER = [
  "guest", "agent", "suspended", "registrant", "applicant", "partner", "admin",
];

const REG_STATUSES = ["registered", "attended", "no_show", "cancelled"];
const AGENT_STATUSES = ["guest", "agent", "suspended"];
const PARTNER_SPONSOR = new Set(["confirmed", "delivered"]);

export function emailKey(value) {
  const s = String(value ?? "").trim().toLowerCase();
  return s.includes("@") ? s : "";
}

export function createdMs(value) {
  if (value == null || value === "") return null;
  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return d instanceof Date && !isNaN(d) ? d.getTime() : null;
  }
  if (value instanceof Date) return isNaN(value) ? null : value.getTime();
  if (Number.isFinite(value?.seconds)) return value.seconds * 1000;
  return null;
}

export function registrationStatus(row) {
  return REG_STATUSES.includes(row?.status) ? row.status : "registered";
}

function text(value) {
  const s = String(value ?? "").trim();
  return s;
}

function uniqueTexts(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const s = text(value);
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function firstText(values) {
  for (const value of values) {
    const s = text(value);
    if (s) return s;
  }
  return "";
}

function eventLabel(reg, events) {
  const typed = text(reg?.event);
  if (typed) return typed;
  const id = text(reg?.eventId);
  if (!id) return "";
  const ev = (events || []).find(e => e && e.id === id);
  return text(ev?.title);
}

function applicationEvent(app, events) {
  const id = text(app?.eventId);
  if (id) {
    const ev = (events || []).find(e => e && e.id === id);
    const title = text(ev?.title);
    if (title) return title;
  }
  return text(app?.eventTitle) || text(app?.event);
}

function ensure(map, key, sample) {
  let row = map.get(key);
  if (!row) {
    row = {
      emailKey: key,
      email: sample,
      agents: [],
      registrations: [],
      applications: [],
      ownerOrgIds: new Set(),
    };
    map.set(key, row);
  } else if (!row.email) {
    row.email = sample;
  }
  return row;
}

function earliest(rows, pick) {
  let best = null;
  for (const row of rows) {
    const ms = createdMs(pick(row));
    if (ms == null) continue;
    if (best == null || ms < best) best = ms;
  }
  return best;
}

/**
 * @param {{
 *   agents?: object[],
 *   registrations?: object[],
 *   applications?: object[],
 *   organizations?: object[],
 *   sponsors?: object[],
 *   events?: object[],
 *   adminEmails?: string[],
 * }} sources
 */
export function joinContacts(sources = {}) {
  const agents = sources.agents || [];
  const registrations = sources.registrations || [];
  const applications = sources.applications || [];
  const organizations = sources.organizations || [];
  const sponsors = sources.sponsors || [];
  const events = sources.events || [];
  const adminEmails = (sources.adminEmails || ADMIN_ALLOWLIST).map(emailKey).filter(Boolean);

  const orgsById = new Map(organizations.filter(o => o && o.id).map(o => [o.id, o]));
  const map = new Map();

  for (const agent of agents) {
    const key = emailKey(agent?.email);
    if (!key) continue;
    ensure(map, key, text(agent.email)).agents.push(agent);
  }
  for (const reg of registrations) {
    const key = emailKey(reg?.email);
    if (!key) continue;
    ensure(map, key, text(reg.email)).registrations.push(reg);
  }
  for (const app of applications) {
    const key = emailKey(app?.email);
    if (!key) continue;
    ensure(map, key, text(app.email)).applications.push(app);
  }
  for (const org of organizations) {
    const key = emailKey(org?.ownerEmail);
    if (!key || !org?.id) continue;
    ensure(map, key, text(org.ownerEmail)).ownerOrgIds.add(org.id);
  }
  for (const email of adminEmails) {
    ensure(map, email, email);
  }

  const sponsorIds = new Set();
  for (const s of sponsors) {
    if (s?.organizationId && PARTNER_SPONSOR.has(s.status)) sponsorIds.add(s.organizationId);
  }

  const people = [];
  for (const row of map.values()) {
    const agentUids = new Set(row.agents.map(a => a.uid).filter(Boolean));
    const linkedIds = new Set(row.ownerOrgIds);
    for (const org of organizations) {
      if (org?.id && org.createdByUserId && agentUids.has(org.createdByUserId)) linkedIds.add(org.id);
    }
    for (const app of row.applications) {
      if (app?.organizationId) linkedIds.add(app.organizationId);
    }
    const linked = [...linkedIds].map(id => orgsById.get(id)).filter(Boolean);
    const partnerOrgs = linked.filter(o =>
      o.status === "active" && sponsorIds.has(o.id) && text(o.name));

    const types = [];
    for (const agent of row.agents) {
      if (AGENT_STATUSES.includes(agent.status) && !types.includes(agent.status)) types.push(agent.status);
    }
    if (row.registrations.length && !types.includes("registrant")) types.push("registrant");
    if (row.applications.length && !types.includes("applicant")) types.push("applicant");
    if (partnerOrgs.length && !types.includes("partner")) types.push("partner");
    if (adminEmails.includes(row.emailKey) && !types.includes("admin")) types.push("admin");
    types.sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b));

    const names = uniqueTexts([
      ...row.agents.map(a => a.full_name),
      ...row.applications.map(a => a.contactName),
      ...row.registrations.map(r => r.full_name),
    ]);
    const name = firstText([
      ...row.agents.map(a => a.full_name),
      ...row.applications.map(a => a.contactName),
      ...row.registrations.map(r => r.full_name),
    ]);
    const companies = uniqueTexts([
      ...row.applications.map(a => a.companyName),
      ...linked.map(o => o.name),
    ]);
    const eventsSeen = uniqueTexts(row.registrations.map(r => eventLabel(r, events)));
    const phones = uniqueTexts(row.applications.map(a => a.phone));
    const addedMs = earliest(
      [
        ...row.agents.map(a => a.createdAt),
        ...row.registrations.map(r => r.createdAt),
        ...row.applications.map(a => a.createdAt),
      ],
      v => v,
    );

    const byCreated = (a, b) => (createdMs(b?.createdAt) || 0) - (createdMs(a?.createdAt) || 0);
    people.push({
      emailKey: row.emailKey,
      email: row.email || row.emailKey,
      name,
      names,
      displayName: name || row.email || row.emailKey,
      types,
      events: eventsSeen,
      companies,
      phones,
      addedMs,
      agents: [...row.agents].sort(byCreated),
      registrations: [...row.registrations].sort(byCreated).map(r => ({
        ...r,
        status: registrationStatus(r),
        eventLabel: eventLabel(r, events),
      })),
      applications: [...row.applications].sort(byCreated).map(a => ({
        ...a,
        eventLabel: applicationEvent(a, events),
      })),
      partnerOrgs: partnerOrgs.map(o => ({ id: o.id, name: text(o.name) })).filter(o => o.name),
      admin: types.includes("admin"),
    });
  }

  people.sort((a, b) => {
    if (a.addedMs == null && b.addedMs == null) return a.emailKey.localeCompare(b.emailKey);
    if (a.addedMs == null) return 1;
    if (b.addedMs == null) return -1;
    if (b.addedMs !== a.addedMs) return b.addedMs - a.addedMs;
    return a.emailKey.localeCompare(b.emailKey);
  });
  return people;
}

/** types is OR. "all" or an empty list means no type filter. Search is name, email, company. */
export function filterContacts(people, { query = "", types = [] } = {}) {
  const q = String(query || "").trim().toLowerCase();
  const set = new Set((types || []).filter(t => t && t !== "all" && TYPE_ORDER.includes(t)));
  return (people || []).filter(p => {
    if (set.size && !p.types.some(t => set.has(t))) return false;
    if (!q) return true;
    const hay = [p.email, ...(p.names || []), ...(p.companies || [])].join("\n").toLowerCase();
    return hay.includes(q);
  });
}
