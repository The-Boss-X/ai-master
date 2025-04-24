/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/log-interaction/route.ts

// Import createServerClient from @supabase/ssr
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  // Get cookie store
  const cookieStore = await cookies();

  // Create Supabase client using createServerClient
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch (error) { /* empty */ }
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: '', ...options }); } catch (error) { /* empty */ }
        },
      },
    }
  );

  let parsedBody: any;

  try {
    // 1. Check for active session (logic remains the same)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
    }

    // 2. Get data from request body (logic remains the same)
    parsedBody = await req.json();
    const { /* ... extract fields ... */ prompt, title, gemini_flash_response, chatgpt_response, gemini_pro_response, gemini_flash_error, chatgpt_error, gemini_pro_error } = parsedBody;
    if (!prompt) {
        return NextResponse.json({ error: 'Prompt is required for logging.' }, { status: 400 });
    }

    // 3. Prepare data for Supabase (logic remains the same)
    const interactionDataForSupabase = {
        prompt: prompt,
        title: title || prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
        gemini_flash_response: gemini_flash_response || null,
        chatgpt_response: chatgpt_response || null,
        gemini_pro_response: gemini_pro_response || null,
        gemini_flash_error: gemini_flash_error || null,
        chatgpt_error: chatgpt_error || null,
        gemini_pro_error: gemini_pro_error || null,
    };
    console.log("Data prepared for Supabase insert:", interactionDataForSupabase);


    // 4. Insert data into Supabase (logic remains the same)
    const { data, error } = await supabase
      .from('interactions')
      .insert([interactionDataForSupabase])
      .select()
      .single();

    if (error) {
      // Error handling logic remains the same
      console.error('Supabase insert error:', error);
      if (error.code === '42501') {
        return NextResponse.json({ error: 'Permission denied to log interaction.' }, { status: 403 });
      }
      return NextResponse.json({ error: 'Failed to log interaction to database.' }, { status: 500 });
    }

    // 5. Return success response (logic remains the same)
    console.log('Supabase log successful, returned data:', data);
    return NextResponse.json({ success: true, loggedData: [data] }, { status: 201 });

  } catch (err: any) {
    // Error handling logic remains the same
    console.error('Error in /api/log-interaction:', err);
    if (err instanceof SyntaxError) {
        return NextResponse.json({ error: 'Invalid JSON payload received.' }, { status: 400 });
    }
    if (err.message?.includes('session')) {
        return NextResponse.json({ error: 'Session error: ' + err.message }, { status: 500 });
    }
    return NextResponse.json({ error: 'Internal Server Error in logging API.' }, { status: 500 });
  }
}