/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/get-history/route.ts

export const dynamic = 'force-dynamic';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Keep the InteractionHistoryItem interface definition
export interface InteractionHistoryItem {
  id: string;
  created_at: string;
  prompt: string;
  title?: string | null;
  gemini_flash_response?: string | null;
  chatgpt_response?: string | null;
  gemini_pro_response?: string | null;
  gemini_flash_error?: string | null;
  chatgpt_error?: string | null;
  gemini_pro_error?: string | null;
  user_id?: string;
}

export async function GET(req: Request) {
  console.log('\n--- API Route /api/get-history START ---');

  // Log Env Vars Check
  console.log('API Route: Checking Env Vars...');
  console.log('API Route: NEXT_PUBLIC_SUPABASE_URL exists:', !!process.env.NEXT_PUBLIC_SUPABASE_URL);
  console.log('API Route: NEXT_PUBLIC_SUPABASE_ANON_KEY exists:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error("API Route: ERROR - Supabase URL or Anon Key missing in environment variables!");
    return NextResponse.json({ error: 'Internal Server Error: Missing Supabase configuration.' }, { status: 500 });
  }


  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          const value = cookieStore.get(name)?.value;
          console.log(`API Route: Cookie get('${name}'): ${value ? 'Found' : 'Not Found'}`);
          return value;
        },
        // Read-only operations (like GET routes) typically don't need set/remove,
        // but including logs can be useful for debugging complex scenarios.
        // The try/catch blocks are standard from Supabase docs for SSR components/routes.
        set(name: string, value: string, options: CookieOptions) {
          try {
            console.log(`API Route: Cookie set('${name}') called:`, { value: value ? '******' : value, options }); // Avoid logging sensitive token value
            cookieStore.set({ name, value, ...options });
          } catch (error) {
            console.error('API Route: Error calling cookieStore.set (expected in read-only contexts):', error);
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            console.log(`API Route: Cookie remove('${name}') called:`, { options });
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {
            console.error('API Route: Error calling cookieStore.delete (expected in read-only contexts):', error);
          }
        },
      },
    }
  );

  try {
    console.log('API Route: Attempting to get user session...');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    // Log the session and error regardless of outcome
    console.log('API Route: supabase.auth.getSession() result:', {
        session: session ? { user_id: session.user.id, expires_at: session.expires_at } : null, // Log relevant session info, not the whole object
        error: sessionError ? sessionError.message : null,
    });


    if (sessionError) {
      console.error('API Route: Explicit Session error:', sessionError.message);
      // Note: Don't return 401 here, let the check below handle lack of session
      // Return 500 for unexpected session fetch errors
      return NextResponse.json({ error: `Failed to get user session: ${sessionError.message}` }, { status: 500 });
    }

    if (!session) {
      // This is where the 401 is triggered if no valid session is found
      console.warn('API Route: No active session found. Returning 401 Unauthorized.');
      return NextResponse.json({ error: 'Unauthorized: User not logged in or session invalid.' }, { status: 401 });
    }

    // If we reach here, session is valid
    console.log(`API Route: Session valid for user ${session.user.id}. Proceeding to fetch data...`);

    const { data, error: dbError } = await supabase
      .from('interactions')
      .select(`
        id, created_at, prompt, title, gemini_flash_response, chatgpt_response,
        gemini_pro_response, gemini_flash_error, chatgpt_error, gemini_pro_error
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (dbError) {
      console.error('API Route: Supabase fetch history error:', dbError);
      if (dbError.code === '42501') {
        console.warn('API Route: RLS Permission denied (42501).');
        return NextResponse.json({ error: 'Permission denied to access history.' }, { status: 403 });
      }
      return NextResponse.json({ error: `Failed to fetch interaction history: ${dbError.message}` }, { status: 500 });
    }

    console.log(`API Route: Successfully fetched ${data?.length ?? 0} history items.`);
    console.log('--- API Route /api/get-history END ---');
    return NextResponse.json(data as InteractionHistoryItem[] | null ?? [], { status: 200 });

  } catch (err: any) {
    console.error('API Route: Unhandled EXCEPTION in /api/get-history:', err);
    console.log('--- API Route /api/get-history END (with error) ---');
    return NextResponse.json({ error: 'Internal Server Error.' }, { status: 500 });
  }
}