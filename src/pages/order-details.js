import { initializePage } from './common.js';
import { supabase, supabaseConfigurationError } from '../services/supabase.js';
import { getProductImagePublicUrl } from '../utils/storage-images.js';
import {
  escapeText,
  formatEUR,
  openConfirmation,
  renderEmptyState,
  renderSkeletonCards,
  showToast,
} from '../components/ui.js';

initializePage('Order details', 'View the saved order summary and authorized event history.');

const pageContent = document.querySelector('#page-content');
if (!pageContent) throw new Error('Page content element was not found.');

const orderId = new URLSearchParams(window.location.search).get('id')?.trim() ?? '';
let activeRequest = 0;

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function publicImageUrl(storagePath) {
  return getProductImagePublicUrl(supabase, storagePath);
}

async function loadOrderDetails() {
  const requestId = ++activeRequest;
  pageContent.innerHTML = renderSkeletonCards(1);

  if (!supabase) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Order unavailable',
      message: supabaseConfigurationError,
      icon: 'bi-exclamation-circle',
    });
    return;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (requestId !== activeRequest) return;
  if (sessionError || !sessionData?.session) {
    const loginParams = new URLSearchParams();
    loginParams.set('return', window.location.pathname + window.location.search);
    window.location.replace(`/login/?${loginParams.toString()}`);
    return;
  }

  if (!isUuid(orderId)) {
    pageContent.innerHTML = `
      <div class="empty-state" role="alert">
        <span class="empty-state-icon" aria-hidden="true"><i class="bi bi-exclamation-triangle"></i></span>
        <h2 class="h4">Invalid order link</h2>
        <p>The order identifier is missing or invalid.</p>
        <a class="btn btn-primary" href="/my-orders/">Back to My Orders</a>
      </div>
    `;
    return;
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(`
      id,
      reference,
      user_id,
      product_id,
      status,
      total_price,
      currency,
      client_name,
      contact_phone,
      special_requests,
      product_name_snapshot,
      created_at,
      cancelled_at,
      products (
        id,
        name,
        is_active,
        product_images (
          storage_path,
          alt_text,
          position,
          is_cover
        )
      )
    `)
    .eq('id', orderId)
    .maybeSingle();

  if (requestId !== activeRequest) return;
  if (orderError) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Order unavailable',
      message: 'We could not load this order.',
      icon: 'bi-wifi-off',
    });
    showToast('Could not load order details.', { type: 'error' });
    return;
  }
  if (!order) {
    pageContent.innerHTML = `
      <div class="empty-state" role="status">
        <span class="empty-state-icon" aria-hidden="true"><i class="bi bi-shield-exclamation"></i></span>
        <h2 class="h4">Order not found</h2>
        <p>This order is unavailable or belongs to another account.</p>
        <a class="btn btn-primary" href="/my-orders/">Back to My Orders</a>
      </div>
    `;
    return;
  }

  const { data: events, error: eventsError } = await supabase
    .from('order_events')
    .select('id, actor_id, event_type, details, created_at')
    .eq('order_id', order.id)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (requestId !== activeRequest) return;
  if (eventsError) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Order events unavailable',
      message: 'The order loaded, but authorized event history could not be loaded.',
      icon: 'bi-wifi-off',
    });
    return;
  }

  const images = [...(order.products?.product_images ?? [])]
    .sort((a, b) => {
      if (a.is_cover !== b.is_cover) return a.is_cover ? -1 : 1;
      return (a.position ?? 0) - (b.position ?? 0);
    });
  const imageUrl = images[0]
    ? publicImageUrl(images[0].storage_path)
    : null;
  const createdAt = new Date(order.created_at);
  const cancellationAt = new Date(order.created_at);
  cancellationAt.setHours(cancellationAt.getHours() + 24);
  const now = new Date();
  const canCancelAsGuest = order.status === 'confirmed'
    && now <= cancellationAt;

  pageContent.innerHTML = `
    <nav aria-label="Order context" class="product-detail-breadcrumb">
      <a class="btn btn-ghost btn-sm" href="/my-orders/">
        <i class="bi bi-arrow-left me-2" aria-hidden="true"></i>Back to My Orders
      </a>
    </nav>
    <article class="order-detail-layout">
      <section class="order-detail-summary" aria-labelledby="order-summary-heading">
        ${imageUrl
          ? `<img class="order-detail-image" src="${escapeText(imageUrl)}"
              alt="${escapeText(images[0]?.alt_text || order.product_name_snapshot)}">`
          : `
            <span class="product-image-placeholder" role="img"
              aria-label="No image available for ${escapeText(order.product_name_snapshot)}">
              <i class="bi bi-image" aria-hidden="true"></i>
              <span>Image unavailable</span>
            </span>
          `}
        <div class="order-detail-summary-body">
          <p class="eyebrow mb-2">${escapeText(order.reference)}</p>
          <h2 id="order-summary-heading" class="h3">${escapeText(order.product_name_snapshot)}</h2>
          <div class="order-detail-status">
            <span class="badge ${order.status === 'confirmed' ? 'badge-success' : 'badge-neutral'}">
              ${order.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
            </span>
          </div>
          <p class="text-secondary">Confirmed is an order state, not a completed order.</p>
          <div class="order-detail-price">
            <span>Saved EUR amount</span>
            <strong>${formatEUR(order.total_price)}</strong>
          </div>
          <dl class="confirmation-details">
            <div><dt>Placed</dt><dd>${escapeText(createdAt.toLocaleString())}</dd></div>
            <div><dt>Client name</dt><dd>${escapeText(order.client_name)}</dd></div>
            <div><dt>Phone</dt><dd>${escapeText(order.contact_phone || 'Not provided')}</dd></div>
            <div><dt>Special requests</dt><dd>${escapeText(order.special_requests || 'None')}</dd></div>
            ${order.cancelled_at ? `<div><dt>Cancelled</dt><dd>${escapeText(new Date(order.cancelled_at).toLocaleString())}</dd></div>` : ''}
          </dl>
        </div>
      </section>
      <aside class="order-detail-side">
        <section class="order-cancellation-card" aria-labelledby="cancellation-heading">
          <h2 id="cancellation-heading" class="h5">Cancellation eligibility</h2>
          ${order.status === 'cancelled'
            ? '<p class="mb-0 text-secondary">This order is already cancelled.</p>'
            : canCancelAsGuest
              ? '<p class="mb-3">This order is eligible for cancellation through your account.</p><button id="cancel-order" class="btn btn-danger w-100" type="button">Cancel order</button>'
              : `<p class="mb-0">The 24-hour cancellation window has closed. This order will be processed.</p><p class="small text-secondary mb-0 mt-2">Cancellation deadline: ${escapeText(cancellationAt.toLocaleString())}</p>`}
        </section>
        <section class="order-event-card" aria-labelledby="order-events-heading">
          <h2 id="order-events-heading" class="h5">Order events</h2>
          ${(events ?? []).length
            ? `<ol class="order-event-list">
                ${(events ?? []).map((event) => `
                  <li>
                    <time datetime="${escapeText(event.created_at)}">
                      ${escapeText(new Date(event.created_at).toLocaleString())}
                    </time>
                    <strong>${escapeText(event.event_type.replaceAll('_', ' '))}</strong>
                  </li>
                `).join('')}
              </ol>`
            : '<p class="text-secondary mb-0">No authorized events are recorded.</p>'}
        </section>
      </aside>
    </article>
  `;

  document.querySelector('#cancel-order')?.addEventListener('click', async () => {
    const confirmed = await openConfirmation({
      title: 'Cancel this order?',
      message: 'The order will remain in history and the product will become available again. This action cannot be reversed.',
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep order',
      destructive: true,
    });
    if (!confirmed) return;

    const cancelButton = document.querySelector('#cancel-order');
    if (cancelButton) {
      cancelButton.disabled = true;
      cancelButton.textContent = 'Cancelling…';
    }

    const { data, error } = await supabase.rpc('cancel_order', {
      p_order_id: order.id,
    });

    if (error) {
      showToast(error.message || 'The order could not be cancelled.', { type: 'error' });
      if (cancelButton) {
        cancelButton.disabled = false;
        cancelButton.textContent = 'Cancel order';
      }
      return;
    }

    if (data?.status === 'already_cancelled') {
      showToast('This order was already cancelled.', { type: 'info' });
    } else if (data?.status === 'cancelled') {
      showToast('Order cancelled successfully.', { type: 'success' });
    } else if (data?.status === 'too_soon') {
      showToast(data.message || 'The order is not eligible for cancellation yet.', { type: 'error' });
    } else if (data?.status === 'unauthorized') {
      showToast(data.message || 'You are not authorized to cancel this order.', { type: 'error' });
    } else {
      showToast(data?.message || 'Cancellation could not be completed.', { type: 'error' });
    }

    await loadOrderDetails();
  });
}

window.addEventListener('popstate', loadOrderDetails);
loadOrderDetails();
