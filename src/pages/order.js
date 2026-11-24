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

initializePage('Place order', 'Review the current product, EUR price, and order details.');

const pageContent = document.querySelector('#page-content');
if (!pageContent) throw new Error('Page content element was not found.');

const params = new URLSearchParams(window.location.search);
const productId = params.get('productId')?.trim() ?? '';
const returnContext = params.get('return')?.trim() ?? '';
let submitting = false;
let activeRequestId = 0;

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeReturnContext(value) {
  if (!value) return '/products/';
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return '/products/';
    if (!['/product/', '/products/'].includes(url.pathname)) return '/products/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/products/';
  }
}

function createRequestId() {
  return globalThis.crypto?.randomUUID?.()
    ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      const value = character === 'x' ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
}

function sessionRequestKey() {
  return `art-shop-order-request:${productId}`;
}

function getRequestId() {
  try {
    const stored = sessionStorage.getItem(sessionRequestKey());
    if (stored && isUuid(stored)) return stored;
  } catch {}
  const requestId = createRequestId();
  try {
    sessionStorage.setItem(sessionRequestKey(), requestId);
  } catch {}
  return requestId;
}

function clearRequestId() {
  try {
    sessionStorage.removeItem(sessionRequestKey());
  } catch {}
}

function draftStorageKey() {
  return `art-shop-order-draft:${productId}`;
}

function saveDraft(form) {
  try {
    const data = new FormData(form);
    sessionStorage.setItem(draftStorageKey(), JSON.stringify({
      clientName: String(data.get('clientName') ?? ''),
      contactPhone: String(data.get('contactPhone') ?? ''),
      specialRequests: String(data.get('specialRequests') ?? ''),
    }));
  } catch {}
}

function readDraft() {
  try {
    const value = JSON.parse(sessionStorage.getItem(draftStorageKey()) ?? 'null');
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(draftStorageKey());
  } catch {}
}

function publicImageUrl(storagePath) {
  return getProductImagePublicUrl(supabase, storagePath);
}

function validateForm(form) {
  const data = new FormData(form);
  const name = String(data.get('clientName') ?? '').trim();
  const phone = String(data.get('contactPhone') ?? '').trim();
  const requests = String(data.get('specialRequests') ?? '').trim();
  const errors = {};

  if (!name) errors.clientName = 'Client name is required.';
  else if (name.length > 100) errors.clientName = 'Client name must be 100 characters or fewer.';

  if (phone.length > 30) errors.contactPhone = 'Phone number must be 30 characters or fewer.';
  if (requests.length > 2000) errors.specialRequests = 'Special requests must be 2000 characters or fewer.';

  return { name, phone, requests, errors };
}

function setFieldErrors(form, errors) {
  ['clientName', 'contactPhone', 'specialRequests'].forEach((fieldName) => {
    const field = form.elements[fieldName];
    const error = form.querySelector(`[data-error-for="${fieldName}"]`);
    if (!field) return;
    field.classList.toggle('is-invalid', Boolean(errors[fieldName]));
    field.setAttribute('aria-invalid', errors[fieldName] ? 'true' : 'false');
    if (error) error.textContent = errors[fieldName] ?? '';
  });
}

async function reconcileCreateOrder(args) {
  return supabase.rpc('create_order', args);
}

