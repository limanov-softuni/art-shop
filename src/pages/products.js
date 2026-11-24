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

initializePage('Products', 'Search and filter the complete active art catalog.');

const pageContent = document.querySelector('#page-content');
const pageSize = 12;
const destinations = [
  'Acrylic painting',
  'Watercolor',
  'Sculpture',
  'Photography',
  'Giclée print',
  'Digital art',
  'Drawing',
  'Textile',
  'Ceramic',
  'Mixed media',
];
const sortOptions = [
  ['name_asc', 'Name: A to Z'],
  ['name_desc', 'Name: Z to A'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
];

if (!pageContent) {
  throw new Error('Page content element was not found.');
}

function readAndValidateParams() {
  const params = new URLSearchParams(window.location.search);
  const q = (params.get('q') ?? '').trim();
  const destination = (params.get('destination') ?? params.get('type') ?? '').trim();
  const maxPriceRaw = (params.get('maxPrice') ?? '').trim();
  const sort = params.get('sort') ?? 'name_asc';
  const pageRaw = params.get('page') ?? '1';
  const errors = [];

  if (q.length > 100) {
    errors.push('Search text must be 100 characters or fewer.');
  }
  if (destination && !destinations.includes(destination)) {
    errors.push('Destination filter is not supported.');
  }
  if (maxPriceRaw) {
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(maxPriceRaw)
      || Number(maxPriceRaw) > 100000) {
      errors.push('Maximum price must be EUR 0-100000 with up to two decimal places.');
    }
  }
  if (!sortOptions.some(([value]) => value === sort)) {
    errors.push('Sort option is not supported.');
  }
  if (!/^[1-9]\d*$/.test(pageRaw) || Number(pageRaw) > 1000) {
    errors.push('Page must be a positive integer no greater than 1000.');
  }

  return {
    q,
    destination,
    maxPrice: maxPriceRaw ? Number(maxPriceRaw) : null,
    maxPriceRaw,
    sort,
    page: Number(pageRaw),
    errors,
  };
}

const state = readAndValidateParams();

function buildSearchContext() {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.destination) params.set('destination', state.destination);
  if (state.maxPriceRaw) params.set('maxPrice', state.maxPriceRaw);
  params.set('sort', state.sort);
  params.set('page', String(state.page));
  return `${window.location.pathname}?${params.toString()}`;
}

function buildPageUrl(page) {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.destination) params.set('destination', state.destination);
  if (state.maxPriceRaw) params.set('maxPrice', state.maxPriceRaw);
  params.set('sort', state.sort);
  params.set('page', String(page));
  return `/products/?${params.toString()}`;
}

function publicImageUrl(product) {
  const images = Array.isArray(product.product_images) ? product.product_images : [];
  const cover = images.find((image) => image.is_cover)
    ?? [...images].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];
  if (!cover?.storage_path) return null;

  return getProductImagePublicUrl(supabase, cover.storage_path);
}

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

pageContent.innerHTML = `
  <form id="product-search-form" class="catalog-search catalog-search-results" novalidate>
    <div class="row g-3">
      <div class="col-12 col-lg-4">
        <label class="form-label" for="search-name">Product name</label>
        <input id="search-name" class="form-control" name="q" type="search"
          maxlength="100" value="${escapeText(state.q)}"
          placeholder="Search by product name">
      </div>
      <div class="col-12 col-sm-6 col-lg-3">
        <label class="form-label" for="search-destination">Destination / type</label>
        <select id="search-destination" class="form-select" name="destination">
          <option value="">All types</option>
          ${destinations.map((destination) => `
            <option value="${escapeText(destination)}"${state.destination === destination ? ' selected' : ''}>
              ${escapeText(destination)}
            </option>
          `).join('')}
        </select>
      </div>
      <div class="col-12 col-sm-6 col-lg-2">
        <label class="form-label" for="search-max-price">Maximum price</label>
        <div class="input-group">
          <span class="input-group-text">EUR</span>
          <input id="search-max-price" class="form-control" name="maxPrice"
            type="number" inputmode="decimal" min="0" max="100000" step="0.01"
            value="${escapeText(state.maxPriceRaw)}">
        </div>
      </div>
      <div class="col-12 col-sm-6 col-lg-3">
        <label class="form-label" for="search-sort">Sort</label>
        <select id="search-sort" class="form-select" name="sort">
          ${sortOptions.map(([value, label]) => `
            <option value="${value}"${state.sort === value ? ' selected' : ''}>
              ${escapeText(label)}
            </option>
          `).join('')}
        </select>
      </div>
    </div>
    <div class="d-flex flex-wrap gap-2 mt-3">
      <button class="btn btn-primary" type="submit">
        <i class="bi bi-search me-2" aria-hidden="true"></i>Apply filters
      </button>
      <a class="btn btn-secondary" href="/products/">Clear filters</a>
    </div>
  </form>
  <div id="search-results" aria-live="polite"></div>
`;

