/**
 * JSON-file-backed persistence for Oli-Locator. Same intentionally-simple
 * pattern as oliops-backend — a single JSON file with an in-process write
 * queue. Entities: owner, sessions, leads (pre-seeded), savedLeads, inbox,
 * calls, settings.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DATA_DIR = process.env.OLI_LOCATOR_DATA_DIR || path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "oli-locator.json");

/* ========================= Demo Lead Data ========================= */

const TRADES = [
  "cleaning", "pest-control", "renovation", "roofing", "painting",
  "plumbing", "electrical", "landscaping", "hvac", "flooring", "handyman"
];

function generateDemoLeads() {
  const leads = [];

  // 20 USA leads
  const usaCities = [
    { city: "Miami", postcode: "33101" },
    { city: "Miami", postcode: "33125" },
    { city: "Houston", postcode: "77001" },
    { city: "Houston", postcode: "77055" },
    { city: "Phoenix", postcode: "85001" },
    { city: "Phoenix", postcode: "85004" },
    { city: "Chicago", postcode: "60601" },
    { city: "Chicago", postcode: "60614" },
    { city: "Los Angeles", postcode: "90001" },
    { city: "Los Angeles", postcode: "90024" },
    { city: "Miami", postcode: "33130" },
    { city: "Houston", postcode: "77002" },
    { city: "Phoenix", postcode: "85008" },
    { city: "Chicago", postcode: "60622" },
    { city: "Los Angeles", postcode: "90036" },
    { city: "Miami", postcode: "33139" },
    { city: "Houston", postcode: "77019" },
    { city: "Phoenix", postcode: "85016" },
    { city: "Chicago", postcode: "60657" },
    { city: "Los Angeles", postcode: "90046" },
  ];

  const usaLeads = [
    { title: "Deep clean 4-bedroom house before move-in", trade: "cleaning", budget: { min: 30000, max: 50000 }, urgency: "high", score: 92 },
    { title: "Fix leaking kitchen faucet and replace garbage disposal", trade: "plumbing", budget: { min: 15000, max: 35000 }, urgency: "high", score: 88 },
    { title: "Rewire basement for home theater setup", trade: "electrical", budget: { min: 200000, max: 400000 }, urgency: "low", score: 65 },
    { title: "Replace aging shingle roof on 2-story colonial", trade: "roofing", budget: { min: 800000, max: 1500000 }, urgency: "medium", score: 78 },
    { title: "Interior painting — 3 bedrooms and hallway", trade: "painting", budget: { min: 150000, max: 300000 }, urgency: "medium", score: 71 },
    { title: "Full backyard landscaping with irrigation system", trade: "landscaping", budget: { min: 500000, max: 1200000 }, urgency: "low", score: 55 },
    { title: "Build custom walk-in closet shelving", trade: "handyman", budget: { min: 200000, max: 450000 }, urgency: "medium", score: 82 },
    { title: "AC unit replacement — central air for 2400 sqft home", trade: "hvac", budget: { min: 500000, max: 900000 }, urgency: "high", score: 95 },
    { title: "Install hardwood flooring in living room and dining room", trade: "flooring", budget: { min: 400000, max: 700000 }, urgency: "medium", score: 73 },
    { title: "Install 6-foot privacy fence around backyard", trade: "handyman", budget: { min: 300000, max: 600000 }, urgency: "low", score: 60 },
    { title: "Bathroom renovation — complete gut and rebuild", trade: "renovation", budget: { min: 1500000, max: 2500000 }, urgency: "medium", score: 85 },
    { title: "Post-construction cleanup for new addition", trade: "cleaning", budget: { min: 40000, max: 80000 }, urgency: "high", score: 90 },
    { title: "Unclog main sewer line and camera inspection", trade: "plumbing", budget: { min: 25000, max: 50000 }, urgency: "high", score: 94 },
    { title: "Install EV charger in garage", trade: "electrical", budget: { min: 100000, max: 200000 }, urgency: "medium", score: 77 },
    { title: "Repair storm damage — missing shingles on north side", trade: "roofing", budget: { min: 200000, max: 500000 }, urgency: "high", score: 91 },
    { title: "Exterior house painting including trim and shutters", trade: "painting", budget: { min: 400000, max: 700000 }, urgency: "low", score: 58 },
    { title: "Weekly lawn maintenance contract needed", trade: "landscaping", budget: { min: 15000, max: 30000 }, urgency: "low", score: 45 },
    { title: "Replace rotted deck boards and refinish", trade: "handyman", budget: { min: 300000, max: 600000 }, urgency: "medium", score: 70 },
    { title: "Furnace tune-up and duct cleaning", trade: "hvac", budget: { min: 20000, max: 50000 }, urgency: "medium", score: 62 },
    { title: "Kitchen renovation — cabinets, counters, backsplash", trade: "renovation", budget: { min: 2000000, max: 4000000 }, urgency: "low", score: 68 },
  ];

  const usaNames = [
    "Maria Gonzalez", "James Smith", "David Wilson", "Jennifer Brown", "Robert Taylor",
    "Emily Davis", "Michael Johnson", "Sarah Miller", "Carlos Rodriguez", "Amanda White",
    "Thomas Lee", "Jessica Martinez", "Daniel Anderson", "Rachel Garcia", "Kevin Thomas",
    "Laura Jackson", "Brian Harris", "Nicole Clark", "Steven Lewis", "Megan Robinson"
  ];

  for (let i = 0; i < 20; i++) {
    leads.push({
      id: randomUUID(),
      title: usaLeads[i].title,
      trade: usaLeads[i].trade,
      country: "US",
      city: usaCities[i].city,
      postcode: usaCities[i].postcode,
      budget: usaLeads[i].budget,
      urgency: usaLeads[i].urgency,
      leadScore: usaLeads[i].score,
      customerName: usaNames[i],
      customerPhone: `+1${String(2000000000 + Math.floor(Math.random() * 8000000000))}`,
      customerEmail: `${usaNames[i].toLowerCase().replace(" ", ".")}@email.com`,
      postedAt: new Date(Date.now() - Math.floor(Math.random() * 14 * 86400000)).toISOString(),
      description: `${usaLeads[i].title}. Looking for a reliable professional in the ${usaCities[i].city} area. Budget is flexible for the right contractor.`,
    });
  }

  // 15 UK leads
  const ukCities = [
    { city: "London", postcode: "SW1A 1AA" },
    { city: "London", postcode: "EC1A 1BB" },
    { city: "London", postcode: "W1D 3AF" },
    { city: "Manchester", postcode: "M1 1AE" },
    { city: "Manchester", postcode: "M3 4FP" },
    { city: "Manchester", postcode: "M15 4QG" },
    { city: "Birmingham", postcode: "B1 1BB" },
    { city: "Birmingham", postcode: "B5 4BU" },
    { city: "Leeds", postcode: "LS1 1UR" },
    { city: "Leeds", postcode: "LS2 7EW" },
    { city: "Leeds", postcode: "LS6 3HD" },
    { city: "Bristol", postcode: "BS1 1EH" },
    { city: "Bristol", postcode: "BS2 0JA" },
    { city: "Bristol", postcode: "BS8 1TH" },
    { city: "London", postcode: "E1 6AN" },
  ];

  const ukLeads = [
    { title: "End of tenancy deep clean — 2-bed flat", trade: "cleaning", budget: { min: 15000, max: 30000 }, urgency: "high", score: 89 },
    { title: "Fix burst pipe in bathroom ceiling", trade: "plumbing", budget: { min: 10000, max: 25000 }, urgency: "high", score: 96 },
    { title: "Consumer unit upgrade to latest regulations", trade: "electrical", budget: { min: 40000, max: 80000 }, urgency: "medium", score: 74 },
    { title: "Flat roof replacement on rear extension", trade: "roofing", budget: { min: 200000, max: 400000 }, urgency: "medium", score: 80 },
    { title: "Paint entire 3-bed semi interior — neutral colours", trade: "painting", budget: { min: 100000, max: 200000 }, urgency: "low", score: 63 },
    { title: "Garden redesign with new patio and planting scheme", trade: "landscaping", budget: { min: 300000, max: 600000 }, urgency: "low", score: 52 },
    { title: "Fit bespoke built-in wardrobes for master bedroom", trade: "handyman", budget: { min: 150000, max: 300000 }, urgency: "medium", score: 76 },
    { title: "Boiler replacement — combi swap for 4-bed house", trade: "hvac", budget: { min: 250000, max: 450000 }, urgency: "high", score: 93 },
    { title: "Lay engineered oak flooring throughout ground floor", trade: "flooring", budget: { min: 200000, max: 400000 }, urgency: "medium", score: 69 },
    { title: "Erect close-board fencing — 20m boundary", trade: "pest-control", budget: { min: 150000, max: 300000 }, urgency: "low", score: 57 },
    { title: "Loft conversion into home office with Velux windows", trade: "renovation", budget: { min: 2000000, max: 4000000 }, urgency: "medium", score: 84 },
    { title: "Commercial office deep clean — 5000 sqft", trade: "cleaning", budget: { min: 50000, max: 100000 }, urgency: "high", score: 87 },
    { title: "Install underfloor heating in new bathroom", trade: "plumbing", budget: { min: 150000, max: 300000 }, urgency: "medium", score: 72 },
    { title: "Full house rewire — Victorian terrace 3 floors", trade: "electrical", budget: { min: 400000, max: 700000 }, urgency: "medium", score: 81 },
    { title: "Kitchen extension and open-plan conversion", trade: "renovation", budget: { min: 3000000, max: 5000000 }, urgency: "low", score: 66 },
  ];

  const ukNames = [
    "Oliver Williams", "Charlotte Davies", "Jack Thompson", "Amelia Evans", "Harry Roberts",
    "Sophie Walker", "George Wright", "Isla Johnson", "Freddie Baker", "Poppy Green",
    "Oscar Hall", "Mia Collins", "Thomas Morris", "Emily Watson", "William Turner"
  ];

  for (let i = 0; i < 15; i++) {
    leads.push({
      id: randomUUID(),
      title: ukLeads[i].title,
      trade: ukLeads[i].trade,
      country: "UK",
      city: ukCities[i].city,
      postcode: ukCities[i].postcode,
      budget: ukLeads[i].budget,
      urgency: ukLeads[i].urgency,
      leadScore: ukLeads[i].score,
      customerName: ukNames[i],
      customerPhone: `+44${String(7000000000 + Math.floor(Math.random() * 900000000))}`,
      customerEmail: `${ukNames[i].toLowerCase().replace(" ", ".")}@email.co.uk`,
      postedAt: new Date(Date.now() - Math.floor(Math.random() * 14 * 86400000)).toISOString(),
      description: `${ukLeads[i].title}. Seeking a qualified tradesperson in the ${ukCities[i].city} area. Happy to discuss budget.`,
    });
  }

  // 15 Australia leads
  const auCities = [
    { city: "Sydney", postcode: "2000" },
    { city: "Sydney", postcode: "2010" },
    { city: "Sydney", postcode: "2060" },
    { city: "Melbourne", postcode: "3000" },
    { city: "Melbourne", postcode: "3004" },
    { city: "Melbourne", postcode: "3121" },
    { city: "Brisbane", postcode: "4000" },
    { city: "Brisbane", postcode: "4005" },
    { city: "Brisbane", postcode: "4101" },
    { city: "Perth", postcode: "6000" },
    { city: "Perth", postcode: "6005" },
    { city: "Perth", postcode: "6050" },
    { city: "Adelaide", postcode: "5000" },
    { city: "Adelaide", postcode: "5006" },
    { city: "Adelaide", postcode: "5034" },
  ];

  const auLeads = [
    { title: "Bond clean for 3-bed apartment in CBD", trade: "cleaning", budget: { min: 40000, max: 70000 }, urgency: "high", score: 91 },
    { title: "Hot water system replacement — gas to solar", trade: "plumbing", budget: { min: 300000, max: 550000 }, urgency: "medium", score: 75 },
    { title: "Install solar panels — 6.6kW system with battery", trade: "electrical", budget: { min: 800000, max: 1400000 }, urgency: "low", score: 64 },
    { title: "Re-roof Colorbond — single storey brick home", trade: "roofing", budget: { min: 1000000, max: 1800000 }, urgency: "medium", score: 79 },
    { title: "Repaint exterior weatherboard house — prep and 2 coats", trade: "painting", budget: { min: 400000, max: 700000 }, urgency: "medium", score: 72 },
    { title: "Native garden design and install with drip irrigation", trade: "landscaping", budget: { min: 500000, max: 1000000 }, urgency: "low", score: 53 },
    { title: "Build timber deck with pergola — 40sqm", trade: "handyman", budget: { min: 1200000, max: 2000000 }, urgency: "medium", score: 83 },
    { title: "Ducted air conditioning install — 4-bed house", trade: "hvac", budget: { min: 800000, max: 1400000 }, urgency: "high", score: 94 },
    { title: "Polish and seal concrete floors throughout house", trade: "flooring", budget: { min: 300000, max: 600000 }, urgency: "low", score: 59 },
    { title: "Colorbond fencing — full property boundary 50m", trade: "pest-control", budget: { min: 500000, max: 900000 }, urgency: "medium", score: 70 },
    { title: "Full bathroom reno — remove asbestos, retile, new fittings", trade: "renovation", budget: { min: 2000000, max: 3500000 }, urgency: "medium", score: 86 },
    { title: "Regular weekly house cleaning — ongoing contract", trade: "cleaning", budget: { min: 15000, max: 25000 }, urgency: "low", score: 48 },
    { title: "Fix blocked stormwater drain and relining", trade: "plumbing", budget: { min: 200000, max: 450000 }, urgency: "high", score: 88 },
    { title: "Outdoor kitchen electrical and lighting install", trade: "electrical", budget: { min: 200000, max: 400000 }, urgency: "medium", score: 67 },
    { title: "Granny flat build — 60sqm 1-bed attached", trade: "renovation", budget: { min: 8000000, max: 15000000 }, urgency: "low", score: 61 },
  ];

  const auNames = [
    "Liam Mitchell", "Olivia Taylor", "Noah Anderson", "Ava Thompson", "Jack White",
    "Chloe Martin", "William Harris", "Sophie Clark", "James Robinson", "Ella Walker",
    "Cooper Lewis", "Grace Hall", "Bailey King", "Zoe Wright", "Riley Scott"
  ];

  for (let i = 0; i < 15; i++) {
    leads.push({
      id: randomUUID(),
      title: auLeads[i].title,
      trade: auLeads[i].trade,
      country: "AU",
      city: auCities[i].city,
      postcode: auCities[i].postcode,
      budget: auLeads[i].budget,
      urgency: auLeads[i].urgency,
      leadScore: auLeads[i].score,
      customerName: auNames[i],
      customerPhone: `+61${String(400000000 + Math.floor(Math.random() * 100000000))}`,
      customerEmail: `${auNames[i].toLowerCase().replace(" ", ".")}@email.com.au`,
      postedAt: new Date(Date.now() - Math.floor(Math.random() * 14 * 86400000)).toISOString(),
      description: `${auLeads[i].title}. Looking for a licensed tradie in ${auCities[i].city}. Flexible on timing and budget for good work.`,
    });
  }

  return leads;
}

