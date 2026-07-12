const STORAGE_KEY = 'zain-finance-v2';

const expenseCategories = ['Housing', 'Food & Dining', 'Transport', 'Utilities', 'Shopping', 'Health', 'Education', 'Family', 'Travel', 'Entertainment', 'Other'];
const incomeCategories = ['Salary', 'Freelance', 'Business', 'Investment', 'Gift', 'Refund', 'Other Income'];
const categoryColours = ['#4078ff', '#14b888', '#8c5cf5', '#f59e3d', '#e5587a', '#23a6b8', '#6c7b9a', '#ec7d4f', '#7cb342', '#ba68c8', '#8d9aad'];
const categoryIcons = { Housing: 'H', 'Food & Dining': 'F', Transport: 'T', Utilities: 'U', Shopping: 'S', Health: '+', Education: 'E', Family: 'Fm', Travel: '✈', Entertainment: 'P', Other: '•' };

const dateKey = (date = new Date()) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const isoDate = (date = new Date()) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const id = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const escapeHtml = (text = '') => String(text).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
const sum = values => values.reduce((total, value) => total + Number(value || 0), 0);

function createSeedData() {
  return {
    version: 2,
    settings: { currency: 'AED' },
    accounts: [],
    transactions: [],
    budgets: []
  };
}

let state;
localStorage.removeItem('zain-finance-v1');
try { state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || createSeedData(); }
catch { state = createSeedData(); }
state.settings ||= { currency: 'AED' };
state.accounts ||= [];
state.transactions ||= [];
state.budgets ||= [];

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const money = amount => new Intl.NumberFormat('en-AE', { style: 'currency', currency: state.settings.currency, minimumFractionDigits: 2 }).format(Number(amount || 0));
const shortMoney = amount => new Intl.NumberFormat('en-AE', { style: 'currency', currency: state.settings.currency, notation: Math.abs(amount) > 99999 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(amount) > 99999 ? 1 : 0 }).format(Number(amount || 0));
const formatDate = value => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));

function persist(message) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
  if (message) toast(message);
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
}

function accountBalance(account) {
  const movements = state.transactions.filter(t => t.accountId === account.id).map(t => t.type === 'income' ? t.amount : -t.amount);
  return Number(account.openingBalance) + sum(movements);
}

function monthTransactions(month) { return state.transactions.filter(t => t.date.startsWith(month)); }
function monthTotals(month) {
  const tx = monthTransactions(month);
  const income = sum(tx.filter(t => t.type === 'income').map(t => t.amount));
  const expense = sum(tx.filter(t => t.type === 'expense').map(t => t.amount));
  return { income, expense, net: income - expense };
}
function spentFor(month, category) { return sum(state.transactions.filter(t => t.type === 'expense' && t.date.startsWith(month) && t.category === category).map(t => t.amount)); }

