// lib/supabaseClient.ts

// Import createBrowserClient from @supabase/ssr
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js'; // Keep SupabaseClient type if needed elsewhere

// Ensure environment variables are defined
const supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseAnonKey) {
  throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

/**
 * Creates a Supabase client instance configured for client-side (browser) use with SSR integration.
 * Uses the public URL and anonymous key.
 * This client will manage session persistence via cookies, compatible with server-side helpers.
 */
const supabaseClient: SupabaseClient = createBrowserClient(supabaseUrl, supabaseAnonKey);

export default supabaseClient;