/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/get-history/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
// Import the specific types needed
import type { InteractionHistoryItem, ConversationMessage } from '../../types/InteractionHistoryItem'; // Import the UPDATED InteractionHistoryItem type

export const dynamic = 'force-dynamic';

// Define the expected structure of items returned by this route
// This should match your updated InteractionHistoryItem type definition
// Note: This type alias might be redundant if InteractionHistoryItem is imported and used directly
// type HistoryItemResponse = InteractionHistoryItem;


export async function GET() {
    console.log("--- Get History API Start ---");
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
        if (sessionError || !session) {
            console.warn('Get History: Unauthorized attempt or session error.');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;
        console.log(`Get History: Session valid for user ${userId}. Fetching data...`);

        // 2. Fetch data, selecting columns for slots 1-6 AND summary
        const selectQuery = `
            id,
            created_at,
            prompt,
            title,
            summary,
            slot_1_model_used,
            slot_1_conversation,
            slot_2_model_used,
            slot_2_conversation,
            slot_3_model_used,
            slot_3_conversation,
            slot_4_model_used,
            slot_4_conversation,
            slot_5_model_used,
            slot_5_conversation,
            slot_6_model_used,
            slot_6_conversation
        `; // ADDED: summary to select query
        console.log(`Get History: Performing select: ${selectQuery.replace(/\s+/g, ' ').trim()}`);

        const { data, error: fetchError } = await supabase
            .from('interactions') // Your table name
            .select(selectQuery) // Select the conversation history columns
            .order('created_at', { ascending: false })
            .limit(100);

        if (fetchError) {
            console.error(`Get History: Supabase fetch error for user ${userId}:`, fetchError);
            // Check for missing column error specifically
            if (fetchError.message.includes('column') && fetchError.message.includes('does not exist')) {
                 console.error("!!! DB Schema Mismatch: Column likely missing in 'interactions'. Ensure 'summary' column exists. !!!");
                 return NextResponse.json({ success: false, error: `Database schema error: ${fetchError.message}. Ensure 'summary' column exists.` }, { status: 500 });
            }
            if (fetchError.code === '42501') {
                return NextResponse.json({ error: 'Permission denied to access history.' }, { status: 403 });
            }
            return NextResponse.json({ error: `Failed to fetch interaction history: ${fetchError.message}` }, { status: 500 });
        }

        // Log fetched data sample
        console.log(`Get History: Successfully fetched ${data?.length ?? 0} items for user ${userId}.`);
        if (data && data.length > 0) {
            console.log("Get History: Structure of first fetched item:", JSON.stringify(data[0], null, 2));
        }

        // 3. Return the fetched data
        console.log("--- Get History API End (Success) ---");
        // Cast the data to the expected response type array
        // Supabase client automatically parses JSONB columns into JS objects/arrays
        return NextResponse.json(data as InteractionHistoryItem[] ?? [], { status: 200 }); // Use the imported type directly

    } catch (err: any) {
        console.error('Get History: Unexpected error in /api/get-history:', err);
        console.log("--- Get History API End (Error) ---");
        return NextResponse.json({ error: 'Internal Server Error.' }, { status: 500 });
    }
}