/* ========================= Database Operations ========================= */

function ensureDb() {
  mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    const demoLeads = generateDemoLeads();
    const leadsMap = {};
    for (const lead of demoLeads) {
      leadsMap[lead.id] = lead;
    }
    writeFileSync(
      DB_FILE,
      JSON.stringify({
        owner: null,
        sessions: {},
        failedAttempts: {},
        leads: leadsMap,
        savedLeads: [],
        inbox: {},
        calls: {},
        settings: {
          defaultCountry: "US",
          preferredTrades: [],
          businessName: "",
          businessPhone: "",
          businessEmail: "",
        },
      }, null, 2),
      { mode: 0o600 }
    );
  }
}

function readDb() {
  ensureDb();
  try {
    const db = JSON.parse(readFileSync(DB_FILE, "utf8"));
    // Migrations for fields added after initial creation
    if (!db.leads) db.leads = {};
    if (!db.savedLeads) db.savedLeads = [];
    if (!db.inbox) db.inbox = {};
    if (!db.calls) db.calls = {};
    if (!db.settings) db.settings = { defaultCountry: "US", preferredTrades: [], businessName: "", businessPhone: "", businessEmail: "" };
    return db;
  } catch (err) {
    throw new Error(`Oli-Locator database at ${DB_FILE} is corrupted: ${err.message}`);
  }
}

