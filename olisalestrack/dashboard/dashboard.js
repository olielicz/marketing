/**
 * dashboard.js
 * ============
 * Real client logic for the OliSalesTrack dashboard. No frameworks, no
 * build step — plain fetch() calls against two real backend services you
 * (the owner) deploy yourself:
 *
 *   1. admin-auth   — handles login/session (see /admin-auth)
 *   2. olisalestrack-sync — the real Stripe/PayPal/Shopify event store
 *      (see /olisalestrack-sync)
 *
 * This file deliberately does NOT ship with either URL hardcoded to a
 * live server, because this is a self-hosted, single-tenant product —
 * you deploy your own copies of both services and point this page at
 * your own URLs (saved in localStorage on this device only, never sent
 * anywhere except as the base URL for your own fetch() calls).
 */

const CONFIG_KEY = 'olisalestrack.dashboard.config.v1';
const SESSION_KEY = 'olisalestrack.dashboard.session.v1';

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) || { adminAuthUrl: '', syncUrl: '' };
  } catch {
    return { adminAuthUrl: '', syncUrl: '' };
  }
}
function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}
function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}
function saveSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}
function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

function normalizeBaseUrl(url) {
  return String(url || '').trim().replace(/\/$/, '');
}

/* -------------------------------------------------------------------- */
/* DOM refs                                                              */
/* -------------------------------------------------------------------- */
const loginScreen = document.getElementById('loginScreen');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const settingsToggle = document.getElementById('settingsToggle');
const configFields = document.getElementById('configFields');
const adminAuthUrlInput = document.getElementById('adminAuthUrl');
const syncUrlInput = document.getElementById('syncUrl');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const whoami = document.getElementById('whoami');
const refreshBtn = document.getElementById('refreshBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loadError = document.getElementById('loadError');
const statRevenue = document.getElementById('statRevenue');
const statRefunds = document.getElementById('statRefunds');
const statNet = document.getElementById('statNet');
const statCount = document.getElementById('statCount');
const providerFilter = document.getElementById('providerFilter');
const sinceDate = document.getElementById('sinceDate');
const applyFilterBtn = document.getElementById('applyFilterBtn');
const clearFilterBtn = document.getElementById('clearFilterBtn');
const lastSynced = document.getElementById('lastSynced');
const emptyState = document.getElementById('emptyState');
const eventsTable = document.getElementById('eventsTable');
const eventsBody = document.getElementById('eventsBody');

/* -------------------------------------------------------------------- */
/* Config UI                                                            */
/* -------------------------------------------------------------------- */
function initConfigUI() {
  const cfg = loadConfig();
  adminAuthUrlInput.value = cfg.adminAuthUrl;
  syncUrlInput.value = cfg.syncUrl;
}

settingsToggle.addEventListener('click', () => {
  configFields.style.display = configFields.style.display === 'none' ? 'block' : 'none';
});

saveConfigBtn.addEventListener('click', () => {
  const cfg = {
    adminAuthUrl: normalizeBaseUrl(adminAuthUrlInput.value),
    syncUrl: normalizeBaseUrl(syncUrlInput.value),
  };
  saveConfig(cfg);
  loginError.style.display = 'none';
  configFields.style.display = 'none';
});

/* -------------------------------------------------------------------- */
/* Login                                                                */
/* -------------------------------------------------------------------- */
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.style.display = 'none';

  const cfg = loadConfig();
  if (!cfg.adminAuthUrl) {
    loginError.textContent = 'Set your admin-auth server URL first (⚙ Configure server URLs below).';
    loginError.style.display = 'block';
    configFields.style.display = 'block';
    return;
  }

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in…';

  try {
    const res = await fetch(`${cfg.adminAuthUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      loginError.textContent = data.error || 'Sign in failed. Check your username and password.';
      loginError.style.display = 'block';
      return;
    }

    saveSession({ token: data.token, username, expiresAt: data.expiresAt });
    document.getElementById('password').value = ''; // never keep the plaintext password in the DOM/memory longer than needed
    showDashboard();
  } catch (err) {
    loginError.textContent = `Could not reach admin-auth server at ${cfg.adminAuthUrl}. Is it running? (${err.message})`;
    loginError.style.display = 'block';
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In';
  }
});

logoutBtn.addEventListener('click', async () => {
  const session = loadSession();
  const cfg = loadConfig();
  if (session && cfg.adminAuthUrl) {
    try {
      await fetch(`${cfg.adminAuthUrl}/api/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
      });
    } catch {
      // Best-effort — even if this fails (server unreachable), we still
      // clear the LOCAL session below so this device is signed out.
    }
  }
  clearSession();
  showLogin();
});

