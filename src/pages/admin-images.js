import { initializePage } from './common.js';
import { supabase, supabaseConfigurationError } from '../services/supabase.js';
import {
  escapeText,
  openConfirmation,
  renderEmptyState,
  renderSkeletonCards,
  showToast,
} from '../components/ui.js';

initializePage('Admin: Images', 'Upload and manage product gallery assets.');

const pageContent = document.querySelector('#page-content');
const BUCKET = 'product-images';
const MAX_SIZE = 10 * 1024 * 1024;
const MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
let activeRequest = 0;

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function publicUrl(storagePath) {
  if (!storagePath) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data?.publicUrl || null;
}

function generatedPath(productId, file) {
  const extension = file.type === 'image/png'
    ? 'png'
    : file.type === 'image/webp'
      ? 'webp'
      : 'jpg';
  const id = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${productId}/${id}.${extension}`;
}

async function requireAdmin() {
  if (!supabase) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Administration unavailable',
      message: supabaseConfigurationError,
      icon: 'bi-exclamation-circle',
    });
    return null;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session) {
    window.location.replace(`/login/?return=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    return null;
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
    return null;
  }

  return sessionData.session.user;
}

async function loadImageManager() {
  const requestId = ++activeRequest;
  if (!await requireAdmin()) return;

  pageContent.innerHTML = renderSkeletonCards(3);

  const { data: products, error } = await supabase
    .from('products')
    .select('id,name,is_active')
    .order('name', { ascending: true })
    .order('id', { ascending: true });

  if (requestId !== activeRequest) return;
  if (error) {
    pageContent.innerHTML = renderEmptyState({
      title: 'Products unavailable',
      message: 'We could not load the product selector.',
      icon: 'bi-wifi-off',
    });
    showToast('Could not load products.', { type: 'error' });
    return;
  }

  const requestedId = new URLSearchParams(window.location.search).get('productId')?.trim() ?? '';
  const selectedId = products?.some((product) => product.id === requestedId)
    ? requestedId
    : products?.[0]?.id ?? '';

  pageContent.innerHTML = `
    <div class="image-manager-header">
      <div>
        <p class="eyebrow mb-2">Catalog assets</p>
        <h2 class="h3 mb-0">Product images</h2>
      </div>
      <a class="btn btn-secondary" href="/admin/products/">Back to products</a>
    </div>
    <div class="image-manager-controls">
      <label class="form-label" for="image-product-select">Product</label>
      <select id="image-product-select" class="form-select">
        ${(products ?? []).map((product) => `
          <option value="${escapeText(product.id)}"${product.id === selectedId ? ' selected' : ''}>
            ${escapeText(product.name)}${product.is_active ? '' : ' (inactive)'}
          </option>
        `).join('')}
      </select>
    </div>
    <div id="image-manager-content" aria-live="polite">
      ${renderSkeletonCards(3)}
    </div>
  `;

  const selector = document.querySelector('#image-product-select');
  if (!selectedId) {
    document.querySelector('#image-manager-content').innerHTML = renderEmptyState({
      title: 'No products',
      message: 'Create a product before managing its images.',
      icon: 'bi-inbox',
    });
    return;
  }

  selector.addEventListener('change', () => {
    const url = new URL(window.location.href);
    url.searchParams.set('productId', selector.value);
    window.history.pushState({}, '', url);
    loadSelectedProduct(selector.value);
  });

  loadSelectedProduct(selectedId);
}

