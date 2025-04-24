// app/api/auth/sign-in/route.ts

// Import createServerClient from @supabase/ssr
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get('email'));
  const password = String(formData.get('password'));

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
          // Setting cookies IS expected in sign-in/sign-up/sign-out routes
          // No need for try/catch here as the response object *should* be mutable
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          // Removing cookies IS expected
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );

  try {
    // Sign in logic remains the same
    // createServerClient handles cookie setting via its internal calls
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
        // Error handling logic remains the same
        console.error('Sign in error:', signInError);
        if (signInError.message.includes('Invalid login credentials')) {
             return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
        }
        if (signInError.message.includes('Email not confirmed')) {
             return NextResponse.json({ error: 'Please confirm your email address first.' }, { status: 403 });
        }
        return NextResponse.json({ error: signInError.message || 'Could not sign in user.' }, { status: signInError.status || 500 });
    }

    // Sign in successful - createServerClient used by signInWithPassword handles setting cookies
    return NextResponse.json({ message: 'Sign in successful.' }, { status: 200 });

  } catch (error) {
      // Error handling logic remains the same
      console.error('Unexpected error during sign in:', error);
      return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
  }
}