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

initializePage('My orders', 'Review confirmed and cancelled Art Shop orders.');

const pageContent = document.querySelector('#page-content');
if (!pageContent) throw new Error('Page content element was not found.');

const pageSize = 10;
const params = new URLSearchParams(window.location.search);
const statusParam = params.get('status') ?? 'all';
const pageParam = params.get('page') ?? '1';
let activeRequest = 0;

const validStatuses = ['all', 'confirmed', 'completed', 'cancelled'];
const status = validStatuses.includes(statusParam) ? statusParam : 'all';
const page = /^[1-9]\d*$/.test(pageParam) ? Number(pageParam) : 1;

function publicImageUrl(storagePath) {
  return getProductImagePublicUrl(supabase, storagePath);
}

function buildUrl(nextStatus, nextPage) {
  const nextParams = new URLSearchParams();
  if (nextStatus !== 'all') nextParams.set('status', nextStatus);
  if (nextPage > 1) nextParams.set('page', String(nextPage));
  return `/my-orders/${nextParams.size ? `?${nextParams.toString()}` : ''}`;
}

function renderPagination(totalCount) {
  const pageCount = Math.ceil(totalCount / pageSize);
  if (pageCount <= 1) return '';

  const first = Math.max(1, page - 2);
  const last = Math.min(pageCount, page + 2);
  const links = [];
  for (let number = first; number <= last; number += 1) {
    links.push(`
      <a class="catalog-page-link${number === page ? ' active' : ''}"
        href="${escapeText(buildUrl(status, number))}"
        ${number === page ? 'aria-current="page"' : ''}>${number}</a>
    `);
  }

  return `
    <nav class="catalog-pagination" aria-label="Order pages">
      <a class="btn btn-secondary btn-sm${page === 1 ? ' disabled' : ''}"
        href="${page === 1 ? '#' : escapeText(buildUrl(status, page - 1))}"
        ${page === 1 ? 'aria-disabled="true" tabindex="-1"' : ''}>Previous</a>
      ${links.join('')}
      <a class="btn btn-secondary btn-sm${page >= pageCount ? ' disabled' : ''}"
        href="${page >= pageCount ? '#' : escapeText(buildUrl(status, page + 1))}"
        ${page >= pageCount ? 'aria-disabled="true" tabindex="-1"' : ''}>Next</a>
    </nav>
  `;
}

pageContent.innerHTML = `
  <section class="orders-toolbar" aria-label="Order filters">
    <nav class="orders-filter-tabs" aria-label="Filter by order status">
      ${[
        ['all', 'All'],
        ['confirmed', 'Confirmed'],
        ['completed', 'Completed'],
        ['cancelled', 'Cancelled'],
      ].map(([value, label]) => `
        <a href="${escapeText(buildUrl(value, 1))}"
          class="orders-filter-tab${status === value ? ' active' : ''}"
          ${status === value ? 'aria-current="page"' : ''}>${label}</a>
      `).join('')}
    </nav>
  </section>
  <div id="orders-results" aria-live="polite"></div>
`;

const resultsContainer = document.querySelector('#orders-results');

