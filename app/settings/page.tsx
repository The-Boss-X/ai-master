/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/settings/page.tsx
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation'; // Import useRouter
import { useAuth } from '../context/AuthContext'; // Assuming you use this for auth checks

// --- Define Available Models ---
// Group models by provider for clarity in the dropdown
const AVAILABLE_MODELS = {
  Gemini: [
    'gemini-2.5-pro-preview-03-25',
    'gemini-2.5-flash-preview-04-17',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemma-3-1b-it',
  ],
  ChatGPT: [
    'gpt-4o-2024-08-06',
    'o4-mini-2025-04-16',
    'gpt-4.1-2025-04-14',
    'gpt-4.1-nano-2025-04-14',
    'gpt-4.1-mini-2025-04-14',
  ],
} as const;

// Create a flat list for dropdown options, including provider prefix
const MODEL_OPTIONS = Object.entries(AVAILABLE_MODELS).flatMap(
  ([provider, models]) => models.map(model => `${provider}: ${model}`)
);
type AiModelOption = typeof MODEL_OPTIONS[number] | ''; // Type for selected model string

// Define the structure for settings state (client-side)
interface AiSettingsState {
  model: AiModelOption; // Store the combined "Provider: Model" string
  apiKey: string; // Still keep API key input for submission, but DON'T load/save it client-side
}

// Define the structure for data fetched from backend
interface FetchedSettings {
    slot_1_model: string | null;
    slot_2_model: string | null;
    slot_3_model: string | null;
}

