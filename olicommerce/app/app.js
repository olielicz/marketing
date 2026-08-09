/**
 * app.js — real client logic for the OliCommerce app. Plain fetch()
 * calls against a real olicommerce-backend deployment (see
 * ../../olicommerce-backend). Same architecture pattern as
 * olisalestrack/dashboard/dashboard.js and oliops/app/app.js.
 */

const CONFIG_KEY = 'olicommerce.app.config.v1';
const SESSION_KEY = 'olicommerce.app.session.v1';

function loadConfig() { try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || { backendUrl: '' }; } catch { return { backendUrl: '' }; } }
function saveConfig(cfg) { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); }
function loadSession() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; } }
function saveSession(s) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { sessionStorage.removeItem(SESSION_KEY); }
function normalizeUrl(u) { return String(u || '').trim().replace(/\/$/, ''); }
function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str ?? ''; return d.innerHTML; }
// FIX: the catch-fallback below still hardcoded "$" even though the
// real path already correctly uses the cart's own real currency (set by
// the source Shopify/WooCommerce webhook) with a genuine USD default -
// this only matters if Intl.NumberFormat somehow throws (e.g. a
// malformed currency string slipped through).
function formatMoney(cents, currency) { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format((cents || 0) / 100); } catch { return `${currency || 'USD'} ${((cents || 0) / 100).toFixed(2)}`; } }

const els = {};
['loginScreen','app','loginForm','loginBtn','loginError','settingsToggle','configFields','backendUrl','saveConfigBtn',
 'whoami','logoutBtn','refreshBtn','cartsTableWrap','statAbandoned','statSent','statRecovered',
 'recoveryModal','recoveryErr','previewBox','sendRecoveryBtn',
 'chatLog','chatEmpty','chatForm','chatInput','chatSendBtn','chatUseAi','ticketsWrap'
].forEach(id => els[id] = document.getElementById(id));

let cachedCarts = [];
let activeCartId = null;
let chatHistory = [];

/* ---------------- Config UI ---------------- */
function initConfigUI() { els.backendUrl.value = loadConfig().backendUrl; }
els.settingsToggle.addEventListener('click', () => { els.configFields.style.display = els.configFields.style.display === 'none' ? 'block' : 'none'; });
els.saveConfigBtn.addEventListener('click', () => { saveConfig({ backendUrl: normalizeUrl(els.backendUrl.value) }); els.configFields.style.display = 'none'; });

/* ---------------- Auth ---------------- */
els.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.loginError.style.display = 'none';
  const cfg = loadConfig();
  if (!cfg.backendUrl) {
    els.loginError.textContent = 'Set your backend URL first (⚙ Configure server URL below).';
    els.loginError.style.display = 'block';
    els.configFields.style.display = 'block';
    return;
  }
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  els.loginBtn.disabled = true; els.loginBtn.textContent = 'Signing in…';
  try {
    const res = await fetch(`${cfg.backendUrl}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok || !data.ok) { els.loginError.textContent = data.error || 'Sign in failed.'; els.loginError.style.display = 'block'; return; }
    saveSession({ token: data.token, username, storeName: data.storeName });
    document.getElementById('password').value = '';
    showApp();
  } catch (err) {
    els.loginError.textContent = `Could not reach backend at ${cfg.backendUrl}: ${err.message}`;
    els.loginError.style.display = 'block';
  } finally {
    els.loginBtn.disabled = false; els.loginBtn.textContent = 'Sign In';
  }
});

els.logoutBtn.addEventListener('click', async () => {
  const session = loadSession();
  const cfg = loadConfig();
  if (session && cfg.backendUrl) { try { await fetch(`${cfg.backendUrl}/api/logout`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}` } }); } catch {} }
  clearSession();
  showLogin();
});

els.refreshBtn.addEventListener('click', loadCarts);

function showApp() {
  const session = loadSession();
  els.loginScreen.style.display = 'none';
  els.app.style.display = 'block';
  els.whoami.textContent = session ? session.username : '';
  loadCarts();
  loadSupportTickets();
}
function showLogin() { els.app.style.display = 'none'; els.loginScreen.style.display = 'flex'; }

async function verifyExistingSession() {
  const session = loadSession();
  const cfg = loadConfig();
  if (!session || !cfg.backendUrl) return showLogin();
  try {
    const res = await apiFetch('/api/carts');
    if (res.status === 401) { clearSession(); return showLogin(); }
    showApp();
  } catch {
    showLogin();
  }
}

