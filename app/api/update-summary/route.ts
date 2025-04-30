/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// app/api/update-summary/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Ensure this route is always dynamic
export const dynamic = 'force-dynamic';

// Expected request body structure
interface UpdateSummaryPayload {
    interactionId: string;
    newSummary: string;
}

export async function POST(request: NextRequest) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) { return cookieStore.get(name)?.value; },
                set(name: string, value: string, options: CookieOptions) { try { cookieStore.set({ name, value, ...options }); } catch (error) { /* Ignore */ } },
                remove(name: string, options: CookieOptions) { try { cookieStore.set({ name, value: '', ...options }); } catch (error) { /* Ignore */ } },
            },
        }
    );

    try {
        // 1. Check session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
            console.warn("Update Summary Auth Error:", sessionError);
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;

        // 2. Parse request body
        let payload: UpdateSummaryPayload;
        try {
            payload = await request.json();
        } catch (e) {
            console.error("Update Summary Error: Invalid JSON payload", e);
            return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
        }
        const { interactionId, newSummary } = payload;

        if (!interactionId || typeof newSummary !== 'string') {
            console.error("Update Summary Error: Missing interactionId or newSummary", payload);
            return NextResponse.json({ error: 'Missing interactionId or newSummary.' }, { status: 400 });
        }

        // 3. Update the summary in the database
        console.log(`Attempting to update summary for interaction ID: ${interactionId} by user: ${userId}`);
        const { data: updateData, error: updateError } = await supabase
            .from('interactions') // Use the correct table name 'interactions'
            .update({ summary: newSummary })
            .eq('id', interactionId)
            .eq('user_id', userId) // IMPORTANT: RLS check relies on this user_id match
            .select(); // Add select() to potentially get more info or confirm update count

        if (updateError) {
            // --- REVISED ERROR LOGGING ---
            // Log the full error object from Supabase
            console.error(`Update Summary DB Error: Failed to update summary for interaction ${interactionId}, user ${userId}. Full error:`, JSON.stringify(updateError, null, 2));
            // Provide a more informative generic message if specific message is absent
            const errorMessage = updateError.message || 'Unknown database error during summary update.';
            // Check for common RLS error hints (though details might be in DB logs)
            if (updateError.details?.includes('violates row-level security policy')) {
                 console.error("RLS Policy likely violated for update operation.");
                 return NextResponse.json({ error: `Database error updating summary: Check permissions (RLS).` }, { status: 500 });
            }
            return NextResponse.json({ error: `Database error updating summary: ${errorMessage}` }, { status: 500 });
            // --- END REVISED ERROR LOGGING ---
        }

        // Optional: Check if the update actually affected any rows
        if (!updateData || updateData.length === 0) {
             console.warn(`Update Summary Warning: Update operation completed but did not affect any rows for interaction ${interactionId}, user ${userId}. Might indicate wrong ID or RLS issue.`);
             // You might want to return an error here too, e.g., 404 Not Found or 403 Forbidden
             // return NextResponse.json({ error: 'Summary not found or update forbidden.' }, { status: 404 });
        }


        // 4. Return success
        console.log(`Successfully updated summary for interaction ID: ${interactionId}`);
        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error: any) {
        console.error('Unexpected error in update-summary route:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
