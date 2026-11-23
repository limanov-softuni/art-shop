import 'bootstrap';
import '../styles/main.css';
import { renderPageShell } from '../components/page-shell.js';

export function initializePage(title, description) {
  renderPageShell(title, description);
}
