export function escapeText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatEUR(value) {
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value) || 0);
}

export function renderProductCard({
  title = 'Untitled artwork',
  description = '',
  price = null,
  imageLabel = 'Product image placeholder',
  imageUrl = null,
  href = '/product/',
  available = null,
  actionLabel = null,
  actionHref = null,
} = {}) {
  const priceMarkup = price === null
    ? '<span class="product-card-price is-placeholder">Price placeholder</span>'
    : `<span class="product-card-price">${formatEUR(price)}</span>`;
  const availability = available === null
    ? '<span class="badge badge-neutral">Availability pending</span>'
    : available
      ? '<span class="badge badge-success">Available</span>'
      : '<span class="badge badge-neutral">Unavailable</span>';
  const imageMarkup = imageUrl
    ? `
      <img class="product-card-photo" src="${escapeText(imageUrl)}"
        alt="${escapeText(imageLabel)}" loading="lazy" data-product-image>
      <span class="product-image-placeholder" role="img"
        aria-label="${escapeText(imageLabel)}" data-image-fallback hidden>
        <i class="bi bi-image" aria-hidden="true"></i>
        <span>Image unavailable</span>
      </span>
    `
    : `
      <span class="product-image-placeholder" role="img"
        aria-label="${escapeText(imageLabel)}">
        <i class="bi bi-image" aria-hidden="true"></i>
        <span>Image unavailable</span>
      </span>
    `;
  const actionMarkup = actionLabel && actionHref
    ? `
      <a class="btn ${available === false ? 'btn-secondary' : 'btn-primary'} btn-sm"
        href="${escapeText(actionHref)}"${available === false ? ' aria-disabled="true"' : ''}>
        ${escapeText(actionLabel)}
      </a>
    `
    : '';

  return `
    <article class="product-card">
      <a class="product-card-image" href="${escapeText(href)}" aria-label="View ${escapeText(title)}">
        ${imageMarkup}
      </a>
      <div class="product-card-body">
        <div class="d-flex align-items-start justify-content-between gap-3 mb-2">
          <h2 class="h5 product-card-title">
            <a href="${escapeText(href)}">${escapeText(title)}</a>
          </h2>
          ${availability}
        </div>
        ${description ? `<p class="product-card-description">${escapeText(description)}</p>` : ''}
        <div class="product-card-footer">
          ${priceMarkup}
          ${actionMarkup}
        </div>
      </div>
    </article>
  `;
}

export function renderSkeletonCards(count = 3) {
  return `
    <div class="row g-4" aria-label="Loading products" aria-busy="true">
      ${Array.from({ length: count }, () => `
        <div class="col-12 col-md-6 col-lg-4">
          <div class="product-card skeleton-card" aria-hidden="true">
            <div class="skeleton skeleton-image"></div>
            <div class="product-card-body">
              <div class="skeleton skeleton-line skeleton-line-wide"></div>
              <div class="skeleton skeleton-line skeleton-line-short"></div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderEmptyState({
  title = 'Nothing to show',
  message = 'There are no items to display in this view.',
  icon = 'bi-inbox',
} = {}) {
  return `
    <div class="empty-state" role="status">
      <span class="empty-state-icon" aria-hidden="true"><i class="bi ${icon}"></i></span>
      <h2 class="h4">${escapeText(title)}</h2>
      <p>${escapeText(message)}</p>
    </div>
  `;
}

export function renderFieldError(message) {
  return `<div class="invalid-feedback d-block">${escapeText(message)}</div>`;
}

export function initializeToastContainer() {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container position-fixed top-0 end-0 p-3';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-label', 'Notifications');
    document.body.appendChild(container);
  }
  return container;
}

export function showToast(message, { type = 'info', duration = 5000 } = {}) {
  const container = initializeToastContainer();
  const toast = document.createElement('div');
  const icon = type === 'error' ? 'bi-exclamation-circle' : type === 'success' ? 'bi-check-circle' : 'bi-info-circle';
  toast.className = `app-toast app-toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.innerHTML = `
    <i class="bi ${icon}" aria-hidden="true"></i>
    <span></span>
    <button type="button" class="toast-close" aria-label="Dismiss notification">
      <i class="bi bi-x" aria-hidden="true"></i>
    </button>
  `;
  toast.querySelector('span').textContent = message;
  const dismiss = () => toast.remove();
  toast.querySelector('button').addEventListener('click', dismiss);
  container.appendChild(toast);
  window.setTimeout(dismiss, duration);
  return toast;
}

export function openConfirmation({
  title = 'Confirm action',
  message = 'Are you sure you want to continue?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  reasonField = false,
  reasonLabel = 'Reason',
  reasonRequired = false,
} = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog';
    dialog.setAttribute('aria-labelledby', 'confirmation-title');
    dialog.setAttribute('aria-describedby', 'confirmation-message');
    dialog.innerHTML = `
      <form method="dialog" class="app-dialog-card">
        <div class="app-dialog-icon" aria-hidden="true">
          <i class="bi ${destructive ? 'bi-exclamation-triangle' : 'bi-question-circle'}"></i>
        </div>
        <h2 id="confirmation-title" class="h4"></h2>
        <p id="confirmation-message"></p>
        ${reasonField ? `
          <div class="app-dialog-reason">
            <label class="form-label" for="confirmation-reason"></label>
            <textarea id="confirmation-reason" class="form-control" rows="3"
              maxlength="500"></textarea>
            <div class="invalid-feedback" id="confirmation-reason-error"></div>
          </div>
        ` : ''}
        <div class="app-dialog-actions">
          <button type="button" class="btn btn-secondary" data-dialog-cancel></button>
          <button type="button" class="btn ${destructive ? 'btn-danger' : 'btn-primary'}" data-dialog-confirm></button>
        </div>
      </form>
    `;
    dialog.querySelector('#confirmation-title').textContent = title;
    dialog.querySelector('#confirmation-message').textContent = message;
    dialog.querySelector('[data-dialog-cancel]').textContent = cancelLabel;
    dialog.querySelector('[data-dialog-confirm]').textContent = confirmLabel;
    if (reasonField) {
      dialog.querySelector('.app-dialog-reason label').textContent = reasonLabel;
      dialog.querySelector('#confirmation-reason').required = reasonRequired;
    }

    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };

    dialog.querySelector('[data-dialog-cancel]').addEventListener('click', () => settle(false));
    dialog.querySelector('[data-dialog-confirm]').addEventListener('click', () => {
      if (reasonField) {
        const reason = dialog.querySelector('#confirmation-reason').value.trim();
        const error = dialog.querySelector('#confirmation-reason-error');
        if (reasonRequired && !reason) {
          dialog.querySelector('#confirmation-reason').classList.add('is-invalid');
          error.textContent = 'A reason is required.';
          dialog.querySelector('#confirmation-reason').focus();
          return;
        }
        settle({
          confirmed: true,
          reason,
        });
        return;
      }
      settle(true);
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      settle(false);
    });
    document.body.appendChild(dialog);
    dialog.showModal();
    dialog.querySelector('[data-dialog-cancel]').focus();
  });
}
