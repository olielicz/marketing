/**
 * app.js — real client logic for the OliOps app. Plain fetch() calls
 * against a real oliops-backend deployment (see ../../oliops-backend).
 * No frameworks, no build step. Same architecture pattern as
 * olisalestrack/dashboard/dashboard.js — self-hosted, single-tenant,
 * you deploy your own backend and point this at your own URL.
 */

const CONFIG_KEY = 'oliops.app.config.v1';
const SESSION_KEY = 'oliops.app.session.v1';

function loadConfig() { try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || { backendUrl: '' }; } catch { return { backendUrl: '' }; } }
function saveConfig(cfg) { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); }
function loadSession() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; } }
function saveSession(s) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { sessionStorage.removeItem(SESSION_KEY); }
function normalizeUrl(u) { return String(u || '').trim().replace(/\/$/, ''); }
function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str ?? ''; return d.innerHTML; }
// ⚠️ FIX: this previously hardcoded "$" regardless of the business's
// real currency — the same bug already fixed server-side in
// oliops-backend/server/invoiceHtml.js and store.js, but missed here in
// the client-rendered invoice list table (a real customer would see a
// hardcoded dollar sign in the app's own dashboard even after fixing
// their printable invoice's currency). Now uses the real ISO 4217
// currency code fetched from the backend's own /api/tax-settings (see
// cachedCurrency below) via the standard Intl.NumberFormat formatter —
// defaults to USD out of the box, genuinely supports GBP/EUR/AUD/PHP/
// any other real code once the owner configures it.
let cachedCurrency = 'USD';
function formatMoney(cents) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: cachedCurrency || 'USD' }).format((cents || 0) / 100);
  } catch {
    return `${cachedCurrency || 'USD'} ${((cents || 0) / 100).toFixed(2)}`;
  }
}

const els = {};
['loginScreen','app','loginForm','loginBtn','loginError','settingsToggle','configFields','backendUrl','saveConfigBtn',
 'whoami','logoutBtn','contactsTableWrap','tasksTableWrap','invoicesTableWrap',
 'contactModal','taskModal','invoiceModal','contactErr','taskErr','invoiceErr','itemRows',
 'chatLog','chatEmpty','chatForm','chatInput','chatSendBtn','chatUseAi','ticketsWrap'
].forEach(id => els[id] = document.getElementById(id));

let cachedContacts = [];
let cachedTasks = [];
let cachedInvoices = [];
let chatHistory = [];

/* ---------------- Config UI ---------------- */
function initConfigUI() { els.backendUrl.value = loadConfig().backendUrl; }
els.settingsToggle.addEventListener('click', () => { els.configFields.style.display = els.configFields.style.display === 'none' ? 'block' : 'none'; });
els.saveConfigBtn.addEventListener('click', () => {
  saveConfig({ backendUrl: normalizeUrl(els.backendUrl.value) });
  els.configFields.style.display = 'none';
});

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
    if (!res.ok || !data.ok) {
      els.loginError.textContent = data.error || 'Sign in failed.';
      els.loginError.style.display = 'block';
      return;
    }
    saveSession({ token: data.token, username, businessName: data.businessName });
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
  if (session && cfg.backendUrl) {
    try { await fetch(`${cfg.backendUrl}/api/logout`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}` } }); } catch {}
  }
  clearSession();
  showLogin();
});

function showApp() {
  const session = loadSession();
  els.loginScreen.style.display = 'none';
  els.app.style.display = 'block';
  els.whoami.textContent = session ? session.username : '';
  loadAll();
}
function showLogin() { els.app.style.display = 'none'; els.loginScreen.style.display = 'flex'; }

async function verifyExistingSession() {
  const session = loadSession();
  const cfg = loadConfig();
  if (!session || !cfg.backendUrl) return showLogin();
  try {
    const res = await apiFetch('/api/contacts');
    if (res.status === 401) { clearSession(); return showLogin(); }
    showApp();
  } catch {
    showLogin();
  }
}

/* ---------------- API helper (handles 401 -> forced re-login everywhere) ---------------- */
async function apiFetch(path, opts = {}) {
  const cfg = loadConfig();
  const session = loadSession();
  const res = await fetch(`${cfg.backendUrl}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: session ? `Bearer ${session.token}` : '', ...(opts.headers || {}) },
  });
  if (res.status === 401) {
    clearSession();
    showLogin();
    els.loginError.textContent = 'Your session expired or was signed out elsewhere. Please sign in again.';
    els.loginError.style.display = 'block';
  }
  return res;
}

