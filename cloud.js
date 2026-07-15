(function () {
  const config = window.ZAIN_FINANCE_CONFIG || {};
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.supabaseUrl || '')
    && config.supabasePublishableKey
    && !config.supabasePublishableKey.startsWith('__');

  let client = null;
  let user = null;
  let channel = null;
  let stateListener = null;
  let authListener = null;
  let reloadTimer = null;
  let loading = false;

  const emptyState = () => ({ version: 3, settings: { currency: 'AED' }, accounts: [], transactions: [], budgets: [] });
  const cacheKey = () => user ? `zain-finance-cloud-${user.id}` : null;

  function cachedState() {
    const key = cacheKey();
    if (!key) return emptyState();
    try { return JSON.parse(localStorage.getItem(key)) || emptyState(); }
    catch { return emptyState(); }
  }

  function cacheState(state) {
    const key = cacheKey();
    if (key) localStorage.setItem(key, JSON.stringify(state));
  }

  function accountFromRow(row) {
    return { id: row.id, name: row.name, type: row.type, openingBalance: Number(row.opening_balance), colour: row.colour };
  }
  function transactionFromRow(row) {
    return { id: row.id, type: row.type, amount: Number(row.amount), description: row.description, category: row.category, accountId: row.account_id, date: row.transaction_date, notes: row.notes || '' };
  }
  function budgetFromRow(row) {
    return { id: row.id, month: row.budget_month, category: row.category, amount: Number(row.amount) };
  }

  async function loadState(options = {}) {
    if (!client || !user || loading) return;
    loading = true;
    try {
      const [accountsResult, transactionsResult, budgetsResult, settingsResult] = await Promise.all([
        client.from('accounts').select('*').eq('user_id', user.id).order('created_at'),
        client.from('transactions').select('*').eq('user_id', user.id).order('transaction_date', { ascending: false }),
        client.from('budgets').select('*').eq('user_id', user.id).order('budget_month', { ascending: false }),
        client.from('user_settings').select('currency').eq('user_id', user.id).maybeSingle()
      ]);
      const error = accountsResult.error || transactionsResult.error || budgetsResult.error || settingsResult.error;
      if (error) throw error;
      const next = {
        version: 3,
        settings: { currency: settingsResult.data?.currency || 'AED' },
        accounts: (accountsResult.data || []).map(accountFromRow),
        transactions: (transactionsResult.data || []).map(transactionFromRow),
        budgets: (budgetsResult.data || []).map(budgetFromRow)
      };
      cacheState(next);
      stateListener?.(next, { source: 'cloud', silent: options.silent });
    } finally { loading = false; }
  }

  function scheduleReload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => loadState({ silent: true }).catch(error => authListener?.({ type: 'error', message: error.message })), 220);
  }

  async function startRealtime() {
    if (!client || !user) return;
    if (channel) await client.removeChannel(channel);
    channel = client.channel(`finance-${user.id}`);
    for (const table of ['accounts', 'transactions', 'budgets', 'user_settings']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${user.id}` }, scheduleReload);
    }
    channel.subscribe(status => authListener?.({ type: 'sync', status }));
  }

  async function useSession(session) {
    user = session?.user || null;
    if (!user) {
      if (channel) await client.removeChannel(channel);
      channel = null;
      authListener?.({ type: 'signed-out' });
      return;
    }
    stateListener?.(cachedState(), { source: 'cache', silent: true });
    authListener?.({ type: 'signed-in', user });
    await loadState();
    await startRealtime();
  }

  async function init(callbacks = {}) {
    stateListener = callbacks.onState || null;
    authListener = callbacks.onAuth || null;
    if (!configured || !window.supabase?.createClient) {
      authListener?.({ type: 'configuration-error', message: 'Secure cloud connection is not configured.' });
      return;
    }
    client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user?.id !== user?.id) useSession(session).catch(reportError);
      if (event === 'SIGNED_OUT') useSession(null).catch(reportError);
      if (event === 'PASSWORD_RECOVERY') authListener?.({ type: 'password-recovery' });
    });
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    await useSession(data.session);
  }

  function reportError(error) { authListener?.({ type: 'error', message: error.message || 'Cloud connection failed.' }); }
  function requireUser() { if (!client || !user) throw new Error('Please sign in again.'); }

  async function signIn(email, password) {
    if (!client) throw new Error('Cloud connection is not configured.');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.session?.user?.id !== user?.id) await useSession(data.session);
  }

  async function signUp(email, password) {
    if (!client) throw new Error('Cloud connection is not configured.');
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: location.origin + location.pathname }
    });
    if (error) throw error;
    if (data.session?.user?.id !== user?.id) await useSession(data.session);
    return { needsConfirmation: !data.session };
  }

  async function resetPassword(email) {
    if (!client) throw new Error('Cloud connection is not configured.');
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) throw error;
  }

  async function updatePassword(password) {
    if (!client) throw new Error('Cloud connection is not configured.');
    const { error } = await client.auth.updateUser({ password });
    if (error) throw error;
  }

  async function signOut() {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async function upsertAccount(account) {
    requireUser();
    const { error } = await client.from('accounts').upsert({ id: account.id, user_id: user.id, name: account.name, type: account.type, opening_balance: account.openingBalance, colour: account.colour });
    if (error) throw error;
  }
  async function deleteAccount(accountId) { requireUser(); const { error } = await client.from('accounts').delete().eq('id', accountId).eq('user_id', user.id); if (error) throw error; }
  async function upsertTransaction(transaction) {
    requireUser();
    const { error } = await client.from('transactions').upsert({ id: transaction.id, user_id: user.id, type: transaction.type, amount: transaction.amount, description: transaction.description, category: transaction.category, account_id: transaction.accountId, transaction_date: transaction.date, notes: transaction.notes || '' });
    if (error) throw error;
  }
  async function deleteTransaction(transactionId) { requireUser(); const { error } = await client.from('transactions').delete().eq('id', transactionId).eq('user_id', user.id); if (error) throw error; }
  async function upsertBudget(budget) {
    requireUser();
    const { data, error } = await client.from('budgets').upsert({ id: budget.id, user_id: user.id, budget_month: budget.month, category: budget.category, amount: budget.amount }, { onConflict: 'user_id,budget_month,category' }).select('id').single();
    if (error) throw error;
    return data?.id || budget.id;
  }
  async function deleteBudget(budgetId) { requireUser(); const { error } = await client.from('budgets').delete().eq('id', budgetId).eq('user_id', user.id); if (error) throw error; }
  async function saveCurrency(currency) { requireUser(); const { error } = await client.from('user_settings').upsert({ user_id: user.id, currency }); if (error) throw error; }

  async function replaceAll(next) {
    requireUser();
    const transactionRows = next.transactions.map(t => ({ id: t.id, user_id: user.id, type: t.type, amount: t.amount, description: t.description, category: t.category, account_id: t.accountId, transaction_date: t.date, notes: t.notes || '' }));
    const accountRows = next.accounts.map(a => ({ id: a.id, user_id: user.id, name: a.name, type: a.type, opening_balance: a.openingBalance, colour: a.colour }));
    const budgetRows = next.budgets.map(b => ({ id: b.id, user_id: user.id, budget_month: b.month, category: b.category, amount: b.amount }));
    await clearAll(false);
    if (accountRows.length) { const { error } = await client.from('accounts').insert(accountRows); if (error) throw error; }
    if (transactionRows.length) { const { error } = await client.from('transactions').insert(transactionRows); if (error) throw error; }
    if (budgetRows.length) { const { error } = await client.from('budgets').insert(budgetRows); if (error) throw error; }
    await saveCurrency(next.settings?.currency || 'AED');
    await loadState();
  }

  async function clearAll(reload = true) {
    requireUser();
    for (const table of ['transactions', 'budgets', 'accounts', 'user_settings']) {
      const { error } = await client.from(table).delete().eq('user_id', user.id);
      if (error) throw error;
    }
    if (reload) await loadState();
  }

  window.addEventListener('online', () => loadState({ silent: true }).catch(reportError));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadState({ silent: true }).catch(reportError); });

  window.CloudSync = {
    init, signIn, signUp, signOut, resetPassword, updatePassword, loadState, upsertAccount, deleteAccount,
    upsertTransaction, deleteTransaction, upsertBudget, deleteBudget, saveCurrency, replaceAll, clearAll,
    get user() { return user; }, get configured() { return configured; }
  };
})();
