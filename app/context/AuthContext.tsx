/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/exhaustive-deps */
// app/context/AuthContext.tsx
'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from 'react';
import { User as SupabaseUser, Session } from '@supabase/supabase-js';
import supabaseClient from '../../lib/supabaseClient'; // Your client-side Supabase client
import { Database } from '@/lib/database.types'; // Assuming this is generated

// Define the UserSettings interface based on your database.types.ts and get-settings response
// This should match the structure of the user_settings table row.
export interface UserSettings {
  user_id?: string; // This is usually the PK and implicitly known
  slot_1_model: string | null;
  slot_2_model: string | null;
  slot_3_model: string | null;
  slot_4_model: string | null;
  slot_5_model: string | null;
  slot_6_model: string | null;
  summary_model: string | null;
  openai_api_key_encrypted: string | null;
  anthropic_api_key_encrypted: string | null;
  gemini_api_key_encrypted: string | null;
  use_provided_keys: boolean;
  free_tokens_remaining: number;
  free_tokens_last_reset_at: string | null;
  paid_tokens_remaining: number;
  total_tokens_used_overall: number;
  updated_at: string | null;
}

interface AuthContextType {
  user: SupabaseUser | null;
  session: Session | null;
  isLoading: boolean;
  userSettings: UserSettings | null; // Holds all user-specific settings
  fetchUserSettings: () => Promise<void>; // Function to manually refresh settings
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

const defaultSettingsValues: UserSettings = {
    slot_1_model: null, slot_2_model: null, slot_3_model: null, slot_4_model: null, slot_5_model: null, slot_6_model: null,
    summary_model: null,
    openai_api_key_encrypted: null, anthropic_api_key_encrypted: null, gemini_api_key_encrypted: null,
    use_provided_keys: false,
    free_tokens_remaining: 10000,
    free_tokens_last_reset_at: null,
    paid_tokens_remaining: 0,
    total_tokens_used_overall: 0,
    updated_at: null,
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);

  const fetchUserSettingsCallback = useCallback(async (currentSession: Session | null) => {
    if (currentSession?.user?.id) {
      try {
        const response = await fetch('/api/settings/get-settings');
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          // Handle 404 or PGRST116 (no settings found for user) by using defaults
          if (response.status === 404 || errorData.details?.includes('PGRST116') || errorData.error?.includes('No settings found')) {
            console.log('No settings found for user via API, applying defaults to context.');
            setUserSettings(defaultSettingsValues);
            return;
          }
          throw new Error(errorData.error || `Failed to fetch user settings: ${response.statusText}`);
        }
        const data: UserSettings = await response.json();
        setUserSettings(data);
        console.log("AuthContext: User settings fetched/updated.", data);
      } catch (error) {
        console.error("AuthContext: Error fetching user settings:", error);
        setUserSettings(defaultSettingsValues); // Fallback to defaults on any error
      }
    } else {
      setUserSettings(null); // No user, no settings
    }
  }, []);


  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    supabaseClient.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      if (isMounted) {
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        await fetchUserSettingsCallback(initialSession);
        setIsLoading(false);
        console.log("AuthContext: Initial session and settings check complete.", initialSession ? `User: ${initialSession.user.id}` : "No initial session.");
      }
    }).catch(error => {
        console.error("AuthContext: Error in initial getSession:", error);
        if(isMounted) setIsLoading(false);
    });

    const { data: authListener } = supabaseClient.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (isMounted) {
          console.log(`AuthContext: Auth state changed (Event: ${_event})`, newSession ? `New User: ${newSession.user.id}` : "User signed out");
          setSession(newSession);
          setUser(newSession?.user ?? null);
          await fetchUserSettingsCallback(newSession); // Fetch/clear settings on auth change
          // Ensure loading is false after any auth event occurs that might change user state
          if (isLoading && (_event === 'SIGNED_IN' || _event === 'SIGNED_OUT' || _event === 'USER_UPDATED')) {
             setIsLoading(false);
          }
        }
      }
    );

    return () => {
      isMounted = false;
      if (authListener?.subscription) {
        authListener.subscription.unsubscribe();
        console.log("AuthContext: Unsubscribed from auth state changes.");
      }
    };
  }, [fetchUserSettingsCallback]); // Added fetchUserSettingsCallback to dependency array

  const handleSignOut = useCallback(async () => {
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        console.error("AuthContext: Error signing out:", error.message);
      }
      // Session and userSettings will be updated by onAuthStateChange listener
    } catch (err) {
      console.error("AuthContext: Unexpected error during sign out:", err);
    }
  }, []);

  const contextValue: AuthContextType = {
    user,
    session,
    isLoading,
    userSettings,
    fetchUserSettings: () => fetchUserSettingsCallback(session), // Expose manual refresh
    signOut: handleSignOut,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