async function loadSelectedProduct(productId) {
  if (!isUuid(productId)) return;

  const content = document.querySelector('#image-manager-content');
  content.innerHTML = renderSkeletonCards(3);

  const { data: product, error: productError } = await supabase
    .from('products')
    .select('id,name')
    .eq('id', productId)
    .maybeSingle();

  if (productError || !product) {
    content.innerHTML = renderEmptyState({
      title: 'Product unavailable',
      message: 'The selected product could not be loaded.',
      icon: 'bi-wifi-off',
    });
    return;
  }

  const { data: images, error: imagesError } = await supabase
    .from('product_images')
    .select('id,storage_path,alt_text,position,is_cover,created_at')
    .eq('product_id', productId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (imagesError) {
    content.innerHTML = renderEmptyState({
      title: 'Images unavailable',
      message: 'We could not load product image metadata.',
      icon: 'bi-wifi-off',
    });
    showToast('Could not load image metadata.', { type: 'error' });
    return;
  }

  const sortedImages = [...(images ?? [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  content.innerHTML = `
    <div class="image-upload-card">
      <div>
        <p class="eyebrow mb-2">Upload</p>
        <h3 class="h4 mb-1">${escapeText(product.name)}</h3>
        <p class="text-secondary mb-0">PNG, JPEG or WebP, up to 10 MB.</p>
      </div>
      <div class="image-upload-body">
        <label class="image-preview" for="image-file-input">
          <img id="image-preview" alt="Selected image preview" hidden>
          <span id="image-preview-placeholder">
            <i class="bi bi-image" aria-hidden="true"></i>
            <span>Choose an image</span>
          </span>
        </label>
        <input id="image-file-input" class="visually-hidden" type="file"
          accept="image/png,image/jpeg,image/webp">
        <div class="image-upload-fields">
          <label class="form-label" for="image-alt-text">Alternative text</label>
          <input id="image-alt-text" class="form-control" maxlength="300"
            placeholder="Describe the image">
          <div id="image-upload-error" class="invalid-feedback d-block"></div>
          <button id="upload-image" class="btn btn-primary mt-3" type="button" disabled>
            Upload image
          </button>
        </div>
      </div>
    </div>
    <div class="gallery-manager-heading">
      <h3 class="h4 mb-0">Gallery</h3>
      <span class="text-secondary">${sortedImages.length} image${sortedImages.length === 1 ? '' : 's'}</span>
    </div>
    <div id="gallery-list" class="gallery-manager-list">
      ${sortedImages.length
        ? sortedImages.map((image, index) => `
          <article class="gallery-manager-card" data-image-id="${escapeText(image.id)}">
            <img class="gallery-manager-image" src="${escapeText(publicUrl(image.storage_path))}"
              alt="${escapeText(image.alt_text)}">
            <div class="gallery-manager-body">
              <div class="gallery-manager-alt">
                <label class="form-label" for="alt-${escapeText(image.id)}">Alternative text</label>
                <input id="alt-${escapeText(image.id)}" class="form-control gallery-alt-input"
                  maxlength="300" value="${escapeText(image.alt_text)}">
              </div>
              <div class="gallery-manager-actions">
                <button class="btn btn-ghost btn-sm" type="button"
                  data-save-alt="${escapeText(image.id)}">Save alt text</button>
                <button class="btn ${image.is_cover ? 'btn-secondary' : 'btn-primary'} btn-sm"
                  type="button" data-set-cover="${escapeText(image.id)}"
                  ${image.is_cover ? 'disabled' : ''}>
                  ${image.is_cover ? 'Cover image' : 'Set cover'}
                </button>
                <button class="btn btn-ghost btn-sm" type="button"
                  data-replace-image="${escapeText(image.id)}">Replace</button>
                <button class="btn btn-ghost btn-sm" type="button"
                  data-download-image="${escapeText(image.id)}"
                  data-storage-path="${escapeText(image.storage_path)}">Download original</button>
                <button class="btn btn-outline-danger btn-sm" type="button"
                  data-remove-image="${escapeText(image.id)}"
                  data-storage-path="${escapeText(image.storage_path)}"
                  data-position="${index + 1}"
                  data-cover="${image.is_cover ? 'true' : 'false'}"
                  data-alt="${escapeText(image.alt_text)}">Remove</button>
              </div>
              <div class="gallery-reorder">
                <button class="btn btn-ghost btn-sm" type="button"
                  data-move-up="${escapeText(image.id)}"${index === 0 ? ' disabled' : ''}>
                  <i class="bi bi-arrow-up" aria-hidden="true"></i> Up
                </button>
                <button class="btn btn-ghost btn-sm" type="button"
                  data-move-down="${escapeText(image.id)}"${index === sortedImages.length - 1 ? ' disabled' : ''}>
                  <i class="bi bi-arrow-down" aria-hidden="true"></i> Down
                </button>
              </div>
            </div>
          </article>
        `).join('')
        : '<div class="empty-state"><span class="empty-state-icon"><i class="bi bi-images"></i></span><h3 class="h5">No gallery images</h3><p>Upload the first image for this product.</p></div>'
      }
    </div>
  `;

  let selectedFile = null;
  let previewUrl = null;
  const fileInput = document.querySelector('#image-file-input');
  const preview = document.querySelector('#image-preview');
  const previewPlaceholder = document.querySelector('#image-preview-placeholder');
  const uploadButton = document.querySelector('#upload-image');
  const altInput = document.querySelector('#image-alt-text');
  const uploadError = document.querySelector('#image-upload-error');

  fileInput.addEventListener('change', () => {
    selectedFile = fileInput.files?.[0] ?? null;
    uploadError.textContent = '';
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;

    if (!selectedFile) {
      preview.hidden = true;
      previewPlaceholder.hidden = false;
      uploadButton.disabled = true;
      return;
    }
    if (!MIME_TYPES.has(selectedFile.type)) {
      uploadError.textContent = 'Choose a PNG, JPEG or WebP image.';
      selectedFile = null;
      preview.hidden = true;
      previewPlaceholder.hidden = false;
      uploadButton.disabled = true;
      return;
    }
    if (selectedFile.size > MAX_SIZE) {
      uploadError.textContent = 'Image must be 10 MB or smaller.';
      selectedFile = null;
      preview.hidden = true;
      previewPlaceholder.hidden = false;
      uploadButton.disabled = true;
      return;
    }

    previewUrl = URL.createObjectURL(selectedFile);
    preview.src = previewUrl;
    preview.hidden = false;
    previewPlaceholder.hidden = true;
    uploadButton.disabled = false;
  });

  uploadButton.addEventListener('click', async () => {
    if (!selectedFile) return;
    const altText = altInput.value.trim();
    if (!altText) {
      uploadError.textContent = 'Alternative text is required.';
      altInput.focus();
      return;
    }

    uploadButton.disabled = true;
    uploadButton.textContent = 'Uploading…';
    const storagePath = generatedPath(productId, selectedFile);
    const { error: uploadErrorResult } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, selectedFile, {
        contentType: selectedFile.type,
        upsert: false,
      });

    if (uploadErrorResult) {
      showToast(uploadErrorResult.message || 'Upload failed.', { type: 'error' });
      uploadButton.disabled = false;
      uploadButton.textContent = 'Upload image';
      return;
    }

    const position = sortedImages.length + 1;
    const isCover = sortedImages.length === 0;
    const { error: insertError } = await supabase
      .from('product_images')
      .insert({
        product_id: productId,
        storage_path: storagePath,
        alt_text: altText,
        position,
        is_cover: isCover,
      });

    if (insertError) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
      showToast('Upload completed but metadata could not be saved. The uploaded file was cleaned up.', { type: 'error' });
      uploadButton.disabled = false;
      uploadButton.textContent = 'Upload image';
      return;
    }

    showToast('Product image uploaded.', { type: 'success' });
    await loadSelectedProduct(productId);
  });

  content.querySelectorAll('[data-save-alt]').forEach((button) => {
    button.addEventListener('click', async () => {
      const input = document.querySelector(`#alt-${CSS.escape(button.dataset.saveAlt)}`);
      const altText = input.value.trim();
      if (!altText) {
        input.classList.add('is-invalid');
        showToast('Alternative text is required.', { type: 'error' });
        return;
      }
      button.disabled = true;
      const { error } = await supabase
        .from('product_images')
        .update({ alt_text: altText })
        .eq('id', button.dataset.saveAlt);
      if (error) {
        showToast(error.message || 'Alternative text could not be saved.', { type: 'error' });
        button.disabled = false;
        return;
      }
      showToast('Alternative text saved.', { type: 'success' });
      await loadSelectedProduct(productId);
    });
  });

  content.querySelectorAll('[data-set-cover]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      const { data, error } = await supabase.rpc('set_product_image_cover', {
        p_image_id: button.dataset.setCover,
      });
      if (error || data?.status !== 'updated') {
        showToast(error?.message || data?.message || 'Cover could not be changed.', { type: 'error' });
        button.disabled = false;
        return;
      }
      showToast('Cover image updated.', { type: 'success' });
      await loadSelectedProduct(productId);
    });
  });

  content.querySelectorAll('[data-move-up], [data-move-down]').forEach((button) => {
    button.addEventListener('click', async () => {
      const moveUp = Boolean(button.dataset.moveUp);
      const imageId = moveUp ? button.dataset.moveUp : button.dataset.moveDown;
      const orderedIds = sortedImages.map((image) => image.id);
      const index = orderedIds.indexOf(imageId);
      const swapIndex = moveUp ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= orderedIds.length) return;
      [orderedIds[index], orderedIds[swapIndex]] = [orderedIds[swapIndex], orderedIds[index]];

      const { data, error } = await supabase.rpc('reorder_product_images', {
        p_product_id: productId,
        p_image_ids: orderedIds,
      });
      if (error || data?.status !== 'updated') {
        showToast(error?.message || data?.message || 'Gallery order could not be changed.', { type: 'error' });
        return;
      }
      showToast('Gallery reordered.', { type: 'success' });
      await loadSelectedProduct(productId);
    });
  });

  content.querySelectorAll('[data-download-image]').forEach((button) => {
    button.addEventListener('click', async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .download(button.dataset.storagePath);
      if (error || !data) {
        showToast(error?.message || 'The original file could not be downloaded.', { type: 'error' });
        return;
      }
      const downloadUrl = URL.createObjectURL(data);
      const link = document.createElement('a');
      const fileName = button.dataset.storagePath.split('/').pop();
      link.href = downloadUrl;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    });
  });

  content.querySelectorAll('[data-remove-image]').forEach((button) => {
    button.addEventListener('click', async () => {
      const confirmed = await openConfirmation({
        title: 'Remove this image?',
        message: 'The gallery metadata and original Storage object will be removed. A remaining image becomes the cover when appropriate.',
        confirmLabel: 'Remove',
        cancelLabel: 'Keep',
        destructive: true,
      });
      if (!confirmed) return;

      button.disabled = true;
      const imageId = button.dataset.removeImage;
      const storagePath = button.dataset.storagePath;
      const { data, error } = await supabase.rpc('remove_product_image', {
        p_image_id: imageId,
      });
      if (error || data?.status !== 'removed') {
        showToast(error?.message || data?.message || 'Image metadata could not be removed.', { type: 'error' });
        button.disabled = false;
        return;
      }

      const { error: storageError } = await supabase.storage
        .from(BUCKET)
        .remove([storagePath]);
      if (storageError) {
        const position = Number(button.dataset.position);
        const altText = button.dataset.alt;
        const isCover = button.dataset.cover === 'true';
        const { error: restoreError } = await supabase
          .from('product_images')
          .insert({
            id: imageId,
            product_id: productId,
            storage_path: storagePath,
            alt_text: altText,
            position,
            is_cover: false,
          });
        if (!restoreError && isCover) {
          await supabase.rpc('set_product_image_cover', { p_image_id: imageId });
        }
        showToast('The Storage removal failed. The image metadata was restored.', { type: 'error' });
        await loadSelectedProduct(productId);
        return;
      }

      showToast('Image removed and cover synchronized.', { type: 'success' });
      await loadSelectedProduct(productId);
    });
  });

  content.querySelectorAll('[data-replace-image]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/webp';
      input.hidden = true;
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        if (!MIME_TYPES.has(file.type)) {
          showToast('Choose a PNG, JPEG or WebP image.', { type: 'error' });
          return;
        }
        if (file.size > MAX_SIZE) {
          showToast('Image must be 10 MB or smaller.', { type: 'error' });
          return;
        }

        const card = button.closest('[data-image-id]');
        const imageId = card.dataset.imageId;
        const oldImage = sortedImages.find((image) => image.id === imageId);
        if (!oldImage) return;

        button.disabled = true;
        const newPath = generatedPath(productId, file);
        const { error: uploadErrorResult } = await supabase.storage
          .from(BUCKET)
          .upload(newPath, file, {
            contentType: file.type,
            upsert: false,
          });
        if (uploadErrorResult) {
          showToast(uploadErrorResult.message || 'Replacement upload failed.', { type: 'error' });
          button.disabled = false;
          return;
        }

        const { error: updateError } = await supabase
          .from('product_images')
          .update({ storage_path: newPath })
          .eq('id', imageId);
        if (updateError) {
          await supabase.storage.from(BUCKET).remove([newPath]);
          showToast('Replacement upload completed but metadata could not be updated. The new file was cleaned up.', { type: 'error' });
          button.disabled = false;
          return;
        }

        const { error: removeOldError } = await supabase.storage
          .from(BUCKET)
          .remove([oldImage.storage_path]);
        if (removeOldError) {
          await supabase
            .from('product_images')
            .update({ storage_path: oldImage.storage_path })
            .eq('id', imageId);
          await supabase.storage.from(BUCKET).remove([newPath]);
          showToast('The old file could not be removed. Replacement was rolled back.', { type: 'error' });
          await loadSelectedProduct(productId);
          return;
        }

        showToast('Product image replaced.', { type: 'success' });
        await loadSelectedProduct(productId);
      });
      document.body.append(input);
      input.click();
      input.remove();
    });
  });
}

window.addEventListener('popstate', loadImageManager);
loadImageManager();
