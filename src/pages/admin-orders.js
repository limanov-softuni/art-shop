import { initializePage } from './common.js';
import { supabase, supabaseConfigurationError } from '../services/supabase.js';
import {
  escapeText,
  formatEUR,
  openConfirmation,
  renderEmptyState,
  renderSkeletonCards,
  showToast,
} from '../components/ui.js';

initializePage('Admin: Orders', 'Review and administer persisted customer orders.');

const pageContent = document.querySelector('#page-content');
const pageSize = 10;
const params = new URLSearchParams(window.location.search);

async function requireAdmin() {
  if (!supabase) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Administration unavailable',
      message: supabaseConfigurationError,
      icon: 'bi-exclamation-circle',
    });
    return false;
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session) {
    window.location.replace('/login/?return=/admin/orders/');
    return false;
  }
  const { data: role, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', sessionData.session.user.id)
    .maybeSingle();
  if (error || role?.role !== 'admin') {
    pageContent.innerHTML = `
      <div class="empty-state" role="alert">
        <span class="empty-state-icon" aria-hidden="true"><i class="bi bi-shield-lock"></i></span>
        <h2 class="h4">Administrator access required</h2>
        <p>This area is unavailable for the current account.</p>
        <a class="btn btn-primary" href="/">Return home</a>
      </div>
    `;
    return false;
  }
  return true;
}

function buildUrl(productId, orderDate, status, reference, page) {
  const next = new URLSearchParams();
  if (productId) next.set('product', productId);
  if (orderDate) next.set('date', orderDate);
  if (status !== 'all') next.set('status', status);
  if (reference) next.set('reference', reference);
  if (page > 1) next.set('page', String(page));
  return `/admin/orders/${next.size ? `?${next.toString()}` : ''}`;
}