/* -------------------------------------------------------------------- */
/* Dashboard data loading                                               */
/* -------------------------------------------------------------------- */
let cachedEvents = [];

function formatMoney(cents, currency) {
  const amount = (cents || 0) / 100;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: (currency || 'usd').toUpperCase() }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

async function loadEvents() {
  const session = loadSession();
  const cfg = loadConfig();
  loadError.style.display = 'none';

  if (!session || !cfg.syncUrl) {
    loadError.textContent = 'Sync server URL is not configured. Sign out and set it under ⚙ Configure server URLs.';
    loadError.style.display = 'block';
    return;
  }

  const params = new URLSearchParams();
  if (providerFilter.value) params.set('provider', providerFilter.value);
  if (sinceDate.value) params.set('since', new Date(sinceDate.value).toISOString());

  try {
    const res = await fetch(`${cfg.syncUrl}/api/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });

    if (res.status === 401) {
      // Either the sync server's admin-auth check rejected us (session
      // expired/revoked on the admin-auth side) — force a real re-login
      // rather than silently showing stale/empty data.
      clearSession();
      showLogin();
      loginError.textContent = 'Your session expired or was signed out elsewhere. Please sign in again.';
      loginError.style.display = 'block';
      return;
    }

    if (!res.ok) {
      throw new Error(`Sync server returned HTTP ${res.status}`);
    }

    const data = await res.json();
    cachedEvents = data.events || [];
    renderEvents();
    lastSynced.textContent = `Last synced: ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    loadError.textContent = `Could not load events from ${cfg.syncUrl}: ${err.message}`;
    loadError.style.display = 'block';
  }
}

function renderEvents() {
  const totalSaleCents = cachedEvents.filter((e) => e.type === 'sale').reduce((sum, e) => sum + e.amountCents, 0);
  const totalRefundCents = cachedEvents.filter((e) => e.type === 'refund').reduce((sum, e) => sum + e.amountCents, 0);
  const netCents = totalSaleCents - totalRefundCents;
  const currency = cachedEvents[0]?.currency || 'usd';

  statRevenue.textContent = formatMoney(totalSaleCents, currency);
  statRefunds.textContent = formatMoney(totalRefundCents, currency);
  statNet.textContent = formatMoney(netCents, currency);
  statNet.className = 'value ' + (netCents >= 0 ? 'good' : 'bad');
  statCount.textContent = String(cachedEvents.length);

  if (!cachedEvents.length) {
    emptyState.style.display = 'block';
    eventsTable.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  eventsTable.style.display = 'table';

  const sorted = cachedEvents.slice().sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  eventsBody.innerHTML = sorted
    .map(
      (e) => `
    <tr>
      <td>${new Date(e.occurredAt).toLocaleString()}</td>
      <td><span class="badge ${e.type}">${e.type === 'sale' ? '💰 Sale' : '↩ Refund'}</span></td>
      <td><span class="provider-pill">${escapeHtml(e.provider)}</span></td>
      <td>${escapeHtml(e.description || '')}</td>
      <td style="text-align:right; font-weight:700;">${e.type === 'refund' ? '−' : ''}${formatMoney(e.amountCents, e.currency)}</td>
    </tr>
  `
    )
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

refreshBtn.addEventListener('click', loadEvents);
applyFilterBtn.addEventListener('click', loadEvents);
clearFilterBtn.addEventListener('click', () => {
  providerFilter.value = '';
  sinceDate.value = '';
  loadEvents();
});

/* -------------------------------------------------------------------- */
/* Screen switching + session bootstrap                                 */
/* -------------------------------------------------------------------- */
function showDashboard() {
  const session = loadSession();
  loginScreen.style.display = 'none';
  dashboard.style.display = 'block';
  whoami.textContent = session ? session.username : '';
  loadEvents();
}

function showLogin() {
  dashboard.style.display = 'none';
  loginScreen.style.display = 'flex';
}

async function verifyExistingSession() {
  const session = loadSession();
  const cfg = loadConfig();
  if (!session || !cfg.adminAuthUrl) {
    showLogin();
    return;
  }

  // Don't just trust a locally-cached session forever — actually re-check
  // it against admin-auth's live revocation table on page load, the same
  // way loadEvents() does mid-session. A stale/revoked-elsewhere session
  // sitting in sessionStorage should not silently grant dashboard access.
  try {
    const res = await fetch(`${cfg.adminAuthUrl}/api/verify`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      showDashboard();
    } else {
      clearSession();
      showLogin();
    }
  } catch {
    // Can't reach admin-auth right now — fail closed, don't grant access
    // on a network error.
    showLogin();
  }
}

initConfigUI();
verifyExistingSession();
