/* eslint-disable @typescript-eslint/no-explicit-any */
// app/auth/page.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import supabaseClient from '../../lib/supabaseClient'; // Adjust path if necessary
import Link from 'next/link'; // Import Link for navigation

export default function AuthPage() {
  const [isSignUpMode, setIsSignUpMode] = useState(false); // Start in Sign In mode
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null); // For success/info messages
  const router = useRouter();

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
        });

        if (authResponse.error) {
          throw authResponse.error;
        }

        // Check if user object exists and if email confirmation is required
        if (authResponse.data.user && authResponse.data.user.identities?.length === 0) {
            // This condition often indicates email confirmation is required and the user object isn't fully populated yet.
            setMessage("Sign up successful! Please check your email to confirm your account.");
            setEmail(''); // Clear fields after success
            setPassword('');
        } else if (authResponse.data.user) {
             // If sign up doesn't require confirmation or auto-confirms
             setMessage("Sign up successful! Redirecting...");
             // Redirect immediately after a short delay if no confirmation needed
             // Or you might still want them to sign in separately
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
      console.error("Authentication error:", err);
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

  const toggleMode = () => {
    setIsSignUpMode(!isSignUpMode);
    setError(null); // Clear errors when switching modes
    setMessage(null);
    setEmail(''); // Optionally clear fields when switching
    setPassword('');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
        {/* Back to Home Link */}
        <div className="text-sm text-left">
            <Link href="/" className="text-blue-500 hover:underline">&larr; Back to Home</Link>
        </div>

        <h2 className="text-2xl font-bold text-center text-gray-900">
          {isSignUpMode ? 'Create Account' : 'Sign In'}
        </h2>

        {/* Error Message Display */}
        {error && (
          <div className="p-3 text-center text-red-700 bg-red-100 border border-red-300 rounded-md">
            {error}
          </div>
        )}

        {/* Success/Info Message Display */}
        {message && (
          <div className="p-3 text-center text-green-700 bg-green-100 border border-green-300 rounded-md">
            {message}
          </div>
        )}

        {/* Auth Form */}
        <form className="space-y-4" onSubmit={handleAuthAction}>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
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
              disabled={loading}
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
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
              disabled={loading}
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className={`w-full px-4 py-2 font-semibold text-white rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200 ${
                loading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-500'
              }`}
            >
              {loading
                ? 'Processing...'
                : isSignUpMode
                ? 'Sign Up'
                : 'Sign In'}
            </button>
          </div>
        </form>

        {/* Toggle Link */}
        <div className="text-sm text-center">
          <button
            onClick={toggleMode}
            disabled={loading}
            className="font-medium text-blue-600 hover:text-blue-500 disabled:text-gray-400 disabled:cursor-not-allowed"
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