/* ---------------- Tabs ---------------- */
document.querySelectorAll('nav.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`view-${btn.dataset.view}`).classList.add('active');
  });
});

/* ---------------- Load everything ---------------- */
async function loadAll() {
  await loadTaxSettings(); // must resolve before loadInvoices() so formatMoney() uses the real currency, not the USD default, on first render
  await Promise.all([loadContacts(), loadTasks(), loadInvoices(), loadSupportTickets()]);
}

/** Fetches the real, owner-configured currency (and tax rate) from the
 *  backend's own /api/tax-settings — see oliops-backend/server/store.js's
 *  getTaxSettings(). Falls back to the honest USD default on any error
 *  rather than blocking the rest of the app from loading. */
async function loadTaxSettings() {
  try {
    const res = await apiFetch('/api/tax-settings');
    if (!res.ok) return;
    const data = await res.json();
    cachedCurrency = (data.taxSettings && data.taxSettings.currency) || 'USD';
  } catch {
    cachedCurrency = 'USD';
  }
}

/* ---------------- AI Support Assistant ---------------- */
// Talks to the real, honest AI Support Assistant on oliops-backend (see
// oliops-backend/server/supportAssistant.js): a real knowledge-base
// match by default, an optional real AI call if the checkbox is ticked
// AND the server has a real OPENAI_API_KEY configured, and real
// escalation to a support ticket when neither is confident. This is the
// working version of the previously-marketed-but-unbuilt "AI support
// router" — see oliops-backend/README.md's "Scope" history.
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
      <div class="t-meta">${new Date(t.createdAt).toLocaleString()} · <span class="badge ${t.status === 'open' ? 'escalated' : 'done'}">${t.status}</span>${t.contactEmail ? ' · ' + escapeHtml(t.contactEmail) : ''}</div>
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

/* ---------------- Contacts ---------------- */
async function loadContacts() {
  const res = await apiFetch('/api/contacts');
  if (!res.ok) return;
  const data = await res.json();
  cachedContacts = data.contacts || [];
  renderContacts();
  populateContactSelects();
}
function renderContacts() {
  if (!cachedContacts.length) { els.contactsTableWrap.innerHTML = '<div class="empty">No contacts yet. Click "+ Add Contact" to create one.</div>'; return; }
  els.contactsTableWrap.innerHTML = `<table><thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th></th></tr></thead><tbody>${
    cachedContacts.map(c => `<tr>
      <td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.company)}</td><td>${escapeHtml(c.email)}</td><td>${escapeHtml(c.phone)}</td>
      <td class="row-actions"><button onclick="deleteContactRow('${c.id}')">Delete</button></td>
    </tr>`).join('')
  }</tbody></table>`;
}
function populateContactSelects() {
  const opts = cachedContacts.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  const taskSel = document.getElementById('t-contact');
  taskSel.innerHTML = '<option value="">— None —</option>' + opts;
  const invSel = document.getElementById('i-contact');
  invSel.innerHTML = '<option value="">— Manual entry —</option>' + opts;
}
function openContactModal() { els.contactErr.style.display = 'none'; ['c-name','c-email','c-phone','c-company','c-notes'].forEach(id => document.getElementById(id).value = ''); els.contactModal.classList.add('open'); }
async function submitContact() {
  const name = document.getElementById('c-name').value.trim();
  if (!name) { els.contactErr.textContent = 'Name is required.'; els.contactErr.style.display = 'block'; return; }
  const body = { name, email: document.getElementById('c-email').value.trim(), phone: document.getElementById('c-phone').value.trim(), company: document.getElementById('c-company').value.trim(), notes: document.getElementById('c-notes').value.trim() };
  const res = await apiFetch('/api/contacts', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) { const data = await res.json().catch(() => ({})); els.contactErr.textContent = data.error || 'Failed to save contact.'; els.contactErr.style.display = 'block'; return; }
  closeModal('contactModal');
  await loadContacts();
}
async function deleteContactRow(id) {
  if (!confirm('Delete this contact?')) return;
  await apiFetch(`/api/contacts/${id}`, { method: 'DELETE' });
  await loadContacts();
}

