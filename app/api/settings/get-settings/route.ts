/* eslint-disable @typescript-eslint/no-unused-vars */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) { try { cookieStore.set({ name, value, ...options }); } catch (error) {} },
        remove(name: string, options: CookieOptions) { try { cookieStore.set({ name, value: '', ...options }); } catch (error) {} },
      },
    }
  );

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      console.warn('Get settings: Unauthorized access attempt or session error.', sessionError?.message);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const selectQuery = `
      slot_1_model,
      slot_2_model,
      slot_3_model,
      slot_4_model,
      slot_5_model,
      slot_6_model,
      summary_model,
      use_provided_keys,
      free_tokens_remaining,
      paid_tokens_remaining,
      free_tokens_last_reset_at,
      total_tokens_used_overall
    `;

    const { data: settings, error: fetchError } = await supabase
      .from('user_settings')
      .select(selectQuery)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      console.error(`Error fetching user settings for user ${userId}:`, fetchError);
      if (fetchError.message.includes('column') && fetchError.message.includes('does not exist')) {
        console.error("!!! DB Schema Mismatch: Column likely missing in 'user_settings'. Ensure all expected columns exist. !!!");
        return NextResponse.json({ error: `Database schema error: ${fetchError.message}. Ensure all columns exist.` }, { status: 500 });
      }
      return NextResponse.json({ error: `Failed to fetch settings from database. DB Error: ${fetchError.message}` }, { status: 500 });
    }

    console.log(`Fetched settings for user ${userId}:`, settings);
    return NextResponse.json(settings, { status: 200 });

  } catch (error) {
    console.error('Unexpected error in get-settings route:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
