/* eslint-disable @typescript-eslint/no-explicit-any */
// app/page.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from './context/AuthContext'; // Import useAuth
import { InteractionHistoryItem } from './api/get-history/route'; // Ensure this type matches API response
import HistorySidebar from './components/HistorySidebar';
import Link from 'next/link';

// Interfaces remain the same...
interface ApiResponse {
  response?: string;
  error?: string;
}
interface SimpleStatusResponse {
    success: boolean;
    error?: string;
    updatedItem?: InteractionHistoryItem; // Keep for update response
    loggedData?: InteractionHistoryItem[]; // Keep for log response
    // No specific payload needed for delete response usually
}


export default function Home() {
  // --- Auth State ---
  const { user, isLoading: isAuthLoading } = useAuth(); // Get user and loading state

  // --- Core State ---
  const [inputText, setInputText] = useState('');
  const [processedText, setProcessedText] = useState('');

  // --- AI State ---
  const [geminiFlashResponse, setGeminiFlashResponse] = useState('');
  const [geminiFlashLoading, setGeminiFlashLoading] = useState(false);
  const [geminiFlashError, setGeminiFlashError] = useState<string | null>(null);
  const [chatgptResponse, setChatgptResponse] = useState('');
  const [chatgptLoading, setChatgptLoading] = useState(false);
  const [chatgptError, setChatgptError] = useState<string | null>(null);
  const [geminiProResponse, setGeminiProResponse] = useState('');
  const [geminiProLoading, setGeminiProLoading] = useState(false);
  const [geminiProError, setGeminiProError] = useState<string | null>(null);

  // --- UI/Control State ---
  const [showPanels, setShowPanels] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- History State ---
  const [history, setHistory] = useState<InteractionHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false); // Manage fetch loading separately
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  // --- Logging State ---
  const [isLoggingComplete, setIsLoggingComplete] = useState(true);

  // --- Handlers ---
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
  };

  // Fetch history - now depends on user state
  const fetchHistory = useCallback(async () => {
    // Only fetch if logged in and auth isn't loading
    if (!user || isAuthLoading) {
        setHistory([]); // Clear history if logged out
        setHistoryLoading(false);
        return;
    }

    setHistoryLoading(true);
    setHistoryError(null);
    try {
      // This API route is now protected by RLS via server-side client
      const response = await fetch('/api/get-history');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse history error' }));
        // Handle specific auth errors if needed (e.g., 401 Unauthorized)
        if (response.status === 401) {
             throw new Error("Unauthorized. Please log in.");
        }
        throw new Error(errorData.error || `Failed to fetch history: ${response.status}`);
      }
      const data: InteractionHistoryItem[] = await response.json();
      // Sort handled by API now, but client-side sort is fine as fallback
      // data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setHistory(data);
    } catch (error: any) {
      console.error("Error fetching history:", error);
      setHistoryError(error.message);
      setHistory([]); // Clear history on error
    } finally {
      setHistoryLoading(false);
    }
  }, [user, isAuthLoading]); // Depend on user and auth loading state

  // Fetch history when user logs in or auth state is finalized
  useEffect(() => {
    if (!isAuthLoading) { // Only fetch when auth status is known
        fetchHistory();
    }
  }, [user, isAuthLoading, fetchHistory]); // Re-run when user or auth loading state changes

  // Log interaction - only if logged in
  const logInteractionToSupabase = useCallback(async (newData: Omit<InteractionHistoryItem, 'id' | 'created_at' | 'user_id'>) => {
      if (!processedText || !user) {
          console.log("Skipping log: No processed text or user not logged in.");
          setIsLoggingComplete(true); // Ensure logging state is reset
          return;
      }

      try {
        // No need to add user_id here, RLS/default value handles it
        const dataToLog = { ...newData, title: newData.prompt.substring(0, 50) + (newData.prompt.length > 50 ? '...' : '') }; // Example title generation

        const response = await fetch('/api/log-interaction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dataToLog),
        });

        const result: SimpleStatusResponse = await response.json().catch(() => ({ success: false, error: 'Invalid JSON response' }));

        if (!response.ok || !result?.success || !result.loggedData?.[0]) {
            let errorMsg = result?.error || `Failed to log interaction (${response.status})`;
             if (response.status === 401) errorMsg = "Log failed: Unauthorized.";
             console.error('Failed to log interaction:', errorMsg);
             // Maybe show error to user?
        } else {
          const newLogEntry = result.loggedData[0] as InteractionHistoryItem;
          // Ensure essential fields are present
          if (newLogEntry?.id && newLogEntry?.created_at && newLogEntry?.prompt) {
              setHistory(prevHistory => [newLogEntry, ...prevHistory]); // Add to top
              setSelectedHistoryId(newLogEntry.id);
              console.log("Interaction logged successfully, ID:", newLogEntry.id);
          } else {
              console.warn("Logged data from API was incomplete, refetching history.", newLogEntry);
              fetchHistory(); // Refetch for consistency if local update fails
          }
        }
      } catch (error) {
        console.error('Error calling logging API:', error);
      } finally {
          setIsLoggingComplete(true);
      }
  }, [processedText, user, fetchHistory]); // Depend on user and fetchHistory

  // useEffect to trigger logging (logic remains similar, but logInteractionToSupabase now checks for user)
  useEffect(() => {
    const allDoneLoading = !geminiFlashLoading && !chatgptLoading && !geminiProLoading;
    if (allDoneLoading && processedText && !isLoggingComplete && user) { // Added user check
        const interactionData = {
            prompt: processedText,
            gemini_flash_response: geminiFlashResponse,
            chatgpt_response: chatgptResponse,
            gemini_pro_response: geminiProResponse,
            gemini_flash_error: geminiFlashError,
            chatgpt_error: chatgptError,
            gemini_pro_error: geminiProError,
            // No need to pass title here if log-interaction API generates it
            // title: processedText.substring(0, 30) + (processedText.length > 30 ? '...' : ''),
        };
        // Check if there's anything meaningful to log besides the prompt
         const hasAnyResult = Object.entries(interactionData).some(
              ([key, value]) => key !== 'prompt' && value !== null && value !== ''
         );

        if (hasAnyResult) {
            logInteractionToSupabase(interactionData);
        } else {
            console.log(">>> useEffect: Skipping log - No significant results/errors.");
            setIsLoggingComplete(true); // Mark as complete even if skipped
        }
    } else if (allDoneLoading && !isLoggingComplete && !user) {
        console.log(">>> useEffect: Skipping log - User not logged in.");
        setIsLoggingComplete(true); // Mark as complete if skipped due to logout
    }
  }, [
      geminiFlashLoading, chatgptLoading, geminiProLoading,
      processedText, isLoggingComplete, logInteractionToSupabase,
      geminiFlashResponse, chatgptResponse, geminiProResponse,
      geminiFlashError, chatgptError, geminiProError,
      user // Added user dependency
  ]);

  // Handle clicking history item (no auth change needed, relies on fetched history)
  const handleHistoryClick = (item: InteractionHistoryItem) => {
      if (!user) return; // Prevent action if logged out
      setProcessedText(item.prompt);
      setGeminiFlashResponse(item.gemini_flash_response || '');
      setChatgptResponse(item.chatgpt_response || '');
      setGeminiProResponse(item.gemini_pro_response || '');
      setGeminiFlashError(item.gemini_flash_error || null);
      setChatgptError(item.chatgpt_error || null);
      setGeminiProError(item.gemini_pro_error || null);
      setGeminiFlashLoading(false);
      setChatgptLoading(false);
      setGeminiProLoading(false);
      setShowPanels(true);
      setInputText('');
      setSelectedHistoryId(item.id);
      setIsLoggingComplete(true); // Don't log when selecting history
  };

  // Handle submitting new prompt - check user first
  const handleProcessText = () => {
      if (inputText.trim() === '' || !user || isAuthLoading) { // Check user and auth loading
          if (!user && !isAuthLoading) {
             // Optionally show a message prompting login
             console.log("Please log in to use the AI comparison tool.");
          }
          return;
      }

      setIsLoggingComplete(false); // Allow logging for this new interaction
      setSelectedHistoryId(null); // Deselect history
      // Reset AI states...
      setGeminiFlashLoading(true); setChatgptLoading(true); setGeminiProLoading(true);
      setGeminiFlashError(null); setChatgptError(null); setGeminiProError(null);
      setGeminiFlashResponse(''); setChatgptResponse(''); setGeminiProResponse('');

      const currentInput = inputText;
      setProcessedText(currentInput); // Show prompt immediately
      setShowPanels(true);
      if (inputRef.current) inputRef.current.blur();
      setInputText(''); // Clear input field

      // --- Initiate API Calls Individually ---

    // 1. Gemini Flash Request
    fetch('/api/gemini-flash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: currentInput }),
  })
  .then(async (response) => {
      const data: ApiResponse = await response.json();
      if (!response.ok) {
          console.error("Gemini Flash API Error Response:", data);
          // Throw an error to be caught by the .catch block
          throw new Error(data.error || `Request failed with status ${response.status}`);
      }
      setGeminiFlashResponse(data.response || '');
  })
  .catch((error: any) => {
      console.error("Failed to fetch or process Gemini Flash API route:", error);
      setGeminiFlashError(error.message || 'Failed to connect to the Gemini Flash service.');
  })
  .finally(() => {
      setGeminiFlashLoading(false); // Stop loading indicator for this AI specifically
  });

  // 2. ChatGPT Request
  fetch('/api/chatgpt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: currentInput }),
  })
  .then(async (response) => {
      const data: ApiResponse = await response.json();
      if (!response.ok) {
          console.error("ChatGPT API Error Response:", data);
          throw new Error(data.error || `Request failed with status ${response.status}`);
      }
      setChatgptResponse(data.response || '');
  })
  .catch((error: any) => {
      console.error("Failed to fetch or process ChatGPT API route:", error);
      setChatgptError(error.message || 'Failed to connect to the ChatGPT service.');
  })
  .finally(() => {
      setChatgptLoading(false); // Stop loading indicator for this AI specifically
  });

  // 3. Gemini Pro Request
  fetch('/api/gemini-pro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: currentInput }),
  })
  .then(async (response) => {
      const data: ApiResponse = await response.json();
      if (!response.ok) {
          console.error("Gemini Pro API Error Response:", data);
          throw new Error(data.error || `Request failed with status ${response.status}`);
      }
      setGeminiProResponse(data.response || '');
  })
  .catch((error: any) => {
      console.error("Failed to fetch or process Gemini Pro API route:", error);
      setGeminiProError(error.message || 'Failed to connect to the Gemini Pro service.');
  })
  .finally(() => {
      setGeminiProLoading(false); // Stop loading indicator for this AI specifically
  });
};


  // Update title handler - check user
  const handleUpdateTitle = useCallback(async (id: string, newTitle: string): Promise<boolean> => {
      if (!user) return false; // Prevent if not logged in

      try {
        const response = await fetch('/api/update-history-title', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, title: newTitle }),
        });

        const result: SimpleStatusResponse = await response.json();

        if (!response.ok || !result.success) {
            console.error("Failed to update title:", result?.error || response.statusText);
            setHistoryError(`Failed to update title: ${result?.error || 'Server error'}`);
            return false;
        }

        // Update local state immediately
        setHistory(prevHistory =>
            prevHistory.map(item =>
                item.id === id ? { ...item, title: newTitle } : item
            )
        );
        setHistoryError(null);
        return true;

      } catch (error) {
        console.error("Error calling update title API:", error);
        setHistoryError("A network error occurred while updating the title.");
        return false;
      }
  }, [user]); // Depend on user


  // Delete item handler - check user
  const handleDeleteItem = useCallback(async (id: string): Promise<boolean> => {
      if (!user) return false; // Prevent if not logged in

      try {
        const response = await fetch('/api/delete-history-item', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }), // API needs to know which item
        });

        const result: SimpleStatusResponse = await response.json().catch(() => ({success: false, error: 'Invalid JSON response'}));

        if (!response.ok || !result.success) {
            let errorMsg = result?.error || `Failed to delete item (${response.status})`;
            if (response.status === 401) errorMsg = "Delete failed: Unauthorized.";
            if (response.status === 404) errorMsg = "Delete failed: Item not found.";
            console.error("Failed to delete item:", errorMsg);
            setHistoryError(`Failed to delete item: ${errorMsg}`);
            return false;
        }

        // Update local state
        setHistory(prevHistory => prevHistory.filter(item => item.id !== id));

        if (selectedHistoryId === id) {
            // Clear panels if the deleted item was selected
            setSelectedHistoryId(null);
            setProcessedText('');
            setShowPanels(false);
            setGeminiFlashResponse(''); setChatgptResponse(''); setGeminiProResponse('');
            setGeminiFlashError(null); setChatgptError(null); setGeminiProError(null);
        }
        setHistoryError(null);
        return true;

      } catch (error) {
        console.error("Error calling delete item API:", error);
        setHistoryError("A network error occurred while deleting the item.");
        return false;
      }
  }, [user, selectedHistoryId]); // Depend on user and selectedHistoryId


  const isProcessingNew = geminiFlashLoading || chatgptLoading || geminiProLoading;
  const canInteract = !!user && !isAuthLoading; // User is logged in and auth check is done

  return (
    <div className="flex h-screen bg-gray-100"> {/* Ensure container takes full height */}
      <HistorySidebar
        history={history}
        // Pass combined loading state or handle separately in sidebar
        historyLoading={historyLoading || isAuthLoading}
        historyError={historyError}
        selectedHistoryId={selectedHistoryId}
        handleHistoryClick={handleHistoryClick}
        fetchHistory={fetchHistory}
        onUpdateTitle={handleUpdateTitle}
        onDeleteItem={handleDeleteItem}
        isLoggedIn={!!user} // Pass login status to sidebar
      />

      <main className="relative flex-1 flex flex-col p-4 md:p-6 overflow-y-auto">

        {/* Prompt to Login */}
         {!user && !isAuthLoading && (
             <div className="w-full max-w-3xl mb-6 self-center p-4 bg-yellow-100 border border-yellow-300 rounded-md text-center text-yellow-800">
                 Please <Link href="/auth" className="font-semibold underline hover:text-yellow-900">Sign In or Sign Up</Link> to save history and interact with the AIs.
             </div>
         )}

         {/* Input area - disable if not logged in */}
         <div className="w-full max-w-3xl mb-4 self-center flex-shrink-0">
           <input
             ref={inputRef}
             type="text"
             value={inputText}
             onChange={handleInputChange}
             placeholder={canInteract ? "Enter your prompt for the AIs..." : "Please log in to enter a prompt"}
             className="w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm disabled:bg-gray-200 disabled:cursor-not-allowed"
             onKeyDown={(e) => {
               if (e.key === 'Enter' && !isProcessingNew && inputText.trim() !== '' && canInteract) {
                 handleProcessText();
               }
             }}
             disabled={isProcessingNew || !canInteract} // Disable if processing or not logged in
           />
           <button
             onClick={handleProcessText}
             className={`w-full mt-2 p-3 text-white rounded-md font-semibold transition-colors duration-200 ${
               !canInteract || isProcessingNew || inputText.trim() === ''
                 ? 'bg-gray-400 cursor-not-allowed'
                 : 'bg-blue-500 hover:bg-blue-600'
             }`}
             disabled={!canInteract || isProcessingNew || inputText.trim() === ''}
           >
             {isProcessingNew ? 'Processing...' : 'Send to All AIs'}
           </button>
         </div>

         {/* Prompt Display Area */}
         {processedText && canInteract && ( // Only show if logged in and prompt exists
           <div className="w-full max-w-3xl mb-4 self-center bg-gray-50 p-3 rounded border border-gray-200 flex-shrink-0">
             <p className="text-sm font-semibold text-gray-600">Displaying results for prompt:</p>
             <p className="mt-1 text-gray-800">{processedText}</p>
           </div>
         )}

         {/* AI Response Panels Section - Only show if logged in */}
         {showPanels && canInteract && (
           <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-4 self-center flex-grow">
              {/* Panel 1 - Gemini Flash */}
              <div className="p-4 border rounded-lg bg-white shadow-md flex flex-col min-h-[150px]">
                <h2 className="text-xl font-semibold mb-2 text-blue-600 flex-shrink-0">Gemini Flash</h2>
                <div className="flex-grow overflow-y-auto">
                  {geminiFlashLoading && <p className="text-gray-500 animate-pulse">Loading...</p>}
                  {geminiFlashError && <p className="text-red-600">Error: {geminiFlashError}</p>}
                  {!geminiFlashLoading && !geminiFlashError && geminiFlashResponse && (<p className="whitespace-pre-wrap text-gray-800">{geminiFlashResponse}</p>)}
                  {!geminiFlashLoading && !geminiFlashError && !geminiFlashResponse && processedText && (<p className="text-gray-400 italic">No response/error.</p>)}
                  {!processedText && !geminiFlashLoading && (<p className="text-gray-400 italic">Ready.</p>)}
                </div>
              </div>
              {/* Panel 2 - ChatGPT */}
              <div className="p-4 border rounded-lg bg-white shadow-md flex flex-col min-h-[150px]">
                <h2 className="text-xl font-semibold mb-2 text-green-600 flex-shrink-0">ChatGPT</h2>
                 <div className="flex-grow overflow-y-auto">
                    {chatgptLoading && <p className="text-gray-500 animate-pulse">Loading...</p>}
                    {chatgptError && <p className="text-red-600">Error: {chatgptError}</p>}
                    {!chatgptLoading && !chatgptError && chatgptResponse && (<p className="whitespace-pre-wrap text-gray-800">{chatgptResponse}</p>)}
                    {!chatgptLoading && !chatgptError && !chatgptResponse && processedText && (<p className="text-gray-400 italic">No response/error.</p>)}
                    {!processedText && !chatgptLoading && (<p className="text-gray-400 italic">Ready.</p>)}
                 </div>
              </div>
              {/* Panel 3 - Gemini 1.5 Pro */}
               <div className="p-4 border rounded-lg bg-white shadow-md flex flex-col min-h-[150px]">
                 <h2 className="text-xl font-semibold mb-2 text-purple-600 flex-shrink-0">Gemini 1.5 Pro</h2>
                 <div className="flex-grow overflow-y-auto">
                    {geminiProLoading && <p className="text-gray-500 animate-pulse">Loading...</p>}
                    {geminiProError && <p className="text-red-600">Error: {geminiProError}</p>}
                    {!geminiProLoading && !geminiProError && geminiProResponse && (<p className="whitespace-pre-wrap text-gray-800">{geminiProResponse}</p>)}
                    {!geminiProLoading && !geminiProError && !geminiProResponse && processedText && (<p className="text-gray-400 italic">No response/error.</p>)}
                    {!processedText && !geminiProLoading && (<p className="text-gray-400 italic">Ready.</p>)}
                 </div>
               </div>
           </div>
         )}

         {/* Placeholder when panels are not shown or user logged out */}
         {(!showPanels || !canInteract) && !isAuthLoading && ( // Show placeholder if panels hidden OR not logged in (and auth check done)
             <div className="flex-grow flex items-center justify-center text-gray-500">
                {canInteract
                   ? "Enter a prompt above or select from history to see results."
                   : "Log in to start comparing AI responses."
                 }
             </div>
         )}
      </main>
    </div>
  );
}