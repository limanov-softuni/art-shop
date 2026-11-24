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

initializePage('Product details', 'View the artwork and its current EUR price.');

const pageContent = document.querySelector('#page-content');
if (!pageContent) {
  throw new Error('Page content element was not found.');
}

const rawId = new URLSearchParams(window.location.search).get('id')?.trim() ?? '';
const returnContext = new URLSearchParams(window.location.search).get('return')?.trim() ?? '';
let activeRequest = 0;

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeReturnContext(value) {
  if (!value) return '/products/';

  try {
    const decoded = decodeURIComponent(value);
    const url = new URL(decoded, window.location.origin);
    if (url.origin !== window.location.origin) return '/products/';
    if (url.pathname !== '/products/') return '/products/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/products/';
  }
}

function buildProductUrl(productId) {
  const params = new URLSearchParams();
  params.set('id', productId);
  if (safeReturnContext(returnContext) !== '/products/') {
    params.set('return', encodeURIComponent(safeReturnContext(returnContext)));
  }
  return `/product/?${params.toString()}`;
}

function buildOrderUrl(productId) {
  const params = new URLSearchParams();
  params.set('productId', productId);
  params.set('return', buildProductUrl(productId));
  return `/order/?${params.toString()}`;
}

function buildLoginUrl(productId) {
  const params = new URLSearchParams();
  params.set('return', buildOrderUrl(productId));
  return `/login/?${params.toString()}`;
}

function publicImageUrl(storagePath) {
  return getProductImagePublicUrl(supabase, storagePath);
}

function installGallery(container) {
  const mainImage = container.querySelector('[data-main-product-image]');
  const thumbnails = container.querySelectorAll('[data-gallery-image]');

  thumbnails.forEach((thumbnail) => {
    thumbnail.addEventListener('click', () => {
      const nextUrl = thumbnail.dataset.fullUrl;
      const nextAlt = thumbnail.dataset.fullAlt;
      if (!nextUrl || !mainImage) return;

      mainImage.src = nextUrl;
      mainImage.alt = nextAlt || 'Product image';
      thumbnails.forEach((item) => {
        item.classList.remove('active');
        item.setAttribute('aria-pressed', 'false');
      });
      thumbnail.classList.add('active');
      thumbnail.setAttribute('aria-pressed', 'true');
      mainImage.closest('[data-gallery-frame]')?.focus();
    });
  });

  container.querySelectorAll('[data-product-image]').forEach((image) => {
    image.addEventListener('error', () => {
      image.hidden = true;
      const fallback = image.nextElementSibling;
      if (fallback?.hasAttribute('data-image-fallback')) {
        fallback.hidden = false;
      }
    });
  });
}

