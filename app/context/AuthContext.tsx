// context/AuthContext.tsx
'use client'; // Essential for hooks like useState, useEffect, useContext

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback // Added useCallback for signOut stability
} from 'react';
import { User, Session } from '@supabase/supabase-js';
// Assuming your configured client-side Supabase client is here:
// IMPORTANT: Ensure this client uses createBrowserClient from @supabase/ssr
import supabaseClient from '../../lib/supabaseClient'; // Adjust path if needed

// 1. Define the Interface for the Context Value
interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean; // Tracks initial auth state loading
  signOut: () => Promise<void>; // Function to sign out the user
}

// 2. Create the Context
// Initialize with undefined to help catch usage outside the provider
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 3. Create the Custom Hook for Consuming the Context
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

// 4. Create the Provider Component
interface AuthProviderProps {
  children: ReactNode; // To wrap around other components
}

/**
 * Provides authentication state (user, session, loading) and sign-out functionality
 * to its children components via the AuthContext.
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // State variables managed by the provider
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Start as true until initial check completes

  // Effect to fetch initial session and listen for auth changes
  useEffect(() => {
    let isMounted = true; // Prevent state updates on unmounted component

    // Async function to check the initial session state
    const fetchInitialSession = async () => {
      try {
        // Use the client-side Supabase client instance
        const { data: { session: initialSession }, error } = await supabaseClient.auth.getSession();

        if (error) {
          console.error("AuthContext: Error fetching initial session:", error.message);
        }

        // Update state only if component is still mounted
        if (isMounted) {
          setSession(initialSession);
          setUser(initialSession?.user ?? null); // Set user, or null if no session
          console.log("AuthContext: Initial session check complete.", initialSession ? `User: ${initialSession.user.id}` : "No initial session.");
        }
      } catch (err) {
        console.error("AuthContext: Unexpected error during initial session fetch:", err);
      } finally {
        // Mark loading as false once the check is done, if still mounted
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // Run the initial check
    fetchInitialSession();

    // Subscribe to Supabase auth state changes
    const { data: authListener } = supabaseClient.auth.onAuthStateChange(
      (_event, newSession) => {
        if (isMounted) {
          console.log(`AuthContext: Auth state changed (Event: ${_event})`, newSession ? `New User: ${newSession.user.id}` : "User signed out");
          setSession(newSession);
          setUser(newSession?.user ?? null);
          setIsLoading(false); // Ensure loading is false after any auth event
        }
      }
    );

    // Cleanup function: Unsubscribe when the component unmounts
    return () => {
      isMounted = false;
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
        console.log("AuthContext: Unsubscribed from auth state changes.");
      }
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  // Sign out function
  // useCallback ensures the function reference is stable unless dependencies change (none here)
  const handleSignOut = useCallback(async () => {
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        console.error("AuthContext: Error signing out:", error.message);
      }
      // The onAuthStateChange listener will handle setting user/session to null
    } catch (err) {
      console.error("AuthContext: Unexpected error during sign out:", err);
    }
  }, []);

  // Prepare the value object provided by the context
  const contextValue: AuthContextType = {
    user,
    session,
    isLoading,
    signOut: handleSignOut,
  };

  // Provide the context value to children
  // Render children immediately; consuming components should check `isLoading`
  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