async function loadOrders() {
  const requestId = ++activeRequest;
  resultsContainer.innerHTML = renderSkeletonCards(6);

  if (!supabase) {
    resultsContainer.innerHTML = renderEmptyState({
      title: 'Orders unavailable',
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

  let countQuery = supabase
    .from('orders')
    .select('id', { count: 'exact', head: true });
  if (status !== 'all') countQuery = countQuery.eq('status', status);

  const { count, error: countError } = await countQuery;
  if (requestId !== activeRequest) return;
  if (countError) {
    resultsContainer.innerHTML = renderEmptyState({
      title: 'Orders unavailable',
      message: 'We could not load your order list.',
      icon: 'bi-wifi-off',
    });
    showToast('Could not load orders.', { type: 'error' });
    return;
  }

  const totalCount = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  if (page > pageCount) {
    resultsContainer.innerHTML = `
      <div class="empty-state" role="status">
        <span class="empty-state-icon" aria-hidden="true"><i class="bi bi-list-ol"></i></span>
        <h2 class="h4">Page out of range</h2>
        <p>There are ${totalCount} matching orders across ${pageCount} page${pageCount === 1 ? '' : 's'}.</p>
        <a class="btn btn-primary" href="${escapeText(buildUrl(status, 1))}">Return to page 1</a>
      </div>
    `;
    return;
  }

  if (totalCount === 0) {
    resultsContainer.innerHTML = renderEmptyState({
      title: status === 'all' ? 'No orders yet' : `No ${status} orders`,
      message: 'Your matching order history will appear here.',
      icon: 'bi-inbox',
    });
    return;
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let ordersQuery = supabase
    .from('orders')
    .select(`
      id,
      reference,
      status,
      total_price,
      currency,
      product_name_snapshot,
      product_id,
      created_at,
      cancelled_at,
      products (
        id,
        name,
        product_images (
          storage_path,
          alt_text,
          position,
          is_cover
        )
      )
    `)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, to);
  if (status !== 'all') ordersQuery = ordersQuery.eq('status', status);

  const { data: orders, error: ordersError } = await ordersQuery;
  if (requestId !== activeRequest) return;
  if (ordersError) {
    resultsContainer.innerHTML = renderEmptyState({
      title: 'Orders unavailable',
      message: 'We could not load your orders.',
      icon: 'bi-wifi-off',
    });
    showToast('Could not load orders.', { type: 'error' });
    return;
  }

  const firstResult = from + 1;
  const lastResult = Math.min(to + 1, totalCount);
  resultsContainer.innerHTML = `
    <div class="orders-summary">
      <strong>${totalCount}</strong> matching order${totalCount === 1 ? '' : 's'}
      <span aria-hidden="true">·</span>
      Showing ${firstResult}-${lastResult}
    </div>
    <div class="orders-list">
      ${(orders ?? []).map((order) => {
        const images = [...(order.products?.product_images ?? [])]
          .sort((a, b) => {
            if (a.is_cover !== b.is_cover) return a.is_cover ? -1 : 1;
            return (a.position ?? 0) - (b.position ?? 0);
          });
        const imageUrl = images[0]
          ? publicImageUrl(images[0].storage_path)
          : null;
        const createdAt = new Date(order.created_at);
        const createdLabel = Number.isNaN(createdAt.valueOf())
          ? 'Date unavailable'
          : createdAt.toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            });

        return `
          <article class="order-list-card">
            ${imageUrl
              ? `<img class="order-list-image" src="${escapeText(imageUrl)}"
                  alt="${escapeText(images[0]?.alt_text || order.product_name_snapshot)}">`
              : `
                <span class="order-list-placeholder" role="img"
                  aria-label="No image available for ${escapeText(order.product_name_snapshot)}">
                  <i class="bi bi-image" aria-hidden="true"></i>
                  <span>Image unavailable</span>
                </span>
              `}
            <div class="order-list-body">
              <div class="order-list-heading">
                <div>
                  <p class="eyebrow mb-1">${escapeText(order.reference)}</p>
                  <h2 class="h4 mb-1">${escapeText(order.product_name_snapshot)}</h2>
                  <p class="text-secondary mb-0">${escapeText(createdLabel)}</p>
                </div>
                <span class="badge ${order.status === 'confirmed' ? 'badge-success' : 'badge-neutral'}">
                  ${order.status === 'confirmed' ? 'Confirmed' : order.status === 'completed' ? 'Completed' : 'Cancelled'}
                </span>
              </div>
              <div class="order-list-footer">
                <div>
                  <span class="text-secondary small">Saved amount</span>
                  <strong class="d-block">${formatEUR(order.total_price)}</strong>
                </div>
                <a class="btn btn-primary btn-sm"
                  href="/order-details/?id=${encodeURIComponent(order.id)}">
                  View details
                </a>
              </div>
            </div>
          </article>
        `;
      }).join('')}
    </div>
    ${renderPagination(totalCount)}
  `;
}

window.addEventListener('popstate', loadOrders);
loadOrders();
