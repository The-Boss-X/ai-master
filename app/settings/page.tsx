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
    'gemini-2.5-pro-exp-03-25',
    'gemini-2.5-flash-preview-04-17',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemma-3-1b-it',
  ],
  ChatGPT: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
  ],
} as const;

// Create a flat list for dropdown options, including provider prefix
const MODEL_OPTIONS = Object.entries(AVAILABLE_MODELS).flatMap(
  ([provider, models]) => models.map(model => `${provider}: ${model}`)
);
type AiModelOption = typeof MODEL_OPTIONS[number] | ''; // Type for selected model string

// Define the structure for settings state (client-side)
// **MODIFIED**: Separate state for models and API keys
interface SlotSettingsState {
  slot_1_model: AiModelOption;
  slot_2_model: AiModelOption;
  slot_3_model: AiModelOption;
}
interface ApiKeySettingsState {
  geminiApiKey: string; // State for Gemini key input
  openaiApiKey: string; // State for OpenAI key input
}

// Define the structure for data fetched from backend (only models needed)
interface FetchedSettings {
    slot_1_model: string | null;
    slot_2_model: string | null;
    slot_3_model: string | null;
    // **REMOVED**: No longer fetching API keys to the client
}

export default function SettingsPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter(); // Initialize router

  // **MODIFIED**: State split into model selections and API key inputs
  const [modelSettings, setModelSettings] = useState<SlotSettingsState>({
    slot_1_model: '',
    slot_2_model: '',
    slot_3_model: '',
  });
  const [apiKeySettings, setApiKeySettings] = useState<ApiKeySettingsState>({
    geminiApiKey: '',
    openaiApiKey: '',
  });

  const [isLoadingSettings, setIsLoadingSettings] = useState(true); // Loading state for fetching settings
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // --- Fetch Saved Settings (Models Only) from Backend ---
  const fetchSettings = useCallback(async () => {
    if (!user) {
        // Clear settings if user logs out
        setModelSettings({ slot_1_model: '', slot_2_model: '', slot_3_model: '' });
        // Don't clear API key input fields, user might be typing
        setIsLoadingSettings(false);
        return;
    }

    setIsLoadingSettings(true);
    setFetchError(null);
    setErrorMessage(null); // Clear previous errors

    try {
      const response = await fetch('/api/settings/get-settings');

      if (response.status === 401) {
        setFetchError("Unauthorized. Please log in again.");
        return;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        throw new Error(errorData.error || `Failed to fetch settings (${response.status})`);
      }

      const data: FetchedSettings | null = await response.json();

      // Set state based on fetched model data or defaults if null/empty
      setModelSettings({
        slot_1_model: (data?.slot_1_model || MODEL_OPTIONS[0] || '') as AiModelOption,
        slot_2_model: (data?.slot_2_model || MODEL_OPTIONS[1] || '') as AiModelOption,
        slot_3_model: (data?.slot_3_model || MODEL_OPTIONS[2] || '') as AiModelOption,
      });
      // **NOTE**: API keys are NOT fetched or set here. They are write-only from the client.

    } catch (error: any) {
      console.error("Error fetching settings:", error);
      setFetchError(error.message || "An unknown error occurred while fetching settings.");
      // Set default models on error
      setModelSettings({
        slot_1_model: (MODEL_OPTIONS[0] || '') as AiModelOption,
        slot_2_model: (MODEL_OPTIONS[1] || '') as AiModelOption,
        slot_3_model: (MODEL_OPTIONS[2] || '') as AiModelOption,
      });
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
      setModelSettings({ slot_1_model: '', slot_2_model: '', slot_3_model: '' }); // Clear model settings state
      setApiKeySettings({ geminiApiKey: '', openaiApiKey: '' }); // Clear API key input state
    }
  }, [user, isAuthLoading, fetchSettings]);

  // --- Handle Input Changes ---
  const handleModelChange = (slot: 1 | 2 | 3, value: AiModelOption) => {
    setModelSettings(prev => ({ ...prev, [`slot_${slot}_model`]: value }));
  };

  // **MODIFIED**: Handle changes for the two central API key inputs
  const handleApiKeyChange = (provider: 'gemini' | 'openai', value: string) => {
    // Clear save status if user types in API key field after a save attempt
    if (saveStatus !== 'idle') setSaveStatus('idle');
    if (provider === 'gemini') {
      setApiKeySettings(prev => ({ ...prev, geminiApiKey: value }));
    } else if (provider === 'openai') {
      setApiKeySettings(prev => ({ ...prev, openaiApiKey: value }));
    }
  };

  // --- Handle Save ---
  const handleSaveSettings = async () => {
    setSaveStatus('saving');
    setErrorMessage(null);
    setFetchError(null); // Clear fetch errors on save attempt

    // Basic Validation for models
    const selectedModels = [modelSettings.slot_1_model, modelSettings.slot_2_model, modelSettings.slot_3_model].filter(Boolean);
    if (selectedModels.length > 1 && new Set(selectedModels).size !== selectedModels.length) {
        setErrorMessage("Please select unique AI models for each active slot.");
        setSaveStatus('error');
        return;
    }

    // **MODIFIED**: Prepare payload with model selections and the NEW API key fields
    const payload = {
        slot_1_model: modelSettings.slot_1_model || null,
        slot_2_model: modelSettings.slot_2_model || null,
        slot_3_model: modelSettings.slot_3_model || null,
        // Send the provider-specific keys if they have been entered
        gemini_api_key: apiKeySettings.geminiApiKey || null,
        openai_api_key: apiKeySettings.openaiApiKey || null,
    };

    try {
        const response = await fetch('/api/settings/save-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const result = await response.json(); // Attempt to parse JSON regardless of status

        if (!response.ok) {
            throw new Error(result.error || `Failed to save settings (${response.status})`);
        }

        console.log("Settings saved successfully via API:", result.savedSettings);
        setSaveStatus('success');
        // Clear API key fields after successful save for better security UX
        setApiKeySettings({ geminiApiKey: '', openaiApiKey: '' });

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
          AI Master Settings
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

          {/* --- API Key Settings (Centralized) --- */}
          <fieldset className="border p-6 rounded-lg shadow-sm bg-blue-50 dark:bg-gray-700/50 border-blue-200 dark:border-gray-600">
            <legend className="text-xl font-semibold px-2 text-gray-800 dark:text-gray-100">API Keys</legend>
            <p className="text-sm text-gray-600 dark:text-gray-400 px-2 mb-4">Enter your API keys below. They will be stored securely and are only needed if you use the corresponding AI provider in any slot.</p>
            <div className="mt-4 space-y-4">
              {/* Gemini API Key Input */}
              <div>
                <label htmlFor="gemini-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Gemini API Key
                </label>
                <input
                  id="gemini-key"
                  type="password" // Use password type to mask input
                  value={apiKeySettings.geminiApiKey}
                  onChange={(e) => handleApiKeyChange('gemini', e.target.value)}
                  placeholder="Enter New Gemini Key to Update (Optional)"
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                 <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Required if using any Gemini models.</p>
              </div>
              {/* OpenAI API Key Input */}
              <div>
                <label htmlFor="openai-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  OpenAI API Key
                </label>
                <input
                  id="openai-key"
                  type="password" // Use password type to mask input
                  value={apiKeySettings.openaiApiKey}
                  onChange={(e) => handleApiKeyChange('openai', e.target.value)}
                  placeholder="Enter New OpenAI Key to Update (Optional)"
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Required if using any ChatGPT models.</p>
              </div>
            </div>
          </fieldset>

          {/* --- Slot 1 Settings (Model Only) --- */}
          <fieldset className="border p-6 rounded-lg shadow-sm bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600">
            <legend className="text-xl font-semibold px-2 text-gray-800 dark:text-gray-100">AI Slot 1</legend>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="ai1-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Model Selection
                </label>
                <select
                  id="ai1-model"
                  value={modelSettings.slot_1_model}
                  onChange={(e) => handleModelChange(1, e.target.value as AiModelOption)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">-- Select Model --</option>
                  {MODEL_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              {/* **REMOVED**: API Key input for Slot 1 */}
            </div>
          </fieldset>

          {/* --- Slot 2 Settings (Model Only) --- */}
          <fieldset className="border p-6 rounded-lg shadow-sm bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600">
             <legend className="text-xl font-semibold px-2 text-gray-800 dark:text-gray-100">AI Slot 2</legend>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="ai2-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Model Selection
                </label>
                <select
                  id="ai2-model"
                  value={modelSettings.slot_2_model}
                  onChange={(e) => handleModelChange(2, e.target.value as AiModelOption)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">-- Select Model --</option>
                  {MODEL_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              {/* **REMOVED**: API Key input for Slot 2 */}
            </div>
          </fieldset>

          {/* --- Slot 3 Settings (Model Only) --- */}
           <fieldset className="border p-6 rounded-lg shadow-sm bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600">
             <legend className="text-xl font-semibold px-2 text-gray-800 dark:text-gray-100">AI Slot 3</legend>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="ai3-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Model Selection
                </label>
                <select
                  id="ai3-model"
                  value={modelSettings.slot_3_model}
                  onChange={(e) => handleModelChange(3, e.target.value as AiModelOption)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">-- Select Model --</option>
                  {MODEL_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              {/* **REMOVED**: API Key input for Slot 3 */}
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


