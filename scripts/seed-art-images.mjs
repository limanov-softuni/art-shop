import { createClient } from '@supabase/supabase-js';

const intendedProjectRef = 'lskvwfxgpoorcnicttaj';
const bucketName = 'product-images';
const targetImagesPerProduct = 3;

const projectRef = process.env.SUPABASE_PROJECT_REF;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const missing = [];
if (!projectRef) missing.push('SUPABASE_PROJECT_REF');
if (!supabaseUrl) missing.push('SUPABASE_URL');
if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (missing.length) {
  throw new Error(`Missing server image seed configuration: ${missing.join(', ')}`);
}
if (projectRef !== intendedProjectRef) {
  throw new Error(`Refusing seed: project reference must be ${intendedProjectRef}.`);
}
if (supabaseUrl !== `https://${intendedProjectRef}.supabase.co`) {
  throw new Error('Refusing seed: SUPABASE_URL must be the dedicated project URL.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const searchTerms = {
  'Crimson Horizon': 'red landscape sunset',
  'Quiet Current': 'river water landscape',
  'Moonlit Sentinel': 'moon night sculpture',
  'Glasshouse Morning': 'window sunlight interior',
  'City in Amber': 'city street amber',
  'Parallel Islands': 'islands abstract',
  'Graphite Stillness': 'graphite still life drawing',
  'Woven Autumn': 'textile weaving autumn',
  'Blue Vessel': 'blue ceramic vase',
  'Fragments of Summer': 'summer flowers painting',
};

const counts = {
  uploaded: 0,
  metadataCreated: 0,
  skipped: 0,
  failed: 0,
  cleaned: 0,
};

async function getPublicDomainCandidates(query, limit = 12) {
  const endpoint = new URL('https://commons.wikimedia.org/w/api.php');
  endpoint.searchParams.set('action', 'query');
  endpoint.searchParams.set('generator', 'search');
  endpoint.searchParams.set('gsrsearch', `public domain ${query}`);
  endpoint.searchParams.set('gsrnamespace', '6');
  endpoint.searchParams.set('gsrlimit', String(limit));
  endpoint.searchParams.set('prop', 'imageinfo');
  endpoint.searchParams.set('iiprop', 'url|mime|extmetadata');
  endpoint.searchParams.set('iiurlwidth', '1600');
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('origin', '*');

  const response = await fetch(endpoint, {
    headers: { 'User-Agent': 'ArtShopDemoSeed/1.0' },
  });
  if (!response.ok) {
    throw new Error(`Museum image search failed (${response.status}).`);
  }

  const payload = await response.json();
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
  return Object.values(payload.query?.pages ?? {})
    .map((page) => {
      const info = page.imageinfo?.[0];
      const license = info?.extmetadata?.LicenseShortName?.value ?? '';
      return {
        title: page.title?.replace(/^File:/, '') ?? 'Artwork',
        url: info?.thumburl || info?.url,
        mime: info?.mime,
        license,
      };
    })
    .filter((item) =>
      item.url
      && allowed.has(item.mime)
      && /public domain|cc0|pd-license|pdm/i.test(item.license)
    );
}

async function cleanUpload(storagePath) {
  const { error } = await supabase.storage
    .from(bucketName)
    .remove([storagePath]);
  if (!error) counts.cleaned += 1;
}

async function seedProduct(product) {
  const { data: existingImages, error: existingError } = await supabase
    .from('product_images')
    .select('id,storage_path,position,is_cover')
    .eq('product_id', product.id)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (existingError) throw existingError;

  if ((existingImages?.length ?? 0) >= targetImagesPerProduct) {
    counts.skipped += targetImagesPerProduct;
    return;
  }

  let candidates;
  try {
    candidates = await getPublicDomainCandidates(
      searchTerms[product.name] ?? `${product.name} art`,
      12
    );
  } catch (error) {
    counts.failed += 1;
    console.warn(`Could not search images for ${product.name}: ${error.message}`);
    return;
  }

  const currentCover = (existingImages ?? []).find((image) => image.is_cover);
  let nextPosition = (existingImages?.length ?? 0) + 1;

  for (const candidate of candidates) {
    if (nextPosition > targetImagesPerProduct) break;

    const extension = 'jpg';
    const objectId = globalThis.crypto?.randomUUID?.()
      ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const storagePath = `${product.id}/${objectId}.${extension}`;

    let imageResponse;
    try {
      imageResponse = await fetch(candidate.url);
    } catch (error) {
      counts.failed += 1;
      continue;
    }

    if (!imageResponse.ok) {
      counts.failed += 1;
      continue;
    }

    const contentType = imageResponse.headers.get('content-type') ?? '';
    if (!contentType.includes('image/jpeg') && !contentType.includes('image/png') && !contentType.includes('image/webp')) {
      counts.failed += 1;
      continue;
    }

    const bytes = await imageResponse.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > 10 * 1024 * 1024) {
      counts.failed += 1;
      continue;
    }

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(storagePath, new Uint8Array(bytes), {
        contentType: contentType.includes('image/png')
          ? 'image/png'
          : contentType.includes('image/webp')
            ? 'image/webp'
            : 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      counts.failed += 1;
      continue;
    }
    counts.uploaded += 1;

    const altText = `${candidate.title}. Public-domain or freely licensed artwork from Wikimedia Commons.`;
    const isCover = !currentCover && nextPosition === (existingImages?.length ?? 0) + 1;
    const { data: metadata, error: metadataError } = await supabase
      .from('product_images')
      .insert({
        product_id: product.id,
        storage_path: storagePath,
        alt_text: altText,
        position: nextPosition,
        is_cover: isCover,
      })
      .select('id')
      .single();

    if (metadataError) {
      counts.failed += 1;
      await cleanUpload(storagePath);
      continue;
    }

    counts.metadataCreated += 1;
    if (isCover) {
      await supabase.rpc('set_product_image_cover', {
        p_image_id: metadata.id,
      });
    }
    nextPosition += 1;
  }
}

async function main() {
  const { data: products, error } = await supabase
    .from('products')
    .select('id,name')
    .order('name', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;

  for (const product of products ?? []) {
    await seedProduct(product);
  }

  console.log(JSON.stringify({
    projectRef: intendedProjectRef,
    bucket: bucketName,
    targetImagesPerProduct,
    created: {
      uploads: counts.uploaded,
      metadata: counts.metadataCreated,
    },
    skippedByExistingLimit: counts.skipped,
    failed: counts.failed,
    cleanedUploads: counts.cleaned,
  }));
}

main().catch((error) => {
  console.error(`Art image seed failed: ${error.message}`);
  process.exitCode = 1;
});
