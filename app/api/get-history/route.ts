/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// app/api/get-history/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
// Assuming your type definition is updated elsewhere and imported if needed
// import type { InteractionHistoryItem } from '../../types/InteractionHistoryItem';

export const dynamic = 'force-dynamic';

// Define the expected structure of items returned by this route
// This should match your updated InteractionHistoryItem type definition
interface HistoryItemResponse {
  id: string;
  created_at: string;
  prompt: string;
  title?: string | null;
  // Include the model columns
  slot_1_model?: string | null; // Changed from slot_1_model_used for consistency with DB? Verify column name.
  slot_1_response?: string | null;
  slot_1_error?: string | null;
  slot_2_model?: string | null; // Changed from slot_2_model_used for consistency with DB? Verify column name.
  slot_2_response?: string | null;
  slot_2_error?: string | null;
  slot_3_model?: string | null; // Changed from slot_3_model_used for consistency with DB? Verify column name.
  slot_3_response?: string | null;
  slot_3_error?: string | null;
  // user_id is usually not needed client-side due to RLS
}


export async function GET() {
  console.log("--- Get History API Start ---"); // Log start
  const cookieStore = await cookies();
  const supabase = createServerClient(
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
    // 1. Check session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error('Get History: Session error:', sessionError.message);
      return NextResponse.json({ error: 'Failed to get user session.' }, { status: 500 });
    }
    if (!session) {
      console.warn('Get History: Unauthorized attempt.');
      return NextResponse.json({ error: 'Unauthorized: User not logged in.' }, { status: 401 });
    }
    const userId = session.user.id;
    console.log(`Get History: Session valid for user ${userId}. Fetching data...`);

    // 2. Fetch data, including the new slot_..._model columns
    const selectQuery = `
        id,
        created_at,
        prompt,
        title,
        slot_1_model,
        slot_1_response,
        slot_1_error,
        slot_2_model,
        slot_2_response,
        slot_2_error,
        slot_3_model,
        slot_3_response,
        slot_3_error
      `; // Define query string for logging
    console.log(`Get History: Performing select: ${selectQuery.replace(/\s+/g, ' ').trim()}`); // Log the query

    const { data, error: fetchError } = await supabase
      .from('interactions') // Your table name
      .select(selectQuery) // Use the defined query string
      .order('created_at', { ascending: false }) // Get newest first
      .limit(100); // Adjust limit as needed

    // Log the raw data or error immediately after fetch
    if (fetchError) {
      console.error(`Get History: Supabase fetch error for user ${userId}:`, fetchError);
      if (fetchError.code === '42501') { // RLS permission denied
        return NextResponse.json({ error: 'Permission denied to access history.' }, { status: 403 });
      }
       if (fetchError.message.includes('column') && fetchError.message.includes('does not exist')) {
           console.error("!!! Potential schema cache issue or mismatch between code and DB schema for 'interactions' table !!!");
           return NextResponse.json({ success: false, error: `Database schema error: ${fetchError.message}` }, { status: 500 });
      }
      return NextResponse.json({ error: `Failed to fetch interaction history: ${fetchError.message}` }, { status: 500 });
    }

    // Log the fetched data before sending response
    console.log(`Get History: Successfully fetched ${data?.length ?? 0} items for user ${userId}. Sample data:`, JSON.stringify(data?.[0] ?? null, null, 2)); // Log first item sample

    // 3. Return the fetched data
    console.log("--- Get History API End (Success) ---");
    // Cast the data to the expected response type array
    return NextResponse.json(data as HistoryItemResponse[] | null ?? [], { status: 200 });

  } catch (err: any) {
    console.error('Get History: Unexpected error in /api/get-history:', err);
    console.log("--- Get History API End (Error) ---");
    return NextResponse.json({ error: 'Internal Server Error.' }, { status: 500 });
  }
}
