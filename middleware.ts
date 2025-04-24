/* eslint-disable @typescript-eslint/no-explicit-any */
// middleware.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  console.log(`\n--- Middleware START for: ${request.nextUrl.pathname} ---`);

  // Log Env Vars Check
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error("Middleware: ERROR - Supabase URL or Anon Key missing in environment variables!");
    // Consider returning an error response if critical env vars are missing
    // return new NextResponse("Internal Server Error: Missing Supabase configuration", { status: 500 });
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          const value = request.cookies.get(name)?.value;
          return value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options }); // Update request cookies for potential chaining
          response = NextResponse.next({ // Recreate response to apply changes
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options }); // Set cookie on the response
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options }); // Update request cookies
          response = NextResponse.next({ // Recreate response
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: '', ...options }); // Set removal cookie on the response
        },
      },
    }
  );

  console.log('Middleware: Attempting to get user session/refresh token...');
  try {
    // Refresh session if expired - crucial step
    const { error: getUserError } = await supabase.auth.getUser();
    if (getUserError) {
        console.error('Middleware: supabase.auth.getUser() Error:', getUserError.message);
    } else {
        console.log('Middleware: supabase.auth.getUser() completed successfully (session potentially refreshed).');
    }
  } catch (e: any) {
    console.error('Middleware: EXCEPTION during supabase.auth.getUser():', e.message);
  }

  console.log(`--- Middleware END for: ${request.nextUrl.pathname} ---`);
  return response;
}

// Updated Matcher Configuration
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - auth (authentication specific pages like login/signup)
     * BUT explicitly include /api/get-history
     */
    '/((?!_next/static|_next/image|favicon.ico|auth).*)', // Matches most things
    '/api/get-history', // Explicitly include this API route
    // Add other protected API routes here if needed, e.g., '/api/some-other-route'
  ],
};