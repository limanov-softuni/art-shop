export function renderNavigation() {
  return `
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark" aria-label="Primary navigation">
      <div class="container">
        <a class="navbar-brand" href="/">Art Shop</a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#primaryNav" aria-controls="primaryNav" aria-expanded="false" aria-label="Toggle navigation">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="primaryNav">
          <ul class="navbar-nav me-auto mb-2 mb-lg-0">
            <li class="nav-item"><a class="nav-link" href="/products/">Products</a></li>
            <li class="nav-item"><a class="nav-link" href="/my-orders/">My orders</a></li>
            <li class="nav-item"><a class="nav-link" href="/account/">Account</a></li>
            <li class="nav-item"><a class="nav-link" href="/admin/">Admin</a></li>
          </ul>
          <div class="d-flex gap-2">
            <a class="btn btn-outline-light btn-sm" href="/login/">Log in</a>
            <a class="btn btn-warning btn-sm" href="/register/">Register</a>
          </div>
        </div>
      </div>
    </nav>
  `;
}
