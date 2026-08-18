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
 'chatLog','chatEmpty','chatForm','chatInput','chatSendBtn','chatUseAi','ticketsWrap',
 'employeesTableWrap','employeeModal','employeeErr',
 'payrollMonth','payrollTableWrap',
 'expensesTableWrap','expenseModal','expenseErr',
 'reportFrom','reportTo','reportsWrap'
].forEach(id => els[id] = document.getElementById(id));

let cachedContacts = [];
let cachedTasks = [];
let cachedInvoices = [];
let cachedEmployees = [];
let cachedExpenses = [];
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
  await Promise.all([loadContacts(), loadTasks(), loadInvoices(), loadEmployees(), loadExpenses(), loadSupportTickets()]);
  // Default payroll month to current month
  if (els.payrollMonth) {
    const now = new Date();
    els.payrollMonth.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  // Default report date range to current month
  if (els.reportFrom && els.reportTo) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    els.reportFrom.value = `${y}-${m}-01`;
    els.reportTo.value = now.toISOString().split('T')[0];
  }
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

/* ---------------- Employees ---------------- */
async function loadEmployees() {
  const res = await apiFetch('/api/employees');
  if (!res.ok) return;
  const data = await res.json();
  cachedEmployees = data.employees || [];
  renderEmployees();
}
function renderEmployees() {
  if (!cachedEmployees.length) { els.employeesTableWrap.innerHTML = '<div class="empty">No employees yet. Click "+ Add Employee" to create one.</div>'; return; }
  els.employeesTableWrap.innerHTML = `<table><thead><tr><th>Name</th><th>Role</th><th>Pay Type</th><th>Rate</th><th>Status</th><th></th></tr></thead><tbody>${
    cachedEmployees.map(e => `<tr>
      <td>${escapeHtml(e.name)}</td><td>${escapeHtml(e.role || '—')}</td><td>${escapeHtml(e.payType)}</td>
      <td>${e.payType === 'hourly' ? formatMoney(e.hourlyRateCents) + '/hr' : formatMoney(e.monthlySalaryCents) + '/mo'}</td>
      <td><span class="badge ${e.status === 'active' ? 'paid' : 'unpaid'}">${escapeHtml(e.status || 'active')}</span></td>
      <td class="row-actions"><button onclick="deleteEmployeeRow('${e.id}')">Delete</button></td>
    </tr>`).join('')
  }</tbody></table>`;
}
function openEmployeeModal() {
  els.employeeErr.style.display = 'none';
  ['e-name','e-role','e-hourlyRateCents','e-monthlySalaryCents','e-withholdingRatePct'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('e-payType').value = 'hourly';
  document.getElementById('e-hourlyField').style.display = '';
  document.getElementById('e-salaryField').style.display = 'none';
  els.employeeModal.classList.add('open');
}
// Toggle hourly/salary fields
document.getElementById('e-payType').addEventListener('change', function() {
  document.getElementById('e-hourlyField').style.display = this.value === 'hourly' ? '' : 'none';
  document.getElementById('e-salaryField').style.display = this.value === 'salary' ? '' : 'none';
});
async function submitEmployee() {
  const name = document.getElementById('e-name').value.trim();
  if (!name) { els.employeeErr.textContent = 'Name is required.'; els.employeeErr.style.display = 'block'; return; }
  const payType = document.getElementById('e-payType').value;
  const body = {
    name,
    role: document.getElementById('e-role').value.trim(),
    payType,
    hourlyRateCents: payType === 'hourly' ? Number(document.getElementById('e-hourlyRateCents').value) || 0 : undefined,
    monthlySalaryCents: payType === 'salary' ? Number(document.getElementById('e-monthlySalaryCents').value) || 0 : undefined,
    withholdingRatePct: Number(document.getElementById('e-withholdingRatePct').value) || 0,
  };
  const res = await apiFetch('/api/employees', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) { const data = await res.json().catch(() => ({})); els.employeeErr.textContent = data.error || 'Failed to save employee.'; els.employeeErr.style.display = 'block'; return; }
  closeModal('employeeModal');
  await loadEmployees();
}
async function deleteEmployeeRow(id) {
  if (!confirm('Delete this employee?')) return;
  await apiFetch(`/api/employees/${id}`, { method: 'DELETE' });
  await loadEmployees();
}

/* ---------------- Payroll ---------------- */
async function calculatePayroll() {
  const month = els.payrollMonth.value;
  if (!month) { els.payrollTableWrap.innerHTML = '<div class="empty">Please select a month.</div>'; return; }
  const res = await apiFetch(`/api/payroll?month=${month}`);
  if (!res.ok) { const data = await res.json().catch(() => ({})); els.payrollTableWrap.innerHTML = `<div class="empty">${escapeHtml(data.error || 'Failed to calculate payroll.')}</div>`; return; }
  const data = await res.json();
  renderPayroll(data);
}
function renderPayroll(data) {
  const rows = data.rows || data.payroll || [];
  if (!rows.length) { els.payrollTableWrap.innerHTML = '<div class="empty">No payroll data for this month. Make sure employees and time entries exist.</div>'; return; }
  let totalGross = 0, totalWithheld = 0, totalNet = 0;
  const tbody = rows.map(r => {
    totalGross += r.grossPayCents || 0;
    totalWithheld += r.withheldCents || 0;
    totalNet += r.netPayCents || 0;
    return `<tr>
      <td>${escapeHtml(r.employeeName || r.name)}</td>
      <td>${r.hoursLogged != null ? r.hoursLogged : '—'}</td>
      <td>${formatMoney(r.grossPayCents)}</td>
      <td>${formatMoney(r.withheldCents)}</td>
      <td>${formatMoney(r.netPayCents)}</td>
    </tr>`;
  }).join('');
  els.payrollTableWrap.innerHTML = `<table><thead><tr><th>Employee</th><th>Hours Logged</th><th>Gross Pay</th><th>Withheld</th><th>Net Pay</th></tr></thead><tbody>${tbody}
    <tr style="font-weight:800;background:#f8f8fb;">
      <td>Totals</td><td></td>
      <td>${formatMoney(totalGross)}</td>
      <td>${formatMoney(totalWithheld)}</td>
      <td>${formatMoney(totalNet)}</td>
    </tr>
  </tbody></table>`;
}

/* ---------------- Expenses ---------------- */
async function loadExpenses() {
  const res = await apiFetch('/api/expenses');
  if (!res.ok) return;
  const data = await res.json();
  cachedExpenses = data.expenses || [];
  renderExpenses();
}
function renderExpenses() {
  if (!cachedExpenses.length) { els.expensesTableWrap.innerHTML = '<div class="empty">No expenses yet. Click "+ Add Expense" to create one.</div>'; return; }
  els.expensesTableWrap.innerHTML = `<table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th></th></tr></thead><tbody>${
    cachedExpenses.map(ex => `<tr>
      <td>${ex.date ? new Date(ex.date).toLocaleDateString() : '—'}</td>
      <td>${escapeHtml(ex.category)}</td>
      <td>${escapeHtml(ex.description)}</td>
      <td>${formatMoney(ex.amountCents)}</td>
      <td class="row-actions"><button onclick="deleteExpenseRow('${ex.id}')">Delete</button></td>
    </tr>`).join('')
  }</tbody></table>`;
}
function openExpenseModal() {
  els.expenseErr.style.display = 'none';
  document.getElementById('ex-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('ex-category').value = 'Other';
  document.getElementById('ex-description').value = '';
  document.getElementById('ex-amountCents').value = '';
  els.expenseModal.classList.add('open');
}
async function submitExpense() {
  const date = document.getElementById('ex-date').value;
  const category = document.getElementById('ex-category').value;
  const description = document.getElementById('ex-description').value.trim();
  const amountCents = Number(document.getElementById('ex-amountCents').value) || 0;
  if (!description) { els.expenseErr.textContent = 'Description is required.'; els.expenseErr.style.display = 'block'; return; }
  if (!amountCents) { els.expenseErr.textContent = 'Amount is required.'; els.expenseErr.style.display = 'block'; return; }
  const body = { date, category, description, amountCents };
  const res = await apiFetch('/api/expenses', { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) { const data = await res.json().catch(() => ({})); els.expenseErr.textContent = data.error || 'Failed to save expense.'; els.expenseErr.style.display = 'block'; return; }
  closeModal('expenseModal');
  await loadExpenses();
}
async function deleteExpenseRow(id) {
  if (!confirm('Delete this expense?')) return;
  await apiFetch(`/api/expenses/${id}`, { method: 'DELETE' });
  await loadExpenses();
}

/* ---------------- Reports ---------------- */
async function generateReport() {
  const from = els.reportFrom.value;
  const to = els.reportTo.value;
  if (!from || !to) { els.reportsWrap.innerHTML = '<div class="empty">Please select a date range.</div>'; return; }
  const res = await apiFetch(`/api/reports?from=${from}&to=${to}`);
  if (!res.ok) { const data = await res.json().catch(() => ({})); els.reportsWrap.innerHTML = `<div class="empty">${escapeHtml(data.error || 'Failed to generate report.')}</div>`; return; }
  const data = await res.json();
  renderReport(data);
}
function renderReport(data) {
  const report = data.report || data;
  let html = '';

  // P&L Summary
  html += `<h3 style="margin:18px 0 10px;font-size:16px;">Profit &amp; Loss Summary</h3>`;
  html += `<table><tbody>
    <tr><td>Revenue</td><td>${formatMoney(report.revenueCents || 0)}</td></tr>
    <tr><td>Expenses</td><td>${formatMoney(report.expensesCents || 0)}</td></tr>
    <tr><td>Payroll Cost</td><td>${formatMoney(report.payrollCostCents || 0)}</td></tr>
    <tr style="font-weight:800;"><td>Net Profit</td><td>${formatMoney(report.netProfitCents || 0)}</td></tr>
  </tbody></table>`;

  // Expenses by Category
  const byCategory = report.expensesByCategory || {};
  const categories = Object.keys(byCategory);
  if (categories.length) {
    html += `<h3 style="margin:24px 0 10px;font-size:16px;">Expenses by Category</h3>`;
    html += `<table><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>${
      categories.map(cat => `<tr><td>${escapeHtml(cat)}</td><td>${formatMoney(byCategory[cat])}</td></tr>`).join('')
    }</tbody></table>`;
  }

  // Aged Receivables
  const receivables = report.agedReceivables || [];
  if (receivables.length) {
    html += `<h3 style="margin:24px 0 10px;font-size:16px;">Aged Receivables</h3>`;
    html += `<table><thead><tr><th>Invoice #</th><th>Contact</th><th>Amount</th><th>Due Date</th><th>Days Overdue</th></tr></thead><tbody>${
      receivables.map(r => `<tr>
        <td>${escapeHtml(r.invoiceNumber)}</td>
        <td>${escapeHtml(r.contactName)}</td>
        <td>${formatMoney(r.totalCents)}</td>
        <td>${r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—'}</td>
        <td>${r.daysOverdue != null ? r.daysOverdue : '—'}</td>
      </tr>`).join('')
    }</tbody></table>`;
  }

  els.reportsWrap.innerHTML = html || '<div class="empty">No report data for this date range.</div>';
}

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
window.openEmployeeModal = openEmployeeModal;
window.submitEmployee = submitEmployee;
window.deleteEmployeeRow = deleteEmployeeRow;
window.calculatePayroll = calculatePayroll;
window.openExpenseModal = openExpenseModal;
window.submitExpense = submitExpense;
window.deleteExpenseRow = deleteExpenseRow;
window.generateReport = generateReport;
window.closeModal = closeModal;

initConfigUI();
verifyExistingSession();
