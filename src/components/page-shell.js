import { renderNavigation } from './navigation.js';

export function renderPageShell(title, description = '') {
  document.title = `${title} | Art Shop`;

  const app = document.querySelector('#app');
  app.innerHTML = `
    ${renderNavigation()}
    <main class="container py-5">
      <div class="row">
        <div class="col-lg-9">
          <h1 class="mb-3">${title}</h1>
          ${description ? `<p class="lead text-secondary">${description}</p>` : ''}
          <div id="page-content">
            <div class="alert alert-light border" role="status">
              This page is ready for the next implementation milestone.
            </div>
          </div>
        </div>
      </div>
    </main>
  `;
}