async function callCreateOrderWithTimeout(args) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error('The order request timed out. The request is being reconciled.'));
    }, 12000);
  });

  try {
    return await Promise.race([
      reconcileCreateOrder(args),
      timeout,
    ]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function loadOrderPage() {
  const pageRequestId = ++activeRequestId;
  pageContent.innerHTML = renderSkeletonCards(1);

  if (!supabase) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Checkout unavailable',
      message: supabaseConfigurationError,
      icon: 'bi-exclamation-circle',
    });
    return;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (pageRequestId !== activeRequestId) return;

  if (sessionError || !sessionData?.session) {
    const loginParams = new URLSearchParams();
    loginParams.set('return', window.location.pathname + window.location.search);
    window.location.replace(`/login/?${loginParams.toString()}`);
    return;
  }

  if (!isUuid(productId)) {
    pageContent.innerHTML = `
      <div class="empty-state" role="alert">
        <span class="empty-state-icon" aria-hidden="true"><i class="bi bi-exclamation-triangle"></i></span>
        <h2 class="h4">Invalid product link</h2>
        <p>Select a product again before placing an order.</p>
        <a class="btn btn-primary" href="/products/">Browse products</a>
      </div>
    `;
    return;
  }

  const { data: product, error: productError } = await supabase
    .from('products')
    .select(`
      id,
      name,
      description,
      price,
      is_active,
      product_images (
        storage_path,
        alt_text,
        position,
        is_cover
      )
    `)
    .eq('id', productId)
    .eq('is_active', true)
    .maybeSingle();

  if (pageRequestId !== activeRequestId) return;

  if (productError) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Checkout unavailable',
      message: 'We could not load the selected product. Please try again.',
      icon: 'bi-wifi-off',
    });
    return;
  }

  if (!product) {
    pageContent.innerHTML = `
      <div class="empty-state" role="status">
        <span class="empty-state-icon" aria-hidden="true"><i class="bi bi-inbox"></i></span>
        <h2 class="h4">Product unavailable</h2>
        <p>This product is missing or is no longer published.</p>
        <a class="btn btn-primary" href="${escapeText(safeReturnContext(returnContext))}">Back</a>
      </div>
    `;
    return;
  }

  const { data: availability, error: availabilityError } = await supabase.rpc(
    'get_product_availability',
    { p_product_id: product.id }
  );

  if (pageRequestId !== activeRequestId) return;

  if (availabilityError) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Availability unavailable',
      message: 'We could not verify availability. Please try again.',
      icon: 'bi-wifi-off',
    });
    return;
  }

  const isAvailable = availability?.is_available === true;
  const images = [...(product.product_images ?? [])]
    .sort((a, b) => {
      if (a.is_cover !== b.is_cover) return a.is_cover ? -1 : 1;
      return (a.position ?? 0) - (b.position ?? 0);
    });
  const imageUrl = images.length > 0
    ? publicImageUrl(images[0].storage_path)
    : null;

  pageContent.innerHTML = `
    <nav aria-label="Checkout context" class="product-detail-breadcrumb">
      <a class="btn btn-ghost btn-sm" href="${escapeText(safeReturnContext(returnContext))}">
        <i class="bi bi-arrow-left me-2" aria-hidden="true"></i>Back
      </a>
    </nav>
    <div class="checkout-layout">
      <section class="checkout-product-card" aria-labelledby="checkout-product-name">
        ${imageUrl
          ? `<img class="checkout-product-image" src="${escapeText(imageUrl)}" alt="${escapeText(images[0]?.alt_text || product.name)}">`
          : `
            <span class="product-image-placeholder" role="img" aria-label="No image available">
              <i class="bi bi-image" aria-hidden="true"></i>
              <span>Image unavailable</span>
            </span>
          `}
        <div class="checkout-product-body">
          <p class="eyebrow mb-2">Selected product</p>
          <h2 id="checkout-product-name" class="h3">${escapeText(product.name)}</h2>
          <p class="checkout-product-description">${escapeText(product.description || 'No description is available.')}</p>
          <div class="product-detail-status">
            <span class="badge ${isAvailable ? 'badge-success' : 'badge-neutral'}">
              ${isAvailable ? 'Available' : 'Unavailable'}
            </span>
          </div>
          <div class="checkout-price">
            <span>Current product price</span>
            <strong>${formatEUR(product.price)}</strong>
          </div>
        </div>
      </section>
      <section class="checkout-form-card" aria-labelledby="checkout-form-heading">
        <h2 id="checkout-form-heading" class="h4">Order details</h2>
        <form id="create-order-form" novalidate>
          <div class="mb-3">
            <label class="form-label" for="clientName">Client name</label>
            <input id="clientName" name="clientName" class="form-control"
              maxlength="100" required autocomplete="name">
            <div class="invalid-feedback" data-error-for="clientName"></div>
          </div>
          <div class="mb-3">
            <label class="form-label" for="contactPhone">Phone <span class="text-secondary">(optional)</span></label>
            <input id="contactPhone" name="contactPhone" class="form-control"
              maxlength="30" autocomplete="tel">
            <div class="invalid-feedback" data-error-for="contactPhone"></div>
          </div>
          <div class="mb-3">
            <label class="form-label" for="specialRequests">Special requests <span class="text-secondary">(optional)</span></label>
            <textarea id="specialRequests" name="specialRequests" class="form-control"
              maxlength="2000" rows="4"></textarea>
            <div class="invalid-feedback" data-error-for="specialRequests"></div>
          </div>
          <div class="checkout-paypal">
            <i class="bi bi-paypal" aria-hidden="true"></i>
            <div>
              <strong>PayPal payment</strong>
              <p class="mb-0">Payment is explained here before order confirmation. No PayPal secret or credential is used in this page.</p>
            </div>
          </div>
          <div class="checkout-cancellation">
            <i class="bi bi-clock-history" aria-hidden="true"></i>
            <span>You may cancel within 24 hours after placing the order.</span>
          </div>
          <div class="checkout-total">
            <span>Total EUR</span>
            <strong>${formatEUR(product.price)}</strong>
          </div>
          <button id="submit-order" class="btn btn-primary btn-lg w-100" type="submit"
            ${isAvailable ? '' : 'disabled'}>
            ${isAvailable ? 'Confirm and place order' : 'Product unavailable'}
          </button>
          <button id="discard-order" class="btn btn-ghost w-100 mt-2" type="button">
            Discard
          </button>
        </form>
      </section>
    </div>
  `;

  const form = document.querySelector('#create-order-form');
  const submitButton = document.querySelector('#submit-order');
  const requestId = getRequestId();
  const draft = readDraft();
  if (draft) {
    form.elements.clientName.value = draft.clientName ?? '';
    form.elements.contactPhone.value = draft.contactPhone ?? '';
    form.elements.specialRequests.value = draft.specialRequests ?? '';
  }

  form.addEventListener('input', () => saveDraft(form));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting) return;

    const result = validateForm(form);
    setFieldErrors(form, result.errors);
    if (Object.keys(result.errors).length > 0) {
      showToast('Review the highlighted order fields.', { type: 'error' });
      form.querySelector('.is-invalid')?.focus();
      return;
    }

    submitting = true;
    submitButton.disabled = true;
    submitButton.textContent = 'Placing order…';

    const args = {
      p_product_id: product.id,
      p_expected_total: product.price,
      p_client_name: result.name,
      p_contact_phone: result.phone || null,
      p_special_requests: result.requests || null,
      p_request_id: requestId,
    };

    let operation;
    try {
      saveDraft(form);
      operation = callCreateOrderWithTimeout(args);
      const outcome = await operation;

      if (outcome.error) {
        throw outcome.error;
      }
      const resultJson = outcome.data;

      if (resultJson?.status === 'success') {
        clearRequestId();
        clearDraft();
        showToast('Order placed successfully.', { type: 'success' });
        window.location.assign(`/order-confirmation/?id=${encodeURIComponent(resultJson.order_id)}`);
        return;
      }

      if (resultJson?.status === 'requote') {
        showToast('The price changed. Please review the refreshed product price.', { type: 'error' });
        await loadOrderPage();
        return;
      }

      if (resultJson?.status === 'unavailable') {
        showToast(resultJson.message || 'The product is no longer available.', { type: 'error' });
        await loadOrderPage();
        return;
      }

      throw new Error(resultJson?.message || 'The order could not be placed.');
    } catch (error) {
      const reconcile = await callCreateOrderWithTimeout(args);
      if (!reconcile.error && reconcile.data?.status === 'success') {
        clearRequestId();
        clearDraft();
        showToast('Order placed successfully after reconciling the request.', { type: 'success' });
        window.location.assign(`/order-confirmation/?id=${encodeURIComponent(reconcile.data.order_id)}`);
        return;
      }

      showToast(
        reconcile.error?.message || error?.message || 'The order could not be completed. Your form values were preserved.',
        { type: 'error' }
      );
      submitting = false;
      submitButton.disabled = !isAvailable;
      submitButton.textContent = 'Confirm and place order';
    }
  });

  document.querySelector('#discard-order').addEventListener('click', async () => {
    const confirmed = await openConfirmation({
      title: 'Discard this order?',
      message: 'Your entered order details will be cleared.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      destructive: true,
    });
    if (!confirmed) return;
    clearRequestId();
    clearDraft();
    window.location.assign(safeReturnContext(returnContext));
  });
}

window.addEventListener('popstate', loadOrderPage);
loadOrderPage();
