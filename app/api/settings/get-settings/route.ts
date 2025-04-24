// app/api/settings/get-settings/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Ensure this route is always dynamic
export const dynamic = 'force-dynamic';

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        // Read-only route, set/remove not strictly needed but included for completeness
        // No need for try/catch if middleware handles session refresh
        set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }); },
        remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }); },
      },
    }
  );

  try {
    // 1. Get the current user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    // Check if user is authenticated
    if (sessionError || !session) {
      console.warn('Get settings: Unauthorized access attempt or session error.', sessionError?.message);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Fetch settings for the authenticated user
    const { data: settings, error: fetchError } = await supabase
      .from('user_settings') // Your table name
      .select(`
        slot_1_model,
        slot_2_model,
        slot_3_model
        `) // CORRECTED: Removed the invalid comment from this string
      .eq('user_id', userId) // Filter by the authenticated user's ID
      .maybeSingle(); // Use maybeSingle as user might not have settings saved yet

    // Handle potential database errors
    if (fetchError) {
      console.error(`Error fetching user settings for user ${userId}:`, fetchError);
      // Include details from the fetchError in the response for better debugging
      return NextResponse.json({ error: `Failed to fetch settings from database. DB Error: ${fetchError.message}` }, { status: 500 });
    }

    // 3. Return the fetched settings (or null if none exist)
    // The client will handle the case where settings is null (e.g., set defaults)
    console.log(`Fetched settings for user ${userId}:`, settings);
    return NextResponse.json(settings, { status: 200 });

  } catch (error) {
    console.error('Unexpected error in get-settings route:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
