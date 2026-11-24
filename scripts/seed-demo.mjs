import { createClient } from '@supabase/supabase-js';

const INTENDED_PROJECT_REF = 'lskvwfxgpoorcnicttaj';
const isDryRun = process.argv.includes('--dry-run');

const projectRef = process.env.SUPABASE_PROJECT_REF;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.DEMO_ADMIN_EMAIL;
const adminPassword = process.env.DEMO_ADMIN_PASSWORD;
const guestPassword = process.env.DEMO_GUEST_PASSWORD;

function requireServerConfiguration() {
  const missing = [];
  if (!projectRef) missing.push('SUPABASE_PROJECT_REF');
  if (!supabaseUrl) missing.push('SUPABASE_URL');
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!adminEmail) missing.push('DEMO_ADMIN_EMAIL');
  if (!isDryRun && !adminPassword) missing.push('DEMO_ADMIN_PASSWORD');
  if (!isDryRun && !guestPassword) {
    missing.push('DEMO_GUEST_PASSWORD');
  }

  if (missing.length > 0) {
    throw new Error(`Missing server seed configuration: ${missing.join(', ')}`);
  }

  if (projectRef !== INTENDED_PROJECT_REF) {
    throw new Error(
      `Refusing to seed: SUPABASE_PROJECT_REF must be ${INTENDED_PROJECT_REF}.`
    );
  }

  const expectedUrl = `https://${INTENDED_PROJECT_REF}.supabase.co`;
  if (supabaseUrl !== expectedUrl) {
    throw new Error(
      `Refusing to seed: SUPABASE_URL must be ${expectedUrl}.`
    );
  }

  if (!adminEmail.endsWith('@example.invalid')) {
    throw new Error(
      'DEMO_ADMIN_EMAIL must use the reserved @example.invalid domain.'
    );
  }
}

requireServerConfiguration();

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const guestAccounts = [
  { email: 'demo.guest1@example.invalid', displayName: 'Demo Guest One' },
  { email: 'demo.guest2@example.invalid', displayName: 'Demo Guest Two' },
  { email: 'demo.guest3@example.invalid', displayName: 'Demo Guest Three' },
];

const products = [
  {
    name: 'Crimson Horizon',
    description: 'A fictional acrylic landscape with warm red and violet tones.',
    price: '120.00',
    type: 'Acrylic painting',
  },
  {
    name: 'Quiet Current',
    description: 'A fictional watercolor study of reflections on calm water.',
    price: '85.50',
    type: 'Watercolor',
  },
  {
    name: 'Moonlit Sentinel',
    description: 'A fictional hand-finished bronze-style sculptural figure.',
    price: '340.00',
    type: 'Sculpture',
  },
  {
    name: 'Glasshouse Morning',
    description: 'A fictional fine-art photograph of light through old glass.',
    price: '95.00',
    type: 'Photography',
  },
  {
    name: 'City in Amber',
    description: 'A fictional limited-edition giclée street scene.',
    price: '145.75',
    type: 'Giclée print',
  },
  {
    name: 'Parallel Islands',
    description: 'A fictional digital composition generated and refined by hand.',
    price: '210.00',
    type: 'Digital art',
  },
  {
    name: 'Graphite Stillness',
    description: 'A fictional graphite drawing of an isolated still-life arrangement.',
    price: '65.25',
    type: 'Drawing',
  },
  {
    name: 'Woven Autumn',
    description: 'A fictional handwoven textile inspired by autumn fields.',
    price: '175.40',
    type: 'Textile',
  },
  {
    name: 'Blue Vessel',
    description: 'A fictional ceramic vessel with hand-painted cobalt details.',
    price: '230.00',
    type: 'Ceramic',
  },
  {
    name: 'Fragments of Summer',
    description: 'A fictional mixed-media collage of paper, pigment, and thread.',
    price: '158.90',
    type: 'Mixed media',
  },
];