let writeQueue = Promise.resolve();
function writeDb(db) {
  writeQueue = writeQueue.then(
    () => writeFileSync(DB_FILE, JSON.stringify(db, null, 2), { mode: 0o600 }),
    () => writeFileSync(DB_FILE, JSON.stringify(db, null, 2), { mode: 0o600 })
  );
  return writeQueue;
}

/* ========================= Owner + Sessions ========================= */

export async function getOwner() {
  return readDb().owner;
}

export async function createOwner({ username, salt, hash }) {
  const db = readDb();
  if (db.owner) throw new Error("An owner account already exists for this Oli-Locator instance.");
  db.owner = { username, salt, hash, createdAt: new Date().toISOString(), lastLoginAt: null, lastLoginIp: null };
  await writeDb(db);
  return db.owner;
}

export async function updateOwnerPassword({ salt, hash }) {
  const db = readDb();
  if (!db.owner) throw new Error("No owner account exists yet.");
  db.owner.salt = salt;
  db.owner.hash = hash;
  db.owner.passwordChangedAt = new Date().toISOString();
  await writeDb(db);
  return db.owner;
}

export async function recordSuccessfulLogin({ ip }) {
  const db = readDb();
  if (!db.owner) return;
  db.owner.lastLoginAt = new Date().toISOString();
  db.owner.lastLoginIp = ip || null;
  await writeDb(db);
}

