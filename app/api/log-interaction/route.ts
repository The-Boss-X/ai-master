/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/log-interaction/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Ensure dynamic execution
export const dynamic = 'force-dynamic';

// Structure for a single message (mirrors frontend/type definition)
interface ConversationMessage {
  role: 'user' | 'model';
  content: string;
}

// **MODIFIED**: Define the expected structure of the incoming request body (includes up to 6 slots)
interface LogInteractionPayload {
  prompt: string; // The initial prompt
  title?: string | null;
  slot_1_model_used?: string | null;
  slot_1_conversation?: ConversationMessage[] | null;
  slot_2_model_used?: string | null;
  slot_2_conversation?: ConversationMessage[] | null;
  slot_3_model_used?: string | null;
  slot_3_conversation?: ConversationMessage[] | null;
  slot_4_model_used?: string | null; // Added slot 4
  slot_4_conversation?: ConversationMessage[] | null; // Added slot 4
  slot_5_model_used?: string | null; // Added slot 5
  slot_5_conversation?: ConversationMessage[] | null; // Added slot 5
  slot_6_model_used?: string | null; // Added slot 6
  slot_6_conversation?: ConversationMessage[] | null; // Added slot 6
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
      // Extract all potential slots
      slot_1_model_used, slot_1_conversation,
      slot_2_model_used, slot_2_conversation,
      slot_3_model_used, slot_3_conversation,
      slot_4_model_used, slot_4_conversation,
      slot_5_model_used, slot_5_conversation,
      slot_6_model_used, slot_6_conversation,
    } = parsedBody;

    if (!prompt) {
      console.warn("Log Interaction: Prompt is missing.");
      return NextResponse.json({ success: false, error: 'Prompt is required for logging.' }, { status: 400 });
    }

    // 4. **MODIFIED**: Prepare data object for inserting, including slots 1-6
    const interactionDataForSupabase: Record<string, any> = {
      // user_id: userId, // Handled by RLS/default
      prompt: prompt,
      title: title || prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
    };

    // Add data for slots 1 through 6
    for (let i = 1; i <= 6; i++) {
        const modelKey = `slot_${i}_model_used` as keyof LogInteractionPayload;
        const convKey = `slot_${i}_conversation` as keyof LogInteractionPayload;
        interactionDataForSupabase[modelKey] = parsedBody[modelKey] || null;
        interactionDataForSupabase[convKey] = parsedBody[convKey] || null;
    }

    console.log(`Log Interaction: Data prepared for 'interactions' insert for user ${userId}:`, JSON.stringify(interactionDataForSupabase, null, 2));


    // 5. Insert data ONLY into the 'interactions' table
    // Ensure RLS allows insert and user_id matches auth.uid()
    // **MODIFIED**: Select back all 6 conversation slots
    const selectQuery = `
        id, created_at, prompt, title, user_id,
        slot_1_model_used, slot_1_conversation,
        slot_2_model_used, slot_2_conversation,
        slot_3_model_used, slot_3_conversation,
        slot_4_model_used, slot_4_conversation,
        slot_5_model_used, slot_5_conversation,
        slot_6_model_used, slot_6_conversation
    `;
    const { data, error: insertError } = await supabase
      .from('interactions') // Target the interactions table
      .insert([interactionDataForSupabase]) // Insert the prepared interaction data
      .select(selectQuery) // Select the newly inserted row(s) to return to client
      .single(); // Expecting a single row back

    if (insertError) {
      console.error(`Log Interaction: Supabase insert error into 'interactions' for user ${userId}:`, insertError);
      if (insertError.message.includes('column') && insertError.message.includes('does not exist')) {
           console.error("!!! Potential schema cache issue or mismatch between code and DB schema for 'interactions' table !!!");
           return NextResponse.json({ success: false, error: `Database schema error: ${insertError.message}` }, { status: 500 });
      }
       if (insertError.message.includes('invalid input syntax for type json')) {
           console.error("!!! Data being sent for a _conversation column is not valid JSON !!!");
           return NextResponse.json({ success: false, error: `Invalid data format for conversation history.` }, { status: 400 });
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
