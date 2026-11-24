import 'bootstrap';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '../styles/main.css';
import { renderPageShell } from '../components/page-shell.js';
import { initializeToastContainer } from '../components/ui.js';
import { supabase } from '../services/supabase.js';
import { setNavigationState } from '../components/navigation.js';

export function initializePage(title, description) {
  initializeToastContainer();
  renderPageShell(title, description);
  syncAuthNavigation();
}

async function syncAuthNavigation() {
  if (!supabase) return;

  const { data } = await supabase.auth.getSession();
  await applySessionNavigation(data?.session ?? null);
  attachLogoutHandlers();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    await applySessionNavigation(session);
    attachLogoutHandlers();
  });
}

async function applySessionNavigation(session) {
  const authenticated = Boolean(session);
  let admin = false;

  if (authenticated) {
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id)
      .maybeSingle();
    admin = role?.role === 'admin';
  }

  setNavigationState({ authenticated, admin });
  setFooterAuthLinks(authenticated, admin);
}

function setFooterAuthLinks(authenticated, admin = false) {
  document.querySelectorAll('[data-footer-auth-links]').forEach((container) => {
    container.innerHTML = authenticated
      ? `
        <a href="/my-orders/">My Orders</a>
        <a href="/account/">Account</a>
        ${admin ? '<a href="/admin/">Administration</a>' : ''}
      `
      : `
        <a href="/login/">Login</a>
        <a href="/register/">Register</a>
      `;
  });
}

function attachLogoutHandlers() {
  document.querySelectorAll('[data-logout]').forEach((button) => {
    button.addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.assign('/');
    });
  });
}
