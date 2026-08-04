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
function formatMoney(cents) { return `$${((cents || 0) / 100).toFixed(2)}`; }

const els = {};
['loginScreen','app','loginForm','loginBtn','loginError','settingsToggle','configFields','backendUrl','saveConfigBtn',
 'whoami','logoutBtn','contactsTableWrap','tasksTableWrap','invoicesTableWrap',
 'contactModal','taskModal','invoiceModal','contactErr','taskErr','invoiceErr','itemRows'
].forEach(id => els[id] = document.getElementById(id));

let cachedContacts = [];
let cachedTasks = [];
let cachedInvoices = [];

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
  await Promise.all([loadContacts(), loadTasks(), loadInvoices()]);
}

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
  row.innerHTML = `<input placeholder="Description" class="i-desc"/><input placeholder="Qty" type="number" min="1" value="1" class="i-qty"/><input placeholder="Unit $" type="number" min="0" step="0.01" class="i-price"/><button type="button" onclick="this.closest('.item-row').remove()" style="border:none;background:none;cursor:pointer;color:var(--bad);">✕</button>`;
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
