import { createClient } from '@supabase/supabase-js';

const intendedProjectRef = 'lskvwfxgpoorcnicttaj';
const projectRef = process.env.SUPABASE_PROJECT_REF;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const targetUserId = process.env.FIRST_ADMIN_USER_ID;

const missing = [];
if (!projectRef) missing.push('SUPABASE_PROJECT_REF');
if (!supabaseUrl) missing.push('SUPABASE_URL');
if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (!targetUserId) missing.push('FIRST_ADMIN_USER_ID');

if (missing.length > 0) {
  throw new Error(`Missing server bootstrap configuration: ${missing.join(', ')}`);
}

if (projectRef !== intendedProjectRef) {
  throw new Error(`Refusing bootstrap: project reference must be ${intendedProjectRef}.`);
}

if (supabaseUrl !== `https://${intendedProjectRef}.supabase.co`) {
  throw new Error(`Refusing bootstrap: SUPABASE_URL must be the dedicated project URL.`);
}

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId)) {
  throw new Error('FIRST_ADMIN_USER_ID must be an explicit valid UUID.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function bootstrap() {
  const { data: authData, error: authError } =
    await supabase.auth.admin.getUserById(targetUserId);

  if (authError) throw authError;
  if (!authData?.user) {
    throw new Error('The explicitly supplied UUID does not identify an existing Auth user.');
  }

  const { data: existingRole, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (roleError) throw roleError;

  if (existingRole?.role === 'admin') {
    console.log(JSON.stringify({
      status: 'skipped',
      reason: 'The explicit UUID is already an admin.',
      userId: targetUserId,
    }));
    return;
  }

  const { error: upsertError } = await supabase
    .from('user_roles')
    .upsert({
      user_id: targetUserId,
      role: 'admin',
    }, { onConflict: 'user_id' });

  if (upsertError) throw upsertError;

  console.log(JSON.stringify({
    status: 'created',
    reason: 'The explicit UUID was assigned the admin role.',
    userId: targetUserId,
  }));
}

bootstrap().catch((error) => {
  console.error(`First-admin bootstrap failed: ${error.message}`);
  process.exitCode = 1;
});
