/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/get-token-usage/route.ts

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Database } from '@/lib/database.types'; // Assuming your generated types are here

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>( // Use the Database type
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
            try { cookieStore.set({ name, value, ...options }); } catch (error) { /* Read-only, ignore */ }
        },
        remove(name: string, options: CookieOptions) {
            try { cookieStore.set({ name, value: '', ...options }); } catch (error) { /* Read-only, ignore */ }
        },
      },
    }
  );

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      console.warn('Get Token Usage: Unauthorized access attempt.');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    console.log(`Get Token Usage: Fetching data for user ${userId}`);

    // 1. Fetch total tokens used from user_settings (if needed, or rely on settings page to have this already)
    // For simplicity, this endpoint will focus on returning the logs.
    // The settings page already fetches user_settings which includes total_tokens_used_overall.
    // However, if you want this endpoint to be a single source for all displayable usage, you can fetch it here too.
    // For now, I'll keep it focused on logs, assuming the frontend combines data.
    // If you want to include total_tokens_used_overall here, uncomment and adjust:
    /*
    const { data: settingsData, error: settingsError } = await supabase
      .from('user_settings')
      .select('total_tokens_used_overall, updated_at') // updated_at for settings_last_updated
      .eq('user_id', userId)
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') { 
      console.error(`Get Token Usage: Error fetching total_tokens_used_overall for user ${userId}:`, settingsError);
      // Decide if this is a critical error or if logs can still be returned
    }
    const totalTokensOverallForUserKeys = settingsData?.total_tokens_used_overall ?? 0;
    const settingsLastUpdated = settingsData?.updated_at ?? null;
    */

    // 2. Fetch ALL token usage logs for the user, including key_type
    const { data: allLogs, error: logsError } = await supabase
      .from('token_usage_log')
      .select('created_at, provider, model_name, input_tokens, output_tokens, total_tokens_for_call, interaction_id, slot_number, key_type') // Added key_type
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (logsError) {
      console.error(`Get Token Usage: Error fetching token logs for user ${userId}:`, logsError);
      return NextResponse.json({
        // total_tokens_overall: totalTokensOverallForUserKeys, // if fetched
        // settings_last_updated: settingsLastUpdated, // if fetched
        all_logs: [], // Return empty logs on error
        logs_error: 'Failed to fetch usage logs.',
        error: 'Failed to fetch usage logs.', // General error
      }, { status: 500 });
    }

    console.log(`Get Token Usage: Successfully fetched data for user ${userId}. All logs count: ${allLogs?.length ?? 0}`);
    
    // The frontend expects 'recent_logs' or 'all_logs'. Let's consistently use 'all_logs'.
    // Also, the frontend might expect total_tokens_overall if this endpoint is the sole source.
    // For now, matching the structure the frontend tries to read:
    return NextResponse.json({
      // total_tokens_overall: totalTokensOverallForUserKeys, // if you decide to include it
      // settings_last_updated: settingsLastUpdated, // if you decide to include it
      all_logs: allLogs ?? [], // Ensure it's an array
      // recent_logs: allLogs ?? [], // if frontend specifically checks for recent_logs
    }, { status: 200 });

  } catch (error: any) {
    console.error('Get Token Usage: Unexpected error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