const searchForm = document.querySelector('#product-search-form');
const resultsContainer = document.querySelector('#search-results');

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(searchForm);
  const params = new URLSearchParams();
  const q = String(formData.get('q') ?? '').trim();
  const destination = String(formData.get('destination') ?? '').trim();
  const maxPrice = String(formData.get('maxPrice') ?? '').trim();
  const sort = String(formData.get('sort') ?? 'name_asc');

  if (q) params.set('q', q);
  if (destination) params.set('destination', destination);
  if (maxPrice) params.set('maxPrice', maxPrice);
  params.set('sort', sort);
  params.set('page', '1');

  window.location.assign(`/products/?${params.toString()}`);
});

function applyCatalogFilters(query) {
  query = query.eq('is_active', true);

  if (state.q) {
    query = query.ilike('name', `%${state.q.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`);
  }
  if (state.destination) {
    query = query.ilike('description', `%Type: ${state.destination}.%`);
  }
  if (state.maxPrice !== null) {
    query = query.lte('price', state.maxPrice);
  }

  if (state.sort === 'name_desc') {
    query = query.order('name', { ascending: false }).order('id', { ascending: true });
  } else if (state.sort === 'price_asc') {
    query = query.order('price', { ascending: true }).order('name', { ascending: true });
  } else if (state.sort === 'price_desc') {
    query = query.order('price', { ascending: false }).order('name', { ascending: true });
  } else {
    query = query.order('name', { ascending: true }).order('id', { ascending: true });
  }

  return query;
}

function renderPagination(totalCount) {
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  if (pageCount <= 1) return '';

  const pages = [];
  const first = Math.max(1, state.page - 2);
  const last = Math.min(pageCount, state.page + 2);

  for (let page = first; page <= last; page += 1) {
    pages.push(page);
  }

  return `
    <nav class="catalog-pagination" aria-label="Search result pages">
      <a class="btn btn-secondary btn-sm${state.page === 1 ? ' disabled' : ''}"
        href="${state.page === 1 ? '#' : escapeText(buildPageUrl(state.page - 1))}"
        ${state.page === 1 ? 'aria-disabled="true" tabindex="-1"' : ''}>
        Previous
      </a>
      ${pages.map((page) => `
        <a class="catalog-page-link${page === state.page ? ' active' : ''}"
          href="${escapeText(buildPageUrl(page))}"
          ${page === state.page ? 'aria-current="page"' : ''}>
          ${page}
        </a>
      `).join('')}
      <a class="btn btn-secondary btn-sm${state.page >= pageCount ? ' disabled' : ''}"
        href="${state.page >= pageCount ? '#' : escapeText(buildPageUrl(state.page + 1))}"
        ${state.page >= pageCount ? 'aria-disabled="true" tabindex="-1"' : ''}>
        Next
      </a>
    </nav>
  `;
}