const counts = {
  authAccountsCreated: 0,
  authAccountsSkipped: 0,
  adminRolesAssigned: 0,
  guestRolesAssigned: 0,
  profilesUpdated: 0,
  productsCreated: 0,
  productsSkipped: 0,
  ordersCreated: 0,
  ordersSkipped: 0,
  orderEventsCreated: 0,
  orderEventsSkipped: 0,
};

async function listAllAuthUsers() {
  const users = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw error;

    users.push(...(data?.users ?? []));
    if (!data?.users?.length || data.users.length < 100) break;
    page += 1;
  }

  return users;
}

async function ensureAuthUser(email, displayName, password) {
  const users = await listAllAuthUsers();
  const existing = users.find((user) => user.email === email);

  if (existing) {
    counts.authAccountsSkipped += 1;
    return existing;
  }

  if (isDryRun) {
    counts.authAccountsCreated += 1;
    return null;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      demo_seed: true,
    },
  });
  if (error) throw error;
  if (!data?.user) throw new Error(`Auth account was not created for ${email}.`);

  counts.authAccountsCreated += 1;
  return data.user;
}

async function ensureGuestData(userId, displayName) {
  if (isDryRun) return;
  if (!userId) return;

  const { data: role, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (roleError) throw roleError;

  if (!role) {
    if (isDryRun) return;
    const { error } = await supabase
      .from('user_roles')
      .insert({ user_id: userId, role: 'guest' });
    if (error) throw error;
    counts.guestRolesAssigned += 1;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw profileError;

  if (profile && profile.display_name == null) {
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: displayName })
      .eq('id', userId);
    if (error) throw error;
    counts.profilesUpdated += 1;
  }
}