/* ---------------- Tasks ---------------- */
async function loadTasks() {
  const res = await apiFetch('/api/tasks');
  if (!res.ok) return;
  const data = await res.json();
  cachedTasks = data.tasks || [];
  renderTasks();
}
function renderTasks() {
  if (!cachedTasks.length) { els.tasksTableWrap.innerHTML = '<div class="empty">No tasks yet. Click "+ Add Task" to create one.</div>'; return; }
  els.tasksTableWrap.innerHTML = `<table><thead><tr><th>Title</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>${
    cachedTasks.map(t => `<tr>
      <td>${escapeHtml(t.title)}</td><td>${t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}</td>
      <td><span class="badge ${t.status}">${t.status}</span></td>
      <td class="row-actions">
        <button onclick="toggleTaskStatus('${t.id}','${t.status === 'open' ? 'done' : 'open'}')">${t.status === 'open' ? 'Mark done' : 'Reopen'}</button>
        <button onclick="deleteTaskRow('${t.id}')">Delete</button>
      </td>
    </tr>`).join('')
  }</tbody></table>`;
}
function openTaskModal() { els.taskErr.style.display = 'none'; ['t-title','t-due','t-desc'].forEach(id => document.getElementById(id).value = ''); document.getElementById('t-contact').value = ''; els.taskModal.classList.add('open'); }
async function submitTask() {
  const title = document.getElementById('t-title').value.trim();
  if (!title) { els.taskErr.textContent = 'Title is required.'; els.taskErr.style.display = 'block'; return; }
  const body = { title, dueDate: document.getElementById('t-due').value || null, contactId: document.getElementById('t-contact').value || null, description: document.getElementById('t-desc').value.trim() };
  const res = await apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) { const data = await res.json().catch(() => ({})); els.taskErr.textContent = data.error || 'Failed to save task.'; els.taskErr.style.display = 'block'; return; }
  closeModal('taskModal');
  await loadTasks();
}
async function toggleTaskStatus(id, newStatus) { await apiFetch(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) }); await loadTasks(); }
async function deleteTaskRow(id) { if (!confirm('Delete this task?')) return; await apiFetch(`/api/tasks/${id}`, { method: 'DELETE' }); await loadTasks(); }

