/**
 * lib/store.js
 * ============
 * Minimal file-based JSON persistence. No external dependencies.
 *
 * Why this exists: the original integration-layer-*.js files kept all state
 * (webhook subscriptions, OAuth tokens, dead letter queue) in in-memory
 * Map/Array objects. That state was lost on every restart/redeploy, which
 * makes them useless in any real serverless or container deployment.
 *
 * This store persists to a single JSON file on disk (data/store.json).
 * Writes are atomic (write to temp file, then rename) so a crash mid-write
 * can't corrupt the file. This is intentionally simple - swap it for a real
 * database (Postgres/Redis) once you have production traffic. The public
 * API below (get/set/update) is the seam to do that swap without touching
 * calling code.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.OLI_DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

const DEFAULT_SHAPE = {
  webhookSubscriptions: {},   // userId -> [webhook,...]
  oauthTokens: {},            // "userId_provider" -> tokenRecord
  oauthStates: {},            // state -> stateData (short-lived, pruned)
  apiTokens: {},              // token id -> { userId, createdAt } (issued bearer tokens)
  deadLetterQueue: [],        // failed webhook deliveries
  ghlConnections: {},         // userId -> connection
  eventLog: []                // capped rolling log
};

let cache = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load() {
  if (cache) return cache;
  ensureDir();
  if (!fs.existsSync(DATA_FILE)) {
    cache = JSON.parse(JSON.stringify(DEFAULT_SHAPE));
    persist();
    return cache;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    cache = { ...JSON.parse(JSON.stringify(DEFAULT_SHAPE)), ...JSON.parse(raw) };
  } catch (err) {
    console.error('[store] Failed to read store.json, starting fresh:', err.message);
    cache = JSON.parse(JSON.stringify(DEFAULT_SHAPE));
  }
  return cache;
}

function persist() {
  ensureDir();
  const tmpFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(cache, null, 2));
  fs.renameSync(tmpFile, DATA_FILE);
}

/** Get a top-level collection (e.g. 'webhookSubscriptions') */
function get(collection) {
  const data = load();
  return data[collection];
}

/** Replace a top-level collection and persist */
function set(collection, value) {
  const data = load();
  data[collection] = value;
  persist();
  return value;
}

/** Mutate a collection in place via a callback, then persist */
function update(collection, mutatorFn) {
  const data = load();
  if (!(collection in data)) data[collection] = {};
  mutatorFn(data[collection]);
  persist();
  return data[collection];
}

/** Cap an array-based collection to the last N entries */
function capArray(collection, maxLength) {
  const data = load();
  if (Array.isArray(data[collection]) && data[collection].length > maxLength) {
    data[collection] = data[collection].slice(-maxLength);
    persist();
  }
}

module.exports = { get, set, update, capArray, DATA_FILE };
