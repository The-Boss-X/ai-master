 /* eslint-disable @typescript-eslint/no-unused-vars */
 /* eslint-disable @typescript-eslint/no-explicit-any */
 // app/settings/page.tsx
 'use client';

 import React, { useState, useEffect, useCallback } from 'react';
 import Link from 'next/link';
 import { useRouter } from 'next/navigation';
 import { useAuth } from '../context/AuthContext';

 // --- Define Available Models ---
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
   // **ADDED**: Anthropic models
   Anthropic: [
     'claude-3-7-sonnet-latest',
     'claude-3-5-haiku-latest',
     'claude-3-5-sonnet-latest',
     'claude-3-opus-latest', 
     'claude-3-haiku-20240307',
   ],
 } as const;

 const MODEL_OPTIONS = Object.entries(AVAILABLE_MODELS).flatMap(
   ([provider, models]) => models.map(model => `${provider}: ${model}`)
 );
 type AiModelOption = typeof MODEL_OPTIONS[number] | '';

 // --- Constants ---
 const MIN_SLOTS = 1;
 const MAX_SLOTS = 6;

 // --- Types ---
 interface SlotSettingsState {
   modelSelections: AiModelOption[]; // Array to hold model for each slot (index 0 = slot 1)
 }
 interface ApiKeySettingsState {
   geminiApiKey: string;
   openaiApiKey: string;
   anthropicApiKey: string; // **ADDED**: Anthropic API Key state
 }
 interface FetchedSettings {
     slot_1_model: string | null;
     slot_2_model: string | null;
     slot_3_model: string | null;
     slot_4_model: string | null;
     slot_5_model: string | null;
     slot_6_model: string | null;
     // Note: API keys are not fetched back to the client for security
 }

 export default function SettingsPage() {
   const { user, isLoading: isAuthLoading } = useAuth();
   const router = useRouter();

   const [modelSettings, setModelSettings] = useState<SlotSettingsState>({
     modelSelections: Array(MAX_SLOTS).fill(''), // Initialize with max slots empty
   });
   const [apiKeySettings, setApiKeySettings] = useState<ApiKeySettingsState>({
     geminiApiKey: '',
     openaiApiKey: '',
     anthropicApiKey: '', // **ADDED**: Initialize Anthropic key state
   });
   const [numberOfSlots, setNumberOfSlots] = useState<number>(MIN_SLOTS); // Start with minimum

   const [isLoadingSettings, setIsLoadingSettings] = useState(true);
   const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
   const [errorMessage, setErrorMessage] = useState<string | null>(null);
   const [fetchError, setFetchError] = useState<string | null>(null);

   // --- Fetch Saved Settings (Models Only) ---
   const fetchSettings = useCallback(async () => {
     if (!user) {
         setModelSettings({ modelSelections: Array(MAX_SLOTS).fill('') });
         setNumberOfSlots(MIN_SLOTS); // Reset to minimum if logged out
         setIsLoadingSettings(false);
         return;
     }

     setIsLoadingSettings(true);
     setFetchError(null);
     setErrorMessage(null);

     try {
       // Fetches only model settings, not keys
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

       const fetchedModels: AiModelOption[] = Array(MAX_SLOTS).fill('');
       let activeSlotsCount = MIN_SLOTS; // Default to min
       if (data) {
           for (let i = 0; i < MAX_SLOTS; i++) {
               const modelKey = `slot_${i + 1}_model` as keyof FetchedSettings;
               if (data[modelKey]) {
                   // Validate if the fetched model is still in our available options
                   const isValidOption = MODEL_OPTIONS.includes(data[modelKey] as AiModelOption);
                   if (isValidOption) {
                       fetchedModels[i] = data[modelKey] as AiModelOption;
                       activeSlotsCount = Math.max(activeSlotsCount, i + 1); // Track highest active slot
                   } else {
                       console.warn(`Fetched model "${data[modelKey]}" for slot ${i+1} is no longer available. Clearing.`);
                       // Keep fetchedModels[i] as ''
                   }
               }
           }
       }
       setModelSettings({ modelSelections: fetchedModels });
       setNumberOfSlots(activeSlotsCount); // Set number of slots based on fetched data

     } catch (error: any) {
       console.error("Error fetching settings:", error);
       setFetchError(error.message || "An unknown error occurred while fetching settings.");
       // Set default models on error (only for the minimum number of slots)
       const defaultModels = Array(MAX_SLOTS).fill('');
       defaultModels[0] = (MODEL_OPTIONS[0] || '') as AiModelOption;
       setModelSettings({ modelSelections: defaultModels });
       setNumberOfSlots(MIN_SLOTS);
     } finally {
       setIsLoadingSettings(false);
     }
   }, [user]);

   // Fetch settings effect
   useEffect(() => {
     if (!isAuthLoading && user) {
       fetchSettings();
     } else if (!isAuthLoading && !user) {
       setIsLoadingSettings(false);
       setModelSettings({ modelSelections: Array(MAX_SLOTS).fill('') });
       setApiKeySettings({ geminiApiKey: '', openaiApiKey: '', anthropicApiKey: '' }); // **MODIFIED**: Clear all keys
       setNumberOfSlots(MIN_SLOTS);
     }
   }, [user, isAuthLoading, fetchSettings]);

   // --- Handle Input Changes ---
   const handleModelChange = (index: number, value: AiModelOption) => {
     setModelSettings(prev => {
         const newSelections = [...prev.modelSelections];
         newSelections[index] = value;
         return { ...prev, modelSelections: newSelections };
     });
   };

   // **MODIFIED**: Added 'anthropic' case
   const handleApiKeyChange = (provider: 'gemini' | 'openai' | 'anthropic', value: string) => {
     if (saveStatus !== 'idle') setSaveStatus('idle');
     setApiKeySettings(prev => ({ ...prev, [`${provider}ApiKey`]: value }));
   };

   // --- Handle Add/Remove Slots ---
   const addSlot = () => {
       setNumberOfSlots(prev => Math.min(prev + 1, MAX_SLOTS));
   };

   const removeSlot = () => {
       // When removing, also clear the model selection for the slot being removed
       handleModelChange(numberOfSlots - 1, ''); // Clear model for the last slot (0-based index)
       setNumberOfSlots(prev => Math.max(prev - 1, MIN_SLOTS));
   };

   // --- Handle Save ---
   const handleSaveSettings = async () => {
     setSaveStatus('saving');
     setErrorMessage(null);
     setFetchError(null);

     const activeModels = modelSettings.modelSelections.slice(0, numberOfSlots).filter(Boolean);
     if (activeModels.length > 1 && new Set(activeModels).size !== activeModels.length) {
         setErrorMessage("Please select unique AI models for each active slot.");
         setSaveStatus('error');
         return;
     }

     // **MODIFIED**: Include anthropic_api_key in payload
     const payload: Record<string, any> = {
         gemini_api_key: apiKeySettings.geminiApiKey || null,
         openai_api_key: apiKeySettings.openaiApiKey || null,
         anthropic_api_key: apiKeySettings.anthropicApiKey || null, // Add anthropic key
     };
     for (let i = 0; i < MAX_SLOTS; i++) {
         payload[`slot_${i + 1}_model`] = i < numberOfSlots ? (modelSettings.modelSelections[i] || null) : null;
     }

     try {
         const response = await fetch('/api/settings/save-settings', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify(payload),
         });

         const result = await response.json();

         if (!response.ok) {
             throw new Error(result.error || `Failed to save settings (${response.status})`);
         }

         console.log("Settings saved successfully via API:", result.savedSettings);
         setSaveStatus('success');
         // **MODIFIED**: Clear all API key inputs on success
         setApiKeySettings({ geminiApiKey: '', openaiApiKey: '', anthropicApiKey: '' });

         setTimeout(() => setSaveStatus('idle'), 2500);

     } catch (error: any) {
         console.error("Error saving settings via API:", error);
         setErrorMessage(error.message || "An unknown error occurred while saving.");
         setSaveStatus('error');
     }
   };

   // --- Render Loading/Auth State ---
   if (isAuthLoading || isLoadingSettings) {
     return (
       <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
         <p className="text-gray-500 dark:text-gray-400 animate-pulse text-lg">Loading settings...</p>
       </div>
     );
   }

   if (!user) {
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

         {/* Error/Success Messages */}
         {fetchError && (
           <div className="p-3 text-center text-red-700 bg-red-100 border border-red-300 rounded-md dark:bg-red-900 dark:text-red-200 dark:border-red-700">
             {fetchError}
           </div>
         )}
         {errorMessage && saveStatus === 'error' && (
           <div className="p-3 text-center text-red-700 bg-red-100 border border-red-300 rounded-md dark:bg-red-900 dark:text-red-200 dark:border-red-700">
             {errorMessage}
           </div>
         )}
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
                   type="password"
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
                   type="password"
                   value={apiKeySettings.openaiApiKey}
                   onChange={(e) => handleApiKeyChange('openai', e.target.value)}
                   placeholder="Enter New OpenAI Key to Update (Optional)"
                   className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                 />
                 <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Required if using any ChatGPT models.</p>
               </div>
               {/* **ADDED**: Anthropic API Key Input */}
               <div>
                 <label htmlFor="anthropic-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                   Anthropic API Key
                 </label>
                 <input
                   id="anthropic-key"
                   type="password"
                   value={apiKeySettings.anthropicApiKey}
                   onChange={(e) => handleApiKeyChange('anthropic', e.target.value)}
                   placeholder="Enter New Anthropic Key to Update (Optional)"
                   className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                 />
                 <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Required if using any Anthropic models.</p>
               </div>
             </div>
           </fieldset>

           {/* --- Dynamic Slot Settings --- */}
           <fieldset className="border p-6 rounded-lg shadow-sm border-gray-200 dark:border-gray-600">
              <legend className="text-xl font-semibold px-2 text-gray-800 dark:text-gray-100">AI Slots</legend>
              <p className="text-sm text-gray-600 dark:text-gray-400 px-2 mb-4">Configure the AI models you want to use. You can use between {MIN_SLOTS} and {MAX_SLOTS} slots.</p>

              {/* Add/Remove Buttons */}
              <div className="flex justify-center space-x-4 my-4">
                  <button
                    type="button"
                    onClick={removeSlot}
                    disabled={numberOfSlots <= MIN_SLOTS || saveStatus === 'saving'}
                    className="px-4 py-2 text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    - Remove Last Slot
                  </button>
                  <span className="text-lg font-medium text-gray-700 dark:text-gray-300 self-center">
                    {numberOfSlots} Slot{numberOfSlots > 1 ? 's' : ''} Active
                  </span>
                  <button
                    type="button"
                    onClick={addSlot}
                    disabled={numberOfSlots >= MAX_SLOTS || saveStatus === 'saving'}
                    className="px-4 py-2 text-sm font-medium rounded-md text-green-700 bg-green-100 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:hover:bg-green-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    + Add Slot
                  </button>
              </div>

              {/* Render Fieldsets for Active Slots */}
              <div className="space-y-6 mt-6">
                  {modelSettings.modelSelections.slice(0, numberOfSlots).map((modelSelection, index) => (
                      <div key={`slot-settings-${index}`} className="border p-4 rounded-md bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600">
                          <label htmlFor={`ai${index + 1}-model`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Slot {index + 1} Model
                          </label>
                          <select
                              id={`ai${index + 1}-model`}
                              value={modelSelection}
                              onChange={(e) => handleModelChange(index, e.target.value as AiModelOption)}
                              className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          >
                              <option value="">-- Select Model --</option>
                              {MODEL_OPTIONS.map(option => (
                                  <option key={option} value={option}>{option}</option>
                              ))}
                          </select>
                      </div>
                  ))}
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
