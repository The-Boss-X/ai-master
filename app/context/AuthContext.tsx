/* eslint-disable @typescript-eslint/no-unused-vars */
// context/AuthContext.tsx
'use client'; // This context and provider will be used in client components

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Session, SupabaseClient } from '@supabase/supabase-js';
// Import your configured client-side Supabase client
// Assuming AuthContext.tsx is in app/context/ and supabaseClient.ts is in app/lib/
import supabaseClient from '../../lib/supabaseClient'; // Corrected relative path

// Define the shape of the context value
interface AuthContextType {
  user: User | null; // The Supabase user object if logged in, otherwise null
  session: Session | null; // The full session object
  isLoading: boolean; // Indicates if the initial session check is still loading
  signOut: () => Promise<void>; // Add a sign out function
}

// Create the context with a default undefined value
// Add 'export' here
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Custom hook to access the AuthContext.
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Define props for the AuthProvider
interface AuthProviderProps {
  children: ReactNode;
}

/**
 * AuthProvider Component
 * Manages the user session state and provides it through context.
 * Listens to Supabase auth state changes using the client-side client.
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start loading initially

  useEffect(() => {
    let isMounted = true; // Flag to prevent state updates on unmounted component

    // Function to get the initial session when the provider mounts
    const getInitialSession = async () => {
      try {
        // Use getSession from the client-side client (supabaseClient)
        const { data: { session: initialSession }, error } = await supabaseClient.auth.getSession();

        if (error) {
          console.error('Auth Provider: Error getting initial session:', error.message);
        }

        // Only update state if the component is still mounted
        if (isMounted) {
          console.log("Auth Provider: Initial session fetched", initialSession ? `for user ${initialSession.user.id}` : "(No session)");
          setSession(initialSession);
          setUser(initialSession?.user ?? null);
        }
      } catch (error) {
        console.error('Auth Provider: Unexpected error fetching initial session:', error);
      } finally {
        // Ensure loading is set to false after the initial check,
        // but only if the component is still mounted.
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // Fetch the initial session state
    getInitialSession();

    // Set up the listener for subsequent auth state changes (sign-in, sign-out, token refresh)
    const { data: authListener } = supabaseClient.auth.onAuthStateChange(
      (event, newSession) => {
        // Log the event for debugging purposes
        console.log(`Supabase Auth Event: ${event}`, newSession ? `New Session for ${newSession.user.id}` : "(No session)");

        // Update state only if the component is still mounted
        if (isMounted) {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          // We might already be !isLoading from the initial fetch, but this confirms
          // state is up-to-date after events like sign-in/sign-out.
          setIsLoading(false);
        }
      }
    );

    // Cleanup function: Will run when the AuthProvider unmounts
    return () => {
      isMounted = false; // Mark component as unmounted to prevent state updates
      // Detach the auth state change listener
      if (authListener?.subscription) {
        console.log("Auth Provider: Unsubscribing from auth state changes.");
        authListener.subscription.unsubscribe();
      }
    };
  }, []); // Empty dependency array ensures this effect runs only once on mount

  // Sign out function exposed via context
  const handleSignOut = async () => {
    setIsLoading(true); // Optionally indicate loading during sign out
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        console.error("Auth Provider: Error signing out:", error.message);
        // Optionally show an error message to the user via a toast or state
      } else {
        // State (user, session) will be updated automatically by the onAuthStateChange listener
        console.log("Auth Provider: Sign out successful via client.");
      }
    } catch (error) {
        console.error("Auth Provider: Unexpected error during sign out:", error);
    } finally {
        // Listener should set loading to false eventually, but we can force it
        // if needed, though relying on the listener is usually cleaner.
        // setIsLoading(false);
    }
  };


  // The value provided to consuming components via the context
  const value: AuthContextType = {
    user,
    session,
    isLoading,
    signOut: handleSignOut, // Provide the signOut function
  };

  // Provide the context value to children components
  // We render children immediately, and components using useAuth()
  // can check the `isLoading` flag if they need to wait for the initial session.
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// No need to export AuthContext separately again here if exported at creation