async function apiFetch(path, opts = {}) {
  const cfg = loadConfig();
  const session = loadSession();
  const res = await fetch(`${cfg.backendUrl}${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: session ? `Bearer ${session.token}` : '', ...(opts.headers || {}) } });
  if (res.status === 401) {
    clearSession();
    showLogin();
    els.loginError.textContent = 'Your session expired or was signed out elsewhere. Please sign in again.';
    els.loginError.style.display = 'block';
  }
  return res;
}

/* ---------------- Carts ---------------- */
async function loadCarts() {
  const res = await apiFetch('/api/carts');
  if (!res.ok) return;
  const data = await res.json();
  cachedCarts = data.carts || [];
  renderCarts();
}
function renderCarts() {
  els.statAbandoned.textContent = cachedCarts.filter(c => c.status === 'abandoned').length;
  els.statSent.textContent = cachedCarts.reduce((sum, c) => sum + (c.recoveryEmailsSent?.length || 0), 0);
  els.statRecovered.textContent = cachedCarts.filter(c => c.status === 'recovered').length;

  if (!cachedCarts.length) {
    els.cartsTableWrap.innerHTML = '<div class="empty">No abandoned carts yet. Point your storefront\'s abandoned-checkout webhook at your olicommerce-backend deployment — see olicommerce-backend/README.md.</div>';
    return;
  }
  els.cartsTableWrap.innerHTML = `<table><thead><tr><th>Customer</th><th>Items</th><th>Value</th><th>Status</th><th>Abandoned</th><th></th></tr></thead><tbody>${
    cachedCarts.map(c => `<tr>
      <td>${escapeHtml(c.customerName || c.customerEmail || '—')}</td>
      <td>${c.items.length} item${c.items.length === 1 ? '' : 's'}</td>
      <td>${formatMoney(c.cartValueCents, c.currency)}</td>
      <td><span class="badge ${c.status}">${c.status.replace('_', ' ')}</span></td>
      <td>${new Date(c.abandonedAt).toLocaleDateString()}</td>
      <td class="row-actions">
        ${c.customerEmail ? `<button onclick="openRecoveryModal('${c.id}')">Send recovery</button>` : ''}
        ${c.status !== 'recovered' ? `<button onclick="quickMarkRecovered('${c.id}')">Mark recovered</button>` : ''}
        <button onclick="deleteCartRow('${c.id}')">Delete</button>
      </td>
    </tr>`).join('')
  }</tbody></table>`;
}
async function quickMarkRecovered(id) { await apiFetch(`/api/carts/${id}/mark-recovered`, { method: 'POST' }); await loadCarts(); }
async function deleteCartRow(id) { if (!confirm('Delete this cart record?')) return; await apiFetch(`/api/carts/${id}`, { method: 'DELETE' }); await loadCarts(); }

/* ---------------- Recovery email modal ---------------- */
function openRecoveryModal(cartId) {
  activeCartId = cartId;
  els.recoveryErr.style.display = 'none';
  els.previewBox.innerHTML = '';
  document.getElementById('r-tone').value = 'friendly';
  document.getElementById('r-use-ai').checked = false;
  els.recoveryModal.classList.add('open');
}
async function previewEmail() {
  const tone = document.getElementById('r-tone').value;
  const useAi = document.getElementById('r-use-ai').checked;
  const res = await apiFetch(`/api/carts/${activeCartId}/preview-email`, { method: 'POST', body: JSON.stringify({ tone, useAi }) });
  if (!res.ok) { els.recoveryErr.textContent = 'Could not build preview.'; els.recoveryErr.style.display = 'block'; return; }
  const data = await res.json();
  let banner = '';
  if (data.email.aiRewriteAttempted && !data.email.aiRewriteUsed) {
    banner = `<div class="info-banner">ℹ️ ${escapeHtml(data.email.aiRewriteNote)}</div>`;
  } else if (data.email.aiRewriteUsed) {
    banner = `<div class="info-banner">✨ This preview was rewritten by AI.</div>`;
  }
  els.previewBox.innerHTML = `${banner}<div class="email-preview"><strong>Subject:</strong> ${escapeHtml(data.email.subject)}<hr style="margin:8px 0;border:none;border-top:1px solid #e7e9ee;">${data.email.html}</div>`;
}
async function submitSendRecovery() {
  const tone = document.getElementById('r-tone').value;
  const useAi = document.getElementById('r-use-ai').checked;
  els.sendRecoveryBtn.disabled = true;
  try {
    const res = await apiFetch(`/api/carts/${activeCartId}/send-recovery`, { method: 'POST', body: JSON.stringify({ tone, useAi }) });
    const data = await res.json();
    if (!res.ok) { els.recoveryErr.textContent = data.error || 'Failed to send.'; els.recoveryErr.style.display = 'block'; return; }
    closeModal('recoveryModal');
    await loadCarts();
  } finally {
    els.sendRecoveryBtn.disabled = false;
  }
}

function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(overlay => { overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); }); });

/* ---------------- AI Support Assistant ---------------- */
// Talks to the real, honest AI Support Assistant on olicommerce-backend
// (see olicommerce-backend/server/supportAssistant.js) — same
// three-tier pattern (knowledge base -> optional real AI -> real
// ticket escalation) as OliOps' and OliFlow's assistants.
function appendChatMessage(role, text, meta = {}) {
  if (els.chatEmpty) els.chatEmpty.remove();
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  let html = '';
  if (role === 'assistant' && meta.source) {
    const label = meta.source === 'knowledge_base' ? '📚 Knowledge base' : meta.source === 'ai' ? '✨ AI-assisted' : '🎫 Escalated to support';
    html += `<span class="src-badge ${meta.source}">${label}</span>`;
  }
  html += escapeHtml(text);
  if (meta.ticketId) {
    html += `<br><span style="font-size:11.5px;opacity:.8;">A support ticket was created (#${meta.ticketId.slice(0,8)}) — a real person will follow up.</span>`;
  }
  div.innerHTML = html;
  els.chatLog.appendChild(div);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

if (els.chatForm) {
  els.chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = els.chatInput.value.trim();
    if (!message) return;
    appendChatMessage('user', message);
    chatHistory.push({ role: 'user', content: message });
    els.chatInput.value = '';
    els.chatSendBtn.disabled = true;
    els.chatSendBtn.textContent = '…';
    try {
      const res = await apiFetch('/api/support/chat', {
        method: 'POST',
        body: JSON.stringify({ message, history: chatHistory.slice(-8), useAi: els.chatUseAi.checked }),
      });
      const data = await res.json();
      if (!res.ok) {
        appendChatMessage('assistant', data.error || 'Something went wrong reaching the assistant.', { source: 'fallback' });
        return;
      }
      appendChatMessage('assistant', data.answer, { source: data.source, ticketId: data.ticketId });
      chatHistory.push({ role: 'assistant', content: data.answer });
      if (data.ticketId) await loadSupportTickets();
    } catch (err) {
      appendChatMessage('assistant', `Could not reach the backend: ${err.message}`, { source: 'fallback' });
    } finally {
      els.chatSendBtn.disabled = false;
      els.chatSendBtn.textContent = 'Send';
    }
  });
}

