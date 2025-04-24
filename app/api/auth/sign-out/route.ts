/* eslint-disable @typescript-eslint/no-unused-vars */
// app/api/auth/sign-out/route.ts

// Import createServerClient from @supabase/ssr
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
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
          // Setting cookies might happen (e.g., csrf)
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          // Removing cookies IS expected on sign out
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );

  try {
    // Sign out logic remains the same
    // createServerClient handles cookie clearing via its internal calls
    const { error } = await supabase.auth.signOut();

    if (error) {
        // Error handling logic remains the same
         console.error('Sign out error:', error);
         return NextResponse.json({ error: error.message || 'Could not sign out user.' }, { status: error.status || 500 });
    }

    // Sign out successful - createServerClient used by signOut handles clearing cookies
    // Optional Redirect logic remains the same
    return NextResponse.json({ message: 'Sign out successful.' }, { status: 200 });

  } catch (error) {
      // Error handling logic remains the same
       console.error('Unexpected error during sign out:', error);
       return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
  }
}

// Optional GET handler would be converted the same way