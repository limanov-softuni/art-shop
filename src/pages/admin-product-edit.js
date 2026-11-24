import { initializePage } from './common.js';
import { supabase, supabaseConfigurationError } from '../services/supabase.js';
import {
  escapeText,
  openConfirmation,
  renderEmptyState,
  renderSkeletonCards,
  showToast,
} from '../components/ui.js';

initializePage('Admin: Product editor', 'Manage name, description, EUR price, and publication state.');

const pageContent = document.querySelector('#page-content');
const productId = new URLSearchParams(window.location.search).get('id')?.trim() ?? '';
let activeRequest = 0;

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function draftKey() {
  return `art-shop-admin-product-draft:${productId || 'new'}`;
}

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
    window.location.replace(`/login/?return=${encodeURIComponent(window.location.pathname + window.location.search)}`);
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

function readDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(draftKey()) ?? 'null');
  } catch {
    return null;
  }
}

function saveDraft(form) {
  const data = new FormData(form);
  try {
    sessionStorage.setItem(draftKey(), JSON.stringify({
      name: String(data.get('name') ?? ''),
      description: String(data.get('description') ?? ''),
      price: String(data.get('price') ?? ''),
      isActive: data.get('isActive') === 'on',
    }));
  } catch {}
}

function clearDraft() {
  try {
    sessionStorage.removeItem(draftKey());
  } catch {}
}

function validateForm(form) {
  const data = new FormData(form);
  const name = String(data.get('name') ?? '').trim();
  const description = String(data.get('description') ?? '').trim();
  const priceRaw = String(data.get('price') ?? '').trim();
  const errors = {};

  if (!name) errors.name = 'Product name is required.';
  else if (name.length > 200) errors.name = 'Product name must be 200 characters or fewer.';

  if (description.length > 2000) {
    errors.description = 'Description must be 2000 characters or fewer.';
  }

  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(priceRaw)
    || Number(priceRaw) > 9999999999.99) {
    errors.price = 'Enter a valid EUR price with up to two decimal places.';
  }

  return {
    name,
    description,
    price: priceRaw,
    isActive: data.get('isActive') === 'on',
    errors,
  };
}

function setErrors(form, errors) {
  ['name', 'description', 'price'].forEach((fieldName) => {
    const field = form.elements[fieldName];
    const error = form.querySelector(`[data-error-for="${fieldName}"]`);
    if (!field) return;
    field.classList.toggle('is-invalid', Boolean(errors[fieldName]));
    field.setAttribute('aria-invalid', errors[fieldName] ? 'true' : 'false');
    if (error) error.textContent = errors[fieldName] ?? '';
  });
}