async function loadSupportTickets() {
  if (!els.ticketsWrap) return;
  const res = await apiFetch('/api/support/tickets');
  if (!res.ok) return;
  const data = await res.json();
  renderSupportTickets(data.tickets || []);
}
function renderSupportTickets(tickets) {
  if (!tickets.length) { els.ticketsWrap.innerHTML = '<div class="empty" style="padding:30px 10px;">No support tickets yet.</div>'; return; }
  els.ticketsWrap.innerHTML = tickets.map(t => `
    <div class="ticket-card">
      <div class="t-subject">${escapeHtml(t.subject)}</div>
      <div class="t-meta">${new Date(t.createdAt).toLocaleString()} · <span class="badge ${t.status === 'open' ? 'escalated' : 'recovered'}">${t.status}</span>${t.contactEmail ? ' · ' + escapeHtml(t.contactEmail) : ''}</div>
      <div class="row-actions" style="margin-top:8px;">
        ${t.status === 'open'
          ? `<button onclick="closeTicket('${t.id}')">Mark resolved</button>`
          : `<button onclick="reopenTicket('${t.id}')">Reopen</button>`}
      </div>
    </div>`).join('');
}
async function closeTicket(id) { await apiFetch(`/api/support/tickets/${id}/close`, { method: 'POST' }); await loadSupportTickets(); }
async function reopenTicket(id) { await apiFetch(`/api/support/tickets/${id}/reopen`, { method: 'POST' }); await loadSupportTickets(); }
window.closeTicket = closeTicket;
window.reopenTicket = reopenTicket;
window.loadSupportTickets = loadSupportTickets;

window.openRecoveryModal = openRecoveryModal;
window.previewEmail = previewEmail;
window.submitSendRecovery = submitSendRecovery;
window.quickMarkRecovered = quickMarkRecovered;
window.deleteCartRow = deleteCartRow;
window.closeModal = closeModal;

initConfigUI();
verifyExistingSession();
