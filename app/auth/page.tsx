/* eslint-disable @typescript-eslint/no-explicit-any */
// app/auth/page.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
// Make sure this path is correct for your project structure
import supabaseClient from '../../lib/supabaseClient';
import Link from 'next/link'; // Import Link for navigation

export default function AuthPage() {
  const [isSignUpMode, setIsSignUpMode] = useState(false); // Start in Sign In mode
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false); // General loading state for email/password
  const [googleLoading, setGoogleLoading] = useState(false); // Specific loading state for Google
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null); // For success/info messages
  const router = useRouter();

  // --- Handler for Email/Password Sign In/Sign Up ---
  const handleAuthAction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); // Prevent default form submission
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      let authResponse;
      if (isSignUpMode) {
        // --- Sign Up ---
        authResponse = await supabaseClient.auth.signUp({
          email: email,
          password: password,
          // Optional: Add options like redirect URL if needed after sign up confirmation
          // options: {
          //   emailRedirectTo: `${window.location.origin}/`,
          // }
        });

        if (authResponse.error) {
          throw authResponse.error;
        }

        // Check if user object exists and if email confirmation is required
        // Note: Supabase behavior might vary slightly based on project settings (e.g., auto-confirm)
        if (authResponse.data.user && authResponse.data.user.identities?.length === 0) {
          // This condition often indicates email confirmation is required
          setMessage("Sign up successful! Please check your email to confirm your account.");
          setEmail(''); // Clear fields after success
          setPassword('');
        } else if (authResponse.data.user) {
          // If sign up doesn't require confirmation or auto-confirms
          setMessage("Sign up successful! Redirecting...");
          // Redirect immediately or prompt user to sign in
          router.push('/'); // Redirect to home page
          router.refresh(); // Crucial to update server-side state/layout
        } else {
          // Handle cases where user might be null unexpectedly
          setMessage("Sign up process initiated. Follow instructions if prompted.");
        }

      } else {
        // --- Sign In ---
        authResponse = await supabaseClient.auth.signInWithPassword({
          email: email,
          password: password,
        });

        if (authResponse.error) {
          throw authResponse.error;
        }

        // On successful sign-in, redirect to the home page
        router.push('/');
        router.refresh(); // Crucial to update server-side state/layout
      }

    } catch (err: any) {
      console.error("Email/Password Authentication error:", err);
      // Provide more specific error messages if possible
      let errorMessage = err.message || 'An unexpected error occurred.';
      if (err.message.includes('Email rate limit exceeded')) {
        errorMessage = 'Too many attempts. Please try again later.';
      } else if (err.message.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password.';
      } else if (err.message.includes('User already registered')) {
        errorMessage = 'This email is already registered. Try signing in.';
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // --- Handler for Google Sign In ---
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error: oauthError } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // Important: This URL should match one of the URLs configured
          // in your Supabase Dashboard -> Authentication -> URL Configuration
          // and in your Google Cloud Console Authorized Redirect URIs.
          // It's where the user is sent back *after* Google authenticates them
          // and Supabase processes the callback. Usually the root of your app.
          redirectTo: `${window.location.origin}/`,
          // Optional: Add scopes if needed, though Supabase defaults usually suffice
          // scopes: 'email profile',
        },
      });

      if (oauthError) {
        throw oauthError;
      }

      // Note: Redirection happens automatically. If successful, the user leaves
      // this page to go to Google, then back to your redirectTo URL.
      // The AuthContext listener will pick up the new session on redirect.
      // You might show a message like "Redirecting to Google..." here,
      // but often the redirect is fast enough not to require it.
      setMessage("Redirecting to Google for sign in...");

    } catch (err: any) {
      console.error("Google OAuth Error:", err);
      setError(err.error_description || err.message || 'Failed to sign in with Google.');
      setGoogleLoading(false); // Ensure loading state is reset on error
    }
    // No finally block needed to set googleLoading to false here,
    // as successful execution results in a redirect away from this component.
  };


  // --- Toggle between Sign In and Sign Up modes ---
  const toggleMode = () => {
    setIsSignUpMode(!isSignUpMode);
    setError(null); // Clear errors when switching modes
    setMessage(null);
    setEmail(''); // Optionally clear fields when switching
    setPassword('');
  };

  // --- Render Component ---
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        {/* Back to Home Link */}
        <div className="text-sm text-left">
          <Link href="/" className="text-blue-500 hover:underline dark:text-blue-400 dark:hover:text-blue-300">
            &larr; Back to Home
          </Link>
        </div>

        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-gray-100">
          {isSignUpMode ? 'Create Account' : 'Sign In'}
        </h2>

        {/* Error Message Display */}
        {error && (
          <div className="p-3 text-center text-sm text-red-800 bg-red-100 dark:bg-red-900/30 dark:text-red-300 border border-red-300 dark:border-red-700 rounded-md">
            {error}
          </div>
        )}

        {/* Success/Info Message Display */}
        {message && (
          <div className="p-3 text-center text-sm text-green-800 bg-green-100 dark:bg-green-900/30 dark:text-green-300 border border-green-300 dark:border-green-700 rounded-md">
            {message}
          </div>
        )}

        {/* --- Google Sign In Button --- */}
        <div className="pt-4">
          <button
            type="button" // Important: type="button" prevents submitting the email/password form
            onClick={handleGoogleSignIn}
            disabled={loading || googleLoading} // Disable if any auth action is in progress
            className={`w-full flex items-center justify-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium transition-colors duration-200 ${
              googleLoading
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
            }`}
          >
            {/* Basic Google SVG Icon */}
            <svg className="w-5 h-5 mr-2" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
              <path fill="currentColor" d="M488 261.8C488 403.3 381.5 512 244 512 109.8 512 0 402.2 0 256S109.8 0 244 0c73 0 134.3 29.3 179.8 74.8L373.5 128c-27.2-25.6-63.3-40.8-106.8-40.8-84.8 0-153.8 68.8-153.8 153.8s69 153.8 153.8 153.8c94.8 0 132.3-61.3 137.8-93.8H244v-76.8h239.5c3.4 17.9 5.5 37.5 5.5 58.8z"></path>
            </svg>
            {googleLoading ? 'Redirecting...' : 'Sign in with Google'}
          </button>
        </div>

        {/* --- Divider --- */}
        <div className="relative flex items-center py-2">
          <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
          <span className="flex-shrink mx-4 text-sm text-gray-500 dark:text-gray-400">OR</span>
          <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
        </div>


        {/* --- Email/Password Auth Form --- */}
        <form className="space-y-4" onSubmit={handleAuthAction}>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading || googleLoading} // Disable if any auth action is in progress
              className="w-full px-3 py-2 mt-1 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignUpMode ? 'new-password' : 'current-password'}
              required
              minLength={6} // Supabase default minimum password length
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading || googleLoading} // Disable if any auth action is in progress
              className="w-full px-3 py-2 mt-1 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-gray-100 disabled:bg-gray-100 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={loading || googleLoading} // Disable if any auth action is in progress
              className={`w-full px-4 py-2 font-semibold text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200 ${
                loading
                  ? 'bg-gray-400 dark:bg-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 focus:ring-blue-500'
              }`}
            >
              {loading
                ? 'Processing...'
                : isSignUpMode
                ? 'Sign Up with Email'
                : 'Sign In with Email'}
            </button>
          </div>
        </form>

        {/* Toggle Link */}
        <div className="text-sm text-center">
          <button
            onClick={toggleMode}
            disabled={loading || googleLoading} // Disable if any auth action is in progress
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            {isSignUpMode
              ? 'Already have an account? Sign In'
              : "Don't have an account? Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
}
