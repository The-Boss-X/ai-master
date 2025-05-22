// app/api/log-interaction/route.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

interface ConversationMessage {
    role: 'user' | 'model';
    content: string;
}

interface LogInteractionPayload {
    prompt: string;
    title?: string | null;
    summary?: string | null;

    slot_1_model_used?: string | null;
    slot_1_conversation?: ConversationMessage[] | null;
    slot_1_input_tokens?: number | null;
    slot_1_output_tokens?: number | null;

    slot_2_model_used?: string | null;
    slot_2_conversation?: ConversationMessage[] | null;
    slot_2_input_tokens?: number | null;
    slot_2_output_tokens?: number | null;

    slot_3_model_used?: string | null;
    slot_3_conversation?: ConversationMessage[] | null;
    slot_3_input_tokens?: number | null;
    slot_3_output_tokens?: number | null;

    slot_4_model_used?: string | null;
    slot_4_conversation?: ConversationMessage[] | null;
    slot_4_input_tokens?: number | null;
    slot_4_output_tokens?: number | null;

    slot_5_model_used?: string | null;
    slot_5_conversation?: ConversationMessage[] | null;
    slot_5_input_tokens?: number | null;
    slot_5_output_tokens?: number | null;

    slot_6_model_used?: string | null;
    slot_6_conversation?: ConversationMessage[] | null;
    slot_6_input_tokens?: number | null;
    slot_6_output_tokens?: number | null;
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
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) {
            console.warn("Log Interaction: Unauthorized attempt.");
            return NextResponse.json({ success: false, error: 'Unauthorized: User not logged in.' }, { status: 401 });
        }
        const userId = session.user.id; // Get user ID for logging, though RLS should primarily enforce ownership

        try {
            parsedBody = await req.json();
            console.log(`Log Interaction: Received payload for user ${userId}:`, JSON.stringify(parsedBody, null, 2));
        } catch (e) {
            console.error("Log Interaction: Failed to parse JSON body", e);
            return NextResponse.json({ success: false, error: 'Invalid JSON payload received.' }, { status: 400 });
        }

        const { prompt, title, summary } = parsedBody;

        if (!prompt) {
            console.warn("Log Interaction: Prompt is missing.");
            return NextResponse.json({ success: false, error: 'Prompt is required for logging.' }, { status: 400 });
        }

        const interactionDataForSupabase: Record<string, any> = {
            user_id: userId, // Explicitly set user_id for the record
            prompt: prompt,
            title: title || prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
            summary: summary || null,
        };

        for (let i = 1; i <= 6; i++) {
            const modelKey = `slot_${i}_model_used` as keyof LogInteractionPayload;
            const convKey = `slot_${i}_conversation` as keyof LogInteractionPayload;
            const inputTokensKey = `slot_${i}_input_tokens` as keyof LogInteractionPayload;
            const outputTokensKey = `slot_${i}_output_tokens` as keyof LogInteractionPayload;

            interactionDataForSupabase[modelKey] = parsedBody[modelKey] || null;
            interactionDataForSupabase[convKey] = parsedBody[convKey] || null;
            interactionDataForSupabase[inputTokensKey] = parsedBody[inputTokensKey] || null; // Default to null if not provided
            interactionDataForSupabase[outputTokensKey] = parsedBody[outputTokensKey] || null; // Default to null if not provided
        }
        
        console.log(`Log Interaction: Data prepared for 'interactions' insert for user ${userId}:`, JSON.stringify(interactionDataForSupabase, null, 2));

        const selectQuery = `
            id, created_at, prompt, title, user_id, summary,
            slot_1_model_used, slot_1_conversation, slot_1_input_tokens, slot_1_output_tokens,
            slot_2_model_used, slot_2_conversation, slot_2_input_tokens, slot_2_output_tokens,
            slot_3_model_used, slot_3_conversation, slot_3_input_tokens, slot_3_output_tokens,
            slot_4_model_used, slot_4_conversation, slot_4_input_tokens, slot_4_output_tokens,
            slot_5_model_used, slot_5_conversation, slot_5_input_tokens, slot_5_output_tokens,
            slot_6_model_used, slot_6_conversation, slot_6_input_tokens, slot_6_output_tokens
        `;
        const { data, error: insertError } = await supabase
            .from('interactions')
            .insert([interactionDataForSupabase])
            .select(selectQuery)
            .single();

        if (insertError) {
            console.error(`Log Interaction: Supabase insert error into 'interactions' for user ${userId}:`, insertError);
            if (insertError.message.includes('column') && insertError.message.includes('does not exist')) {
                 console.error("!!! DB Schema Mismatch: Column likely missing in 'interactions'. Check token columns. !!!");
                 return NextResponse.json({ success: false, error: `Database schema error: ${insertError.message}. Check token columns.` }, { status: 500 });
            }
            if (insertError.message.includes('invalid input syntax for type json')) {
                console.error("!!! Data being sent for a _conversation column is not valid JSON array !!!");
                return NextResponse.json({ success: false, error: `Invalid data format for conversation history.` }, { status: 400 });
            }
            if (insertError.code === '42501') {
                return NextResponse.json({ success: false, error: 'Permission denied to log interaction.' }, { status: 403 });
            }
            return NextResponse.json({ success: false, error: `Failed to log interaction to database: ${insertError.message}` }, { status: 500 });
        }

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
