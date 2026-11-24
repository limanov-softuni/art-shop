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

initializePage('Admin: Products', 'Create and manage the art catalog.');

const pageContent = document.querySelector('#page-content');
let activeRequest = 0;

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
    window.location.replace('/login/?return=/admin/products/');
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

async function loadProducts() {
  const requestId = ++activeRequest;
  if (!await requireAdmin()) return;

  pageContent.innerHTML = `
    <div class="admin-toolbar">
      <div>
        <p class="eyebrow mb-2">Catalog</p>
        <h2 class="h3 mb-0">Products</h2>
      </div>
      <a class="btn btn-primary" href="/admin/product-edit/">Create product</a>
    </div>
    ${renderSkeletonCards(6)}
  `;

  const { data: products, error } = await supabase
    .from('products')
    .select(`
      id,
      name,
      description,
      price,
      is_active,
      created_at,
      updated_at,
      product_images (
        storage_path,
        alt_text,
        position,
        is_cover
      )
    `)
    .order('name', { ascending: true })
    .order('id', { ascending: true });

  if (requestId !== activeRequest) return;
  if (error) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Catalog unavailable',
      message: 'We could not load products.',
      icon: 'bi-wifi-off',
    });
    showToast('Could not load products.', { type: 'error' });
    return;
  }

  if (!products?.length) {
    pageContent.innerHTML = `
      <div class="admin-toolbar">
        <h2 class="h3 mb-0">Products</h2>
        <a class="btn btn-primary" href="/admin/product-edit/">Create product</a>
      </div>
    `;
    pageContent.innerHTML += renderEmptyState({
      title: 'No products',
      message: 'Create the first catalog product.',
      icon: 'bi-inbox',
    });
    return;
  }

  pageContent.innerHTML = `
    <div class="admin-toolbar">
      <div>
        <p class="eyebrow mb-2">Catalog</p>
        <h2 class="h3 mb-0">Products</h2>
      </div>
      <a class="btn btn-primary" href="/admin/product-edit/">Create product</a>
    </div>
    <div class="admin-products-list">
      ${products.map((product) => {
        const images = [...(product.product_images ?? [])]
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        const image = images.find((item) => item.is_cover) ?? images[0];
        let imageUrl = null;
        if (image?.storage_path) {
          imageUrl = getProductImagePublicUrl(supabase, image.storage_path);
        }

        return `
          <article class="admin-product-row">
            ${imageUrl
              ? `<img class="admin-product-image" src="${escapeText(imageUrl)}" alt="${escapeText(image.alt_text || product.name)}">`
              : `
                <span class="admin-product-placeholder" role="img" aria-label="No product image">
                  <i class="bi bi-image" aria-hidden="true"></i>
                </span>
              `}
            <div class="admin-product-main">
              <div>
                <p class="eyebrow mb-1">${product.is_active ? 'Published' : 'Deactivated'}</p>
                <h3 class="h4 mb-1">${escapeText(product.name)}</h3>
                <p class="text-secondary mb-0">${escapeText(product.description || 'No description')}</p>
              </div>
              <strong>${formatEUR(product.price)}</strong>
            </div>
            <div class="admin-product-actions">
              <a class="btn btn-secondary btn-sm"
                href="/admin/product-edit/?id=${encodeURIComponent(product.id)}">Edit</a>
              <a class="btn btn-primary btn-sm"
                href="/admin/images/?productId=${encodeURIComponent(product.id)}">
                <i class="bi bi-images me-1" aria-hidden="true"></i>Manage images
              </a>
              <button class="btn btn-ghost btn-sm" type="button"
                data-toggle-product="${escapeText(product.id)}"
                data-active="${product.is_active ? 'true' : 'false'}">
                ${product.is_active ? 'Deactivate' : 'Publish'}
              </button>
              <button class="btn btn-outline-danger btn-sm" type="button"
                data-delete-product="${escapeText(product.id)}"
                data-product-name="${escapeText(product.name)}">Delete</button>
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;

  pageContent.querySelectorAll('[data-toggle-product]').forEach((button) => {
    button.addEventListener('click', async () => {
      const productId = button.dataset.toggleProduct;
      const nextActive = button.dataset.active !== 'true';
      button.disabled = true;
      const { error } = await supabase
        .from('products')
        .update({ is_active: nextActive })
        .eq('id', productId);
      if (error) {
        showToast(error.message || 'Product state could not be changed.', { type: 'error' });
        button.disabled = false;
        return;
      }
      showToast(nextActive ? 'Product published.' : 'Product deactivated.', {
        type: 'success',
      });
      await loadProducts();
    });
  });

  pageContent.querySelectorAll('[data-delete-product]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = await openConfirmation({
        title: 'Delete this product?',
        message: `Delete "${button.dataset.productName}"? This is possible only if it has no order history and no references. Records with order history must be deactivated instead.`,
        confirmLabel: 'Delete',
        cancelLabel: 'Keep',
        destructive: true,
      });
      if (!confirmed) return;

      button.disabled = true;
      const { data, error } = await supabase.rpc('delete_unreferenced_product', {
        p_product_id: button.dataset.deleteProduct,
      });
      if (error) {
        showToast(error.message || 'Product could not be deleted.', { type: 'error' });
        button.disabled = false;
        return;
      }
      if (data?.status === 'referenced') {
        showToast(data.message, { type: 'error' });
        button.disabled = false;
        return;
      }
      if (data?.status !== 'deleted') {
        showToast(data?.message || 'Product could not be deleted.', { type: 'error' });
        button.disabled = false;
        return;
      }
      showToast('Unreferenced product deleted.', { type: 'success' });
      await loadProducts();
    });
  });
}

loadProducts();