/* ---------------- Invoices ---------------- */
async function loadInvoices() {
  const res = await apiFetch('/api/invoices');
  if (!res.ok) return;
  const data = await res.json();
  cachedInvoices = data.invoices || [];
  renderInvoices();
}
function renderInvoices() {
  if (!cachedInvoices.length) { els.invoicesTableWrap.innerHTML = '<div class="empty">No invoices yet. Click "+ Create Invoice" to create one.</div>'; return; }
  const cfg = loadConfig();
  els.invoicesTableWrap.innerHTML = `<table><thead><tr><th>#</th><th>Bill to</th><th>Total</th><th>Status</th><th>Due</th><th></th></tr></thead><tbody>${
    cachedInvoices.map(inv => `<tr>
      <td>${escapeHtml(inv.invoiceNumber)}</td><td>${escapeHtml(inv.contactName)}</td><td>${formatMoney(inv.totalCents)}</td>
      <td><span class="badge ${inv.status}">${inv.status}</span></td>
      <td>${inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}</td>
      <td class="row-actions">
        <a class="btn sm secondary" target="_blank" href="${cfg.backendUrl}/api/invoices/${inv.id}/html" style="text-decoration:none;display:inline-block;">Print</a>
        ${inv.status === 'unpaid' ? `<button onclick="markPaid('${inv.id}')">Mark paid</button>` : ''}
        <button onclick="deleteInvoiceRow('${inv.id}')">Delete</button>
      </td>
    </tr>`).join('')
  }</tbody></table>`;
}
function openInvoiceModal() {
  els.invoiceErr.style.display = 'none';
  document.getElementById('i-contact').value = '';
  document.getElementById('i-contact-name').value = '';
  document.getElementById('i-due').value = '';
  document.getElementById('i-notes').value = '';
  els.itemRows.innerHTML = '';
  addItemRow();
  els.invoiceModal.classList.add('open');
}
function addItemRow() {
  const row = document.createElement('div');
  row.className = 'item-row';
  // FIX: "Unit $" was a hardcoded placeholder label - now shows the real
  // configured currency code (e.g. "Unit GBP") instead of always implying USD.
  row.innerHTML = `<input placeholder="Description" class="i-desc"/><input placeholder="Qty" type="number" min="1" value="1" class="i-qty"/><input placeholder="Unit ${escapeHtml(cachedCurrency || 'USD')}" type="number" min="0" step="0.01" class="i-price"/><button type="button" onclick="this.closest('.item-row').remove()" style="border:none;background:none;cursor:pointer;color:var(--bad);">✕</button>`;
  els.itemRows.appendChild(row);
}
async function submitInvoice() {
  const rows = [...els.itemRows.querySelectorAll('.item-row')];
  const items = rows.map(row => ({
    description: row.querySelector('.i-desc').value.trim(),
    quantity: Number(row.querySelector('.i-qty').value) || 1,
    unitPriceCents: Math.round((Number(row.querySelector('.i-price').value) || 0) * 100),
  })).filter(item => item.description);

  if (!items.length) { els.invoiceErr.textContent = 'Add at least one line item with a description.'; els.invoiceErr.style.display = 'block'; return; }

  const contactId = document.getElementById('i-contact').value;
  const contact = cachedContacts.find(c => c.id === contactId);
  const body = {
    contactId: contactId || null,
    contactName: contact ? contact.name : document.getElementById('i-contact-name').value.trim(),
    items,
    dueDate: document.getElementById('i-due').value || null,
    notes: document.getElementById('i-notes').value.trim(),
  };
  const res = await apiFetch('/api/invoices', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) { const data = await res.json().catch(() => ({})); els.invoiceErr.textContent = data.error || 'Failed to create invoice.'; els.invoiceErr.style.display = 'block'; return; }
  closeModal('invoiceModal');
  await loadInvoices();
}
async function markPaid(id) { await apiFetch(`/api/invoices/${id}/mark-paid`, { method: 'POST' }); await loadInvoices(); }
async function deleteInvoiceRow(id) { if (!confirm('Delete this invoice?')) return; await apiFetch(`/api/invoices/${id}`, { method: 'DELETE' }); await loadInvoices(); }

/* ---------------- Modal helpers ---------------- */
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
});

// Expose functions referenced by inline onclick= handlers in index.html
window.openContactModal = openContactModal;
window.submitContact = submitContact;
window.deleteContactRow = deleteContactRow;
window.openTaskModal = openTaskModal;
window.submitTask = submitTask;
window.toggleTaskStatus = toggleTaskStatus;
window.deleteTaskRow = deleteTaskRow;
window.openInvoiceModal = openInvoiceModal;
window.addItemRow = addItemRow;
window.submitInvoice = submitInvoice;
window.markPaid = markPaid;
window.deleteInvoiceRow = deleteInvoiceRow;
window.closeModal = closeModal;

initConfigUI();
verifyExistingSession();
