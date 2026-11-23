import { initializePage } from './common.js';
import { supabase, supabaseConfigurationError } from '../services/supabase.js';
import { escapeText, formatEUR, renderEmptyState, renderSkeletonCards, showToast } from '../components/ui.js';

initializePage('Administration', 'Manage the Art Shop catalog and orders.');

const pageContent = document.querySelector('#page-content');

async function requireAdmin() {
  if (!supabase) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Administration unavailable',
      message: supabaseConfigurationError,
      icon: 'bi-exclamation-circle',
    });
    return false;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session) {
    window.location.replace('/login/?return=/admin/');
    return false;
  }

  const { data: role, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', sessionData.session.user.id)
    .maybeSingle();

  if (error || role?.role !== 'admin') {
    pageContent.innerHTML = `
      <div class="empty-state" role="alert">
        <span class="empty-state-icon" aria-hidden="true"><i class="bi bi-shield-lock"></i></span>
        <h2 class="h4">Administrator access required</h2>
        <p>This area is unavailable for the current account.</p>
        <a class="btn btn-primary" href="/">Return home</a>
      </div>
    `;
    return false;
  }

  return true;
}

async function loadDashboard() {
  if (!await requireAdmin()) return;
  pageContent.innerHTML = `
    <div class="admin-day-picker">
      <label class="form-label" for="dashboard-day">Orders for day</label>
      <input id="dashboard-day" class="form-control" type="date" value="${new Date().toISOString().slice(0, 10)}">
    </div>
    <div id="admin-dashboard-summary">${renderSkeletonCards(3)}</div>
    <div class="admin-dashboard-grid">
      <a class="admin-dashboard-card" href="/admin/products/">
        <span class="admin-dashboard-icon" aria-hidden="true"><i class="bi bi-palette"></i></span>
        <div><h2 class="h4">Products</h2><p class="mb-0">Create, edit, publish, deactivate, and delete unreferenced products.</p></div>
      </a>
      <a class="admin-dashboard-card" href="/admin/orders/">
        <span class="admin-dashboard-icon" aria-hidden="true"><i class="bi bi-receipt"></i></span>
        <div><h2 class="h4">Orders</h2><p class="mb-0">Review and administer persisted customer orders.</p></div>
      </a>
    </div>
  `;

  const dayInput = document.querySelector('#dashboard-day');
  const summary = document.querySelector('#admin-dashboard-summary');

  async function loadSummary() {
    summary.innerHTML = renderSkeletonCards(3);
    const { data, error } = await supabase.rpc('admin_dashboard', {
      p_day: dayInput.value || null,
    });
    if (error || data?.status !== 'success') {
      summary.innerHTML = renderEmptyState({
        title: 'Summary unavailable',
        message: error?.message || data?.message || 'The dashboard summary could not be loaded.',
        icon: 'bi-wifi-off',
      });
      showToast('Could not load dashboard summary.', { type: 'error' });
      return;
    }

    summary.innerHTML = `
      <div class="admin-summary-grid">
        <article class="admin-summary-card">
          <span>Published products</span>
          <strong>${data.published_products}</strong>
        </article>
        <article class="admin-summary-card">
          <span>Confirmed orders</span>
          <strong>${data.confirmed_orders}</strong>
        </article>
        <article class="admin-summary-card">
          <span>Confirmed order value</span>
          <strong>${formatEUR(data.confirmed_order_value)}</strong>
        </article>
        <article class="admin-summary-card">
          <span>Orders for ${escapeText(data.selected_day)}</span>
          <strong>${data.orders_for_day}</strong>
        </article>
      </div>
    `;
  }

  dayInput.addEventListener('change', loadSummary);
  await loadSummary();
}

loadDashboard();
