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
  setNavigationState({ authenticated: Boolean(data?.session) });
  setFooterAuthLinks(Boolean(data?.session));
  attachLogoutHandlers();

  supabase.auth.onAuthStateChange((_event, session) => {
    setNavigationState({ authenticated: Boolean(session) });
    setFooterAuthLinks(Boolean(session));
    attachLogoutHandlers();
  });
}

function setFooterAuthLinks(authenticated) {
  document.querySelectorAll('[data-footer-auth-links]').forEach((container) => {
    container.innerHTML = authenticated
      ? `
        <a href="/my-orders/">My Orders</a>
        <a href="/account/">Account</a>
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
