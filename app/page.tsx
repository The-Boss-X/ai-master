/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
// app/page.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from './context/AuthContext';
import type { InteractionHistoryItem, ConversationMessage } from './types/InteractionHistoryItem'; // Ensure this type includes slots 1-6
import HistorySidebar from './components/HistorySidebar';
import ReactMarkdown from 'react-markdown'; // Use for both user and model
import remarkGfm from 'remark-gfm';

// --- Constants ---
const MIN_SLOTS = 1;
const MAX_SLOTS = 6; // Max slots supported by backend/DB schema

// --- Types ---
interface FetchedSettings {
    slot_1_model: string | null;
    slot_2_model: string | null;
    slot_3_model: string | null;
    slot_4_model: string | null;
    slot_5_model: string | null;
    slot_6_model: string | null;
}

interface AiSlotState {
    modelName: string | null;
    loading: boolean;
    response: string | null;
    error: string | null;
    followUpInput: string;
    conversationHistory: ConversationMessage[];
}

const PANEL_COLORS = [
    { border: 'border-blue-200 dark:border-blue-700/60', text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30', focusRing: 'focus:ring-blue-500', button: 'bg-blue-500 hover:bg-blue-600' },
    { border: 'border-green-200 dark:border-green-700/60', text: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/30', focusRing: 'focus:ring-green-500', button: 'bg-green-500 hover:bg-green-600' },
    { border: 'border-purple-200 dark:border-purple-700/60', text: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/30', focusRing: 'focus:ring-purple-500', button: 'bg-purple-500 hover:bg-purple-600' },
    { border: 'border-orange-200 dark:border-orange-700/60', text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/30', focusRing: 'focus:ring-orange-500', button: 'bg-orange-500 hover:bg-orange-600' },
    { border: 'border-teal-200 dark:border-teal-700/60', text: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/30', focusRing: 'focus:ring-teal-500', button: 'bg-teal-500 hover:bg-teal-600' },
    { border: 'border-pink-200 dark:border-pink-700/60', text: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-50 dark:bg-pink-900/30', focusRing: 'focus:ring-pink-500', button: 'bg-pink-500 hover:bg-pink-600' },
];

export default function Home() {
  // --- State Hooks ---
  const { user, isLoading: isAuthLoading } = useAuth();
  const [mainInputText, setMainInputText] = useState('');
  const [currentChatPrompt, setCurrentChatPrompt] = useState<string | null>(null);
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [uiLocked, setUiLocked] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const initialSlotState: AiSlotState = { modelName: null, loading: false, response: null, error: null, followUpInput: '', conversationHistory: [] };
  const [slotStates, setSlotStates] = useState<AiSlotState[]>([]);
  const [showPanels, setShowPanels] = useState(false);
  const mainInputRef = useRef<HTMLTextAreaElement>(null);
  const [history, setHistory] = useState<InteractionHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [needsLogging, setNeedsLogging] = useState(false);

  // --- Data Fetching Callbacks ---
  const fetchSettings = useCallback(async (isHistorySelected: boolean) => {
    if (!user) {
        setSlotStates([]);
        setSettingsLoading(false);
        return;
    }
    console.log("fetchSettings called, isHistorySelected:", isHistorySelected);
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const response = await fetch('/api/settings/get-settings');
      if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Fetch settings failed (${response.status})`);
      }
      const data: FetchedSettings | null = await response.json();
      console.log("Fetched settings data:", data);

      if (!isHistorySelected) {
          const newSlotStates: AiSlotState[] = [];
          if (data) {
              for (let i = 0; i < MAX_SLOTS; i++) {
                  const modelKey = `slot_${i + 1}_model` as keyof FetchedSettings;
                  if (data[modelKey]) {
                      newSlotStates.push({
                          ...initialSlotState,
                          modelName: data[modelKey] as string,
                      });
                  }
              }
          }
          if (newSlotStates.length === 0) {
              console.log("No models configured in settings, adding one default empty slot.");
              newSlotStates.push({...initialSlotState});
          }
          setSlotStates(newSlotStates);
          console.log(`Home Page: Applied general settings. Active slots: ${newSlotStates.length}`);
      } else {
          console.log("Home Page: History item selected. Skipping settings application to slot states.");
      }
    } catch (e: any) {
        console.error("Error fetching settings:", e);
        setSettingsError(e.message);
        setSlotStates([initialSlotState]);
    }
    finally {
        setSettingsLoading(false);
    }
  }, [user]);

  const fetchHistory = useCallback(async () => {
    if (isAuthLoading || !user) { setHistory([]); setHistoryLoading(false); return; }
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch('/api/get-history');
      if (!response.ok) throw new Error(`Fetch history failed (${response.status})`);
      const data: InteractionHistoryItem[] = await response.json();
      data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setHistory(data);
    } catch (e: any) { setHistoryError(e.message); setHistory([]); }
    finally { setHistoryLoading(false); }
  }, [user, isAuthLoading]);

  // --- Initial Data Fetching Effect ---
  useEffect(() => {
    if (!isAuthLoading && user) {
      console.log("Home Page: Auth loaded. Fetching initial data...");
      fetchSettings(!!selectedHistoryId);
      fetchHistory();
    } else if (!isAuthLoading && !user) {
        setSlotStates([]);
        setHistory([]);
        setSettingsLoading(false);
        setHistoryLoading(false);
        setSelectedHistoryId(null);
        setCurrentChatPrompt(null);
        setShowPanels(false);
    }
  }, [user, isAuthLoading]);

  // Effect to refetch settings when selectedHistoryId becomes null
  useEffect(() => {
      if (!selectedHistoryId && user && !isAuthLoading) {
          console.log("History deselected (New Chat?), fetching settings...");
          fetchSettings(false);
      }
  }, [selectedHistoryId, user, isAuthLoading, fetchSettings]);


  // --- Log ONLY the Initial Interaction ---
  const logInitialInteraction = useCallback(async (promptToLog: string, currentSlotStates: AiSlotState[]) => {
    if (!user || !promptToLog || currentSlotStates.length === 0) return;
    console.log("Home Page: Attempting to log INITIAL interaction...");
    try {
        const buildLogHistory = (prompt: string, finalSlotState: AiSlotState): ConversationMessage[] | null => {
            if (!prompt || !finalSlotState.modelName) return null;
            const logHistory: ConversationMessage[] = [{ role: 'user', content: prompt }];
            if (finalSlotState.response) { logHistory.push({ role: 'model', content: finalSlotState.response }); }
            return logHistory.length > 1 ? logHistory : null;
        };

        const dataToLog: Record<string, any> = {
            prompt: promptToLog,
            title: promptToLog.substring(0, 50) + (promptToLog.length > 50 ? '...' : ''),
        };
        currentSlotStates.forEach((slotState, index) => {
            const slotNum = index + 1;
            const modelKey = `slot_${slotNum}_model_used`;
            const convKey = `slot_${slotNum}_conversation`;
            if (slotState.modelName) {
                dataToLog[modelKey] = slotState.modelName;
                dataToLog[convKey] = buildLogHistory(promptToLog, slotState);
            } else {
                 dataToLog[modelKey] = null;
                 dataToLog[convKey] = null;
            }
        });
        for (let i = currentSlotStates.length; i < MAX_SLOTS; i++) {
             const slotNum = i + 1;
             dataToLog[`slot_${slotNum}_model_used`] = null;
             dataToLog[`slot_${slotNum}_conversation`] = null;
        }

        const response = await fetch('/api/log-interaction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dataToLog) });
        const result = await response.json().catch(() => ({ success: false, error: 'Invalid JSON response' }));
        if (!response.ok || !result?.success || !result.loggedData?.[0]) {
            console.error('Home Page: Failed to log interaction:', result?.error);
        } else {
            const newLogEntry = result.loggedData[0] as InteractionHistoryItem;
            if (newLogEntry?.id) {
                setHistory(prev => [newLogEntry, ...prev.filter(h => h.id !== newLogEntry.id)]);
                setSelectedHistoryId(newLogEntry.id);
            } else {
                fetchHistory();
            }
        }
    } catch (error) {
        console.error('Home Page: Error calling logging API:', error);
    }
  }, [ user, fetchHistory ]);

  // --- useEffect to Trigger Logging After Initial AI Calls Complete ---
  useEffect(() => {
    const anySlotLoading = slotStates.some(slot => slot.loading);
    if (needsLogging && currentChatPrompt && slotStates.length > 0 && !anySlotLoading) {
      console.log("Home Page: All slots finished, triggering log for initial interaction.");
      logInitialInteraction(currentChatPrompt, slotStates);
      setNeedsLogging(false);
    }
  }, [ slotStates, needsLogging, currentChatPrompt, logInitialInteraction ]);


  // --- Handle Clicking a History Item ---
  const handleHistoryClick = useCallback((item: InteractionHistoryItem) => {
    if (!user || uiLocked) return;
    console.log("Home Page: handleHistoryClick triggered for item:", item.id);
    setUiLocked(true);
    setSelectedHistoryId(item.id);
    setCurrentChatPrompt(item.prompt);
    setLastSubmittedPrompt(null);
    setMainInputText('');
    setNeedsLogging(false);
    setShowPanels(false);

    const newSlotStates: AiSlotState[] = [];
    for (let i = 0; i < MAX_SLOTS; i++) {
        const slotNum = i + 1;
        const modelKey = `slot_${slotNum}_model_used` as keyof InteractionHistoryItem;
        const conversationKey = `slot_${slotNum}_conversation` as keyof InteractionHistoryItem;

        if (item[modelKey]) {
            const conversationHistory = (item[conversationKey] as ConversationMessage[] | null) || [];
            newSlotStates.push({
                ...initialSlotState,
                modelName: item[modelKey] as string | null,
                response: conversationHistory.findLast(m => m.role === 'model')?.content || null,
                conversationHistory: conversationHistory,
            });
        }
    }
     if (newSlotStates.length === 0) {
         console.warn(`History item ${item.id} resulted in zero active slots. Adding one empty slot.`);
         newSlotStates.push({...initialSlotState});
     }

    console.log(`Home Page: Prepared ${newSlotStates.length} slot states from history item ${item.id}.`);
    setSlotStates(newSlotStates);
    setTimeout(() => {
        setShowPanels(true);
        setUiLocked(false);
        console.log(`Home Page: State updated for history item ${item.id}.`);
    }, 50);

  }, [user, uiLocked]);

    // --- Handle "New Chat" Button Click ---
   const handleNewChat = useCallback(() => {
     if (!user || uiLocked) return;
     console.log("Home Page: Starting New Chat");
     setUiLocked(true);
     setSelectedHistoryId(null);
     setCurrentChatPrompt(null);
     setLastSubmittedPrompt(null);
     setMainInputText('');
     setShowPanels(false);
     setNeedsLogging(false);
     setSlotStates([]);
     mainInputRef.current?.focus();
     setTimeout(() => setUiLocked(false), 100);
   }, [user, uiLocked]);

    // --- Handle Update Title & Delete Item --- (No changes needed)
    const handleUpdateTitle = useCallback(async (id: string, newTitle: string): Promise<boolean> => {
        if (!user) return false;
        try { const response = await fetch('/api/update-history-title', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title: newTitle }) }); const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || 'Failed to update title'); setHistory(prev => prev.map(item => item.id === id ? { ...item, title: newTitle } : item)); return true; } catch (error: any) { setHistoryError(`Update failed: ${error.message}`); return false; }
    }, [user]);
    const handleDeleteItem = useCallback(async (id: string): Promise<boolean> => {
        if (!user) return false;
        try { const response = await fetch('/api/delete-history-item', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || 'Failed to delete item'); setHistory(prev => prev.filter(item => item.id !== id)); if (selectedHistoryId === id) handleNewChat(); return true; } catch (error: any) { setHistoryError(`Delete failed: ${error.message}`); return false; }
    }, [user, selectedHistoryId, handleNewChat]);

     // --- Helper Function to Call AI API & Append Conversation ---
     const callApiForSlot = useCallback(async (
         slotIndex: number,
         modelString: string | null,
         promptToSend: string,
         currentHistory: ConversationMessage[],
         currentInteractionId: string | null
     ) => {
         const slotNumber = slotIndex + 1;

         const updateSlotState = (updateFn: (prevState: AiSlotState) => AiSlotState) => {
             setSlotStates(prevStates =>
                 prevStates.map((state, index) =>
                     index === slotIndex ? updateFn(state) : state
                 )
             );
         };

         if (!modelString || !promptToSend) {
             updateSlotState(prev => ({ ...prev, loading: false }));
             return;
         }

         const newUserMessage: ConversationMessage = { role: 'user', content: promptToSend };
         const historyToSend = [...currentHistory, newUserMessage];

         updateSlotState(prev => ({ ...prev, loading: true, response: null, error: null, conversationHistory: historyToSend }));

         let modelResponseText: string | null = null;
         try {
             const parts = modelString.split(': '); if (parts.length !== 2) throw new Error(`Invalid model format: ${modelString}`);
             const provider = parts[0]; const specificModel = parts[1];
             let apiUrl = '';
             if (provider === 'ChatGPT') apiUrl = '/api/call-openai';
             else if (provider === 'Gemini') apiUrl = '/api/call-gemini';
             else throw new Error(`Unsupported provider: ${provider}`);

             const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: promptToSend, model: specificModel, slotNumber, conversationHistory: historyToSend }) });
             const result = await response.json(); if (!response.ok) throw new Error(result.error || `API call failed (${response.status})`);

             modelResponseText = result.response;
             const newModelMessage: ConversationMessage = { role: 'model', content: modelResponseText! };

             updateSlotState(prev => ({ ...prev, response: modelResponseText, error: null, loading: false, conversationHistory: [...historyToSend, newModelMessage] }));

             if (currentInteractionId && modelResponseText) {
                 console.log(`Attempting to append turn to DB for interaction ${currentInteractionId}, slot ${slotNumber}`);
                 fetch('/api/append-conversation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interactionId: currentInteractionId, slotNumber: slotNumber, newUserMessage: newUserMessage, newModelMessage: newModelMessage }) })
                    .then(async appendResponse => {
                        if (!appendResponse.ok) { const appendError = await appendResponse.json().catch(() => ({})); console.error(`Failed to append conversation turn for slot ${slotNumber}:`, appendError.error || `Status ${appendResponse.status}`); }
                        else { console.log(`Successfully appended turn for slot ${slotNumber} to interaction ${currentInteractionId}`); }
                    })
                    .catch(appendErr => console.error(`Error calling append-conversation API for slot ${slotNumber}:`, appendErr));
             }
         } catch (error: any) {
              updateSlotState(prev => ({ ...prev, response: null, error: error.message || 'Unknown error', loading: false, conversationHistory: historyToSend }));
         }
     }, []);

  // --- Handle Processing New Prompt / Main Follow-up ---
  const handleProcessText = useCallback(async () => {
    const currentInput = mainInputText.trim();
    const activeSlots = slotStates.filter(s => s.modelName);
    if (currentInput === '' || !user || isAuthLoading || settingsLoading || activeSlots.length === 0) return;

    const isFirstPromptOfChat = !selectedHistoryId;
    if (isFirstPromptOfChat) {
        setCurrentChatPrompt(currentInput);
        setNeedsLogging(true);
        setSlotStates(prevStates => prevStates.map(s => s.modelName ? { ...s, conversationHistory: [] } : s));
    } else {
        setNeedsLogging(false);
    }

    setLastSubmittedPrompt(currentInput);
    setShowPanels(true);
    if (mainInputRef.current) mainInputRef.current.blur();
    setMainInputText('');

    setSlotStates(prevStates => prevStates.map(s => ({ ...s, loading: false, response: null, error: null })));

    console.log(`Home Page: Processing ${isFirstPromptOfChat ? 'initial' : 'follow-up'} prompt: "${currentInput}" for ${activeSlots.length} active slots`);

    const currentInteractionIdForUpdate = selectedHistoryId;
    const stateForCalls = [...slotStates];

    const promises = stateForCalls.map((slotState, index) => {
        if (slotState.modelName) {
            const historyForCall = isFirstPromptOfChat ? [] : slotState.conversationHistory;
            return callApiForSlot(
                index,
                slotState.modelName,
                currentInput,
                historyForCall,
                currentInteractionIdForUpdate
            );
        }
        return Promise.resolve();
    });

    Promise.allSettled(promises).then(() => {
        console.log("Home Page: All main API calls initiated.");
    });

  }, [ mainInputText, user, isAuthLoading, settingsLoading, selectedHistoryId, slotStates, callApiForSlot ]);


    // --- Handle Individual Follow-up Replies ---
    const handleReplyToSlot = useCallback((slotIndex: number) => {
        if (uiLocked) return;
        const targetState = slotStates[slotIndex];
        if (!targetState) return;

        const followUpPrompt = targetState.followUpInput.trim();
        if (!followUpPrompt || !targetState.modelName || !user || !selectedHistoryId) {
            if (!selectedHistoryId) console.warn("Cannot send individual reply: No history item selected.");
            return;
        }

        console.log(`Home Page: Sending follow-up to Slot ${slotIndex + 1} (${targetState.modelName}): "${followUpPrompt}"`);
        setLastSubmittedPrompt(followUpPrompt);
        setNeedsLogging(false);

        setSlotStates(prevStates =>
            prevStates.map((state, index) =>
                index === slotIndex ? { ...state, followUpInput: '' } : state
            )
        );

        callApiForSlot(
            slotIndex,
            targetState.modelName,
            followUpPrompt,
            targetState.conversationHistory,
            selectedHistoryId
        );
    }, [user, slotStates, callApiForSlot, selectedHistoryId, uiLocked]);


  // --- Determine Overall UI State ---
  const isProcessingAny = slotStates.some(slot => slot.loading);
  const canInteract = !!user && !isAuthLoading && !settingsLoading && !uiLocked;

  // --- Helper to get Display Name ---
  const getModelDisplayName = (modelString: string | null): string => { if (!modelString) return "Slot Empty"; return modelString; };

  // --- Dynamic Grid Class ---
  const getGridColsClass = (count: number): string => {
      if (count <= 1) return 'grid-cols-1';
      if (count === 2) return 'grid-cols-1 md:grid-cols-2';
      if (count === 3) return 'grid-cols-1 md:grid-cols-3';
      if (count === 4) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4';
      if (count === 5) return 'grid-cols-1 md:grid-cols-3 lg:grid-cols-5';
      if (count >= 6) return 'grid-cols-1 md:grid-cols-3 lg:grid-cols-3';
      return 'grid-cols-1 md:grid-cols-3';
  };


  // --- Render Component JSX ---
  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* History Sidebar */}
      <HistorySidebar history={history} historyLoading={historyLoading || isAuthLoading} historyError={historyError} selectedHistoryId={selectedHistoryId} handleHistoryClick={handleHistoryClick} fetchHistory={fetchHistory} onUpdateTitle={handleUpdateTitle} onDeleteItem={handleDeleteItem} isLoggedIn={!!user} handleNewChat={handleNewChat} />
      {/* Main Content Area */}
      <main className="relative flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
        {/* Loading Overlay ONLY for transitions/auth/settings load */}
        {(uiLocked || settingsLoading || isAuthLoading) && (
            <div className="absolute inset-0 bg-gray-400/30 dark:bg-gray-900/50 flex items-center justify-center z-50">
                <svg className="animate-spin h-8 w-8 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
            </div>
        )}

        {/* Top Bar */}
        <div className="w-full max-w-7xl mb-4 self-center flex justify-between items-center px-1 h-5 flex-shrink-0">
             <div className="text-sm text-red-500"> {settingsError && `Settings Error: ${settingsError}`} </div>
             {user && !isAuthLoading && ( <Link href="/settings" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline"> ⚙️ Settings </Link> )}
             {!user && !isAuthLoading && <div className="h-5"></div>}
         </div>
        {/* Login Prompt */}
        {!user && !isAuthLoading && ( <div className="w-full max-w-3xl mb-6 self-center p-4 bg-yellow-100 border rounded-md text-center text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-100 dark:border-yellow-700"> Please <Link href="/auth" className="font-semibold underline hover:text-yellow-900 dark:hover:text-yellow-200">Sign In or Sign Up</Link>... </div> )}
        {/* Main Input Area */}
        <div className="w-full max-w-3xl mb-4 self-center flex-shrink-0 px-1">
          <textarea
            ref={mainInputRef}
            rows={1}
            value={mainInputText}
            onChange={(e) => setMainInputText(e.target.value)}
            placeholder={
                !user ? "Please log in" :
                settingsLoading ? "Loading settings..." :
                slotStates.length === 0 ? "No slots configured. Go to Settings." :
                selectedHistoryId ? "Send follow-up to all..." :
                "Enter initial prompt..."
            }
            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 shadow-sm disabled:bg-gray-200 dark:disabled:bg-gray-700/50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 resize-none overflow-y-auto min-h-[44px] max-h-[128px]" style={{ height: 'auto' }} onInput={(e) => { const target = e.target as HTMLTextAreaElement; target.style.height = 'auto'; target.style.height = `${target.scrollHeight}px`; }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !isProcessingAny && mainInputText.trim() !== '' && canInteract) { e.preventDefault(); handleProcessText(); } }}
            disabled={!canInteract || isProcessingAny || slotStates.length === 0}
          />
          <button
            onClick={handleProcessText}
            className={`w-full mt-2 p-3 text-white rounded-md font-semibold transition-colors duration-200 ${ !canInteract || isProcessingAny || mainInputText.trim() === '' || slotStates.filter(s => s.modelName).length === 0 ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600' }`}
            disabled={!canInteract || isProcessingAny || mainInputText.trim() === '' || slotStates.filter(s => s.modelName).length === 0}
          >
              {isProcessingAny ? 'Processing...' : (selectedHistoryId) ? 'Send Follow-up' : 'Send Initial Prompt'}
          </button>
        </div>

        {/* AI Response Panels Section */}
                {/* Show panels if user logged in, not loading settings, AND (either panels explicitly shown OR there's a selected history item) */}
                {user && !settingsLoading && (showPanels || selectedHistoryId) && slotStates.length > 0 && (
                    <div className={`w-full max-w-7xl grid ${getGridColsClass(slotStates.length)} gap-4 self-center flex-grow px-1 pb-4 overflow-hidden`}>
                        {slotStates.map((slotState, index) => {
                            const colors = PANEL_COLORS[index % PANEL_COLORS.length];
                            const isSlotProcessing = slotState.loading;
                            const hasModel = !!slotState.modelName;

                            // Render panel only if it has a model OR if we are showing panels generally (to show empty slots)
                            if (!hasModel && !showPanels) return null;

                            return (
                                <div key={`panel-${index}`} className={`border rounded-lg bg-white dark:bg-gray-800 shadow-md flex flex-col min-h-[250px] ${colors.border} overflow-hidden ${!hasModel ? 'opacity-60 pointer-events-none' : ''}`}>
                                    {/* Panel Header */}
                                    <h2 className={`text-lg md:text-xl font-semibold p-4 pb-2 ${colors.text} flex-shrink-0 truncate border-b dark:border-gray-700`} title={slotState.modelName || `Slot ${index + 1}`}>
                                        {getModelDisplayName(slotState.modelName)} (Slot {index + 1})
                                    </h2>

                                    {/* Conversation Area */}
                                    <div className="flex-grow overflow-y-auto text-sm p-4 space-y-3 custom-scrollbar">
                                        {!hasModel && <p className="text-gray-400 dark:text-gray-500 italic text-center mt-4">Slot empty.</p>}
                                        {hasModel && slotState.conversationHistory && slotState.conversationHistory.map((msg, msgIndex) => (
                                            <div key={`${selectedHistoryId || 'new'}-${index}-${msgIndex}`}
                                                // Apply base styles and conditional background/text color + whitespace
                                                className={`max-w-none p-2 rounded-md max-w-[90%] whitespace-pre-wrap ${ // Apply pre-wrap to parent
                                                    msg.role === 'user'
                                                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 ml-auto' // User messages align right
                                                    : `${colors.bg} ${colors.text.split(' ')[0]} dark:${colors.text.split(' ')[1]} mr-auto` // Model messages align left
                                                }`}>
                                                {/* Use ReactMarkdown for BOTH user and model messages */}
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    // Ensure paragraphs within markdown don't add extra bottom margin
                                                    components={{
                                                        p: ({node, ...props}) => <p className="mb-0" {...props} />
                                                    }}
                                                >
                                                    {msg.content}
                                                </ReactMarkdown>
                                            </div>
                                        ))}
                                        {/* Loading/Error indicators */}
                                        {hasModel && isSlotProcessing && <p className="text-gray-500 dark:text-gray-400 animate-pulse mt-2 p-2">Loading...</p>}
                                        {hasModel && slotState.error && <p className="text-red-600 dark:text-red-400 mt-2 p-2">Error: {slotState.error}</p>}
                                    </div>

                                    {/* Follow-up Input Area - Show only if model exists and a chat is active */}
                                    {hasModel && (selectedHistoryId || currentChatPrompt) && (
                                        <div className="mt-auto p-4 pt-2 border-t dark:border-gray-600 flex items-end space-x-2 flex-shrink-0"> {/* Use items-end */}
                                            {/* *** MODIFIED: Changed input to textarea *** */}
                                            <textarea
                                                rows={1} // Start with 1 row
                                                value={slotState.followUpInput}
                                                onChange={(e) => setSlotStates(prev => prev.map((s, i) => i === index ? { ...s, followUpInput: e.target.value } : s))}
                                                placeholder={`Reply...`}
                                                className={`flex-grow p-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 ${colors.focusRing} focus:outline-none disabled:bg-gray-200 dark:disabled:bg-gray-700/50 resize-none overflow-y-auto min-h-[40px] max-h-[100px]`} // Added min/max height, resize-none
                                                style={{ height: 'auto' }} // Allow auto height
                                                onInput={(e) => { // Auto-resize logic
                                                    const target = e.target as HTMLTextAreaElement;
                                                    target.style.height = 'auto';
                                                    target.style.height = `${target.scrollHeight}px`;
                                                }}
                                                onKeyDown={(e) => { // Submit on Enter (not Shift+Enter)
                                                    if (e.key === 'Enter' && !e.shiftKey && !isSlotProcessing && slotState.followUpInput.trim() && canInteract) {
                                                        e.preventDefault();
                                                        handleReplyToSlot(index);
                                                    }
                                                }}
                                                disabled={!canInteract || isSlotProcessing}
                                            />
                                            <button
                                                onClick={() => handleReplyToSlot(index)}
                                                disabled={!canInteract || isSlotProcessing || !slotState.followUpInput.trim()}
                                                className={`px-3 py-2 ${colors.button} text-white text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 self-end mb-[1px]`} // Align button nicely with textarea
                                                title={`Send follow-up to ${getModelDisplayName(slotState.modelName)}`}>
                                                {isSlotProcessing ? '...' : 'Send'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Placeholder when no panels are shown */}
                {(!user || (!showPanels && !selectedHistoryId && !settingsLoading) || (slotStates.length === 0 && !settingsLoading)) && (
                     <div className="flex-grow flex items-center justify-center text-gray-500 dark:text-gray-400 text-center px-4">
                        {
                            !user ? "Please log in to start chatting." :
                            settingsLoading ? "Loading configuration..." :
                            slotStates.filter(s => s.modelName).length === 0 ? "No active AI models configured. Please visit Settings." :
                            "Click 'New Chat' or select an item from history to begin."
                         }
                     </div>
                 )}
            </main>
        </div>
    );
}