async function loadResults() {
  if (state.errors.length > 0) {
    resultsContainer.innerHTML = `
      <div class="empty-state empty-state-error" role="alert">
        <span class="empty-state-icon" aria-hidden="true"><i class="bi bi-exclamation-triangle"></i></span>
        <h2 class="h4">Invalid search parameters</h2>
        <ul class="invalid-search-list">
          ${state.errors.map((error) => `<li>${escapeText(error)}</li>`).join('')}
        </ul>
        <a class="btn btn-secondary" href="/products/">Reset search</a>
      </div>
    `;
    return;
  }

  if (!supabase) {
    resultsContainer.innerHTML = renderEmptyState({
      title: 'Catalog unavailable',
      message: supabaseConfigurationError,
      icon: 'bi-exclamation-circle',
    });
    return;
  }

  resultsContainer.innerHTML = renderSkeletonCards(6);

  let countQuery = supabase
    .from('products')
    .select('id', { count: 'exact', head: true });
  countQuery = applyCatalogFilters(countQuery);

  const { count, error: countError } = await countQuery;
  if (countError) {
    resultsContainer.innerHTML = renderEmptyState({
      title: 'Search unavailable',
      message: 'We could not count matching products. Please try again.',
      icon: 'bi-wifi-off',
    });
    showToast('Could not load search results.', { type: 'error' });
    return;
  }

  const totalCount = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalCount > 0 && state.page > pageCount) {
    resultsContainer.innerHTML = `
      <div class="empty-state" role="status">
        <span class="empty-state-icon" aria-hidden="true"><i class="bi bi-list-ol"></i></span>
        <h2 class="h4">Page out of range</h2>
        <p>There are ${totalCount} matching results, available across ${pageCount} page${pageCount === 1 ? '' : 's'}.</p>
        <a class="btn btn-primary" href="${escapeText(buildPageUrl(1))}">Return to page 1</a>
      </div>
    `;
    return;
  }

  if (totalCount === 0) {
    resultsContainer.innerHTML = renderEmptyState({
      title: 'No matching products',
      message: 'Try a different name, destination, or maximum price.',
      icon: 'bi-inbox',
    });
    return;
  }

  const from = (state.page - 1) * pageSize;
  const to = from + pageSize - 1;
  let resultsQuery = supabase
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
    `);
  resultsQuery = applyCatalogFilters(resultsQuery).range(from, to);

  const { data: products, error: resultsError } = await resultsQuery;
  if (resultsError) {
    resultsContainer.innerHTML = renderEmptyState({
      title: 'Search unavailable',
      message: 'We could not load matching products. Please try again.',
      icon: 'bi-wifi-off',
    });
    showToast('Could not load search results.', { type: 'error' });
    return;
  }

  let matchingIdsQuery = supabase
    .from('products')
    .select('id');
  matchingIdsQuery = applyCatalogFilters(matchingIdsQuery);
  const { data: matchingIds, error: idsError } = await matchingIdsQuery;
  if (idsError) {
    resultsContainer.innerHTML = renderEmptyState({
      title: 'Search unavailable',
      message: 'We could not calculate the availability summary.',
      icon: 'bi-wifi-off',
    });
    return;
  }

  const ids = (matchingIds ?? []).map((product) => product.id);
  const availabilityById = new Map();
  if (ids.length > 0) {
    const { data: availabilityRows, error: availabilityError } = await supabase.rpc(
      'get_products_availability',
      { p_product_ids: ids }
    );
    if (availabilityError) {
      resultsContainer.innerHTML = renderEmptyState({
        title: 'Availability unavailable',
        message: 'Products loaded, but availability could not be verified.',
        icon: 'bi-wifi-off',
      });
      return;
    }
    availabilityRows?.forEach((row) => {
      availabilityById.set(row.product_id, row.is_available);
    });
  }

  const availableCount = [...availabilityById.values()]
    .filter((isAvailable) => isAvailable).length;
  const unavailableCount = totalCount - availableCount;
  const firstResult = from + 1;
  const lastResult = Math.min(to + 1, totalCount);
  const searchContext = buildSearchContext();

  resultsContainer.innerHTML = `
    <div class="catalog-results-summary">
      <p class="mb-0">
        <strong>${totalCount}</strong> matching result${totalCount === 1 ? '' : 's'}
        <span aria-hidden="true">·</span>
        Showing ${firstResult}-${lastResult}
      </p>
      <p class="mb-0">
        <span class="summary-available">${availableCount} available</span>
        <span aria-hidden="true">·</span>
        ${unavailableCount} unavailable
      </p>
    </div>
    <div class="row g-4">
      ${(products ?? []).map((product) => {
        const cover = (product.product_images ?? [])
          .find((image) => image.is_cover)
          ?? [...(product.product_images ?? [])]
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0];
        const available = availabilityById.get(product.id) === true;
        const returnContext = encodeURIComponent(searchContext);

        return `
          <div class="col-12 col-md-6 col-lg-4">
            ${renderProductCard({
              title: product.name,
              description: product.description,
              price: product.price,
              imageLabel: cover?.alt_text || product.name,
              imageUrl: publicImageUrl(product),
              href: `/product/?id=${encodeURIComponent(product.id)}&return=${returnContext}`,
              available,
              actionLabel: 'View Product',
              actionHref: `/product/?id=${encodeURIComponent(product.id)}&return=${returnContext}`,
            })}
          </div>
        `;
      }).join('')}
    </div>
    ${renderPagination(totalCount)}
  `;

  installImageFallbacks(resultsContainer);
}

loadResults();
