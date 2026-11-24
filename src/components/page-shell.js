import { renderNavigation } from './navigation.js';

export function renderPageShell(title, description = '') {
  document.title = `${title} | Art Shop`;

  const app = document.querySelector('#app');
  if (!app) return;

  app.innerHTML = `
    ${renderNavigation()}
    <main id="main-content" class="page-main">
      <div class="container page-container">
        <section class="page-heading" aria-labelledby="page-title">
          <p class="eyebrow">Art Shop</p>
          <h1 id="page-title">${title}</h1>
          ${description ? `<p class="page-description">${description}</p>` : ''}
        </section>
        <div id="page-content" class="page-content" aria-live="polite">
          <div class="placeholder-panel">
            <span class="placeholder-icon" aria-hidden="true"><i class="bi bi-hourglass-split"></i></span>
            <div>
              <h2 class="h5 mb-1">Placeholder content</h2>
              <p class="mb-0">This section is prepared for the next implementation milestone.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
    ${renderFooter()}
  `;
}

export function renderFooter() {
  const year = new Date().getFullYear();
  return `
    <footer class="site-footer">
      <div class="container page-container">
        <div class="footer-grid">
          <div>
            <a class="footer-brand" href="/">Art Shop</a>
            <p>Curated art for considered spaces.</p>
          </div>
          <nav aria-label="Footer navigation" data-footer-navigation>
            <a href="/products/">Products</a>
            <span data-footer-auth-links>
              <a href="/login/">Login</a>
              <a href="/register/">Register</a>
            </span>
          </nav>
        </div>
        <div class="footer-meta">
          <small>&copy; ${year} Art Shop</small>
          <small>Prices in EUR</small>
        </div>
      </div>
    </footer>
  `;
}
