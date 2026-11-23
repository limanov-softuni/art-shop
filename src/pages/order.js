import { initializePage } from './common.js';
import { getQueryParam } from '../utils/query-params.js';

initializePage('Checkout');
const orderDate = getQueryParam('orderDate');
if (orderDate) {
  const detail = document.createElement('p');
  detail.className = 'small text-secondary';
  detail.textContent = `Order date: ${orderDate}`;
  document.querySelector('#page-content').append(detail);
}