async function ensureAdmin(userId) {
  if (isDryRun) return;
  if (!userId) return;

  const { data: role, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (roleError) throw roleError;

  if (!role) {
    const { error } = await supabase
      .from('user_roles')
      .insert({ user_id: userId, role: 'admin' });
    if (error) throw error;
  } else if (role.role !== 'admin') {
    const { error } = await supabase
      .from('user_roles')
      .update({ role: 'admin' })
      .eq('user_id', userId);
    if (error) throw error;
  } else {
    return;
  }

  counts.adminRolesAssigned += 1;
}

async function seedProducts() {
  const names = products.map((product) => product.name);
  const { data: existing, error } = await supabase
    .from('products')
    .select('id, name')
    .in('name', names);
  if (error) throw error;

  const existingNames = new Set((existing ?? []).map((product) => product.name));
  const createdByName = new Map((existing ?? []).map((product) => [product.name, product]));

  for (const product of products) {
    if (existingNames.has(product.name)) {
      counts.productsSkipped += 1;
      continue;
    }

    if (isDryRun) {
      counts.productsCreated += 1;
      continue;
    }

    const { data, error: insertError } = await supabase
      .from('products')
      .insert({
        name: product.name,
        description: `${product.description} Type: ${product.type}.`,
        price: product.price,
        is_active: true,
      })
      .select('id, name')
      .single();
    if (insertError) throw insertError;

    createdByName.set(product.name, data);
    existingNames.add(product.name);
    counts.productsCreated += 1;
  }

  return createdByName;
}

async function seedOrders(productByName, guestUsers) {
  const confirmedOrders = [
    { productName: 'Crimson Horizon', guest: guestUsers[0] },
    { productName: 'Quiet Current', guest: guestUsers[1] ?? guestUsers[0] },
    { productName: 'Moonlit Sentinel', guest: guestUsers[2] ?? guestUsers[0] },
    { productName: 'Glasshouse Morning', guest: guestUsers[0] },
  ];

  const cancelledOrder = {
    productName: 'City in Amber',
    guest: guestUsers[1] ?? guestUsers[0],
  };

  const allDefinitions = [
    ...confirmedOrders.map((order) => ({ ...order, status: 'confirmed' })),
    { ...cancelledOrder, status: 'cancelled' },
  ];

  const references = allDefinitions.map(
    (order) => `DEMO-${order.productName.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}`
  );

  const { data: existingOrders, error } = await supabase
    .from('orders')
    .select('id, reference')
    .in('reference', references);
  if (error) throw error;

  const existingReferences = new Set(
    (existingOrders ?? []).map((order) => order.reference)
  );

  for (const [index, definition] of allDefinitions.entries()) {
    const reference = references[index];
    if (existingReferences.has(reference)) {
      counts.ordersSkipped += 1;
      counts.orderEventsSkipped += 1;
      continue;
    }

    if (isDryRun) {
      counts.ordersCreated += 1;
      counts.orderEventsCreated += 1;
      continue;
    }

    let product = productByName.get(definition.productName);
    if (!product) {
      const { data, error: productError } = await supabase
        .from('products')
        .select('id, name, price')
        .eq('name', definition.productName)
        .maybeSingle();
      if (productError) throw productError;
      product = data;
    }

    if (!product) continue;

    if (!definition.guest?.id) continue;

    const productDetails = await supabase
      .from('products')
      .select('price')
      .eq('id', product.id)
      .single();
    if (productDetails.error) throw productDetails.error;

    const orderRow = {
      reference,
      user_id: definition.guest.id,
      product_id: product.id,
      status: definition.status,
      total_price: productDetails.data.price,
      currency: 'EUR',
      client_name: definition.guest.user_metadata?.display_name ?? 'Demo Guest',
      contact_phone: '000000000',
      special_requests: 'Fictional demo order',
      product_name_snapshot: definition.productName,
    };

    if (definition.status === 'cancelled') {
      orderRow.cancelled_at = new Date().toISOString();
      orderRow.created_at = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderRow)
      .select('id')
      .single();
    if (orderError) throw orderError;

    const eventType = definition.status === 'cancelled' ? 'cancelled' : 'confirmed';
    const { error: eventError } = await supabase
      .from('order_events')
      .insert({
        order_id: order.id,
        actor_id: definition.guest.id,
        event_type: eventType,
        details: { status: definition.status, source: 'demo_seed' },
      });
    if (eventError) throw eventError;

    counts.ordersCreated += 1;
    counts.orderEventsCreated += 1;
  }
}

async function main() {
  console.log(`Demo seed mode: ${isDryRun ? 'dry-run' : 'execution'}`);
  console.log(`Target project reference: ${INTENDED_PROJECT_REF}`);

  if (isDryRun) {
    await ensureAuthUser(adminEmail, 'Demo Administrator', adminPassword);
    for (const guest of guestAccounts) {
      await ensureAuthUser(
        guest.email,
        guest.displayName,
        guestPassword
      );
    }
    await seedProducts();
    await seedOrders(new Map(), []);
  } else {
    const adminUser = await ensureAuthUser(
      adminEmail,
      'Demo Administrator',
      adminPassword
    );
    await ensureAdmin(adminUser?.id);

    const guests = [];
    for (const guest of guestAccounts) {
      const user = await ensureAuthUser(
        guest.email,
        guest.displayName,
        guestPassword
      );
      if (user) {
        await ensureGuestData(user.id, guest.displayName);
        guests.push(user);
      }
    }

    const productByName = await seedProducts();
    await seedOrders(productByName, guests);
  }

  const missingImages = products.map((product) => ({
    productName: product.name,
    reason: 'No real image asset or public Storage object was found.',
  }));

  console.log('Missing real product images:', JSON.stringify(missingImages));
  console.log('Seed summary:', JSON.stringify({
    mode: isDryRun ? 'dry-run' : 'execution',
    created: {
      authAccounts: counts.authAccountsCreated,
      adminRoles: counts.adminRolesAssigned,
      guestRoles: counts.guestRolesAssigned,
      profiles: counts.profilesUpdated,
      products: counts.productsCreated,
      orders: counts.ordersCreated,
      orderEvents: counts.orderEventsCreated,
    },
    skipped: {
      authAccounts: counts.authAccountsSkipped,
      products: counts.productsSkipped,
      orders: counts.ordersSkipped,
      orderEvents: counts.orderEventsSkipped,
    },
  }));
}

main().catch((error) => {
  console.error(`Demo seed failed: ${error.message}`);
  process.exitCode = 1;
});
