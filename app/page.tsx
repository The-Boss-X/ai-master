/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/page.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link'; // Import Link for navigation
import { useRouter } from 'next/navigation'; // Can be useful, though not strictly used in this final version
import { useAuth } from './context/AuthContext'; // Import useAuth hook
import type { InteractionHistoryItem } from './types/InteractionHistoryItem'; // Import the type definition
import HistorySidebar from './components/HistorySidebar'; // Import the sidebar component

// Define the structure for data fetched from backend settings API
interface FetchedSettings {
    slot_1_model: string | null;
    slot_2_model: string | null;
    slot_3_model: string | null;
}

// Define structure for AI Slot state within this component
interface AiSlotState {
    modelName: string | null; // e.g., "ChatGPT: gpt-4o", "Gemini: gemini-1.5-pro-latest", or null if empty
    loading: boolean; // Is this slot currently fetching a response?
    response: string | null; // The AI's response text
    error: string | null; // Any error message for this slot's API call
}

export default function Home() {
  // --- Authentication State ---
  const { user, isLoading: isAuthLoading } = useAuth(); // Get user and auth loading status

  // --- Core Input/Output State ---
  const [inputText, setInputText] = useState(''); // User's current input in the text box
  const [processedText, setProcessedText] = useState(''); // The prompt that was last submitted

  // --- Settings State ---
  const [settingsLoading, setSettingsLoading] = useState(true); // Is settings data being fetched?
  const [settingsError, setSettingsError] = useState<string | null>(null); // Error fetching settings

  // --- AI Slot State (Manages each of the 3 comparison panels) ---
  const [slot1State, setSlot1State] = useState<AiSlotState>({ modelName: null, loading: false, response: null, error: null });
  const [slot2State, setSlot2State] = useState<AiSlotState>({ modelName: null, loading: false, response: null, error: null });
  const [slot3State, setSlot3State] = useState<AiSlotState>({ modelName: null, loading: false, response: null, error: null });

  // --- UI Control State ---
  const [showPanels, setShowPanels] = useState(false); // Whether to display the AI response panels
  const inputRef = useRef<HTMLInputElement>(null); // Ref for the input field (e.g., for focus)

  // --- History State ---
  const [history, setHistory] = useState<InteractionHistoryItem[]>([]); // Array of past interactions
  const [historyLoading, setHistoryLoading] = useState(false); // Is history being fetched?
  const [historyError, setHistoryError] = useState<string | null>(null); // Error fetching history
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null); // ID of the history item currently displayed

  // --- Logging State ---
  const [isLoggingComplete, setIsLoggingComplete] = useState(true); // Tracks if the current interaction needs to be logged

  // --- Fetch User Settings ---
  // useCallback ensures this function reference doesn't change unnecessarily
  const fetchSettings = useCallback(async () => {
    // Don't fetch if we know the user isn't logged in
    if (!user) {
        // Clear any previously loaded models if user logs out
        setSlot1State(prev => ({ ...prev, modelName: null }));
        setSlot2State(prev => ({ ...prev, modelName: null }));
        setSlot3State(prev => ({ ...prev, modelName: null }));
        setSettingsLoading(false); // Mark loading as complete
        return;
    }
    // Indicate loading and clear previous errors
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      // Call the backend API route to get settings
      const response = await fetch('/api/settings/get-settings');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse settings error' }));
        if (response.status === 401) {
            console.warn("Settings fetch unauthorized, user might be logged out.");
            // Clear local state as settings are invalid
            setSlot1State(prev => ({ ...prev, modelName: null }));
            setSlot2State(prev => ({ ...prev, modelName: null }));
            setSlot3State(prev => ({ ...prev, modelName: null }));
        }
        throw new Error(errorData.error || `Failed to fetch settings (${response.status})`);
      }
      const data: FetchedSettings | null = await response.json();

      // Update slot states with fetched model names
      // Keep existing response/error/loading states intact
      setSlot1State(prev => ({ ...prev, modelName: data?.slot_1_model || null }));
      setSlot2State(prev => ({ ...prev, modelName: data?.slot_2_model || null }));
      setSlot3State(prev => ({ ...prev, modelName: data?.slot_3_model || null }));
      console.log("Fetched and applied settings:", data);

    } catch (error: any) {
      console.error("Error fetching settings:", error);
      setSettingsError(error.message);
      // Fallback: Clear models on error to prevent using stale/incorrect settings
       setSlot1State(prev => ({ ...prev, modelName: null }));
       setSlot2State(prev => ({ ...prev, modelName: null }));
       setSlot3State(prev => ({ ...prev, modelName: null }));
    } finally {
      setSettingsLoading(false); // Mark loading as complete
    }
  }, [user]); // Re-run only when the user object changes (login/logout)

  // --- Fetch History ---
  const fetchHistory = useCallback(async () => {
    // Don't fetch if auth is still loading or user is not logged in
    if (isAuthLoading || !user) {
        setHistory([]); // Clear history if logged out
        setHistoryLoading(false);
        return;
    }
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      // Call the backend API route for history
      const response = await fetch('/api/get-history');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse history error' }));
        if (response.status === 401) throw new Error("Unauthorized fetching history. Please log in.");
        throw new Error(errorData.error || `Failed to fetch history: ${response.status}`);
      }
      const data: InteractionHistoryItem[] = await response.json();
      // Ensure history is sorted newest first (API should ideally handle this)
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setHistory(data);
    } catch (error: any) {
      console.error("Error fetching history:", error);
      setHistoryError(error.message);
      setHistory([]); // Clear history on error
    } finally {
      setHistoryLoading(false);
    }
  }, [user, isAuthLoading]); // Re-run if user or auth loading state changes

  // --- Initial Data Fetching Effect ---
  useEffect(() => {
    // Fetch data only when the authentication status is definitively known
    if (!isAuthLoading) {
      fetchSettings(); // Fetch user's model settings
      fetchHistory(); // Fetch user's interaction history
    }
  }, [user, isAuthLoading, fetchSettings, fetchHistory]); // Dependencies

  // --- Log Interaction to Backend ---
  const logInteractionToSupabase = useCallback(async () => {
    // Conditions to skip logging
    if (isLoggingComplete || !user || !processedText) {
      setIsLoggingComplete(true); // Ensure state is reset if skipped
      return;
    }
    // Check if any AI model was actually configured for the slots during this interaction
    const attemptedModels = [slot1State.modelName, slot2State.modelName, slot3State.modelName].filter(Boolean);
    if (attemptedModels.length === 0) {
        console.log("Skipping log: No models were assigned to slots.");
        setIsLoggingComplete(true);
        return;
    }

    console.log("Attempting to log interaction to Supabase...");
    try {
      // Construct the data payload matching the NEW database schema
      const dataToLog = {
        prompt: processedText,
        title: processedText.substring(0, 50) + (processedText.length > 50 ? '...' : ''), // Auto-generate title
        slot_1_model_used: slot1State.modelName,
        slot_1_response: slot1State.response,
        slot_1_error: slot1State.error,
        slot_2_model_used: slot2State.modelName,
        slot_2_response: slot2State.response,
        slot_2_error: slot2State.error,
        slot_3_model_used: slot3State.modelName,
        slot_3_response: slot3State.response,
        slot_3_error: slot3State.error,
        // user_id is typically handled by Supabase policies/default values
      };

      // Call the logging API route
      const response = await fetch('/api/log-interaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToLog),
      });

      // Process the response from the logging API
      const result = await response.json().catch(() => ({ success: false, error: 'Invalid JSON response from log API' }));

      if (!response.ok || !result?.success || !result.loggedData?.[0]) {
        const errorMsg = result?.error || `Failed to log interaction (${response.status})`;
        console.error('Failed to log interaction:', errorMsg);
        // Optionally display this error to the user
      } else {
        // If logging was successful, update the local history state
        const newLogEntry = result.loggedData[0] as InteractionHistoryItem;
        // Basic validation of the returned entry
        if (newLogEntry?.id && newLogEntry?.created_at && newLogEntry?.prompt) {
          // Add the new item to the beginning of the history array
          setHistory(prevHistory => [newLogEntry, ...prevHistory]);
          setSelectedHistoryId(newLogEntry.id); // Automatically select the new entry
          console.log("Interaction logged successfully, ID:", newLogEntry.id);
        } else {
          // If the returned data is incomplete, log a warning and refetch history for consistency
          console.warn("Logged data from API was incomplete, refetching history.", newLogEntry);
          fetchHistory();
        }
      }
    } catch (error) {
      console.error('Error calling logging API:', error);
      // Optionally display a generic error to the user
    } finally {
      setIsLoggingComplete(true); // Mark logging as complete for this interaction cycle
    }
  }, [
      // Dependencies for the logging function
      user, processedText, isLoggingComplete, fetchHistory,
      slot1State.modelName, slot1State.response, slot1State.error,
      slot2State.modelName, slot2State.response, slot2State.error,
      slot3State.modelName, slot3State.response, slot3State.error
  ]);

  // --- useEffect to Trigger Logging After AI Calls Complete ---
  useEffect(() => {
    // Check if all slots have finished loading (or weren't active)
    const allSlotsFinished = !slot1State.loading && !slot2State.loading && !slot3State.loading;
    // Trigger log only if processing finished, there was a prompt, and logging hasn't occurred yet
    if (allSlotsFinished && processedText && !isLoggingComplete) {
      logInteractionToSupabase();
    }
  }, [
      // Dependencies that signal the end of AI processing
      slot1State.loading, slot2State.loading, slot3State.loading,
      processedText, isLoggingComplete, logInteractionToSupabase
  ]);

  // --- Handle Clicking a History Item ---
  const handleHistoryClick = (item: InteractionHistoryItem) => {
    if (!user) return; // Ignore clicks if logged out
    console.log("Loading history item:", item.id);

    // Populate the main view with data from the selected history item
    setProcessedText(item.prompt); // Set the displayed prompt

    // Populate each AI slot's state based on the history item's saved data
    setSlot1State({
        modelName: item.slot_1_model_used || null,
        response: item.slot_1_response || null,
        error: item.slot_1_error || null,
        loading: false // Not loading when displaying history
    });
    setSlot2State({
        modelName: item.slot_2_model_used || null,
        response: item.slot_2_response || null,
        error: item.slot_2_error || null,
        loading: false
    });
    setSlot3State({
        modelName: item.slot_3_model_used || null,
        response: item.slot_3_response || null,
        error: item.slot_3_error || null,
        loading: false
    });

    setShowPanels(true); // Ensure panels are visible
    setInputText(''); // Clear the input field
    setSelectedHistoryId(item.id); // Highlight the selected item in the sidebar
    setIsLoggingComplete(true); // Prevent logging when just viewing history
  };

   // --- Handle Update Title (Passed to Sidebar) ---
   const handleUpdateTitle = useCallback(async (id: string, newTitle: string): Promise<boolean> => {
       if (!user) return false; // Auth check
       console.log(`Update title requested for ID: ${id} to "${newTitle}"`);
       try {
           // Call the backend API to update the title
           const response = await fetch('/api/update-history-title', {
               method: 'PATCH',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ id, title: newTitle }),
           });
           const result = await response.json();
           if (!response.ok || !result.success) {
               // Use error from backend if available
               throw new Error(result.error || 'Failed to update title on server');
           }
           // Update the local history state immediately for better UX
           setHistory(prev => prev.map(item => item.id === id ? { ...item, title: newTitle } : item));
           console.log(`Title updated locally for ID: ${id}`);
           return true; // Indicate success
       } catch (error: any) {
           console.error("Error updating title:", error);
           setHistoryError(`Update failed: ${error.message}`); // Show error in the history sidebar area
           return false; // Indicate failure
       }
   }, [user]); // Depend on user state

   // --- Handle Delete Item (Passed to Sidebar) ---
   const handleDeleteItem = useCallback(async (id: string): Promise<boolean> => {
       if (!user) return false; // Auth check
       console.log(`Delete item requested for ID: ${id}`);
       try {
           // Call the backend API to delete the item
           const response = await fetch('/api/delete-history-item', {
               method: 'DELETE',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ id }),
           });
           const result = await response.json();
           if (!response.ok || !result.success) {
               throw new Error(result.error || 'Failed to delete item on server');
           }
           // Remove the item from the local history state
           setHistory(prev => prev.filter(item => item.id !== id));
           console.log(`Item deleted locally for ID: ${id}`);

           // If the deleted item was currently selected, clear the main view
           if (selectedHistoryId === id) {
               setSelectedHistoryId(null);
               setProcessedText('');
               setShowPanels(false);
               // Reset slot states
               setSlot1State({ modelName: null, loading: false, response: null, error: null });
               setSlot2State({ modelName: null, loading: false, response: null, error: null });
               setSlot3State({ modelName: null, loading: false, response: null, error: null });
           }
           return true; // Indicate success
       } catch (error: any) {
           console.error("Error deleting item:", error);
           setHistoryError(`Delete failed: ${error.message}`); // Show error in history sidebar
           return false; // Indicate failure
       }
   }, [user, selectedHistoryId]); // Depend on user and which item is selected

  // --- Handle Processing New Prompt Submission ---
  const handleProcessText = async () => {
    const currentInput = inputText.trim();
    // Validate input and user/loading states
    if (currentInput === '' || !user || isAuthLoading || settingsLoading) {
      if (!user && !isAuthLoading) {
        console.log("User not logged in.");
        // Maybe show a toast/message asking user to log in
      }
      return; // Exit if not ready
    }
    // Check if any models are actually selected in settings
    const activeModels = [slot1State.modelName, slot2State.modelName, slot3State.modelName].filter(Boolean);
    if (activeModels.length === 0) {
        setSettingsError("No AI models selected. Please configure them in Settings."); // Show error message
        return;
    }
    setSettingsError(null); // Clear any previous settings error

    // Prepare UI for new processing
    setIsLoggingComplete(false); // Indicate that this interaction will need logging
    setSelectedHistoryId(null); // Deselect any previous history item
    setProcessedText(currentInput); // Display the prompt being processed
    setShowPanels(true); // Show the AI response panels
    if (inputRef.current) inputRef.current.blur(); // Remove focus from input
    setInputText(''); // Clear the input field

    // Reset states for ALL slots before making new API calls
    setSlot1State(prev => ({ ...prev, loading: false, response: null, error: null }));
    setSlot2State(prev => ({ ...prev, loading: false, response: null, error: null }));
    setSlot3State(prev => ({ ...prev, loading: false, response: null, error: null }));

    // --- Helper Function to Call Specific AI Backend API ---
    const callApiForSlot = async (
        slotNumber: 1 | 2 | 3, // Which slot this is for
        modelString: string | null, // The combined "Provider: Model" string from settings
        prompt: string, // The user's prompt
        setState: React.Dispatch<React.SetStateAction<AiSlotState>> // The state setter for this slot
    ) => {
        // If no model is configured for this slot, do nothing
        if (!modelString) {
            setState(prev => ({ ...prev, loading: false, response: null, error: null })); // Ensure state is reset
            return;
        }

        // Set loading state and clear previous results/errors
        setState(prev => ({ ...prev, loading: true, response: null, error: null }));

        try {
            // Extract provider and specific model name
            const parts = modelString.split(': ');
            if (parts.length !== 2) throw new Error(`Invalid model format: ${modelString}`);
            const provider = parts[0];
            const specificModel = parts[1];

            // Determine the correct backend API endpoint based on the provider
            let apiUrl = '';
            if (provider === 'ChatGPT') apiUrl = '/api/call-openai';
            else if (provider === 'Gemini') apiUrl = '/api/call-gemini';
            else throw new Error(`Unsupported provider: ${provider}`);

            // Make the API call to the backend proxy route
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: prompt,
                    model: specificModel, // Send the specific model name
                    slotNumber: slotNumber // Send the slot number (for key retrieval)
                }),
            });

            const result = await response.json(); // Parse the response

            // Check if the API call was successful
            if (!response.ok) {
                // Throw error using message from backend if available
                throw new Error(result.error || `API call failed (${response.status})`);
            }

            // Update slot state with the successful response
            setState(prev => ({ ...prev, response: result.response, error: null }));

        } catch (error: any) {
            // Handle any errors during the API call
            console.error(`Error calling API for Slot ${slotNumber} (${modelString}):`, error);
            // Update slot state with the error message
            setState(prev => ({ ...prev, response: null, error: error.message || 'An unknown error occurred' }));
        } finally {
            // Always set loading to false when the call completes (success or error)
            setState(prev => ({ ...prev, loading: false }));
        }
    };

    // --- Initiate API Calls Concurrently for all active slots ---
    // Promise.allSettled waits for all promises to resolve or reject
    console.log("Initiating API calls for active slots...");
    await Promise.allSettled([
        callApiForSlot(1, slot1State.modelName, currentInput, setSlot1State),
        callApiForSlot(2, slot2State.modelName, currentInput, setSlot2State),
        callApiForSlot(3, slot3State.modelName, currentInput, setSlot3State)
    ]);
    console.log("All API calls settled.");
    // Logging will be triggered by the useEffect hook monitoring loading states
  };

  // --- Determine Overall UI State ---
  const isProcessingAny = slot1State.loading || slot2State.loading || slot3State.loading;
  // User can interact if logged in AND auth check AND settings fetch are complete
  const canInteract = !!user && !isAuthLoading && !settingsLoading;

  // --- Helper to get Display Name for Panels ---
  const getModelDisplayName = (modelString: string | null): string => {
      if (!modelString) return "Slot Empty"; // Clearly indicate if no model is selected
      // Could potentially shorten long model names here if needed
      return modelString; // Display "Provider: Model Name"
  };

  // --- Render Component JSX ---
  return (
    // Main container using flex layout
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* History Sidebar Component */}
      <HistorySidebar
        history={history}
        historyLoading={historyLoading || isAuthLoading} // Combine loading states for sidebar
        historyError={historyError}
        selectedHistoryId={selectedHistoryId}
        handleHistoryClick={handleHistoryClick}
        fetchHistory={fetchHistory}
        onUpdateTitle={handleUpdateTitle} // Pass down the handler
        onDeleteItem={handleDeleteItem}   // Pass down the handler
        isLoggedIn={!!user} // Pass login status
      />

      {/* Main Content Area */}
      <main className="relative flex-1 flex flex-col p-4 md:p-6 overflow-y-auto">

        {/* Top Bar: Settings Link & Status Messages */}
        <div className="w-full max-w-6xl mb-4 self-center flex justify-between items-center px-1 h-5"> {/* Fixed height */}
             <div className="text-sm text-red-500"> {/* Settings fetch error */}
                {settingsError && `Settings Error: ${settingsError}`}
             </div>
             {/* Show Settings link only when logged in and auth/settings are loaded */}
             {user && !isAuthLoading && !settingsLoading && (
                 <Link href="/settings" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline">
                     ⚙️ Settings
                 </Link>
             )}
         </div>

        {/* Prompt to Login (Shown when not logged in and auth check is complete) */}
        {!user && !isAuthLoading && (
             <div className="w-full max-w-3xl mb-6 self-center p-4 bg-yellow-100 border border-yellow-300 rounded-md text-center text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-100 dark:border-yellow-700">
                 Please <Link href="/auth" className="font-semibold underline hover:text-yellow-900 dark:hover:text-yellow-200">Sign In or Sign Up</Link> to save history and interact with the AIs.
             </div>
        )}

        {/* Input Area */}
        <div className="w-full max-w-3xl mb-4 self-center flex-shrink-0 px-1">
          {/* Input Field */}
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
                canInteract
                ? "Enter your prompt..."
                : (isAuthLoading || settingsLoading)
                ? "Loading user & settings..."
                : "Please log in to enter a prompt"
            }
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 shadow-sm disabled:bg-gray-200 dark:disabled:bg-gray-700/50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            // Process prompt on Enter key press
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isProcessingAny && inputText.trim() !== '' && canInteract) {
                handleProcessText();
              }
            }}
            disabled={isProcessingAny || !canInteract} // Disable if processing or cannot interact
          />
          {/* Submit Button */}
          <button
            onClick={handleProcessText}
            className={`w-full mt-2 p-3 text-white rounded-md font-semibold transition-colors duration-200 ${
              !canInteract || isProcessingAny || inputText.trim() === ''
                ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed' // Disabled style
                : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600' // Enabled style
            }`}
            disabled={!canInteract || isProcessingAny || inputText.trim() === ''} // Disable conditions
          >
            {isProcessingAny ? 'Processing...' : 'Send Prompt'}
          </button>
        </div>

        {/* Display Area for the Processed Prompt */}
        {processedText && canInteract && (
          <div className="w-full max-w-3xl mb-4 self-center bg-gray-50 dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 flex-shrink-0 px-1">
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Results for prompt:</p>
            <p className="mt-1 text-gray-800 dark:text-gray-200">{processedText}</p>
          </div>
        )}

        {/* AI Response Panels Section */}
        {/* Show panels only if interaction possible and panels should be shown */}
        {showPanels && canInteract && (
          <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-4 self-center flex-grow px-1 pb-4">

            {/* Panel 1 */}
            <div className={`p-4 border rounded-lg bg-white dark:bg-gray-800 shadow-md flex flex-col min-h-[150px] border-gray-200 dark:border-gray-700 ${!slot1State.modelName ? 'opacity-60' : ''}`}>
              {/* Panel Title */}
              <h2 className="text-lg md:text-xl font-semibold mb-2 text-blue-600 dark:text-blue-400 flex-shrink-0 truncate" title={slot1State.modelName || 'Slot 1'}>
                  {getModelDisplayName(slot1State.modelName)}
              </h2>
              {/* Panel Content Area */}
              <div className="flex-grow overflow-y-auto text-sm custom-scrollbar"> {/* Added custom-scrollbar class if defined in globals.css */}
                {!slot1State.modelName && <p className="text-gray-400 dark:text-gray-500 italic text-center mt-4">Slot empty. Configure in Settings.</p>}
                {slot1State.modelName && slot1State.loading && <p className="text-gray-500 dark:text-gray-400 animate-pulse">Loading...</p>}
                {slot1State.modelName && slot1State.error && <p className="text-red-600 dark:text-red-400">Error: {slot1State.error}</p>}
                {slot1State.modelName && !slot1State.loading && !slot1State.error && slot1State.response && (<p className="whitespace-pre-wrap text-gray-800 dark:text-gray-200">{slot1State.response}</p>)}
                {/* Show 'No response' only if processing finished without error/response for a submitted prompt */}
                {slot1State.modelName && !slot1State.loading && !slot1State.error && !slot1State.response && processedText && (<p className="text-gray-400 dark:text-gray-500 italic">No response received.</p>)}
                {/* Show 'Ready' only if a model is selected but no prompt has been processed yet */}
                {slot1State.modelName && !processedText && !slot1State.loading && (<p className="text-gray-400 dark:text-gray-500 italic">Ready.</p>)}
              </div>
            </div>

            {/* Panel 2 */}
             <div className={`p-4 border rounded-lg bg-white dark:bg-gray-800 shadow-md flex flex-col min-h-[150px] border-gray-200 dark:border-gray-700 ${!slot2State.modelName ? 'opacity-60' : ''}`}>
              <h2 className="text-lg md:text-xl font-semibold mb-2 text-green-600 dark:text-green-400 flex-shrink-0 truncate" title={slot2State.modelName || 'Slot 2'}>
                  {getModelDisplayName(slot2State.modelName)}
              </h2>
              <div className="flex-grow overflow-y-auto text-sm custom-scrollbar">
                {!slot2State.modelName && <p className="text-gray-400 dark:text-gray-500 italic text-center mt-4">Slot empty. Configure in Settings.</p>}
                {slot2State.modelName && slot2State.loading && <p className="text-gray-500 dark:text-gray-400 animate-pulse">Loading...</p>}
                {slot2State.modelName && slot2State.error && <p className="text-red-600 dark:text-red-400">Error: {slot2State.error}</p>}
                {slot2State.modelName && !slot2State.loading && !slot2State.error && slot2State.response && (<p className="whitespace-pre-wrap text-gray-800 dark:text-gray-200">{slot2State.response}</p>)}
                {slot2State.modelName && !slot2State.loading && !slot2State.error && !slot2State.response && processedText && (<p className="text-gray-400 dark:text-gray-500 italic">No response received.</p>)}
                {slot2State.modelName && !processedText && !slot2State.loading && (<p className="text-gray-400 dark:text-gray-500 italic">Ready.</p>)}
              </div>
            </div>

            {/* Panel 3 */}
             <div className={`p-4 border rounded-lg bg-white dark:bg-gray-800 shadow-md flex flex-col min-h-[150px] border-gray-200 dark:border-gray-700 ${!slot3State.modelName ? 'opacity-60' : ''}`}>
              <h2 className="text-lg md:text-xl font-semibold mb-2 text-purple-600 dark:text-purple-400 flex-shrink-0 truncate" title={slot3State.modelName || 'Slot 3'}>
                  {getModelDisplayName(slot3State.modelName)}
              </h2>
              <div className="flex-grow overflow-y-auto text-sm custom-scrollbar">
                {!slot3State.modelName && <p className="text-gray-400 dark:text-gray-500 italic text-center mt-4">Slot empty. Configure in Settings.</p>}
                {slot3State.modelName && slot3State.loading && <p className="text-gray-500 dark:text-gray-400 animate-pulse">Loading...</p>}
                {slot3State.modelName && slot3State.error && <p className="text-red-600 dark:text-red-400">Error: {slot3State.error}</p>}
                {slot3State.modelName && !slot3State.loading && !slot3State.error && slot3State.response && (<p className="whitespace-pre-wrap text-gray-800 dark:text-gray-200">{slot3State.response}</p>)}
                {slot3State.modelName && !slot3State.loading && !slot3State.error && !slot3State.response && processedText && (<p className="text-gray-400 dark:text-gray-500 italic">No response received.</p>)}
                {slot3State.modelName && !processedText && !slot3State.loading && (<p className="text-gray-400 dark:text-gray-500 italic">Ready.</p>)}
              </div>
            </div>

          </div>
        )}

        {/* Placeholder shown when panels are hidden or interaction is not possible */}
        {(!showPanels || !canInteract) && (
             <div className="flex-grow flex items-center justify-center text-gray-500 dark:text-gray-400 text-center px-4">
               {canInteract
                 ? "Enter a prompt above or select an item from history to see AI responses."
                 : (isAuthLoading || settingsLoading)
                 ? "Loading user data and settings..." // Loading state message
                 : "Please log in to start comparing AI responses." // Logged out message
               }
             </div>
        )}
      </main>
    </div>
  );
}
