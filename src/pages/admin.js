import { initializePage } from './common.js';
import { supabase, supabaseConfigurationError } from '../services/supabase.js';
import { renderEmptyState } from '../components/ui.js';

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
    <div class="admin-dashboard-grid">
      <a class="admin-dashboard-card" href="/admin/products/">
        <span class="admin-dashboard-icon" aria-hidden="true"><i class="bi bi-palette"></i></span>
        <div>
          <h2 class="h4">Products</h2>
          <p class="mb-0">Create, edit, publish, deactivate, and delete unreferenced products.</p>
        </div>
      </a>
      <a class="admin-dashboard-card" href="/admin/orders/">
        <span class="admin-dashboard-icon" aria-hidden="true"><i class="bi bi-receipt"></i></span>
        <div>
          <h2 class="h4">Orders</h2>
          <p class="mb-0">Review and administer persisted customer orders.</p>
        </div>
      </a>
    </div>
  `;
}

loadDashboard();
