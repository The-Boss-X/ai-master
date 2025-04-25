/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/append-conversation/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Type for a single message (ensure consistency with frontend)
interface ConversationMessage {
  role: 'user' | 'model';
  content: string;
}

// **MODIFIED**: Expected payload from the client (slotNumber can now be 1-6)
interface AppendConversationPayload {
  interactionId: string; // ID of the history item to update
  slotNumber: 1 | 2 | 3 | 4 | 5 | 6; // Which slot's conversation to update (1-based)
  newUserMessage: ConversationMessage; // The user's follow-up prompt
  newModelMessage: ConversationMessage; // The model's response to the follow-up
}

// **MODIFIED**: Explicitly type the expected shape of the interaction object fetched from Supabase (includes slots 1-6)
interface InteractionConversationData {
    slot_1_conversation?: ConversationMessage[] | null;
    slot_2_conversation?: ConversationMessage[] | null;
    slot_3_conversation?: ConversationMessage[] | null;
    slot_4_conversation?: ConversationMessage[] | null; // Added slot 4
    slot_5_conversation?: ConversationMessage[] | null; // Added slot 5
    slot_6_conversation?: ConversationMessage[] | null; // Added slot 6
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
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
    // 1. Authenticate User
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Parse Payload
    let payload: AppendConversationPayload;
    try {
      payload = await request.json();
    } catch (e) {
      return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
    }

    const { interactionId, slotNumber, newUserMessage, newModelMessage } = payload;

    // **MODIFIED**: Basic validation for slotNumber 1-6
    if (!interactionId || !slotNumber || ![1, 2, 3, 4, 5, 6].includes(slotNumber) || !newUserMessage?.content || !newModelMessage?.content) {
      return NextResponse.json({ success: false, error: 'Missing required fields for appending conversation' }, { status: 400 });
    }

    // 3. **MODIFIED**: Fetch the current conversation history for ALL slots (1-6)
    // Ensure RLS allows the user to select this row (auth.uid() = user_id)
    const selectQuery = `
        slot_1_conversation, slot_2_conversation, slot_3_conversation,
        slot_4_conversation, slot_5_conversation, slot_6_conversation
    `; // Select all conversation columns
    const { data, error: fetchError } = await supabase
      .from('interactions')
      .select(selectQuery)
      .eq('id', interactionId)
      .eq('user_id', userId) // Ensure user owns this interaction
      .single(); // Expect one row

    // Explicitly cast the fetched data to our defined type
    const currentInteraction = data as InteractionConversationData | null;

    if (fetchError) {
      console.error(`Append Conversation: Error fetching interaction ${interactionId} for user ${userId}:`, fetchError);
      if (fetchError.code === 'PGRST116') { // Not found or not owned
          return NextResponse.json({ success: false, error: 'Interaction not found or permission denied.' }, { status: 404 });
      }
      return NextResponse.json({ success: false, error: 'Database error fetching current conversation.' }, { status: 500 });
    }
    if (!currentInteraction) { // Should be caught by fetchError, but double-check
        console.error(`Append Conversation: Interaction ${interactionId} not found for user ${userId} after fetch.`);
        return NextResponse.json({ success: false, error: 'Interaction not found.' }, { status: 404 });
    }

    // 4. **MODIFIED**: Determine the target column and get existing history (handles 1-6)
    const conversationColumn = `slot_${slotNumber}_conversation` as keyof InteractionConversationData; // Use keyof for type safety
    const existingHistory: ConversationMessage[] = currentInteraction[conversationColumn] || [];

    // 5. Prepare the updated conversation array
    const updatedHistory = [...existingHistory, newUserMessage, newModelMessage];

    // 6. Update the specific conversation column in the database
    // Ensure RLS allows the user to update this row
    const { error: updateError } = await supabase
      .from('interactions')
      .update({ [conversationColumn]: updatedHistory }) // Use computed property name to set the correct column
      .eq('id', interactionId)
      .eq('user_id', userId); // Redundant check if RLS is correct, but adds safety

    if (updateError) {
      console.error(`Append Conversation: Error updating interaction ${interactionId} for user ${userId}:`, updateError);
       if (updateError.code === '42501') {
         return NextResponse.json({ success: false, error: 'Permission denied to update interaction.' }, { status: 403 });
       }
       if (updateError.message.includes('invalid input syntax for type json')) {
           console.error("!!! Data being sent for update is not valid JSON array !!!", updatedHistory);
           return NextResponse.json({ success: false, error: `Invalid data format for conversation history update.` }, { status: 400 });
       }
      return NextResponse.json({ success: false, error: 'Database error updating conversation.' }, { status: 500 });
    }

    console.log(`Append Conversation: Successfully appended turn to slot ${slotNumber} for interaction ${interactionId}`);
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error("Append Conversation: Unexpected error:", error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