export async function createSession({ sessionId, expiresAt, ip, userAgent }) {
  const db = readDb();
  db.sessions[sessionId] = { createdAt: new Date().toISOString(), expiresAt, revoked: false, ip: ip || null, userAgent: userAgent || null, lastSeenAt: new Date().toISOString() };
  await writeDb(db);
}

export async function isSessionActive(sessionId) {
  const db = readDb();
  const session = db.sessions[sessionId];
  if (!session) return false;
  if (session.revoked) return false;
  if (new Date(session.expiresAt).getTime() < Date.now()) return false;
  return true;
}

export async function revokeSession(sessionId) {
  const db = readDb();
  if (db.sessions[sessionId]) {
    db.sessions[sessionId].revoked = true;
    await writeDb(db);
    return true;
  }
  return false;
}

export async function revokeAllSessions() {
  const db = readDb();
  let count = 0;
  for (const session of Object.values(db.sessions)) {
    if (!session.revoked) { session.revoked = true; count++; }
  }
  await writeDb(db);
  return count;
}

export async function recordFailedAttempt(key) {
  const db = readDb();
  if (!db.failedAttempts[key]) db.failedAttempts[key] = [];
  db.failedAttempts[key].push(Date.now());
  await writeDb(db);
}

export async function clearFailedAttempts(key) {
  const db = readDb();
  delete db.failedAttempts[key];
  await writeDb(db);
}

