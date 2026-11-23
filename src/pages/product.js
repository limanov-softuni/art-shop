import { initializePage } from './common.js';
import { getQueryParam } from '../utils/query-params.js';

initializePage('Product');
const id = getQueryParam('id');
if (id) {
  const detail = document.createElement('p');
  detail.className = 'small text-secondary';
  detail.textContent = `Selected product: ${id}`;
  document.querySelector('#page-content').append(detail);
}
