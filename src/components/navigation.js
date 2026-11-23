let navigationState = { authenticated: false };

export function setNavigationState(nextState = {}) {
  navigationState = { authenticated: false, ...nextState };
  document.querySelectorAll('[data-auth-navigation]').forEach((node) => node.remove());
}

export function renderNavigation(state = navigationState) {
  navigationState = state;
  const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';

  const navLink = (href, label) => {
    const normalizedHref = href.replace(/\/+$/, '') || '/';
    const active = currentPath === normalizedHref;
    return `
      <li class="nav-item">
        <a class="nav-link${active ? ' active' : ''}" href="${href}"${active ? ' aria-current="page"' : ''}>
          ${label}
        </a>
      </li>
    `;
  };

  const publicLinks = `${navLink('/', 'Home')}${navLink('/products/', 'Products')}`;
  const authenticatedLinks = `
    ${navLink('/my-orders/', 'My Orders')}
    ${navLink('/account/', 'Account')}
  `;

  return `
    <header class="site-header">
      <nav class="navbar navbar-expand-lg" aria-label="Primary navigation">
        <div class="container page-container">
          <a class="navbar-brand d-flex align-items-center gap-2" href="/" aria-label="Art Shop home">
            <span class="brand-mark" aria-hidden="true"><i class="bi bi-palette2"></i></span>
            <span>Art Shop</span>
          </a>
          <button class="navbar-toggler" type="button" data-bs-toggle="collapse"
            data-bs-target="#primaryNav" aria-controls="primaryNav" aria-expanded="false"
            aria-label="Open navigation menu">
            <i class="bi bi-list" aria-hidden="true"></i>
          </button>
          <div class="collapse navbar-collapse" id="primaryNav">
            <ul class="navbar-nav mx-lg-auto mb-3 mb-lg-0">
              ${publicLinks}
              ${navigationState.authenticated ? authenticatedLinks : ''}
            </ul>
            <div class="d-flex align-items-center gap-2" data-auth-navigation>
              ${navigationState.authenticated
                ? '<button class="btn btn-outline-dark btn-sm" type="button" data-logout>Logout</button>'
                : `
                  <a class="btn btn-ghost btn-sm" href="/login/">Login</a>
                  <a class="btn btn-primary btn-sm" href="/register/">Register</a>
                `}
            </div>
          </div>
        </div>
      </nav>
    </header>
  `;
}
