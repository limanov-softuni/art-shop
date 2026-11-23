import 'bootstrap';
import 'bootstrap-icons/font/bootstrap-icons.css';
import '../styles/main.css';
import { renderPageShell } from '../components/page-shell.js';
import { initializeToastContainer } from '../components/ui.js';

export function initializePage(title, description) {
  initializeToastContainer();
  renderPageShell(title, description);
}