async function loadAdminOrders() {
  if (!await requireAdmin()) return;

  const statusParam = params.get('status') ?? 'all';
  const status = ['all', 'confirmed', 'completed', 'cancelled'].includes(statusParam) ? statusParam : 'all';
  const productId = params.get('product')?.trim() ?? '';
  const orderDate = params.get('date')?.trim() ?? '';
  const reference = params.get('reference')?.trim() ?? '';
  const pageRaw = params.get('page') ?? '1';
  const page = /^[1-9]\d*$/.test(pageRaw) ? Number(pageRaw) : 1;

  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id,name')
    .order('name', { ascending: true })
    .order('id', { ascending: true });
  if (productsError) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Orders unavailable',
      message: 'We could not load the product filter.',
      icon: 'bi-wifi-off',
    });
    return;
  }

  pageContent.innerHTML = `
    <form id="admin-order-filters" class="admin-order-filters">
      <div class="row g-3">
        <div class="col-12 col-lg-3">
          <label class="form-label" for="admin-order-product">Product</label>
          <select id="admin-order-product" class="form-select" name="product">
            <option value="">All products</option>
            ${(products ?? []).map((product) => `
              <option value="${escapeText(product.id)}"${productId === product.id ? ' selected' : ''}>
                ${escapeText(product.name)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="col-12 col-sm-6 col-lg-2">
          <label class="form-label" for="admin-order-date">Creation date</label>
          <input id="admin-order-date" class="form-control" type="date" name="date"
            value="${escapeText(orderDate)}">
        </div>
        <div class="col-12 col-sm-6 col-lg-2">
          <label class="form-label" for="admin-order-status">Status</label>
          <select id="admin-order-status" class="form-select" name="status">
            ${[['all','All'],['confirmed','Confirmed'],['completed','Completed'],['cancelled','Cancelled']].map(([value,label]) => `
              <option value="${value}"${status === value ? ' selected' : ''}>${label}</option>
            `).join('')}
          </select>
        </div>
        <div class="col-12 col-lg-3">
          <label class="form-label" for="admin-order-reference">Reference search</label>
          <input id="admin-order-reference" class="form-control" name="reference"
            maxlength="100" value="${escapeText(reference)}" placeholder="AS-...">
        </div>
        <div class="col-12 col-lg-2 d-flex align-items-end">
          <button class="btn btn-primary w-100" type="submit">Apply</button>
        </div>
      </div>
    </form>
    <div id="admin-order-results" aria-live="polite">${renderSkeletonCards(6)}</div>
  `;

  document.querySelector('#admin-order-filters').addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextProduct = String(formData.get('product') ?? '').trim();
    const nextDate = String(formData.get('date') ?? '').trim();
    const nextStatus = String(formData.get('status') ?? 'all');
    const nextReference = String(formData.get('reference') ?? '').trim();
    window.location.assign(buildUrl(nextProduct, nextDate, nextStatus, nextReference, 1));
  });

  const results = document.querySelector('#admin-order-results');

  let selectedProductUuid = null;
  if (productId) {
    if (/^[0-9a-f-]{36}$/i.test(productId)) selectedProductUuid = productId;
  }
  let selectedDate = null;
  if (orderDate) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) selectedDate = orderDate;
  }

  const { data, error } = await supabase.rpc('admin_search_orders', {
    p_status: status === 'all' ? null : status,
    p_product_id: selectedProductUuid,
    p_order_date: selectedDate,
    p_reference: reference || null,
    p_page: page,
    p_page_size: pageSize,
  });

  if (error || data?.status !== 'success') {
    results.innerHTML = renderEmptyState({
      title: 'Orders unavailable',
      message: error?.message || data?.message || 'The order list could not be loaded.',
      icon: 'bi-wifi-off',
    });
    showToast('Could not load admin orders.', { type: 'error' });
    return;
  }

  if (data.total_count === 0) {
    results.innerHTML = renderEmptyState({
      title: 'No matching orders',
      message: 'Change or clear the filters to see persisted orders.',
      icon: 'bi-inbox',
    });
    return;
  }

  if (page > data.page_count) {
    results.innerHTML = `
      <div class="empty-state" role="status">
        <h2 class="h4">Page out of range</h2>
        <p>There are ${data.total_count} matching orders across ${data.page_count} pages.</p>
        <a class="btn btn-primary" href="${escapeText(buildUrl(productId, orderDate, status, reference, 1))}">Return to page 1</a>
      </div>
    `;
    return;
  }

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, data.total_count);
  const pages = [];
  const firstPage = Math.max(1, page - 2);
  const lastPage = Math.min(data.page_count, page + 2);
  for (let number = firstPage; number <= lastPage; number += 1) {
    pages.push(`
      <a class="catalog-page-link${number === page ? ' active' : ''}"
        href="${escapeText(buildUrl(productId, orderDate, status, reference, number))}"
        ${number === page ? 'aria-current="page"' : ''}>${number}</a>
    `);
  }

  results.innerHTML = `
    <div class="orders-summary">
      <strong>${data.total_count}</strong> matching order${data.total_count === 1 ? '' : 's'}
      <span aria-hidden="true">·</span> Showing ${first}-${last}
    </div>
    <div class="admin-orders-list">
      ${data.orders.map((order) => {
        const created = new Date(order.created_at);
        const cancelled = order.cancelled_at ? new Date(order.cancelled_at) : null;
        const completed = order.completed_at ? new Date(order.completed_at) : null;
        return `
          <article class="admin-order-row">
            <div class="admin-order-main">
              <p class="eyebrow mb-1">${escapeText(order.reference)}</p>
              <h2 class="h4 mb-1">${escapeText(order.product_name)}</h2>
              <p class="text-secondary mb-2">Client: ${escapeText(order.client_name)}</p>
              <dl class="admin-order-dates">
                <div><dt>Created</dt><dd>${escapeText(created.toLocaleString())}</dd></div>
                <div><dt>Completion date</dt><dd>Not tracked for confirmed orders</dd></div>
                ${cancelled ? `<div><dt>Cancelled at</dt><dd>${escapeText(cancelled.toLocaleString())}</dd></div>` : ''}
                ${completed ? `<div><dt>Completed at</dt><dd>${escapeText(completed.toLocaleString())}</dd></div>` : ''}
              </dl>
            </div>
            <div class="admin-order-side">
              <span class="badge ${order.status === 'confirmed' ? 'badge-success' : 'badge-neutral'}">
                ${order.status === 'confirmed' ? 'Confirmed' : order.status === 'completed' ? 'Completed' : 'Cancelled'}
              </span>
              <strong>${formatEUR(order.saved_price)}</strong>
              <div class="admin-order-actions">
                <a class="btn btn-secondary btn-sm"
                  href="/order-details/?id=${encodeURIComponent(order.id)}">View details</a>
                ${order.status === 'confirmed'
                  ? `
                    <button class="btn btn-primary btn-sm" type="button"
                      data-admin-complete="${escapeText(order.id)}"
                      data-admin-reference="${escapeText(order.reference)}">Complete</button>
                    <button class="btn btn-outline-danger btn-sm" type="button"
                      data-admin-cancel="${escapeText(order.id)}"
                      data-admin-reference="${escapeText(order.reference)}">Cancel</button>
                  `
                  : ''}
              </div>
            </div>
          </article>
        `;
      }).join('')}
    </div>
    ${data.page_count > 1 ? `
      <nav class="catalog-pagination" aria-label="Admin order pages">
        <a class="btn btn-secondary btn-sm${page === 1 ? ' disabled' : ''}"
          href="${page === 1 ? '#' : escapeText(buildUrl(productId, orderDate, status, reference, page - 1))}"
          ${page === 1 ? 'aria-disabled="true" tabindex="-1"' : ''}>Previous</a>
        ${pages.join('')}
        <a class="btn btn-secondary btn-sm${page >= data.page_count ? ' disabled' : ''}"
          href="${page >= data.page_count ? '#' : escapeText(buildUrl(productId, orderDate, status, reference, page + 1))}"
          ${page >= data.page_count ? 'aria-disabled="true" tabindex="-1"' : ''}>Next</a>
      </nav>
    ` : ''}
  `;

  results.querySelectorAll('[data-admin-cancel]').forEach((button) => {
    button.addEventListener('click', async () => {
      const outcome = await openConfirmation({
        title: 'Cancel confirmed order?',
        message: `Cancel order ${button.dataset.adminReference}? The persisted order will remain and the product will become available again.`,
        confirmLabel: 'Cancel order',
        cancelLabel: 'Keep order',
        destructive: true,
        reasonField: true,
        reasonLabel: 'Cancellation reason',
        reasonRequired: true,
      });
      if (!outcome?.confirmed) return;

      button.disabled = true;
      const { data: cancelData, error: cancelError } = await supabase.rpc('cancel_order', {
        p_order_id: button.dataset.adminCancel,
        p_reason: outcome.reason,
      });
      if (cancelError) {
        showToast(cancelError.message || 'Cancellation failed.', { type: 'error' });
        button.disabled = false;
        return;
      }
      if (cancelData?.status === 'cancelled') {
        showToast('Order cancelled and availability refreshed.', { type: 'success' });
      } else if (cancelData?.status === 'already_cancelled') {
        showToast('This order was already cancelled.', { type: 'info' });
      } else {
        showToast(cancelData?.message || 'Cancellation could not be completed.', { type: 'error' });
        button.disabled = false;
        return;
      }
      await loadAdminOrders();
    });
  });

  results.querySelectorAll('[data-admin-complete]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = await openConfirmation({
        title: 'Complete this order?',
        message: `Mark order ${button.dataset.adminReference} as completed after the product has been sent to the client.`,
        confirmLabel: 'Complete order',
        cancelLabel: 'Keep confirmed',
        destructive: false,
      });
      if (!confirmed) return;

      button.disabled = true;
      const { data: completeData, error: completeError } = await supabase.rpc('complete_order', {
        p_order_id: button.dataset.adminComplete,
      });
      if (completeError) {
        showToast(completeError.message || 'Order could not be completed.', { type: 'error' });
        button.disabled = false;
        return;
      }
      if (completeData?.status === 'completed') {
        showToast('Order marked as completed.', { type: 'success' });
      } else if (completeData?.status === 'already_completed') {
        showToast('This order was already completed.', { type: 'info' });
      } else {
        showToast(completeData?.message || 'Order could not be completed.', { type: 'error' });
        button.disabled = false;
        return;
      }
      await loadAdminOrders();
    });
  });
}

loadAdminOrders();