async function loadProduct() {
  const requestId = ++activeRequest;

  if (!isValidUuid(rawId)) {
    pageContent.innerHTML = `
      <div class="empty-state" role="alert">
        <span class="empty-state-icon" aria-hidden="true"><i class="bi bi-exclamation-triangle"></i></span>
        <h2 class="h4">Invalid product link</h2>
        <p>The product identifier in this URL is missing or invalid.</p>
        <a class="btn btn-primary" href="${escapeText(safeReturnContext(returnContext))}">Back to search</a>
      </div>
    `;
    return;
  }

  if (!supabase) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Product unavailable',
      message: supabaseConfigurationError,
      icon: 'bi-exclamation-circle',
    });
    return;
  }

  pageContent.innerHTML = renderSkeletonCards(1);

  const { data: product, error: productError } = await supabase
    .from('products')
    .select(`
      id,
      name,
      description,
      price,
      is_active,
      product_images (
        id,
        storage_path,
        alt_text,
        position,
        is_cover
      )
    `)
    .eq('id', rawId)
    .eq('is_active', true)
    .maybeSingle();

  if (requestId !== activeRequest) return;

  if (productError) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Product unavailable',
      message: 'We could not load this product. Please try again.',
      icon: 'bi-wifi-off',
    });
    showToast('Could not load product details.', { type: 'error' });
    return;
  }

  if (!product) {
    pageContent.innerHTML = `
      <div class="empty-state" role="status">
        <span class="empty-state-icon" aria-hidden="true"><i class="bi bi-inbox"></i></span>
        <h2 class="h4">Product not found</h2>
        <p>This product is missing or is no longer published.</p>
        <a class="btn btn-primary" href="${escapeText(safeReturnContext(returnContext))}">Back to search</a>
      </div>
    `;
    return;
  }

  const { data: availability, error: availabilityError } = await supabase.rpc(
    'get_product_availability',
    { p_product_id: product.id }
  );

  if (requestId !== activeRequest) return;

  if (availabilityError) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Availability unavailable',
      message: 'The product details loaded, but current availability could not be verified.',
      icon: 'bi-wifi-off',
    });
    return;
  }

  const isAvailable = availability?.is_available === true;
  const images = [...(product.product_images ?? [])]
    .sort((a, b) => {
      if (a.is_cover !== b.is_cover) return a.is_cover ? -1 : 1;
      return (a.position ?? 0) - (b.position ?? 0);
    })
    .map((image) => ({
      url: publicImageUrl(image.storage_path),
      alt: image.alt_text?.trim() || product.name,
    }))
    .filter((image) => image.url);

  const mainImage = images[0];
  const imageMarkup = mainImage
    ? `
      <div class="product-detail-gallery">
        <div class="product-detail-frame" data-gallery-frame tabindex="-1">
          <img class="product-detail-main-image" data-main-product-image
            data-product-image src="${escapeText(mainImage.url)}"
            alt="${escapeText(mainImage.alt)}">
          <span class="product-image-placeholder" role="img"
            aria-label="${escapeText(mainImage.alt)}" data-image-fallback hidden>
            <i class="bi bi-image" aria-hidden="true"></i>
            <span>Image unavailable</span>
          </span>
        </div>
        ${images.length > 1
          ? `
            <div class="product-gallery-thumbnails" role="group" aria-label="Product images">
              ${images.map((image, index) => `
                <button class="product-gallery-thumbnail${index === 0 ? ' active' : ''}"
                  type="button" data-gallery-image
                  data-full-url="${escapeText(image.url)}"
                  data-full-alt="${escapeText(image.alt)}"
                  aria-label="View image ${index + 1}: ${escapeText(image.alt)}"
                  aria-pressed="${index === 0 ? 'true' : 'false'}">
                  <img src="${escapeText(image.url)}" alt="" loading="lazy">
                </button>
              `).join('')}
            </div>
          `
          : ''}
      </div>
    `
    : `
      <div class="product-detail-frame">
        <span class="product-image-placeholder" role="img"
          aria-label="No image available for ${escapeText(product.name)}">
          <i class="bi bi-image" aria-hidden="true"></i>
          <span>Image unavailable</span>
        </span>
      </div>
    `;

  const orderAction = isAvailable
    ? `
      <a class="btn btn-primary btn-lg w-100" href="${escapeText(buildOrderUrl(product.id))}">
        <i class="bi bi-bag me-2" aria-hidden="true"></i>Place order
      </a>
    `
    : `
      <button class="btn btn-secondary btn-lg w-100" type="button" disabled>
        Unavailable
      </button>
    `;

  pageContent.innerHTML = `
    <nav aria-label="Product context" class="product-detail-breadcrumb">
      <a class="btn btn-ghost btn-sm" href="${escapeText(safeReturnContext(returnContext))}">
        <i class="bi bi-arrow-left me-2" aria-hidden="true"></i>Back to search
      </a>
    </nav>
    <article class="product-detail-layout">
      ${imageMarkup}
      <div class="product-detail-summary">
        <p class="eyebrow mb-2">Active artwork</p>
        <h2 class="product-detail-title">${escapeText(product.name)}</h2>
        <div class="product-detail-status">
          <span class="badge ${isAvailable ? 'badge-success' : 'badge-neutral'}">
            ${isAvailable ? 'Available' : 'Unavailable'}
          </span>
        </div>
        <section aria-labelledby="product-description-heading">
          <h3 id="product-description-heading" class="h5">Description</h3>
          <p class="product-detail-description">
            ${escapeText(product.description || 'No description is available for this product.')}
          </p>
        </section>
        <div class="product-detail-price" aria-label="Current product price">
          <span>Current price</span>
          <strong>${formatEUR(product.price)}</strong>
        </div>
        ${orderAction}
      </div>
    </article>
  `;

  installGallery(pageContent);

  supabase.auth.getSession().then(({ data }) => {
    if (requestId !== activeRequest) return;
    if (data?.session) return;

    const orderLink = pageContent.querySelector('a[href*="/order/"]');
    if (!orderLink) return;

    orderLink.href = buildLoginUrl(product.id);
  });
}

window.addEventListener('popstate', loadProduct);
loadProduct();
