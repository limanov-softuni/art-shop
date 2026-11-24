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
  attachLogoutHandlers();

  supabase.auth.onAuthStateChange((_event, session) => {
    setNavigationState({ authenticated: Boolean(session) });
    attachLogoutHandlers();
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
