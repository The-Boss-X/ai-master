/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/update-history-title/route.ts

// Import createServerClient from @supabase/ssr
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Use PATCH for partial updates
export async function PATCH(request: NextRequest) {
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
        // 1. Check session (logic remains the same)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Get data from request (logic remains the same)
        parsedBody = await request.json();
        const { id, title } = parsedBody;
        if (!id || typeof title !== 'string' || title.trim() === '') {
            return NextResponse.json({ success: false, error: 'Missing or invalid id or title' }, { status: 400 });
        }

        // 3. Perform update (logic remains the same)
        const { data, error } = await supabase
            .from('interactions')
            .update({ title: title.trim() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            // Error handling logic remains the same
             console.error('Supabase update error:', error);
             if (error.code === '42501') {
                 return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
             }
            if (error.code === 'PGRST116') {
                 return NextResponse.json({ success: false, error: 'Record not found or not owned by user' }, { status: 404 });
             }
             return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        if (!data) {
             // Handling remains the same
             console.warn('Update successful but no data returned for ID:', id);
             return NextResponse.json({ success: false, error: 'Record not found after update' }, { status: 404 });
        }

        // 4. Return success (logic remains the same)
        return NextResponse.json({ success: true, updatedItem: data });

    } catch (error: any) {
        // Error handling logic remains the same
        console.error('API Error updating title:', error);
        if (error instanceof SyntaxError) {
            return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
        }
        if (error.message?.includes('session')) {
            return NextResponse.json({ success: false, error: 'Session error: ' + error.message }, { status: 500 });
        }
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}