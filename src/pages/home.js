import { initializePage } from './common.js';
import { supabase, supabaseConfigurationError } from '../services/supabase.js';
import { getProductImagePublicUrl } from '../utils/storage-images.js';
import {
  escapeText,
  renderEmptyState,
  renderProductCard,
  renderSkeletonCards,
  showToast,
} from '../components/ui.js';

initializePage('Art Shop', 'Discover original art and curated creative pieces.');

const pageContent = document.querySelector('#page-content');

if (!pageContent) {
  throw new Error('Page content element was not found.');
}

pageContent.innerHTML = `
  <form id="home-product-search" class="catalog-search" role="search">
    <label class="form-label" for="home-search-term">Search by product name</label>
    <div class="catalog-search-controls">
      <input
        id="home-search-term"
        class="form-control"
        name="term"
        type="search"
        autocomplete="off"
        placeholder="Search the catalog"
      >
      <button class="btn btn-primary" type="submit">
        <i class="bi bi-search me-2" aria-hidden="true"></i>Search
      </button>
    </div>
  </form>
  <section aria-labelledby="featured-products-title">
    <div class="catalog-section-heading">
      <div>
        <p class="eyebrow mb-2">Featured collection</p>
        <h2 id="featured-products-title" class="h3 mb-0">Active products</h2>
      </div>
      <a class="btn btn-ghost btn-sm" href="/products/">View all products</a>
    </div>
    <div id="featured-products">
      ${renderSkeletonCards(6)}
    </div>
  </section>
`;

const searchForm = document.querySelector('#home-product-search');
const searchInput = document.querySelector('#home-search-term');
const featuredContainer = document.querySelector('#featured-products');

function installImageFallbacks(container) {
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

function publicImageUrl(product) {
  const images = Array.isArray(product.product_images) ? product.product_images : [];
  const cover = images.find((image) => image.is_cover)
    ?? [...images].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];

  if (!cover?.storage_path) return null;

  return getProductImagePublicUrl(supabase, cover.storage_path);
}

async function loadProducts(searchTerm = '') {
  if (!supabase) {
    featuredContainer.innerHTML = renderEmptyState({
      title: 'Catalog unavailable',
      message: supabaseConfigurationError,
      icon: 'bi-exclamation-circle',
    });
    return;
  }

  featuredContainer.innerHTML = renderSkeletonCards(6);

  let query = supabase
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
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(12);

  const normalizedTerm = searchTerm.trim();
  if (normalizedTerm) {
    query = query.ilike('name', `%${normalizedTerm}%`);
  }

  const { data: products, error } = await query;

  if (error) {
    featuredContainer.innerHTML = renderEmptyState({
      title: 'Catalog unavailable',
      message: 'We could not load the active product catalog. Please try again.',
      icon: 'bi-wifi-off',
    });
    showToast('Could not load products.', { type: 'error' });
    return;
  }

  if (!products?.length) {
    featuredContainer.innerHTML = renderEmptyState({
      title: normalizedTerm ? 'No matching products' : 'No featured products',
      message: normalizedTerm
        ? `No active products match "${normalizedTerm}".`
        : 'There are no active products to display right now.',
      icon: 'bi-inbox',
    });
    return;
  }

  const productIds = products.map((product) => product.id);
  const { data: availabilityRows, error: availabilityError } = await supabase.rpc(
    'get_products_availability',
    { p_product_ids: productIds }
  );

  if (availabilityError) {
    featuredContainer.innerHTML = renderEmptyState({
      title: 'Catalog unavailable',
      message: 'We could not verify product availability.',
      icon: 'bi-wifi-off',
    });
    showToast('Could not verify product availability.', { type: 'error' });
    return;
  }

  const availabilityById = new Map(
    (availabilityRows ?? []).map((row) => [row.product_id, row.is_available === true])
  );
  const availableProducts = products.filter(
    (product) => availabilityById.get(product.id) === true
  );

  if (!availableProducts.length) {
    featuredContainer.innerHTML = renderEmptyState({
      title: normalizedTerm ? 'No available matching products' : 'No available featured products',
      message: normalizedTerm
        ? `No available active products match "${normalizedTerm}".`
        : 'There are no available products to display right now.',
      icon: 'bi-inbox',
    });
    return;
  }

  featuredContainer.innerHTML = `
    <div class="row g-4">
      ${availableProducts.map((product) => {
        const cover = (product.product_images ?? [])
          .find((image) => image.is_cover)
          ?? [...(product.product_images ?? [])]
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];
        const available = availabilityById.get(product.id) ?? false;

        return `
          <div class="col-12 col-md-6 col-lg-4">
            ${renderProductCard({
              title: product.name,
              description: product.description,
              price: product.price,
              imageLabel: cover?.alt_text || product.name,
              imageUrl: publicImageUrl(product),
              href: `/product/?id=${encodeURIComponent(product.id)}`,
              available,
              actionLabel: available ? 'View & place order' : null,
              actionHref: available
                ? `/order/?productId=${encodeURIComponent(product.id)}`
                : null,
            })}
          </div>
        `;
      }).join('')}
    </div>
  `;

  installImageFallbacks(featuredContainer);
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  loadProducts(searchInput.value);
});

loadProducts();
