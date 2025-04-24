// app/api/auth/sign-up/route.ts

// Import createServerClient from @supabase/ssr
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const requestUrl = new URL(request.url);
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
          // Setting cookies IS expected in sign-up (e.g., if auto-confirm/already logged in)
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          // Removing cookies might happen
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );

  try {
    // Sign up logic remains the same
    // createServerClient handles potential cookie setting via its internal calls
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Logic remains the same
        emailRedirectTo: `${requestUrl.origin}/api/auth/callback`,
      },
    });

    if (signUpError) {
      // Error handling logic remains the same
       console.error('Sign up error:', signUpError);
       if (signUpError.message.includes("User already registered")) {
           return NextResponse.json({ error: "User already registered with this email." }, { status: 409 });
       }
       return NextResponse.json({ error: signUpError.message || 'Could not sign up user.' }, { status: signUpError.status || 500 });
    }

    // Sign up successful
    return NextResponse.json({
      message: 'Sign up successful. Please check your email for confirmation.',
    }, { status: 200 });

  } catch (error) {
    // Error handling logic remains the same
     console.error('Unexpected error during sign up:', error);
     return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
  }
}