import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const pages = [
  'index',
  'products/index',
  'product/index',
  'login/index',
  'register/index',
  'order/index',
  'order-confirmation/index',
  'my-orders/index',
  'order-details/index',
  'account/index',
  'admin/index',
  'admin/products/index',
  'admin/product-edit/index',
  'admin/images/index',
  'admin/orders/index',
];

export default defineConfig({
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        pages.map((page) => [page.replace(/\//g, '-'), resolve(process.cwd(), `${page}.html`)])
      ),
    },
  },
});