export default function SettingsPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter(); // Initialize router

  // State for the three AI slots
  const [ai1Settings, setAi1Settings] = useState<AiSettingsState>({ model: '', apiKey: '' });
  const [ai2Settings, setAi2Settings] = useState<AiSettingsState>({ model: '', apiKey: '' });
  const [ai3Settings, setAi3Settings] = useState<AiSettingsState>({ model: '', apiKey: '' });

  const [isLoadingSettings, setIsLoadingSettings] = useState(true); // Loading state for fetching settings
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // --- Fetch Saved Settings from Backend ---
  const fetchSettings = useCallback(async () => {
    if (!user) {
        // Clear settings if user logs out while on the page
        setAi1Settings({ model: '', apiKey: '' });
        setAi2Settings({ model: '', apiKey: '' });
        setAi3Settings({ model: '', apiKey: '' });
        setIsLoadingSettings(false); // Stop loading if no user
        return;
    }

    setIsLoadingSettings(true);
    setFetchError(null);
    setErrorMessage(null); // Clear previous errors

    try {
      const response = await fetch('/api/settings/get-settings');

      if (response.status === 401) {
        setFetchError("Unauthorized. Please log in again.");
        // Optionally redirect after a delay or show a persistent message
        // setTimeout(() => router.push('/auth'), 2000);
        return;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        throw new Error(errorData.error || `Failed to fetch settings (${response.status})`);
      }

      const data: FetchedSettings | null = await response.json();

      // Set state based on fetched data or defaults if null/empty
      // Keep existing apiKey input state if user typed something before fetch completed
      setAi1Settings(prev => ({
          ...prev,
          model: (data?.slot_1_model || MODEL_OPTIONS[0] || '') as AiModelOption
      }));
      setAi2Settings(prev => ({
          ...prev,
          model: (data?.slot_2_model || MODEL_OPTIONS[1] || '') as AiModelOption
      }));
      setAi3Settings(prev => ({
          ...prev,
          model: (data?.slot_3_model || MODEL_OPTIONS[2] || '') as AiModelOption
      }));

    } catch (error: any) {
      console.error("Error fetching settings:", error);
      setFetchError(error.message || "An unknown error occurred while fetching settings.");
      // Set default models on error to provide a usable state
       setAi1Settings(prev => ({ ...prev, model: MODEL_OPTIONS[0] || '' }));
       setAi2Settings(prev => ({ ...prev, model: MODEL_OPTIONS[1] || '' }));
       setAi3Settings(prev => ({ ...prev, model: MODEL_OPTIONS[2] || '' }));
    } finally {
      setIsLoadingSettings(false);
    }
  }, [user]); // Depend on user object

  // Fetch settings when user is loaded and available
  useEffect(() => {
    if (!isAuthLoading && user) {
      fetchSettings();
    } else if (!isAuthLoading && !user) {
        // Handle case where user is definitely logged out on initial load
        setIsLoadingSettings(false); // Ensure loading stops
        setAi1Settings({ model: '', apiKey: '' }); // Clear settings state
        setAi2Settings({ model: '', apiKey: '' });
        setAi3Settings({ model: '', apiKey: '' });
    }
  }, [user, isAuthLoading, fetchSettings]);

  // --- Handle Input Changes ---
  const handleModelChange = (slot: number, value: AiModelOption) => {
    if (slot === 1) setAi1Settings(prev => ({ ...prev, model: value }));
    if (slot === 2) setAi2Settings(prev => ({ ...prev, model: value }));
    if (slot === 3) setAi3Settings(prev => ({ ...prev, model: value }));
  };

  const handleApiKeyChange = (slot: number, value: string) => {
    // Clear save status if user types in API key field after a save attempt
    if (saveStatus !== 'idle') setSaveStatus('idle');
    if (slot === 1) setAi1Settings(prev => ({ ...prev, apiKey: value }));
    if (slot === 2) setAi2Settings(prev => ({ ...prev, apiKey: value }));
    if (slot === 3) setAi3Settings(prev => ({ ...prev, apiKey: value }));
  };

  // --- Handle Save ---
  const handleSaveSettings = async () => {
    setSaveStatus('saving');
    setErrorMessage(null);
    setFetchError(null); // Clear fetch errors on save attempt

    // Basic Validation
    const selectedModels = [ai1Settings.model, ai2Settings.model, ai3Settings.model].filter(Boolean); // Filter out empty strings
    // Check for duplicates only if more than one model is selected
    if (selectedModels.length > 1 && new Set(selectedModels).size !== selectedModels.length) {
        setErrorMessage("Please select unique AI models for each active slot.");
        setSaveStatus('error');
        return;
    }
    // Ensure at least one model is selected to save something meaningful (optional check)
    // if (selectedModels.length === 0) {
    //    setErrorMessage("Please select at least one AI model.");
    //    setSaveStatus('error');
    //    return;
    // }

    const payload = {
        slot_1_model: ai1Settings.model || null,
        slot_2_model: ai2Settings.model || null,
        slot_3_model: ai3Settings.model || null,
        // Include API keys in the payload sent to the backend
        // The backend MUST handle encryption securely.
        slot_1_api_key: ai1Settings.apiKey || null,
        slot_2_api_key: ai2Settings.apiKey || null,
        slot_3_api_key: ai3Settings.apiKey || null,
    };

    try {
        const response = await fetch('/api/settings/save-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await response.json(); // Attempt to parse JSON regardless of status

        if (!response.ok) {
            // Use error from backend response if available
            throw new Error(result.error || `Failed to save settings (${response.status})`);
        }

        console.log("Settings saved successfully via API:", result.savedSettings);
        setSaveStatus('success');
        // Optionally clear API key fields after successful save for better security UX
        setAi1Settings(prev => ({ ...prev, apiKey: '' }));
        setAi2Settings(prev => ({ ...prev, apiKey: '' }));
        setAi3Settings(prev => ({ ...prev, apiKey: '' }));

        setTimeout(() => setSaveStatus('idle'), 2500); // Reset status after a delay

    } catch (error: any) {
        console.error("Error saving settings via API:", error);
        setErrorMessage(error.message || "An unknown error occurred while saving.");
        setSaveStatus('error');
    }
  };

  // --- Render Loading/Auth State ---
   if (isAuthLoading || isLoadingSettings) {
    // Show a loading indicator while checking auth or fetching settings
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <p className="text-gray-500 dark:text-gray-400 animate-pulse text-lg">Loading settings...</p>
      </div>
    );
  }

  if (!user) {
    // Show message and link to login if user is definitely not logged in
     return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
         <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl text-center">
             <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Access Denied</h2>
             <p className="text-gray-600 dark:text-gray-300">You must be logged in to view and manage settings.</p>
             <Link href="/auth" className="mt-4 inline-block px-6 py-2 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors">
                 Sign In
             </Link>
             <div className="mt-6 text-sm">
                <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline">&larr; Back to Home</Link>
            </div>
         </div>
      </div>
    );
  }

  // --- Render Settings Form ---
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-3xl p-8 space-y-8 bg-white dark:bg-gray-800 rounded-lg shadow-xl">
        {/* Back to Home Link */}
        <div className="text-sm">
            <Link href="/" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline">&larr; Back to Home</Link>
        </div>

        <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-gray-100">
          AI Comparison Settings
        </h2>

        {/* Fetch Error Message Display */}
        {fetchError && (
          <div className="p-3 text-center text-red-700 bg-red-100 border border-red-300 rounded-md dark:bg-red-900 dark:text-red-200 dark:border-red-700">
            {fetchError}
          </div>
        )}
         {/* Save Error Message Display */}
        {errorMessage && saveStatus === 'error' && (
          <div className="p-3 text-center text-red-700 bg-red-100 border border-red-300 rounded-md dark:bg-red-900 dark:text-red-200 dark:border-red-700">
            {errorMessage}
          </div>
        )}
         {/* Success Message Display */}
         {saveStatus === 'success' && (
           <div className="p-3 text-center text-green-700 bg-green-100 border border-green-300 rounded-md dark:bg-green-900 dark:text-green-200 dark:border-green-700">
             Settings saved successfully!
           </div>
         )}

        <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); handleSaveSettings(); }}>
          {/* --- Slot 1 Settings --- */}
          <fieldset className="border p-6 rounded-lg shadow-sm bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600">
            <legend className="text-xl font-semibold px-2 text-gray-800 dark:text-gray-100">AI Slot 1</legend>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="ai1-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Model Selection
                </label>
                <select
                  id="ai1-model"
                  value={ai1Settings.model}
                  onChange={(e) => handleModelChange(1, e.target.value as AiModelOption)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">-- Select Model --</option>
                  {MODEL_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ai1-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  API Key (Stored Securely on Backend)
                </label>
                 <input
                  id="ai1-key"
                  type="password" // Use password type to mask input
                  value={ai1Settings.apiKey}
                  onChange={(e) => handleApiKeyChange(1, e.target.value)}
                  placeholder="Enter New API Key to Update (Optional)"
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                 <p className="mt-2 text-xs text-orange-700 dark:text-orange-400 font-medium">
                 </p>
              </div>
            </div>
          </fieldset>

          {/* --- Slot 2 Settings --- */}
          <fieldset className="border p-6 rounded-lg shadow-sm bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600">
             <legend className="text-xl font-semibold px-2 text-gray-800 dark:text-gray-100">AI Slot 2</legend>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="ai2-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Model Selection
                </label>
                <select
                  id="ai2-model"
                  value={ai2Settings.model}
                  onChange={(e) => handleModelChange(2, e.target.value as AiModelOption)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">-- Select Model --</option>
                  {MODEL_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ai2-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  API Key (Stored Securely on Backend)
                </label>
                 <input
                  id="ai2-key"
                  type="password"
                  value={ai2Settings.apiKey}
                  onChange={(e) => handleApiKeyChange(2, e.target.value)}
                  placeholder="Enter New API Key to Update (Optional)"
                   className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                 <p className="mt-2 text-xs text-orange-700 dark:text-orange-400 font-medium">
                 </p>
              </div>
            </div>
          </fieldset>

          {/* --- Slot 3 Settings --- */}
           <fieldset className="border p-6 rounded-lg shadow-sm bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600">
             <legend className="text-xl font-semibold px-2 text-gray-800 dark:text-gray-100">AI Slot 3</legend>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="ai3-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Model Selection
                </label>
                <select
                  id="ai3-model"
                  value={ai3Settings.model}
                  onChange={(e) => handleModelChange(3, e.target.value as AiModelOption)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">-- Select Model --</option>
                  {MODEL_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ai3-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  API Key (Stored Securely on Backend)
                </label>
                 <input
                  id="ai3-key"
                  type="password"
                  value={ai3Settings.apiKey}
                  onChange={(e) => handleApiKeyChange(3, e.target.value)}
                  placeholder="Enter New API Key to Update (Optional)"
                   className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                 <p className="mt-2 text-xs text-orange-700 dark:text-orange-400 font-medium">
                 </p>
              </div>
            </div>
          </fieldset>

          {/* --- Save Button --- */}
          <div>
            <button
              type="submit"
              disabled={saveStatus === 'saving' || isLoadingSettings}
              className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                saveStatus === 'saving' || isLoadingSettings
                  ? 'bg-indigo-400 dark:bg-indigo-800 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:ring-indigo-500'
              }`}
            >
              {saveStatus === 'saving' ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

