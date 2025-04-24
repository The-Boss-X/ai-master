// components/AccountButton.tsx
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext'; // Adjust path if necessary
import supabaseClient from '../../lib/supabaseClient'; // Adjust path if necessary

export default function AccountButton() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false); // State for logout loading

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        console.error('Error signing out:', error);
        // Optionally show an error message to the user
      } else {
        // Refresh the current route to reflect the signed-out state
        // This should update server components and trigger layout changes
         router.refresh();
        // You could also redirect to home or auth page if preferred:
        // router.push('/');
      }
    } catch (error) {
      console.error('Unexpected error during sign out:', error);
    } finally {
      setIsSigningOut(false);
    }
  };

  // --- Render Logic ---

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="px-3 py-2 text-sm text-gray-500 animate-pulse">
        Loading...
      </div>
    );
  }

  // 2. Logged In State
  if (user) {
    return (
      <div className="flex items-center space-x-3">
        {/* Display user email - adjust if you have profile/username */}
        <span className="text-sm text-gray-700 hidden sm:inline">
          {user.email}
        </span>
        <button
          onClick={handleSignOut}
          disabled={isSigningOut}
          className={`px-3 py-2 text-sm font-medium rounded-md transition-colors duration-150 ${
            isSigningOut
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-red-500 text-white hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-1'
          }`}
        >
          {isSigningOut ? 'Logging out...' : 'Log Out'}
        </button>
      </div>
    );
  }

  // 3. Logged Out State
  return (
    <Link
      href="/auth"
      className="px-3 py-2 text-sm font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 transition-colors duration-150"
    >
      Sign In / Sign Up
    </Link>
  );
}