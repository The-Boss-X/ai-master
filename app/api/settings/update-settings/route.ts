/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { Database } from '@/lib/database.types';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => {
          const cookie = cookieStore.get(name);
          return cookie?.value;
        },
        set: (name: string, value: string, options: CookieOptions) => {
          cookieStore.set(name, value, options);
        },
        remove: (name: string, options: CookieOptions) => {
          cookieStore.set(name, '', options);
        },
      },
    }
  );

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Error getting session:', sessionError.message);
      return NextResponse.json({ error: 'Failed to authenticate: ' + sessionError.message }, { status: 401 });
    }

    if (!session) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    const userId = session.user.id;
    if (!userId) {
      return NextResponse.json({ error: 'User ID not found in session' }, { status: 401 });
    }

    const body = await request.json();
    const { enable_streaming } = body;

    if (typeof enable_streaming !== 'boolean') {
      return NextResponse.json({ error: 'Invalid input: enable_streaming must be a boolean' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('user_settings')
      .update({ 
        enable_streaming: enable_streaming,
        updated_at: new Date().toISOString() 
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating user_settings:', error.message);
      return NextResponse.json({ error: 'Failed to update settings: ' + error.message }, { status: 500 });
    }

    if (!data) {
        console.warn('No settings found for user to update, or RLS prevented update for user_id:', userId);
        return NextResponse.json({ error: 'Settings not found for user, or update failed post-check.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Settings updated successfully', updatedSettings: data });

  } catch (e: any) {
    console.error('Unexpected error in update-settings:', e.message);
    if (e instanceof SyntaxError && e.message.includes('JSON')) {
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unexpected error occurred: ' + e.message }, { status: 500 });
  }
} 