export async function countRecentFailedAttempts(key, windowMs) {
  const db = readDb();
  const attempts = db.failedAttempts[key] || [];
  const cutoff = Date.now() - windowMs;
  const recent = attempts.filter((t) => t > cutoff);
  if (recent.length !== attempts.length) {
    db.failedAttempts[key] = recent;
    await writeDb(db);
  }
  return recent.length;
}

/* ========================= Leads ========================= */

export async function listLeads() {
  const db = readDb();
  return Object.values(db.leads);
}

export async function getLead(id) {
  const db = readDb();
  return db.leads[id] || null;
}

/* ========================= Saved Leads ========================= */

export async function getSavedLeads() {
  const db = readDb();
  const savedIds = db.savedLeads || [];
  return savedIds.map((id) => db.leads[id]).filter(Boolean);
}

export async function saveLead(id) {
  const db = readDb();
  if (!db.leads[id]) return null;
  if (!db.savedLeads.includes(id)) {
    db.savedLeads.push(id);
    await writeDb(db);
  }
  return db.leads[id];
}

export async function unsaveLead(id) {
  const db = readDb();
  const idx = db.savedLeads.indexOf(id);
  if (idx === -1) return false;
  db.savedLeads.splice(idx, 1);
  await writeDb(db);
  return true;
}

