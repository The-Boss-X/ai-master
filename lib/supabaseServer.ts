// lib/supabaseServer.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('Error: Missing environment variable NEXT_PUBLIC_SUPABASE_URL');
  throw new Error('Supabase URL is missing from environment variables.');
}
if (!supabaseServiceRoleKey) {
    console.error('Error: Missing environment variable SUPABASE_SERVICE_ROLE_KEY');
    throw new Error('Supabase Service Role Key is missing from environment variables.');
}

// Create a single supabase client for server-side operations
const supabaseServer = createClient(supabaseUrl, supabaseServiceRoleKey, {
   auth: {
     // Required for service_role key to work Session-less
     persistSession: false,
     autoRefreshToken: false,
     detectSessionInUrl: false,
   }
});

export default supabaseServer;