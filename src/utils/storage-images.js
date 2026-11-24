export const PRODUCT_IMAGE_BUCKET = 'product-images';

export function getProductImagePublicUrl(supabaseClient, storagePath) {
  if (!supabaseClient || !storagePath) return null;

  const { data } = supabaseClient.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .getPublicUrl(storagePath);

  return data?.publicUrl || null;
}
