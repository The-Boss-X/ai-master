/* eslint-disable @typescript-eslint/no-unused-vars */
// components/AuthProvider.tsx
'use client';

import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
} from 'react';
import supabaseClient from '../../lib/supabaseClient'; // Adjust path if necessary
import { User, Session } from '@supabase/supabase-js';
import { AuthContext } from '../context/AuthContext'; // Import the context definition

// Define props for the provider component
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start loading until session is checked

  useEffect(() => {
    // Flag to prevent setting state if component unmounts before async operations complete
    let isMounted = true;

    // Function to get the initial session
    const getInitialSession = async () => {
      try {
        // Fetches the session from localStorage (or cookies if using server-side helpers)
        const { data: { session }, error } = await supabaseClient.auth.getSession();

        if (error) {
          console.error('Error getting initial session:', error.message);
        }

        if (isMounted) {
          setUser(session?.user ?? null); // Set user if session exists, otherwise null
        }
      } catch (error) {
        console.error('Unexpected error getting initial session:', error);
         if (isMounted) {
            setUser(null);
         }
      } finally {
        if (isMounted) {
          setIsLoading(false); // Finished loading initial session state
        }
      }
    };

    // Fetch the initial session when the provider mounts
    getInitialSession();

    // Set up the auth state change listener
    const { data: authListener } = supabaseClient.auth.onAuthStateChange(
      async (_event, session) => {
        // This callback runs when the user signs in, signs out, password recovery, etc.
        if (isMounted) {
          console.log("Auth State Change Detected:", _event, session ? 'Session exists' : 'No session');
          setUser(session?.user ?? null);
          // If the initial load was still happening, mark it as finished now
          // This covers cases where the listener fires before getInitialSession completes
          if (isLoading) {
            setIsLoading(false);
          }
        }
      }
    );

    // Cleanup function: Unsubscribe the listener when the component unmounts
    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, [isLoading]); // Rerun effect slightly differently based on isLoading state (or keep empty array if preferred)
                  // Including isLoading helps ensure loading is set to false if listener fires first. Empty array [] is also common.

  // Value object passed to the AuthContext.Provider
  const contextValue = {
    user,
    isLoading,
  };

  // Render the context provider, wrapping the children components
  // Only render children once the initial loading is complete to prevent layout shifts
  // or rendering protected content prematurely.
  return (
    <AuthContext.Provider value={contextValue}>
      {!isLoading ? children : null /* Or a loading spinner */}
    </AuthContext.Provider>
  );
};