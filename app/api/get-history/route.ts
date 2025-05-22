// app/api/get-history/route.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { InteractionHistoryItem } from '../../types/InteractionHistoryItem'; // Ensure this path is correct

export const dynamic = 'force-dynamic';

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
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
            console.warn('Get History: Unauthorized attempt or session error.');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;
        console.log(`Get History: Session valid for user ${userId}. Fetching data...`);

        const selectQuery = `
            id,
            created_at,
            prompt,
            title,
            summary,
            user_id, 
            slot_1_model_used, slot_1_conversation, slot_1_input_tokens, slot_1_output_tokens,
            slot_2_model_used, slot_2_conversation, slot_2_input_tokens, slot_2_output_tokens,
            slot_3_model_used, slot_3_conversation, slot_3_input_tokens, slot_3_output_tokens,
            slot_4_model_used, slot_4_conversation, slot_4_input_tokens, slot_4_output_tokens,
            slot_5_model_used, slot_5_conversation, slot_5_input_tokens, slot_5_output_tokens,
            slot_6_model_used, slot_6_conversation, slot_6_input_tokens, slot_6_output_tokens
        `;
        console.log(`Get History: Performing select: ${selectQuery.replace(/\s+/g, ' ').trim()}`);

        const { data, error: fetchError } = await supabase
            .from('interactions')
            .select(selectQuery)
            .eq('user_id', userId) // Ensure RLS also enforces this
            .order('created_at', { ascending: false })
            .limit(100);

        if (fetchError) {
            console.error(`Get History: Supabase fetch error for user ${userId}:`, fetchError);
            if (fetchError.message.includes('column') && fetchError.message.includes('does not exist')) {
                 console.error("!!! DB Schema Mismatch: Column likely missing in 'interactions'. Check token columns. !!!");
                 return NextResponse.json({ success: false, error: `Database schema error: ${fetchError.message}. Ensure token columns exist.` }, { status: 500 });
            }
            if (fetchError.code === '42501') {
                return NextResponse.json({ error: 'Permission denied to access history.' }, { status: 403 });
            }
            return NextResponse.json({ error: `Failed to fetch interaction history: ${fetchError.message}` }, { status: 500 });
        }

        console.log(`Get History: Successfully fetched ${data?.length ?? 0} items for user ${userId}.`);
        if (data && data.length > 0) {
            console.log("Get History: Structure of first fetched item:", JSON.stringify(data[0], null, 2));
        }

        console.log("--- Get History API End (Success) ---");
        return NextResponse.json(data as InteractionHistoryItem[] ?? [], { status: 200 });

    } catch (err: any) {
        console.error('Get History: Unexpected error in /api/get-history:', err);
        console.log("--- Get History API End (Error) ---");
        return NextResponse.json({ error: 'Internal Server Error.' }, { status: 500 });
    }
}
