// app/context/AuthContext.tsx
'use client'; // Essential for hooks like useState, useEffect, useContext

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback, // Keep useCallback for signOut stability
} from 'react';
import { User, Session } from '@supabase/supabase-js';
// Assuming your configured client-side Supabase client is here:
// IMPORTANT: Ensure this client uses createBrowserClient from @supabase/ssr
// or createClient from @supabase/supabase-js if not using SSR features needing cookies.
// Make sure this path is correct for your project structure
import supabaseClient from '../../lib/supabaseClient';

// 1. Define the Interface for the Context Value
interface AuthContextType {
  user: User | null; // The authenticated Supabase user object, or null
  session: Session | null; // The active Supabase session object, or null
  isLoading: boolean; // Tracks initial auth state loading (true until first check completes)
  signOut: () => Promise<void>; // Function to sign out the user
}

// 2. Create the Context
// Initialize with undefined to help catch usage outside the provider during development
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 3. Create the Custom Hook for Consuming the Context
/**
 * Hook to easily access authentication state (user, session, loading) and actions (signOut).
 * Throws an error if used outside of an AuthProvider.
 * @returns {AuthContextType} The authentication context value.
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // This error helps ensure the hook is used correctly within the component tree
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// 4. Create the Provider Component
interface AuthProviderProps {
  children: ReactNode; // To wrap around other components that need auth context
}

/**
 * AuthProvider component manages and provides authentication state (user, session, loading)
 * and the signOut function to its children components via the AuthContext.
 * It fetches the initial session state and listens for real-time auth changes from Supabase.
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // State variables managed by the provider
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Start loading until initial check

  // Effect to fetch initial session and set up the auth state change listener
  useEffect(() => {
    // Flag to prevent state updates if the component unmounts quickly
    let isMounted = true;

    // Async function to check the initial session state on component mount
    const fetchInitialSession = async () => {
      try {
        // Use the client-side Supabase client instance to get the current session
        const { data: { session: initialSession }, error } = await supabaseClient.auth.getSession();

        if (error) {
          console.error("AuthContext: Error fetching initial session:", error.message);
        }

        // Only update state if the component is still mounted
        if (isMounted) {
          setSession(initialSession);
          console.log("AuthContext: Initial session check complete.", initialSession ? `User: ${initialSession.user.id}` : "No initial session.");
        }

      } catch (err) {
        console.error("AuthContext: Unexpected error during initial session fetch:", err);
        if (isMounted) {
          setSession(null); // Ensure session is null on unexpected error
        }
      } finally {
        // Mark loading as false once the initial check attempt is complete, if mounted
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // Run the initial session check
    fetchInitialSession();

    // Subscribe to Supabase auth state changes (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.)
    const { data: authListener } = supabaseClient.auth.onAuthStateChange(
      (_event, newSession) => {
        // This listener callback runs whenever the auth state changes
        if (isMounted) {
          console.log(`AuthContext: Auth state changed (Event: ${_event})`, newSession ? `New User: ${newSession.user.id}` : "User signed out");
          // Update the session state with the new session (or null if signed out)
          setSession(newSession);
          // Ensure loading is false after any auth event occurs
          setIsLoading(false);
        }
      }
    );

    // Cleanup function: This runs when the component unmounts
    return () => {
      isMounted = false; // Set flag to prevent state updates after unmount
      // Unsubscribe the listener to prevent memory leaks
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
        console.log("AuthContext: Unsubscribed from auth state changes.");
      }
    };
  }, []); // Empty dependency array ensures this effect runs only once on mount

  // Sign out function, wrapped in useCallback for performance optimization
  // Prevents unnecessary re-creation if passed down as a prop
  const handleSignOut = useCallback(async () => {
    try {
      // Call Supabase's signOut method
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        console.error("AuthContext: Error signing out:", error.message);
      }
      // No need to manually set session to null here;
      // the onAuthStateChange listener will detect the SIGNED_OUT event and update the state.
    } catch (err) {
      console.error("AuthContext: Unexpected error during sign out:", err);
    }
  }, []); // No dependencies, so this function is stable

  // Prepare the value object to be provided by the context
  // Derive the 'user' directly from the 'session' state for convenience
  const contextValue: AuthContextType = {
    user: session?.user ?? null, // Provide the user object or null if no session
    session,                     // Provide the full session object or null
    isLoading,                   // Provide the loading status
    signOut: handleSignOut,      // Provide the signOut function
  };

  // Render the AuthContext.Provider, passing the context value
  // Wrap the children components, making the context available to them
  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
