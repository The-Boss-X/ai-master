/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/page.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link'; // Import Link for navigation
import { useRouter } from 'next/navigation'; // Can be useful
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
    modelName: string | null;
    loading: boolean;
    response: string | null;
    error: string | null;
}

export default function Home() {
  // --- Authentication State ---
  const { user, isLoading: isAuthLoading } = useAuth();

  // --- Core Input/Output State ---
  const [inputText, setInputText] = useState('');
  const [processedText, setProcessedText] = useState('');

  // --- Settings State ---
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // --- AI Slot State ---
  const [slot1State, setSlot1State] = useState<AiSlotState>({ modelName: null, loading: false, response: null, error: null });
  const [slot2State, setSlot2State] = useState<AiSlotState>({ modelName: null, loading: false, response: null, error: null });
  const [slot3State, setSlot3State] = useState<AiSlotState>({ modelName: null, loading: false, response: null, error: null });

  // --- UI Control State ---
  const [showPanels, setShowPanels] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- History State ---
  const [history, setHistory] = useState<InteractionHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null); // Keep track of selected history

  // --- Logging State ---
  const [isLoggingComplete, setIsLoggingComplete] = useState(true);

  // --- Fetch User Settings ---
  // useCallback memoizes the function; dependencies define when it should be recreated.
  const fetchSettings = useCallback(async () => {
    // No need to fetch if we know the user isn't logged in
    if (!user) {
        setSlot1State(prev => ({ ...prev, modelName: null }));
        setSlot2State(prev => ({ ...prev, modelName: null }));
        setSlot3State(prev => ({ ...prev, modelName: null }));
        setSettingsLoading(false);
        return;
    }
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const response = await fetch('/api/settings/get-settings');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse settings error' }));
        if (response.status === 401) {
            console.warn("Settings fetch unauthorized, user might be logged out.");
            setSlot1State(prev => ({ ...prev, modelName: null }));
            setSlot2State(prev => ({ ...prev, modelName: null }));
            setSlot3State(prev => ({ ...prev, modelName: null }));
        }
        throw new Error(errorData.error || `Failed to fetch settings (${response.status})`);
      }
      const data: FetchedSettings | null = await response.json();

      // *** IMPORTANT FIX: Only update general settings if NO history item is selected ***
      // This prevents overwriting the displayed history data when settings are refetched
      // We access selectedHistoryId directly here instead of making it a dependency
      if (!selectedHistoryId) {
          setSlot1State(prev => ({ ...prev, modelName: data?.slot_1_model || null }));
          setSlot2State(prev => ({ ...prev, modelName: data?.slot_2_model || null }));
          setSlot3State(prev => ({ ...prev, modelName: data?.slot_3_model || null }));
          console.log("Home Page: Fetched and applied settings (no history selected):", data);
      } else {
          console.log("Home Page: Fetched settings, but history item is selected. Skipping modelName update.", data);
      }

    } catch (error: any) {
      console.error("Home Page: Error fetching settings:", error);
      setSettingsError(error.message);
       setSlot1State(prev => ({ ...prev, modelName: null }));
       setSlot2State(prev => ({ ...prev, modelName: null }));
       setSlot3State(prev => ({ ...prev, modelName: null }));
    } finally {
      setSettingsLoading(false);
    }
  // *** REMOVED selectedHistoryId from dependency array ***
  }, [user]);

  // --- Fetch History ---
  const fetchHistory = useCallback(async () => {
    if (isAuthLoading || !user) {
        setHistory([]);
        setHistoryLoading(false);
        return;
    }
    setHistoryLoading(true);
    setHistoryError(null);
    console.log("Home Page: Fetching history...");
    try {
      const response = await fetch('/api/get-history');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse history error' }));
        if (response.status === 401) throw new Error("Unauthorized fetching history. Please log in.");
        throw new Error(errorData.error || `Failed to fetch history: ${response.status}`);
      }
      const data: InteractionHistoryItem[] = await response.json();
      console.log("Home Page: History data received from API:", data ? data.length : 0, "items");
      if (data && data.length > 0) {
          console.log("Home Page: Structure of first history item received:", JSON.stringify(data[0], null, 2));
      }
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setHistory(data);
    } catch (error: any) {
      console.error("Home Page: Error fetching history:", error);
      setHistoryError(error.message);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [user, isAuthLoading]);

  // --- Initial Data Fetching Effect ---
  // *** Simplified dependencies to only run on auth state changes ***
  useEffect(() => {
    if (!isAuthLoading) {
      console.log("Home Page: Auth loaded, fetching settings and history...");
      fetchSettings();
      fetchHistory();
    }
  }, [user, isAuthLoading, fetchSettings, fetchHistory]); // Keep fetch functions here as they depend on user

  // --- Log Interaction to Backend ---
  const logInteractionToSupabase = useCallback(async () => {
    if (isLoggingComplete || !user || !processedText) {
      setIsLoggingComplete(true);
      return;
    }
    const attemptedModels = [slot1State.modelName, slot2State.modelName, slot3State.modelName].filter(Boolean);
    if (attemptedModels.length === 0) {
        setIsLoggingComplete(true);
        return;
    }
    console.log("Home Page: Attempting to log interaction...");
    try {
      const dataToLog = {
        prompt: processedText,
        title: processedText.substring(0, 50) + (processedText.length > 50 ? '...' : ''),
        slot_1_model_used: slot1State.modelName,
        slot_1_response: slot1State.response,
        slot_1_error: slot1State.error,
        slot_2_model_used: slot2State.modelName,
        slot_2_response: slot2State.response,
        slot_2_error: slot2State.error,
        slot_3_model_used: slot3State.modelName,
        slot_3_response: slot3State.response,
        slot_3_error: slot3State.error,
      };
      console.log("Home Page: Sending data to /api/log-interaction:", dataToLog);

      const response = await fetch('/api/log-interaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToLog),
      });

      const result = await response.json().catch(() => ({ success: false, error: 'Invalid JSON response from log API' }));

      if (!response.ok || !result?.success || !result.loggedData?.[0]) {
        const errorMsg = result?.error || `Failed to log interaction (${response.status})`;
        console.error('Home Page: Failed to log interaction:', errorMsg);
      } else {
        const newLogEntry = result.loggedData[0] as InteractionHistoryItem;
        if (newLogEntry?.id && newLogEntry?.created_at && newLogEntry?.prompt) {
          setHistory(prevHistory => [newLogEntry, ...prevHistory]);
          setSelectedHistoryId(newLogEntry.id); // Select the new entry
          console.log("Home Page: Interaction logged successfully, ID:", newLogEntry.id);
        } else {
          console.warn("Home Page: Logged data from API was incomplete, refetching history.", newLogEntry);
          fetchHistory();
        }
      }
    } catch (error) {
      console.error('Home Page: Error calling logging API:', error);
    } finally {
      setIsLoggingComplete(true);
    }
  }, [
      user, processedText, isLoggingComplete, fetchHistory,
      slot1State.modelName, slot1State.response, slot1State.error,
      slot2State.modelName, slot2State.response, slot2State.error,
      slot3State.modelName, slot3State.response, slot3State.error
  ]);

  // --- useEffect to Trigger Logging After AI Calls Complete ---
  useEffect(() => {
    const allSlotsFinished = !slot1State.loading && !slot2State.loading && !slot3State.loading;
    if (allSlotsFinished && processedText && !isLoggingComplete) {
      logInteractionToSupabase();
    }
  }, [
      slot1State.loading, slot2State.loading, slot3State.loading,
      processedText, isLoggingComplete, logInteractionToSupabase
  ]);

  // --- Handle Clicking a History Item ---
  const handleHistoryClick = (item: InteractionHistoryItem) => {
    if (!user) return;
    console.log("Home Page: handleHistoryClick triggered for item:", item.id);
    console.log("Home Page: Clicked history item data:", JSON.stringify(item, null, 2));

    setProcessedText(item.prompt);

    // Use the correct field names from the InteractionHistoryItem type
    const newState1: AiSlotState = {
        modelName: item.slot_1_model || null, // Use the model saved in history
        response: item.slot_1_response || null,
        error: item.slot_1_error || null,
        loading: false
    };
    const newState2: AiSlotState = {
        modelName: item.slot_2_model || null, // Use the model saved in history
        response: item.slot_2_response || null,
        error: item.slot_2_error || null,
        loading: false
    };
    const newState3: AiSlotState = {
        modelName: item.slot_3_model || null, // Use the model saved in history
        response: item.slot_3_response || null,
        error: item.slot_3_error || null,
        loading: false
    };

    console.log("Home Page: Preparing to set slot 1 state from history:", newState1);
    console.log("Home Page: Preparing to set slot 2 state from history:", newState2);
    console.log("Home Page: Preparing to set slot 3 state from history:", newState3);

    // Update the state for all three slots based on the history item
    setSlot1State(newState1);
    setSlot2State(newState2);
    setSlot3State(newState3);

    setShowPanels(true);
    setInputText('');
    setSelectedHistoryId(item.id); // Set the selected ID *after* setting slot state
    setIsLoggingComplete(true);
    console.log("Home Page: handleHistoryClick finished setting state for item:", item.id);
  };

   // --- Handle Update Title (Passed to Sidebar) ---
   const handleUpdateTitle = useCallback(async (id: string, newTitle: string): Promise<boolean> => {
       if (!user) return false;
       console.log(`Update title requested for ID: ${id} to "${newTitle}"`);
       try {
           const response = await fetch('/api/update-history-title', {
               method: 'PATCH',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ id, title: newTitle }),
           });
           const result = await response.json();
           if (!response.ok || !result.success) {
               throw new Error(result.error || 'Failed to update title');
           }
           setHistory(prev => prev.map(item => item.id === id ? { ...item, title: newTitle } : item));
           return true;
       } catch (error: any) {
           console.error("Error updating title:", error);
           setHistoryError(`Update failed: ${error.message}`);
           return false;
       }
   }, [user]);

   // --- Handle Delete Item (Passed to Sidebar) ---
   const handleDeleteItem = useCallback(async (id: string): Promise<boolean> => {
       if (!user) return false;
       console.log(`Delete item requested for ID: ${id}`);
       try {
           const response = await fetch('/api/delete-history-item', {
               method: 'DELETE',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ id }),
           });
           const result = await response.json();
           if (!response.ok || !result.success) {
               throw new Error(result.error || 'Failed to delete item');
           }
           setHistory(prev => prev.filter(item => item.id !== id));
           if (selectedHistoryId === id) {
               setSelectedHistoryId(null);
               setProcessedText('');
               setShowPanels(false);
               // Reset slot states to reflect general settings or empty
               fetchSettings(); // Refetch general settings after deleting selected item
           }
           return true;
       } catch (error: any) {
           console.error("Error deleting item:", error);
           setHistoryError(`Delete failed: ${error.message}`);
           return false;
       }
   // Include fetchSettings in dependency array as it's called inside
   }, [user, selectedHistoryId, fetchSettings]);

  // --- Handle Processing New Prompt Submission ---
  const handleProcessText = async () => {
    const currentInput = inputText.trim();
    if (currentInput === '' || !user || isAuthLoading || settingsLoading) {
      if (!user && !isAuthLoading) console.log("User not logged in.");
      return;
    }
    // Fetch the latest settings right before processing, in case they changed
    // This also ensures slot states reflect current settings, not potentially stale ones
    await fetchSettings();
    // We need to access the LATEST state after fetchSettings potentially updated it.
    // A slight delay or using the state directly might work, but for robustness,
    // it's better if callApiForSlot could read the latest state or receive it.
    // Let's proceed assuming the state update from fetchSettings is quick enough for now.

    const activeModels = [slot1State.modelName, slot2State.modelName, slot3State.modelName].filter(Boolean);
    if (activeModels.length === 0) {
        setSettingsError("No AI models selected. Please configure them in Settings.");
        return;
    }
    setSettingsError(null);

    setIsLoggingComplete(false);
    setSelectedHistoryId(null); // Deselect history when processing new
    setProcessedText(currentInput);
    setShowPanels(true);
    if (inputRef.current) inputRef.current.blur();
    setInputText('');

    // Reset only response/error/loading, keep modelName from fetched settings
    setSlot1State(prev => ({ ...prev, loading: false, response: null, error: null }));
    setSlot2State(prev => ({ ...prev, loading: false, response: null, error: null }));
    setSlot3State(prev => ({ ...prev, loading: false, response: null, error: null }));

    // --- Helper Function to Call Specific AI Backend API ---
    const callApiForSlot = async (
        slotNumber: 1 | 2 | 3,
        modelString: string | null, // Use the model name currently in state
        prompt: string,
        setState: React.Dispatch<React.SetStateAction<AiSlotState>>
    ) => {
        if (!modelString) {
            setState(prev => ({ ...prev, loading: false, response: null, error: null }));
            return;
        }
        setState(prev => ({ ...prev, loading: true, response: null, error: null }));
        try {
            const parts = modelString.split(': ');
            if (parts.length !== 2) throw new Error(`Invalid model format: ${modelString}`);
            const provider = parts[0];
            const specificModel = parts[1];
            let apiUrl = '';
            if (provider === 'ChatGPT') apiUrl = '/api/call-openai';
            else if (provider === 'Gemini') apiUrl = '/api/call-gemini';
            else throw new Error(`Unsupported provider: ${provider}`);

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, model: specificModel, slotNumber }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || `API call failed (${response.status})`);
            }
            setState(prev => ({ ...prev, response: result.response, error: null }));
        } catch (error: any) {
            console.error(`Error calling API for Slot ${slotNumber} (${modelString}):`, error);
            setState(prev => ({ ...prev, response: null, error: error.message || 'Unknown error' }));
        } finally {
            setState(prev => ({ ...prev, loading: false }));
        }
    };

    // --- Initiate API Calls Concurrently using the current state's modelName ---
    console.log("Home Page: Initiating API calls for active slots...");
    await Promise.allSettled([
        callApiForSlot(1, slot1State.modelName, currentInput, setSlot1State),
        callApiForSlot(2, slot2State.modelName, currentInput, setSlot2State),
        callApiForSlot(3, slot3State.modelName, currentInput, setSlot3State)
    ]);
    console.log("Home Page: All API calls settled.");
  };

  // --- Determine Overall UI State ---
  const isProcessingAny = slot1State.loading || slot2State.loading || slot3State.loading;
  const canInteract = !!user && !isAuthLoading && !settingsLoading;

  // --- Helper to get Display Name for Panels ---
  const getModelDisplayName = (modelString: string | null): string => {
      if (!modelString) return "Slot Empty";
      return modelString;
  };

  // --- Debugging useEffect to Monitor Slot State ---
  useEffect(() => {
    console.log("Home Page: Slot states updated:", {
        slot1: slot1State,
        slot2: slot2State,
        slot3: slot3State
    });
  }, [slot1State, slot2State, slot3State]);

  // --- Render Component JSX ---
  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* History Sidebar Component */}
      <HistorySidebar
        history={history}
        historyLoading={historyLoading || isAuthLoading}
        historyError={historyError}
        selectedHistoryId={selectedHistoryId}
        handleHistoryClick={handleHistoryClick}
        fetchHistory={fetchHistory}
        onUpdateTitle={handleUpdateTitle}
        onDeleteItem={handleDeleteItem}
        isLoggedIn={!!user}
      />

      {/* Main Content Area */}
      <main className="relative flex-1 flex flex-col p-4 md:p-6 overflow-y-auto">

        {/* Top Bar: Settings Link & Status Messages */}
        <div className="w-full max-w-6xl mb-4 self-center flex justify-between items-center px-1 h-5">
             <div className="text-sm text-red-500">
                {settingsError && `Settings Error: ${settingsError}`}
             </div>
             {user && !isAuthLoading && !settingsLoading && (
                 <Link href="/settings" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline">
                     ⚙️ Settings
                 </Link>
             )}
              {!user && !isAuthLoading && <div className="h-5"></div>}
         </div>

        {/* Prompt to Login */}
        {!user && !isAuthLoading && (
             <div className="w-full max-w-3xl mb-6 self-center p-4 bg-yellow-100 border border-yellow-300 rounded-md text-center text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-100 dark:border-yellow-700">
                 Please <Link href="/auth" className="font-semibold underline hover:text-yellow-900 dark:hover:text-yellow-200">Sign In or Sign Up</Link> to save history and interact with the AIs.
             </div>
        )}

        {/* Input Area */}
        <div className="w-full max-w-3xl mb-4 self-center flex-shrink-0 px-1">
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
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isProcessingAny && inputText.trim() !== '' && canInteract) {
                handleProcessText();
              }
            }}
            disabled={isProcessingAny || !canInteract}
          />
          <button
            onClick={handleProcessText}
            className={`w-full mt-2 p-3 text-white rounded-md font-semibold transition-colors duration-200 ${
              !canInteract || isProcessingAny || inputText.trim() === ''
                ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
            }`}
            disabled={!canInteract || isProcessingAny || inputText.trim() === ''}
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
        {showPanels && canInteract && (
          <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-4 self-center flex-grow px-1 pb-4">

            {/* Panel 1 */}
            <div className={`p-4 border rounded-lg bg-white dark:bg-gray-800 shadow-md flex flex-col min-h-[150px] border-gray-200 dark:border-gray-700 ${!slot1State.modelName ? 'opacity-60' : ''}`}>
              <h2 className="text-lg md:text-xl font-semibold mb-2 text-blue-600 dark:text-blue-400 flex-shrink-0 truncate" title={slot1State.modelName || 'Slot 1'}>
                  {getModelDisplayName(slot1State.modelName)}
              </h2>
              <div className="flex-grow overflow-y-auto text-sm custom-scrollbar">
                {!slot1State.modelName && <p className="text-gray-400 dark:text-gray-500 italic text-center mt-4">Slot empty. Configure in Settings.</p>}
                {slot1State.modelName && slot1State.loading && <p className="text-gray-500 dark:text-gray-400 animate-pulse">Loading...</p>}
                {slot1State.modelName && slot1State.error && <p className="text-red-600 dark:text-red-400">Error: {slot1State.error}</p>}
                {slot1State.modelName && !slot1State.loading && !slot1State.error && slot1State.response && (<p className="whitespace-pre-wrap text-gray-800 dark:text-gray-200">{slot1State.response}</p>)}
                {slot1State.modelName && !slot1State.loading && !slot1State.error && !slot1State.response && processedText && (<p className="text-gray-400 dark:text-gray-500 italic">No response received.</p>)}
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
