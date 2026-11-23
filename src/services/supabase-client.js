import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabaseConfigurationError =
  !supabaseUrl || !supabasePublishableKey
    ? 'Missing Supabase configuration: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
    : null;

if (supabaseConfigurationError) {
  console.error(supabaseConfigurationError);
}

export const supabaseClient =
  supabaseConfigurationError
    ? null
    : createClient(supabaseUrl, supabasePublishableKey);