/* ========================= Inbox (Request-a-Quote) ========================= */

export async function listInbox() {
  const db = readDb();
  return Object.values(db.inbox).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function createInboxSubmission({ customerName, customerEmail, customerPhone, trade, city, country, description, budget }) {
  const db = readDb();
  const id = randomUUID();
  const submission = {
    id,
    customerName: customerName || "",
    customerEmail: customerEmail || "",
    customerPhone: customerPhone || "",
    trade: trade || "",
    city: city || "",
    country: country || "",
    description: description || "",
    budget: budget || null,
    status: "new",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.inbox[id] = submission;
  await writeDb(db);
  return submission;
}

export async function updateInboxStatus(id, status) {
  const db = readDb();
  const submission = db.inbox[id];
  if (!submission) return null;
  const validStatuses = ["new", "contacted", "quoted", "won", "lost"];
  if (!validStatuses.includes(status)) return null;
  submission.status = status;
  submission.updatedAt = new Date().toISOString();
  await writeDb(db);
  return submission;
}

/* ========================= Calls ========================= */

export async function listCalls() {
  const db = readDb();
  return Object.values(db.calls).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function createCall({ leadId, leadName, phone, durationMinutes, outcome, notes }) {
  const db = readDb();
  const id = randomUUID();
  const call = {
    id,
    leadId: leadId || null,
    leadName: leadName || "",
    phone: phone || "",
    durationMinutes: Number(durationMinutes) || 0,
    outcome: outcome || "",
    notes: notes || "",
    createdAt: new Date().toISOString(),
  };
  db.calls[id] = call;
  await writeDb(db);
  return call;
}

/* ========================= Settings ========================= */

export async function getSettings() {
  const db = readDb();
  return db.settings || { defaultCountry: "US", preferredTrades: [], businessName: "", businessPhone: "", businessEmail: "" };
}

export async function updateSettings(patch) {
  const db = readDb();
  const current = db.settings || { defaultCountry: "US", preferredTrades: [], businessName: "", businessPhone: "", businessEmail: "" };
  if (patch.defaultCountry !== undefined) current.defaultCountry = String(patch.defaultCountry).trim();
  if (patch.preferredTrades !== undefined) current.preferredTrades = Array.isArray(patch.preferredTrades) ? patch.preferredTrades : [];
  if (patch.businessName !== undefined) current.businessName = String(patch.businessName).trim();
  if (patch.businessPhone !== undefined) current.businessPhone = String(patch.businessPhone).trim();
  if (patch.businessEmail !== undefined) current.businessEmail = String(patch.businessEmail).trim();
  db.settings = current;
  await writeDb(db);
  return current;
}