async function loadEditor() {
  const requestId = ++activeRequest;
  if (!await requireAdmin()) return;

  pageContent.innerHTML = renderSkeletonCards(1);

  let product = null;
  if (productId) {
    if (!isUuid(productId)) {
      pageContent.innerHTML = `
        <div class="empty-state" role="alert">
          <span class="empty-state-icon" aria-hidden="true"><i class="bi bi-exclamation-triangle"></i></span>
          <h2 class="h4">Invalid product link</h2>
          <a class="btn btn-primary" href="/admin/products/">Back to products</a>
        </div>
      `;
      return;
    }

    const { data, error } = await supabase
      .from('products')
      .select('id,name,description,price,is_active')
      .eq('id', productId)
      .maybeSingle();
    if (requestId !== activeRequest) return;
    if (error) {
      pageContent.innerHTML = renderEmptyState({
        title: 'Product unavailable',
        message: 'We could not load this product.',
        icon: 'bi-wifi-off',
      });
      showToast('Could not load the product.', { type: 'error' });
      return;
    }
    if (!data) {
      pageContent.innerHTML = `
        <div class="empty-state" role="status">
          <span class="empty-state-icon" aria-hidden="true"><i class="bi bi-inbox"></i></span>
          <h2 class="h4">Product not found</h2>
          <a class="btn btn-primary" href="/admin/products/">Back to products</a>
        </div>
      `;
      return;
    }
    product = data;
  }

  const draft = readDraft();
  const initial = draft ?? product;

  pageContent.innerHTML = `
    <div class="admin-editor-header">
      <div>
        <p class="eyebrow mb-2">${product ? 'Edit product' : 'Create product'}</p>
        <h2 class="h3 mb-0">${product ? escapeText(product.name) : 'New product'}</h2>
      </div>
      <div class="d-flex flex-wrap gap-2">
        ${product
          ? `<a class="btn btn-primary" href="/admin/images/?productId=${encodeURIComponent(product.id)}&return=${encodeURIComponent(`/admin/product-edit/?id=${product.id}`)}">
              <i class="bi bi-images me-2" aria-hidden="true"></i>Manage images
            </a>`
          : ''}
        <a class="btn btn-secondary" href="/admin/products/">Back to products</a>
      </div>
    </div>
    <form id="admin-product-form" class="admin-product-form" novalidate>
      <div class="mb-3">
        <label class="form-label" for="product-name">Name</label>
        <input id="product-name" name="name" class="form-control" maxlength="200" required
          value="${escapeText(initial?.name ?? '')}">
        <div class="invalid-feedback" data-error-for="name"></div>
      </div>
      <div class="mb-3">
        <label class="form-label" for="product-description">Description</label>
        <textarea id="product-description" name="description" class="form-control"
          maxlength="2000" rows="7">${escapeText(initial?.description ?? '')}</textarea>
        <div class="invalid-feedback" data-error-for="description"></div>
      </div>
      <div class="mb-3">
        <label class="form-label" for="product-price">Price in EUR</label>
        <div class="input-group">
          <span class="input-group-text">EUR</span>
          <input id="product-price" name="price" class="form-control"
            type="number" min="0" max="9999999999.99" step="0.01"
            value="${escapeText(initial?.price ?? '')}">
        </div>
        <div class="invalid-feedback" data-error-for="price"></div>
      </div>
      <div class="form-check form-switch mb-4">
        <input id="product-active" name="isActive" class="form-check-input"
          type="checkbox"${(draft ? draft.isActive : initial?.is_active) ? ' checked' : ''}>
        <label class="form-check-label" for="product-active">Published / active</label>
      </div>
      <div class="admin-editor-actions">
        <button id="save-product" class="btn btn-primary" type="submit">
          ${product ? 'Save changes' : 'Create product'}
        </button>
        <button id="discard-product" class="btn btn-ghost" type="button">Discard draft</button>
      </div>
    </form>
  `;

  const form = document.querySelector('#admin-product-form');
  const saveButton = document.querySelector('#save-product');
  form.addEventListener('input', () => saveDraft(form));

  document.querySelector('#discard-product').addEventListener('click', async () => {
    const confirmed = await openConfirmation({
      title: 'Discard product draft?',
      message: 'Unsaved product values will be cleared.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      destructive: true,
    });
    if (!confirmed) return;
    clearDraft();
    window.location.assign('/admin/products/');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const result = validateForm(form);
    setErrors(form, result.errors);
    if (Object.keys(result.errors).length > 0) {
      saveDraft(form);
      showToast('Review the highlighted product fields.', { type: 'error' });
      form.querySelector('.is-invalid')?.focus();
      return;
    }

    saveDraft(form);
    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';

    const payload = {
      name: result.name,
      description: result.description || null,
      price: result.price,
      is_active: result.isActive,
    };

    if (product) {
      const { error } = await supabase
        .from('products')
        .update(payload)
        .eq('id', product.id);
      if (error) {
        showToast(error.message || 'Product could not be updated.', { type: 'error' });
        saveButton.disabled = false;
        saveButton.textContent = 'Save changes';
        return;
      }
      clearDraft();
      showToast('Product updated successfully.', { type: 'success' });
      window.location.assign('/admin/products/');
      return;
    }

    const { data, error } = await supabase
      .from('products')
      .insert(payload)
      .select('id')
      .single();
    if (error) {
      showToast(error.message || 'Product could not be created.', { type: 'error' });
      saveButton.disabled = false;
      saveButton.textContent = 'Create product';
      return;
    }
    clearDraft();
    showToast('Product created successfully.', { type: 'success' });
    window.location.assign(`/admin/product-edit/?id=${encodeURIComponent(data.id)}`);
  });
}

loadEditor();
