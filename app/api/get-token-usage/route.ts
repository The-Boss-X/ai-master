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
    // RLS must allow the user to SELECT their own settings row.
    const { data: settingsData, error: settingsError } = await supabase
      .from('user_settings')
      .select('total_tokens_used_overall, updated_at') // Also fetch updated_at for context
      .eq('user_id', userId)
      .single(); // Expect one row or null (if no settings yet)

    if (settingsError && settingsError.code !== 'PGRST116') { // PGRST116: 0 rows, which is fine
      console.error(`Get Token Usage: Error fetching total_tokens_used_overall for user ${userId}:`, settingsError);
      return NextResponse.json({ error: 'Failed to fetch total token usage.' }, { status: 500 });
    }
    const totalTokensOverall = settingsData?.total_tokens_used_overall ?? 0;
    const settingsLastUpdated = settingsData?.updated_at ?? null;

    // 2. Fetch recent token usage logs (e.g., last 20 calls) for more detailed display
    // RLS must allow the user to SELECT their own logs from token_usage_log.
    const { data: recentLogs, error: logsError } = await supabase
      .from('token_usage_log')
      .select('created_at, provider, model_name, input_tokens, output_tokens, total_tokens_for_call, interaction_id, slot_number')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20); // Adjust limit as needed

    if (logsError) {
      console.error(`Get Token Usage: Error fetching recent token logs for user ${userId}:`, logsError);
      // Still return total, but indicate logs couldn't be fetched
      return NextResponse.json({
        total_tokens_overall: totalTokensOverall,
        settings_last_updated: settingsLastUpdated,
        recent_logs: [],
        logs_error: 'Failed to fetch recent usage logs.',
      }, { status: 200 }); // Return 200 as total is still valid
    }

    console.log(`Get Token Usage: Successfully fetched data for user ${userId}. Total tokens: ${totalTokensOverall}, Recent logs count: ${recentLogs?.length ?? 0}`);
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
