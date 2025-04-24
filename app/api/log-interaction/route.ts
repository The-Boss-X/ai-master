/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/log-interaction/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Ensure dynamic execution
export const dynamic = 'force-dynamic';

// Define the expected structure of the incoming request body from app/page.tsx
// Includes the model used for each slot
interface LogInteractionPayload {
  prompt: string;
  title?: string | null;
  slot_1_model_used?: string | null; // Model identifier string (e.g., "ChatGPT: gpt-4o") used in slot 1
  slot_1_response?: string | null;
  slot_1_error?: string | null;
  slot_2_model_used?: string | null; // Model identifier string used in slot 2
  slot_2_response?: string | null;
  slot_2_error?: string | null;
  slot_3_model_used?: string | null; // Model identifier string used in slot 3
  slot_3_response?: string | null;
  slot_3_error?: string | null;
}


export async function POST(req: NextRequest) {
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

  let parsedBody: LogInteractionPayload;

  try {
    // 1. Check for active session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) {
      console.warn("Log Interaction: Unauthorized attempt.");
      return NextResponse.json({ success: false, error: 'Unauthorized: User not logged in.' }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Get data from request body
    try {
        parsedBody = await req.json();
        console.log(`Log Interaction: Received payload for user ${userId}:`, JSON.stringify(parsedBody, null, 2));
    } catch (e) {
        console.error("Log Interaction: Failed to parse JSON body", e);
        return NextResponse.json({ success: false, error: 'Invalid JSON payload received.' }, { status: 400 });
    }


    // 3. Extract data received from the frontend
    const {
      prompt,
      title,
      slot_1_model_used, // Get the model used from the payload
      slot_1_response,
      slot_1_error,
      slot_2_model_used, // Get the model used from the payload
      slot_2_response,
      slot_2_error,
      slot_3_model_used, // Get the model used from the payload
      slot_3_response,
      slot_3_error,
    } = parsedBody;

    if (!prompt) {
      console.warn("Log Interaction: Prompt is missing.");
      return NextResponse.json({ success: false, error: 'Prompt is required for logging.' }, { status: 400 });
    }

    // 4. Prepare data object for inserting into the 'interactions' table
    // Mapping received data to the database columns, including the NEW model columns
    const interactionDataForSupabase = {
      // user_id: userId, // Handled by RLS/default
      prompt: prompt,
      title: title || prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
      // Map the model used to the new columns you added
      slot_1_model: slot_1_model_used || null, // Save to slot_1_model column
      slot_1_response: slot_1_response || null,
      slot_1_error: slot_1_error || null,
      slot_2_model: slot_2_model_used || null, // Save to slot_2_model column
      slot_2_response: slot_2_response || null,
      slot_2_error: slot_2_error || null,
      slot_3_model: slot_3_model_used || null, // Save to slot_3_model column
      slot_3_response: slot_3_response || null,
      slot_3_error: slot_3_error || null,
      // created_at is handled by Supabase default
    };
    console.log(`Log Interaction: Data prepared for 'interactions' insert for user ${userId}:`, JSON.stringify(interactionDataForSupabase, null, 2));


    // 5. Insert data ONLY into the 'interactions' table
    const { data, error: insertError } = await supabase
      .from('interactions') // Target the interactions table
      .insert([interactionDataForSupabase]) // Insert the prepared interaction data
      .select() // Select the newly inserted row(s) to return to client
      .single(); // Expecting a single row back

    if (insertError) {
      console.error(`Log Interaction: Supabase insert error into 'interactions' for user ${userId}:`, insertError);
      if (insertError.message.includes('column') && insertError.message.includes('does not exist')) {
           console.error("!!! Potential schema cache issue or mismatch between code and DB schema for 'interactions' table !!!");
           return NextResponse.json({ success: false, error: `Database schema error: ${insertError.message}` }, { status: 500 });
      }
      if (insertError.code === '42501') { // RLS permission denied
        return NextResponse.json({ success: false, error: 'Permission denied to log interaction.' }, { status: 403 });
      }
      return NextResponse.json({ success: false, error: `Failed to log interaction to database: ${insertError.message}` }, { status: 500 });
    }

    // 6. Return success response
    console.log(`Log Interaction: Supabase log successful for user ${userId}, returned data ID:`, data?.id);
    return NextResponse.json({ success: true, loggedData: [data] }, { status: 201 });

  } catch (err: any) {
    console.error('Log Interaction: Unexpected error in /api/log-interaction:', err);
    if (err.message?.includes('session')) {
      return NextResponse.json({ success: false, error: 'Session error: ' + err.message }, { status: 500 });
    }
    return NextResponse.json({ success: false, error: 'Internal Server Error in logging API.' }, { status: 500 });
  }
}
