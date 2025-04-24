/* eslint-disable @typescript-eslint/no-unused-vars */
// context/AuthContext.tsx
import React, { createContext, useContext, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';

// Define the shape of the context value
interface AuthContextType {
  user: User | null; // The Supabase user object if logged in, otherwise null
  isLoading: boolean; // Indicates if the initial session check is still loading
  // You could potentially add functions like signOut here later if needed,
  // but often they are managed within the AuthProvider or specific components.
}

// Create the context with a default undefined value
// Using undefined helps detect if a component tries to use the context
// without being wrapped by the provider.
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Custom hook to access the AuthContext.
 * Provides a convenient way to get the user session and loading state.
 * Throws an error if used outside of an AuthProvider.
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Export the context itself if needed directly (e.g., for the AuthProvider)
export { AuthContext };

// Note: The actual logic for fetching the user session and providing
// the context value will reside in the `AuthProvider` component.
// This file just defines the context structure and the consumer hook.