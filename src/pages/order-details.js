import { initializePage } from './common.js';
import { getQueryParam } from '../utils/query-params.js';

initializePage('Order details');
const id = getQueryParam('id');
if (id) {
  const detail = document.createElement('p');
  detail.className = 'small text-secondary';
  detail.textContent = `Selected order: ${id}`;
  document.querySelector('#page-content').append(detail);
}
