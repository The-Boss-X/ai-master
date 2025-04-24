/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/delete-history-item/route.ts

// Import createServerClient from @supabase/ssr
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function DELETE(request: NextRequest) {
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

        // 2. Get ID from request body (logic remains the same)
        parsedBody = await request.json();
        const { id } = parsedBody;
        if (!id || typeof id !== 'string') {
            return NextResponse.json({ success: false, error: 'Missing or invalid history item ID' }, { status: 400 });
        }

        // 3. Perform delete (logic remains the same)
        const { error, count } = await supabase
            .from('interactions')
            .delete()
            .eq('id', id);

        if (error) {
            // Error handling logic remains the same
             console.error('Supabase delete error:', error);
             if (error.code === '42501') {
                 return NextResponse.json({ success: false, error: 'Permission denied' }, { status: 403 });
             }
             return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        // Optional check remains the same
        // if (count === 0) { ... }

        // 4. Return success (logic remains the same)
        return NextResponse.json({ success: true });

    } catch (error: any) {
        // Error handling logic remains the same
        console.error('API Error deleting item:', error);
        if (error instanceof SyntaxError) {
            return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
        }
        if (error.message?.includes('session')) {
            return NextResponse.json({ success: false, error: 'Session error: ' + error.message }, { status: 500 });
        }
        return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}