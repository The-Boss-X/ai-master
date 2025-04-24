// app/api/auth/callback/route.ts

// Import createServerClient from @supabase/ssr
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code'); // Get the code from query params

  if (code) {
    // Get cookie store
    const cookieStore = await cookies();

    // Create Supabase client using createServerClient
    // This route NEEDS to set cookies upon successful code exchange
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            // Set cookie on the response for the browser
            // No try/catch needed here as setting cookies is expected
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
             // Removing cookies might happen
             // No try/catch needed here
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    try {
      // Exchange the code for a session (logic remains the same)
      // createServerClient handles setting the session cookie via its internal calls
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
          // Error handling logic remains the same
          console.error('Error exchanging code for session:', error);
          return NextResponse.redirect(`${requestUrl.origin}/auth?error=Could not authenticate user`);
      }
      // Successfully exchanged code, session cookie is set by createServerClient

    } catch (error) {
        // Error handling logic remains the same
         console.error('Unexpected error during code exchange:', error);
         return NextResponse.redirect(`${requestUrl.origin}/auth?error=Server error during authentication`);
    }
  } else {
      // Handling for missing code remains the same
      console.warn('Callback route called without a code parameter.');
      return NextResponse.redirect(`${requestUrl.origin}/auth?error=Invalid callback request`);
  }

  // Redirect user after successful authentication or if code was missing initially (handled above)
  // Redirect to the home page or a desired post-auth destination
  console.log('Auth callback successful, redirecting to origin:', requestUrl.origin);
  return NextResponse.redirect(requestUrl.origin);
}