function setView(view) {
  $$('.view').forEach(el => el.classList.remove('active'));
  $(`#${view}View`)?.classList.add('active');
  $$('.nav-item[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  const titles = { dashboard: 'Financial overview', transactions: 'Transactions', accounts: 'Accounts', budgets: 'Monthly budgets', reports: 'Reports & insights', settings: 'Settings' };
  $('#pageTitle').textContent = titles[view] || 'Zain Finance';
  history.replaceState(null, '', `#${view}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderDashboard() {
  const currentMonth = dateKey();
  const previousDate = new Date(); previousDate.setMonth(previousDate.getMonth() - 1);
  const current = monthTotals(currentMonth);
  const previous = monthTotals(dateKey(previousDate));
  const total = sum(state.accounts.map(accountBalance));
  $('#totalBalance').textContent = money(total);
  $('#monthIncome').textContent = money(current.income);
  $('#monthExpense').textContent = money(current.expense);
  $('#monthSavings').textContent = money(current.net);
  const rate = current.income ? Math.round((current.net / current.income) * 100) : 0;
  $('#savingsRate').textContent = `${rate}% savings rate`;
  $('#incomeComparison').textContent = comparisonText(current.income, previous.income, 'last month');
  $('#expenseComparison').textContent = comparisonText(current.expense, previous.expense, 'last month');
  renderCashflow(Number($('#chartPeriod').value || 6));
  renderBudgetPreview(currentMonth);
  renderRecentTransactions();
  renderAccountPreview();
}

function comparisonText(current, previous, suffix) {
  if (!previous) return 'No previous month data';
  const change = Math.round(((current - previous) / previous) * 100);
  return `${change >= 0 ? '+' : ''}${change}% vs ${suffix}`;
}

function renderCashflow(monthCount) {
  const data = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const totals = monthTotals(dateKey(d));
    data.push({ label: d.toLocaleDateString('en-GB', { month: 'short' }), ...totals });
  }
  const max = Math.max(...data.flatMap(d => [d.income, d.expense]), 1);
  $('#cashflowChart').innerHTML = data.map(item => `<div class="chart-group"><div class="chart-bar income" style="height:${Math.max(2, item.income / max * 100)}%" title="Income ${money(item.income)}"></div><div class="chart-bar expense" style="height:${Math.max(2, item.expense / max * 100)}%" title="Expenses ${money(item.expense)}"></div><span class="chart-label">${item.label}</span></div>`).join('');
}

function budgetRow(budget) {
  const spent = spentFor(budget.month, budget.category);
  const percent = budget.amount ? Math.round(spent / budget.amount * 100) : 0;
  const cls = percent > 100 ? 'over' : percent >= 80 ? 'warning' : '';
  return `<div class="budget-row"><div class="budget-row-header"><span>${escapeHtml(budget.category)}</span><span>${money(spent)} / ${money(budget.amount)}</span></div><div class="progress-track"><div class="progress-bar ${cls}" style="width:${Math.min(percent, 100)}%"></div></div></div>`;
}

function renderBudgetPreview(month) {
  const budgets = state.budgets.filter(b => b.month === month).slice(0, 4);
  $('#budgetPreview').innerHTML = budgets.length ? budgets.map(budgetRow).join('') : '<div class="empty-inline">No budgets set for this month.</div>';
}

function renderRecentTransactions() {
  const txs = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  $('#recentTransactions').innerHTML = txs.length ? txs.map(t => `<div class="transaction-item"><span class="transaction-avatar">${escapeHtml((categoryIcons[t.category] || t.category[0] || '•').slice(0, 2))}</span><div class="transaction-copy"><strong>${escapeHtml(t.description)}</strong><small>${escapeHtml(t.category)} · ${formatDate(t.date)}</small></div><span class="transaction-amount ${t.type}">${t.type === 'income' ? '+' : '−'}${money(t.amount)}</span></div>`).join('') : '<div class="empty-inline">No transactions yet.</div>';
}

function renderAccountPreview() {
  const accounts = state.accounts.slice(0, 4);
  $('#accountPreview').innerHTML = accounts.length ? accounts.map(a => `<div class="account-preview-item"><i class="account-dot" style="background:${a.colour}"></i><div><strong>${escapeHtml(a.name)}</strong><small>${escapeHtml(a.type)}</small></div><b>${money(accountBalance(a))}</b></div>`).join('') : '<div class="empty-inline">Add your first account.</div>';
}

function renderTransactions() {
  const query = $('#transactionSearch').value.trim().toLowerCase();
  const type = $('#transactionTypeFilter').value;
  const month = $('#transactionMonthFilter').value;
  const rows = [...state.transactions]
    .filter(t => !query || `${t.description} ${t.category} ${t.notes || ''}`.toLowerCase().includes(query))
    .filter(t => type === 'all' || t.type === type)
    .filter(t => month === 'all' || t.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date));
  $('#transactionTableBody').innerHTML = rows.map(t => {
    const account = state.accounts.find(a => a.id === t.accountId);
    return `<tr><td>${formatDate(t.date)}</td><td><strong>${escapeHtml(t.description)}</strong></td><td>${escapeHtml(t.category)}</td><td>${escapeHtml(account?.name || 'Deleted account')}</td><td><span class="type-badge ${t.type}">${t.type}</span></td><td class="amount-cell"><strong class="transaction-amount ${t.type}">${t.type === 'income' ? '+' : '−'}${money(t.amount)}</strong></td><td><div class="row-actions"><button class="row-action edit-transaction" data-id="${t.id}" title="Edit">✎</button><button class="row-action delete-transaction" data-id="${t.id}" title="Delete">×</button></div></td></tr>`;
  }).join('');
  $('#transactionEmpty').hidden = rows.length > 0;
  $('.responsive-table').hidden = rows.length === 0;
}

function renderAccounts() {
  $('#accountGrid').innerHTML = state.accounts.length ? state.accounts.map(a => {
    const balance = accountBalance(a);
    return `<article class="account-card" style="background:linear-gradient(135deg, ${a.colour}, ${shadeColour(a.colour, -32)})"><div class="account-card-head"><small>${escapeHtml(a.type)}</small><button class="account-menu" data-account-menu="${a.id}">•••</button></div><h3>${money(balance)}</h3><p>Available balance</p><span class="account-card-name">${escapeHtml(a.name)}</span><div class="account-card-actions" data-account-actions="${a.id}"><button class="edit-account" data-id="${a.id}">Edit account</button><button class="delete-account" data-id="${a.id}">Delete account</button></div></article>`;
  }).join('') : '<article class="panel empty-state"><span>▣</span><h3>No accounts yet</h3><p>Add cash or a bank account to get started.</p></article>';
}

function shadeColour(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16), amount = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, (num >> 8 & 0x00ff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amount));
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

function renderBudgets() {
  const month = $('#budgetMonth').value || dateKey();
  const budgets = state.budgets.filter(b => b.month === month);
  $('#budgetGrid').innerHTML = budgets.length ? budgets.map((b, index) => {
    const spent = spentFor(month, b.category);
    const percent = b.amount ? Math.round(spent / b.amount * 100) : 0;
    const remaining = b.amount - spent;
    const cls = percent > 100 ? 'over' : percent >= 80 ? 'warning' : '';
    return `<article class="panel budget-card"><div class="budget-card-head"><div class="budget-card-title"><span class="category-icon">${escapeHtml((categoryIcons[b.category] || b.category[0]).slice(0, 2))}</span><div><h3>${escapeHtml(b.category)}</h3><small>${percent}% used</small></div></div><button class="row-action delete-budget" data-id="${b.id}" title="Delete budget">×</button></div><div class="budget-numbers"><span>Spent <strong>${money(spent)}</strong></span><span>Limit <strong>${money(b.amount)}</strong></span></div><div class="progress-track"><div class="progress-bar ${cls}" style="width:${Math.min(percent,100)}%;background-color:${cls ? '' : categoryColours[index % categoryColours.length]}"></div></div><p class="budget-caption">${remaining >= 0 ? `${money(remaining)} remaining` : `${money(Math.abs(remaining))} over budget`}</p></article>`;
  }).join('') : '<article class="panel empty-state"><span>◎</span><h3>No budgets for this month</h3><p>Set spending limits for the categories that matter.</p></article>';
}

function renderReports() {
  const month = $('#reportMonth').value || dateKey();
  const totals = monthTotals(month);
  $('#reportIncome').textContent = money(totals.income);
  $('#reportExpense').textContent = money(totals.expense);
  $('#reportNet').textContent = money(totals.net);
  const categoryData = expenseCategories.map(category => ({ category, amount: spentFor(month, category) })).filter(c => c.amount > 0).sort((a,b) => b.amount - a.amount);
  if (!categoryData.length) {
    $('#categoryChart').innerHTML = '<div class="empty-inline">No expense data for this month.</div>';
    $('#categoryTotals').innerHTML = '<div class="empty-inline">Categories will appear after you add expenses.</div>';
    return;
  }
  let current = 0;
  const segments = categoryData.map((item, index) => {
    const start = current;
    current += item.amount / totals.expense * 100;
    return `${categoryColours[index % categoryColours.length]} ${start}% ${current}%`;
  }).join(', ');
  $('#categoryChart').innerHTML = `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${segments})"></div><div class="donut-centre"><strong>${shortMoney(totals.expense)}</strong><small>Total spent</small></div></div>`;
  $('#categoryTotals').innerHTML = categoryData.map((item, index) => `<div class="category-total-row"><i style="background:${categoryColours[index % categoryColours.length]}"></i><span>${escapeHtml(item.category)}</span><strong>${money(item.amount)}</strong></div>`).join('');
}

function populateFiltersAndForms() {
  const months = [...new Set(state.transactions.map(t => t.date.slice(0, 7)))].sort().reverse();
  const filter = $('#transactionMonthFilter');
  const prior = filter.value || 'all';
  filter.innerHTML = '<option value="all">All months</option>' + months.map(month => `<option value="${month}">${new Date(`${month}-02T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</option>`).join('');
  filter.value = months.includes(prior) ? prior : 'all';
  const accountOptions = state.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
  $('#transactionForm select[name="accountId"]').innerHTML = accountOptions || '<option value="">Add an account first</option>';
  $('#budgetForm select[name="category"]').innerHTML = expenseCategories.map(c => `<option>${c}</option>`).join('');
}

function updateTransactionCategories() {
  const form = $('#transactionForm');
  const type = form.elements.type.value;
  const current = form.elements.category.value;
  const categories = type === 'income' ? incomeCategories : expenseCategories;
  form.elements.category.innerHTML = categories.map(c => `<option>${c}</option>`).join('');
  if (categories.includes(current)) form.elements.category.value = current;
}

function renderAll() {
  populateFiltersAndForms();
  renderDashboard();
  renderTransactions();
  renderAccounts();
  renderBudgets();
  renderReports();
  $('#currencySetting').value = state.settings.currency;
  $('#amountCurrency').textContent = state.settings.currency;
  $('#budgetCurrency').textContent = state.settings.currency;
}

function openTransaction(transaction = null) {
  if (!state.accounts.length) { toast('Add an account before adding a transaction'); setView('accounts'); return; }
  const form = $('#transactionForm');
  form.reset();
  form.elements.id.value = transaction?.id || '';
  form.elements.type.value = transaction?.type || 'expense';
  updateTransactionCategories();
  form.elements.amount.value = transaction?.amount || '';
  form.elements.description.value = transaction?.description || '';
  form.elements.date.value = transaction?.date || isoDate();
  form.elements.category.value = transaction?.category || (transaction?.type === 'income' ? 'Salary' : 'Food & Dining');
  form.elements.accountId.value = transaction?.accountId || state.accounts[0].id;
  form.elements.notes.value = transaction?.notes || '';
  $('#transactionDialogTitle').textContent = transaction ? 'Edit transaction' : 'Add transaction';
  $('#transactionDialog').showModal();
}

function openAccount(account = null) {
  const form = $('#accountForm');
  form.reset();
  form.elements.id.value = account?.id || '';
  form.elements.name.value = account?.name || '';
  form.elements.type.value = account?.type || 'bank';
  form.elements.openingBalance.value = account?.openingBalance ?? 0;
  form.elements.colour.value = account?.colour || '#4078ff';
  $('#accountDialogTitle').textContent = account ? 'Edit account' : 'Add account';
  $('#accountDialog').showModal();
}

function openBudget() {
  const form = $('#budgetForm');
  form.reset();
  form.elements.month.value = $('#budgetMonth').value || dateKey();
  $('#budgetDialog').showModal();
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$$('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
$$('[data-view-jump]').forEach(button => button.addEventListener('click', () => setView(button.dataset.viewJump)));
$$('[data-open]').forEach(button => button.addEventListener('click', () => button.dataset.open === 'transaction' ? openTransaction() : button.dataset.open === 'account' ? openAccount() : openBudget()));
$$('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$$('.app-dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));

$('#transactionForm').addEventListener('change', event => { if (event.target.name === 'type') updateTransactionCategories(); });
$('#transactionForm').addEventListener('submit', event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const transaction = { ...data, id: data.id || id(), amount: Number(data.amount) };
  const index = state.transactions.findIndex(t => t.id === data.id);
  if (index >= 0) state.transactions[index] = transaction; else state.transactions.push(transaction);
  $('#transactionDialog').close();
  persist(index >= 0 ? 'Transaction updated' : 'Transaction added');
});

$('#accountForm').addEventListener('submit', event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const account = { ...data, id: data.id || id(), openingBalance: Number(data.openingBalance) };
  const index = state.accounts.findIndex(a => a.id === data.id);
  if (index >= 0) state.accounts[index] = account; else state.accounts.push(account);
  $('#accountDialog').close();
  persist(index >= 0 ? 'Account updated' : 'Account added');
});

$('#budgetForm').addEventListener('submit', event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const existing = state.budgets.find(b => b.month === data.month && b.category === data.category);
  if (existing) existing.amount = Number(data.amount); else state.budgets.push({ ...data, id: id(), amount: Number(data.amount) });
  $('#budgetDialog').close();
  $('#budgetMonth').value = data.month;
  persist(existing ? 'Budget updated' : 'Budget added');
});

$('#transactionTableBody').addEventListener('click', event => {
  const edit = event.target.closest('.edit-transaction');
  const del = event.target.closest('.delete-transaction');
  if (edit) openTransaction(state.transactions.find(t => t.id === edit.dataset.id));
  if (del && confirm('Delete this transaction?')) { state.transactions = state.transactions.filter(t => t.id !== del.dataset.id); persist('Transaction deleted'); }
});

$('#accountGrid').addEventListener('click', event => {
  const menu = event.target.closest('[data-account-menu]');
  const edit = event.target.closest('.edit-account');
  const del = event.target.closest('.delete-account');
  if (menu) $(`[data-account-actions="${menu.dataset.accountMenu}"]`).classList.toggle('open');
  if (edit) openAccount(state.accounts.find(a => a.id === edit.dataset.id));
  if (del) {
    const used = state.transactions.some(t => t.accountId === del.dataset.id);
    if (used) return toast('Delete or move this account’s transactions first');
    if (confirm('Delete this account?')) { state.accounts = state.accounts.filter(a => a.id !== del.dataset.id); persist('Account deleted'); }
  }
});

$('#budgetGrid').addEventListener('click', event => {
  const del = event.target.closest('.delete-budget');
  if (del && confirm('Delete this budget?')) { state.budgets = state.budgets.filter(b => b.id !== del.dataset.id); persist('Budget deleted'); }
});

['transactionSearch', 'transactionTypeFilter', 'transactionMonthFilter'].forEach(key => $(`#${key}`).addEventListener(key === 'transactionSearch' ? 'input' : 'change', renderTransactions));
$('#budgetMonth').addEventListener('change', renderBudgets);
$('#reportMonth').addEventListener('change', renderReports);
$('#chartPeriod').addEventListener('change', renderDashboard);
$('#currencySetting').addEventListener('change', event => { state.settings.currency = event.target.value; persist('Currency updated'); });

$('#exportCsv').addEventListener('click', () => {
  const header = ['Date', 'Type', 'Description', 'Category', 'Account', 'Amount', 'Notes'];
  const rows = state.transactions.map(t => [t.date, t.type, t.description, t.category, state.accounts.find(a => a.id === t.accountId)?.name || '', t.amount, t.notes || '']);
  const csv = [header, ...rows].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
  download(`zain-finance-transactions-${isoDate()}.csv`, csv, 'text/csv;charset=utf-8');
  toast('CSV exported');
});

$('#backupData').addEventListener('click', () => { download(`zain-finance-backup-${isoDate()}.json`, JSON.stringify(state, null, 2), 'application/json'); toast('Backup downloaded'); });
$('#restoreData').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported.accounts) || !Array.isArray(imported.transactions) || !Array.isArray(imported.budgets)) throw new Error('Invalid backup');
    if (!confirm('Replace current data with this backup?')) return;
    state = imported; persist('Backup restored');
  } catch { toast('This is not a valid Zain Finance backup'); }
  event.target.value = '';
});
$('#resetData').addEventListener('click', () => { if (confirm('This permanently deletes all finance data on this device. Continue?')) { state = { version: 2, settings: { currency: state.settings.currency }, accounts: [], transactions: [], budgets: [] }; persist('App data reset'); } });

let deferredInstall;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredInstall = event; $('#installButton').hidden = false; });
$('#installButton').addEventListener('click', async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; $('#installButton').hidden = true; });
window.addEventListener('appinstalled', () => toast('Zain Finance installed'));

$('#todayLabel').textContent = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
$('#budgetMonth').value = dateKey();
$('#reportMonth').value = dateKey();
const initialView = location.hash.slice(1);
setView(['dashboard','transactions','accounts','budgets','reports','settings'].includes(initialView) ? initialView : 'dashboard');
renderAll();

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
