// context/AuthContext.tsx
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
import supabaseClient from '../../lib/supabaseClient'; // Adjust path if needed

// 1. Define the Interface for the Context Value (Unchanged)
interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean; // Tracks initial auth state loading
  signOut: () => Promise<void>; // Function to sign out the user
}

// 2. Create the Context (Unchanged)
// Initialize with undefined to help catch usage outside the provider
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 3. Create the Custom Hook for Consuming the Context (Unchanged)
/**
 * Hook to easily access authentication state (user, session, loading) and actions (signOut).
 * Must be used within a component wrapped by AuthProvider.
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// 4. Create the Provider Component (Refactored State and Effect)
interface AuthProviderProps {
  children: ReactNode; // To wrap around other components
}

/**
 * Provides authentication state (user, session, loading) and sign-out functionality
 * to its children components via the AuthContext.
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // State variables managed by the provider
  // We only strictly need to store the session; user can be derived.
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Start true until initial check

  // Effect to fetch initial session and listen for auth changes
  useEffect(() => {
    // Async function to check the initial session state
    const fetchInitialSession = async () => {
      try {
        // Use the client-side Supabase client instance
        const { data: { session: initialSession }, error } = await supabaseClient.auth.getSession();

        if (error) {
          // Log error but allow the flow to continue to finally block
          console.error("AuthContext: Error fetching initial session:", error.message);
        }

        // Update session state. React handles updates correctly even if component unmounts quickly.
        setSession(initialSession);
        console.log("AuthContext: Initial session check complete.", initialSession ? `User: ${initialSession.user.id}` : "No initial session.");

      } catch (err) {
        console.error("AuthContext: Unexpected error during initial session fetch:", err);
        // Ensure session state reflects failure if needed (though null is likely correct)
        setSession(null);
      } finally {
        // Mark loading as false once the initial check attempt is complete
        setIsLoading(false);
      }
    };

    // Run the initial check
    fetchInitialSession();

    // Subscribe to Supabase auth state changes
    const { data: authListener } = supabaseClient.auth.onAuthStateChange(
      (_event, newSession) => {
        // Listener updates the session state directly
        console.log(`AuthContext: Auth state changed (Event: ${_event})`, newSession ? `New User: ${newSession.user.id}` : "User signed out");
        setSession(newSession);
        // It's possible an auth event happens *during* the initial load,
        // ensure loading is false after any auth event.
        setIsLoading(false);
      }
    );

    // Cleanup function: Automatically called on component unmount.
    // Unsubscribes the listener.
    return () => {
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
        console.log("AuthContext: Unsubscribed from auth state changes.");
      }
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  // Sign out function (Unchanged, useCallback is appropriate)
  const handleSignOut = useCallback(async () => {
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        console.error("AuthContext: Error signing out:", error.message);
      }
      // The onAuthStateChange listener will handle setting session to null
    } catch (err) {
      console.error("AuthContext: Unexpected error during sign out:", err);
    }
  }, []);

  // Prepare the value object provided by the context
  // Derive the 'user' directly from the 'session' state
  const contextValue: AuthContextType = {
    user: session?.user ?? null, // User is derived from the session state
    session,
    isLoading,
    signOut: handleSignOut,
  };

  // Provide the context value to children
  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};