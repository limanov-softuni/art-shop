import { initializePage } from './common.js';
import { supabase, supabaseConfigurationError } from '../services/supabase.js';
import { getProductImagePublicUrl } from '../utils/storage-images.js';
import {
  escapeText,
  formatEUR,
  renderEmptyState,
  renderSkeletonCards,
  showToast,
} from '../components/ui.js';

initializePage('Order confirmation', 'Confirmed against the persisted order record.');

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

async function loadConfirmation() {
  const requestId = ++activeRequest;
  pageContent.innerHTML = renderSkeletonCards(1);

  if (!supabase) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Confirmation unavailable',
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
        <h2 class="h4">Confirmation not available</h2>
        <p>The order identifier is missing or invalid. Query-string text is not proof of a successful order.</p>
        <a class="btn btn-primary" href="/my-orders/">View my orders</a>
      </div>
    `;
    return;
  }

  const { data: order, error } = await supabase
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
      cancelled_at
    `)
    .eq('id', orderId)
    .maybeSingle();

  if (requestId !== activeRequest) return;

  if (error) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Confirmation unavailable',
      message: 'We could not verify the persisted order.',
      icon: 'bi-wifi-off',
    });
    showToast('Could not load order confirmation.', { type: 'error' });
    return;
  }

  if (!order) {
    pageContent.innerHTML = `
      <div class="empty-state" role="status">
        <span class="empty-state-icon" aria-hidden="true"><i class="bi bi-shield-exclamation"></i></span>
        <h2 class="h4">Order not found</h2>
        <p>This order may belong to another account or may not exist.</p>
        <a class="btn btn-primary" href="/my-orders/">View my orders</a>
      </div>
    `;
    return;
  }

  if (!['confirmed', 'completed'].includes(order.status)) {
    pageContent.innerHTML = `
      <div class="empty-state" role="status">
        <span class="empty-state-icon" aria-hidden="true"><i class="bi bi-clock-history"></i></span>
        <h2 class="h4">Order status changed</h2>
        <p>This persisted order is cancelled and cannot be shown as a confirmed placement.</p>
        <a class="btn btn-primary" href="/order-details/?id=${encodeURIComponent(order.id)}">View order details</a>
      </div>
    `;
    return;
  }

  const { data: product } = await supabase
    .from('products')
    .select(`
      id,
      name,
      is_active,
      product_images (
        storage_path,
        alt_text,
        position,
        is_cover
      )
    `)
    .eq('id', order.product_id)
    .maybeSingle();

  if (requestId !== activeRequest) return;

  const images = [...(product?.product_images ?? [])]
    .sort((a, b) => {
      if (a.is_cover !== b.is_cover) return a.is_cover ? -1 : 1;
      return (a.position ?? 0) - (b.position ?? 0);
    });
  const imageUrl = images.length > 0
    ? publicImageUrl(images[0].storage_path)
    : null;

  pageContent.innerHTML = `
    <article class="confirmation-card">
      <div class="confirmation-success">
        <span class="confirmation-icon" aria-hidden="true"><i class="bi bi-check-lg"></i></span>
        <div>
          <p class="eyebrow mb-2">${order.status === 'completed' ? 'Completed order' : 'Confirmed order'}</p>
          <h2 class="h3 mb-1">${escapeText(order.reference)}</h2>
          <p class="mb-0 text-secondary">This confirmation was loaded from the authorized persisted order.</p>
        </div>
      </div>
      <div class="confirmation-layout">
        ${imageUrl
          ? `<img class="confirmation-image" src="${escapeText(imageUrl)}" alt="${escapeText(images[0]?.alt_text || order.product_name_snapshot)}">`
          : `
            <span class="product-image-placeholder" role="img" aria-label="No product image">
              <i class="bi bi-image" aria-hidden="true"></i>
              <span>Image unavailable</span>
            </span>
          `}
        <div>
          <h3 class="h4">${escapeText(order.product_name_snapshot)}</h3>
          <p class="text-secondary mb-2">Saved product name and EUR price</p>
          <div class="confirmation-price">
            <span>Saved total</span>
            <strong>${formatEUR(order.total_price)}</strong>
          </div>
          <dl class="confirmation-details">
            <div><dt>Status</dt><dd>${order.status === 'completed' ? 'Completed' : 'Confirmed'}</dd></div>
            <div><dt>Client</dt><dd>${escapeText(order.client_name)}</dd></div>
            <div><dt>Phone</dt><dd>${escapeText(order.contact_phone || 'Not provided')}</dd></div>
            <div><dt>Special requests</dt><dd>${escapeText(order.special_requests || 'None')}</dd></div>
          </dl>
        </div>
      </div>
      <div class="confirmation-actions">
        <a class="btn btn-primary" href="/order-details/?id=${encodeURIComponent(order.id)}">View Order Details</a>
        <a class="btn btn-secondary" href="/my-orders/">View My Orders</a>
      </div>
    </article>
  `;
}

window.addEventListener('popstate', loadConfirmation);
loadConfirmation();
