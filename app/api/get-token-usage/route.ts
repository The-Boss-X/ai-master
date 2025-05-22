/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/get-token-usage/route.ts
// NEW FILE: API route to fetch token usage statistics for the settings page.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
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

    // 1. Fetch total tokens used from user_settings
    const { data: settingsData, error: settingsError } = await supabase
      .from('user_settings')
      .select('total_tokens_used_overall, updated_at')
      .eq('user_id', userId)
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') { 
      console.error(`Get Token Usage: Error fetching total_tokens_used_overall for user ${userId}:`, settingsError);
      return NextResponse.json({ error: 'Failed to fetch total token usage.' }, { status: 500 });
    }
    const totalTokensOverall = settingsData?.total_tokens_used_overall ?? 0;
    const settingsLastUpdated = settingsData?.updated_at ?? null;

    // 2. Fetch ALL token usage logs for the user
    // REMOVED .limit(20) to fetch all logs
    const { data: recentLogs, error: logsError } = await supabase
      .from('token_usage_log')
      .select('created_at, provider, model_name, input_tokens, output_tokens, total_tokens_for_call, interaction_id, slot_number')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }); // Keep ordering

    if (logsError) {
      console.error(`Get Token Usage: Error fetching token logs for user ${userId}:`, logsError);
      return NextResponse.json({
        total_tokens_overall: totalTokensOverall,
        settings_last_updated: settingsLastUpdated,
        recent_logs: [],
        logs_error: 'Failed to fetch usage logs.', // Keep this specific error for logs
        error: 'Failed to fetch usage logs.', // General error if only logs failed
      }, { status: 500 }); // Return 500 if logs fail as it's part of the core request
    }

    console.log(`Get Token Usage: Successfully fetched data for user ${userId}. Total tokens: ${totalTokensOverall}, All logs count: ${recentLogs?.length ?? 0}`);
    return NextResponse.json({
      total_tokens_overall: totalTokensOverall,
      settings_last_updated: settingsLastUpdated,
      recent_logs: recentLogs ?? [],
    }, { status: 200 });

  } catch (error: any) {
    console.error('Get Token Usage: Unexpected error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
