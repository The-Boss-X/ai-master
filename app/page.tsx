/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
// app/page.tsx
'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from './context/AuthContext';
// Import types, including ConversationMessage
import type { InteractionHistoryItem, ConversationMessage } from './types/InteractionHistoryItem';
import HistorySidebar from './components/HistorySidebar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Define the structure for data fetched from backend settings API
interface FetchedSettings {
    slot_1_model: string | null;
    slot_2_model: string | null;
    slot_3_model: string | null;
}

// Define structure for AI Slot state, including conversation history
interface AiSlotState {
    modelName: string | null;
    loading: boolean;
    response: string | null; // Last response text (can be derived from history)
    error: string | null;
    followUpInput: string;
    conversationHistory: ConversationMessage[]; // Array to store the chat history
}

export default function Home() {
  // --- State Hooks ---
  const { user, isLoading: isAuthLoading } = useAuth();
  const [mainInputText, setMainInputText] = useState('');
  const [currentChatPrompt, setCurrentChatPrompt] = useState<string | null>(null);
  const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const initialSlotState: AiSlotState = { modelName: null, loading: false, response: null, error: null, followUpInput: '', conversationHistory: [] };
  const [slot1State, setSlot1State] = useState<AiSlotState>({ ...initialSlotState });
  const [slot2State, setSlot2State] = useState<AiSlotState>({ ...initialSlotState });
  const [slot3State, setSlot3State] = useState<AiSlotState>({ ...initialSlotState });
  const [showPanels, setShowPanels] = useState(false);
  const mainInputRef = useRef<HTMLTextAreaElement>(null);
  const [history, setHistory] = useState<InteractionHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [needsLogging, setNeedsLogging] = useState(false);

  // --- Data Fetching Callbacks ---
  // Fetch settings - only apply if not viewing history
  const fetchSettings = useCallback(async (isHistorySelected: boolean) => {
    if (!user) {
        setSlot1State(prev => ({ ...prev, modelName: null, conversationHistory: [] }));
        setSlot2State(prev => ({ ...prev, modelName: null, conversationHistory: [] }));
        setSlot3State(prev => ({ ...prev, modelName: null, conversationHistory: [] }));
        setSettingsLoading(false);
        return;
    }
    setSettingsLoading(true); setSettingsError(null);
    try {
      const response = await fetch('/api/settings/get-settings');
      if (!response.ok) throw new Error(`Fetch settings failed (${response.status})`);
      const data: FetchedSettings | null = await response.json();
      // Only update model names if NO history item is selected
      if (!isHistorySelected) {
          setSlot1State(prev => ({ ...prev, modelName: data?.slot_1_model || null }));
          setSlot2State(prev => ({ ...prev, modelName: data?.slot_2_model || null }));
          setSlot3State(prev => ({ ...prev, modelName: data?.slot_3_model || null }));
          console.log("Home Page: Fetched and applied general settings (no history selected):", data);
      } else {
           console.log("Home Page: Fetched settings, but history item selected. Skipping modelName update.", data);
      }
    } catch (e: any) { setSettingsError(e.message); }
    finally { setSettingsLoading(false); }
  }, [user]); // Depend only on user

  // Fetch history list
  const fetchHistory = useCallback(async () => {
    if (isAuthLoading || !user) { setHistory([]); setHistoryLoading(false); return; }
    setHistoryLoading(true); setHistoryError(null);
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
  // Runs only when auth state is resolved (isAuthLoading is false) or user changes
  useEffect(() => {
    if (!isAuthLoading) {
      console.log("Home Page: Auth loaded. Fetching initial data...");
      // Pass the current value of selectedHistoryId directly
      fetchSettings(!!selectedHistoryId);
      fetchHistory();
    }
  }, [user, isAuthLoading, fetchSettings, fetchHistory, selectedHistoryId]); // Include selectedHistoryId here

  // --- Log ONLY the Initial Interaction ---
  const logInitialInteraction = useCallback(async (promptToLog: string, slot1Result: AiSlotState, slot2Result: AiSlotState, slot3Result: AiSlotState) => {
    if (!user || !promptToLog) return;
    console.log("Home Page: Attempting to log INITIAL interaction...");
    try {
       const buildLogHistory = (prompt: string, finalSlotState: AiSlotState): ConversationMessage[] | null => {
          if (!prompt) return null;
          const logHistory: ConversationMessage[] = [{ role: 'user', content: prompt }];
          if (finalSlotState.response) { logHistory.push({ role: 'model', content: finalSlotState.response }); }
          return logHistory.length > 0 ? logHistory : null;
       };
      const dataToLog = {
        prompt: promptToLog, title: promptToLog.substring(0, 50) + (promptToLog.length > 50 ? '...' : ''),
        slot_1_model_used: slot1Result.modelName, slot_2_model_used: slot2Result.modelName, slot_3_model_used: slot3Result.modelName,
        slot_1_conversation: buildLogHistory(promptToLog, slot1Result),
        slot_2_conversation: buildLogHistory(promptToLog, slot2Result),
        slot_3_conversation: buildLogHistory(promptToLog, slot3Result),
      };
      const response = await fetch('/api/log-interaction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dataToLog) });
      const result = await response.json().catch(() => ({ success: false, error: 'Invalid JSON response' }));
      if (!response.ok || !result?.success || !result.loggedData?.[0]) console.error('Home Page: Failed to log interaction:', result?.error);
      else {
        const newLogEntry = result.loggedData[0] as InteractionHistoryItem;
        if (newLogEntry?.id) { setHistory(prev => [newLogEntry, ...prev]); setSelectedHistoryId(newLogEntry.id); }
        else fetchHistory(); // Refetch if needed
      }
    } catch (error) { console.error('Home Page: Error calling logging API:', error); }
  }, [ user, fetchHistory ]);

  // --- useEffect to Trigger Logging After Initial AI Calls Complete ---
  useEffect(() => {
    const allSlotsFinished = !slot1State.loading && !slot2State.loading && !slot3State.loading;
    if (allSlotsFinished && needsLogging && currentChatPrompt) {
      console.log("Home Page: All slots finished, triggering log for initial interaction.");
      logInitialInteraction(currentChatPrompt, slot1State, slot2State, slot3State);
      setNeedsLogging(false); // Reset flag
    }
  }, [ slot1State.loading, slot2State.loading, slot3State.loading, needsLogging, currentChatPrompt, logInitialInteraction, slot1State, slot2State, slot3State ]);


  // --- Handle Clicking a History Item ---
  const handleHistoryClick = (item: InteractionHistoryItem) => {
    if (!user) return;
    console.log("Home Page: handleHistoryClick triggered for item:", item.id);
    console.log("Home Page: Clicked history item data from API:", JSON.stringify(item, null, 2));

    // Set the state *synchronously* based on the clicked item
    setCurrentChatPrompt(item.prompt);
    setLastSubmittedPrompt(null);
    setMainInputText('');
    setNeedsLogging(false); // Not a new interaction

    // Directly use the conversation data from the item
    const history1 = item.slot_1_conversation || [];
    const history2 = item.slot_2_conversation || [];
    const history3 = item.slot_3_conversation || [];

    setSlot1State({
        modelName: item.slot_1_model_used || null,
        response: history1.findLast(m => m.role === 'model')?.content || null,
        error: null, loading: false, followUpInput: '',
        conversationHistory: history1
    });
    setSlot2State({
        modelName: item.slot_2_model_used || null,
        response: history2.findLast(m => m.role === 'model')?.content || null,
        error: null, loading: false, followUpInput: '',
        conversationHistory: history2
    });
    setSlot3State({
        modelName: item.slot_3_model_used || null,
        response: history3.findLast(m => m.role === 'model')?.content || null,
        error: null, loading: false, followUpInput: '',
        conversationHistory: history3
    });

    setShowPanels(true);
    setSelectedHistoryId(item.id); // Set selected ID *last*
    console.log(`Home Page: State updated for history item ${item.id}. History lengths: S1=${history1.length}, S2=${history2.length}, S3=${history3.length}`);
  };

   // --- Handle "New Chat" Button Click ---
   const handleNewChat = useCallback(() => {
     if (!user) return;
     console.log("Home Page: Starting New Chat");
     setSelectedHistoryId(null); setCurrentChatPrompt(null); setLastSubmittedPrompt(null);
     setMainInputText(''); setShowPanels(false); setNeedsLogging(false);
     setSlot1State({ ...initialSlotState }); setSlot2State({ ...initialSlotState }); setSlot3State({ ...initialSlotState });
     fetchSettings(false); // Fetch settings for the new chat state (pass false explicitly)
     mainInputRef.current?.focus();
   }, [user, fetchSettings]);

   // --- Handle Update Title & Delete Item ---
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
        slotNumber: 1 | 2 | 3, modelString: string | null, promptToSend: string,
        currentHistory: ConversationMessage[], setState: React.Dispatch<React.SetStateAction<AiSlotState>>,
        currentInteractionId: string | null
    ) => {
        if (!modelString || !promptToSend) { setState(prev => ({ ...prev, loading: false })); return; }
        const newUserMessage: ConversationMessage = { role: 'user', content: promptToSend };
        const historyToSend = [...currentHistory, newUserMessage];
        setState(prev => ({ ...prev, loading: true, response: null, error: null, conversationHistory: historyToSend }));
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
            setState(prev => ({ ...prev, response: modelResponseText, error: null, loading: false, conversationHistory: [...historyToSend, newModelMessage] }));
            if (currentInteractionId && modelResponseText) {
                console.log(`Attempting to append turn to DB for interaction ${currentInteractionId}, slot ${slotNumber}`);
                try {
                    const appendResponse = await fetch('/api/append-conversation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interactionId: currentInteractionId, slotNumber: slotNumber, newUserMessage: newUserMessage, newModelMessage: newModelMessage }) });
                    if (!appendResponse.ok) { const appendError = await appendResponse.json().catch(() => ({})); console.error(`Failed to append conversation turn for slot ${slotNumber}:`, appendError.error || `Status ${appendResponse.status}`); }
                    else { console.log(`Successfully appended turn for slot ${slotNumber} to interaction ${currentInteractionId}`); }
                } catch (appendErr) { console.error(`Error calling append-conversation API for slot ${slotNumber}:`, appendErr); }
            }
        } catch (error: any) { setState(prev => ({ ...prev, response: null, error: error.message || 'Unknown error', loading: false, conversationHistory: historyToSend })); }
    }, []);

  // --- Handle Processing New Prompt / Main Follow-up ---
  const handleProcessText = useCallback(async () => {
    const currentInput = mainInputText.trim();
    if (currentInput === '' || !user || isAuthLoading || settingsLoading) return;
    const isFirstPromptOfChat = !selectedHistoryId; // Simplified check: if no history selected, it's new
    if (isFirstPromptOfChat) { setCurrentChatPrompt(currentInput); setNeedsLogging(true); setSlot1State(prev => ({ ...prev, conversationHistory: [] })); setSlot2State(prev => ({ ...prev, conversationHistory: [] })); setSlot3State(prev => ({ ...prev, conversationHistory: [] })); }
    else { setNeedsLogging(false); }
    setLastSubmittedPrompt(currentInput); setShowPanels(true); if (mainInputRef.current) mainInputRef.current.blur(); setMainInputText('');
    setSlot1State(prev => ({ ...prev, loading: false, response: null, error: null })); setSlot2State(prev => ({ ...prev, loading: false, response: null, error: null })); setSlot3State(prev => ({ ...prev, loading: false, response: null, error: null }));
    console.log(`Home Page: Processing ${isFirstPromptOfChat ? 'initial' : 'follow-up'} prompt: "${currentInput}"`);
    const stateBeforeCalls = { s1: slot1State, s2: slot2State, s3: slot3State };
    const currentInteractionIdForUpdate = selectedHistoryId;
    const promises = [
        callApiForSlot(1, stateBeforeCalls.s1.modelName, currentInput, stateBeforeCalls.s1.conversationHistory, setSlot1State, currentInteractionIdForUpdate),
        callApiForSlot(2, stateBeforeCalls.s2.modelName, currentInput, stateBeforeCalls.s2.conversationHistory, setSlot2State, currentInteractionIdForUpdate),
        callApiForSlot(3, stateBeforeCalls.s3.modelName, currentInput, stateBeforeCalls.s3.conversationHistory, setSlot3State, currentInteractionIdForUpdate)
    ];
    await Promise.allSettled(promises);
    console.log("Home Page: All main API calls settled.");
  }, [ mainInputText, user, isAuthLoading, settingsLoading, selectedHistoryId, currentChatPrompt, slot1State, slot2State, slot3State, callApiForSlot, logInitialInteraction ]);

   // --- Handle Individual Follow-up Replies ---
   const handleReplyToSlot = useCallback((slotNumber: 1 | 2 | 3) => {
        let targetState: AiSlotState; let setState: React.Dispatch<React.SetStateAction<AiSlotState>>;
        if (slotNumber === 1) { targetState = slot1State; setState = setSlot1State; }
        else if (slotNumber === 2) { targetState = slot2State; setState = setSlot2State; }
        else { targetState = slot3State; setState = setSlot3State; }
        const followUpPrompt = targetState.followUpInput.trim();
        if (!followUpPrompt || !targetState.modelName || !user || !selectedHistoryId) { if (!selectedHistoryId) console.warn("Cannot send individual reply: No history item selected."); return; }
        console.log(`Home Page: Sending follow-up to Slot ${slotNumber} (${targetState.modelName}): "${followUpPrompt}"`);
        setLastSubmittedPrompt(followUpPrompt); setNeedsLogging(false);
        setState(prev => ({ ...prev, followUpInput: '' }));
        callApiForSlot(slotNumber, targetState.modelName, followUpPrompt, targetState.conversationHistory, setState, selectedHistoryId);
   }, [user, slot1State, slot2State, slot3State, callApiForSlot, selectedHistoryId]);


  // --- Determine Overall UI State ---
  const isProcessingSlot1 = slot1State.loading; const isProcessingSlot2 = slot2State.loading; const isProcessingSlot3 = slot3State.loading;
  const isProcessingAny = isProcessingSlot1 || isProcessingSlot2 || isProcessingSlot3;
  const canInteract = !!user && !isAuthLoading && !settingsLoading;

  // --- Helper to get Display Name ---
  const getModelDisplayName = (modelString: string | null): string => { if (!modelString) return "Slot Empty"; return modelString; };

  // --- Render Component JSX ---
  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* History Sidebar */}
      <HistorySidebar history={history} historyLoading={historyLoading || isAuthLoading} historyError={historyError} selectedHistoryId={selectedHistoryId} handleHistoryClick={handleHistoryClick} fetchHistory={fetchHistory} onUpdateTitle={handleUpdateTitle} onDeleteItem={handleDeleteItem} isLoggedIn={!!user} handleNewChat={handleNewChat} />
      {/* Main Content Area */}
      <main className="relative flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
        {/* Top Bar */}
        <div className="w-full max-w-7xl mb-4 self-center flex justify-between items-center px-1 h-5 flex-shrink-0">
             <div className="text-sm text-red-500"> {settingsError && `Settings Error: ${settingsError}`} </div>
             {user && !isAuthLoading && !settingsLoading && ( <Link href="/settings" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline"> ⚙️ Settings </Link> )}
             {!user && !isAuthLoading && <div className="h-5"></div>}
         </div>
        {/* Login Prompt */}
        {!user && !isAuthLoading && ( <div className="w-full max-w-3xl mb-6 self-center p-4 bg-yellow-100 border rounded-md text-center text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-100 dark:border-yellow-700"> Please <Link href="/auth" className="font-semibold underline hover:text-yellow-900 dark:hover:text-yellow-200">Sign In or Sign Up</Link>... </div> )}
        {/* Main Input Area */}
        <div className="w-full max-w-3xl mb-4 self-center flex-shrink-0 px-1">
          <textarea ref={mainInputRef} rows={1} value={mainInputText} onChange={(e) => setMainInputText(e.target.value)} placeholder={ canInteract ? (selectedHistoryId) ? "Send follow-up to all..." : "Enter initial prompt..." : (isAuthLoading || settingsLoading) ? "Loading..." : "Please log in" } className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 shadow-sm disabled:bg-gray-200 dark:disabled:bg-gray-700/50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 resize-none overflow-y-auto min-h-[44px] max-h-[128px]" style={{ height: 'auto' }} onInput={(e) => { const target = e.target as HTMLTextAreaElement; target.style.height = 'auto'; target.style.height = `${target.scrollHeight}px`; }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !isProcessingAny && mainInputText.trim() !== '' && canInteract) { e.preventDefault(); handleProcessText(); } }} disabled={isProcessingAny || !canInteract} />
          <button onClick={handleProcessText} className={`w-full mt-2 p-3 text-white rounded-md font-semibold transition-colors duration-200 ${ !canInteract || isProcessingAny || mainInputText.trim() === '' ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600' }`} disabled={!canInteract || isProcessingAny || mainInputText.trim() === ''}> {isProcessingAny ? 'Processing...' : (selectedHistoryId) ? 'Send Follow-up' : 'Send Initial Prompt'} </button>
        </div>
        {/* AI Response Panels Section */}
        {showPanels && canInteract && (
          <div className="w-full max-w-7xl grid grid-cols-1 md:grid-cols-3 gap-4 self-center flex-grow px-1 pb-4 overflow-hidden">
            {/* Panel 1 */}
            <div className={`border rounded-lg bg-white dark:bg-gray-800 shadow-md flex flex-col min-h-[250px] border-gray-200 dark:border-gray-700 overflow-hidden ${!slot1State.modelName ? 'opacity-60 pointer-events-none' : ''}`}>
                    <h2 className="text-lg md:text-xl font-semibold p-4 pb-2 text-blue-600 dark:text-blue-400 flex-shrink-0 truncate border-b dark:border-gray-700" title={slot1State.modelName || 'Slot 1'}> {getModelDisplayName(slot1State.modelName)} </h2>
                    <div className="flex-grow overflow-y-auto text-sm p-4 space-y-3 custom-scrollbar">
                      {!slot1State.modelName && <p className="text-gray-400 dark:text-gray-500 italic text-center mt-4">Slot empty.</p>}
                      {/* --- REVISED SECTION START --- */}
                      {slot1State.modelName && slot1State.conversationHistory.map((msg, index) => (
                        <div key={`${selectedHistoryId || 'new'}-1-${index}`}
                             // MODIFIED LINE: Added prose classes
                             className={`prose prose-sm dark:prose-invert max-w-none p-2 rounded-md max-w-[90%] ${msg.role === 'user' ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 ml-auto' : 'bg-blue-50 dark:bg-blue-900/30 text-gray-900 dark:text-gray-100 mr-auto'}`}>
                           {/* ReactMarkdown component itself remains unchanged */}
                           <ReactMarkdown remarkPlugins={[remarkGfm]}>
                             {msg.content}
                           </ReactMarkdown>
                        </div>
                      ))}
                       {/* --- REVISED SECTION END --- */}
                      {slot1State.modelName && slot1State.loading && <p className="text-gray-500 dark:text-gray-400 animate-pulse mt-2 p-2">Loading...</p>}
                      {slot1State.modelName && slot1State.error && <p className="text-red-600 dark:text-red-400 mt-2 p-2">Error: {slot1State.error}</p>}
                    </div>
              {slot1State.modelName && !slot1State.loading && (selectedHistoryId || currentChatPrompt) && (
                 <div className="mt-auto p-4 pt-2 border-t dark:border-gray-600 flex space-x-2 flex-shrink-0">
                   <input type="text" value={slot1State.followUpInput} onChange={(e) => setSlot1State(prev => ({ ...prev, followUpInput: e.target.value }))} placeholder={`Reply...`} className="flex-grow p-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-blue-500 focus:outline-none" onKeyDown={(e) => { if (e.key === 'Enter' && slot1State.followUpInput.trim()) handleReplyToSlot(1); }} disabled={isProcessingSlot1} />
                   <button onClick={() => handleReplyToSlot(1)} disabled={!slot1State.followUpInput.trim() || isProcessingSlot1} className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0" title={`Send follow-up to ${getModelDisplayName(slot1State.modelName)}`}> Send </button>
                 </div>
               )}
            </div>
            {/* Panel 2 */}
            <div className={`border rounded-lg bg-white dark:bg-gray-800 shadow-md flex flex-col min-h-[250px] border-gray-200 dark:border-gray-700 overflow-hidden ${!slot2State.modelName ? 'opacity-60 pointer-events-none' : ''}`}>
                     <h2 className="text-lg md:text-xl font-semibold p-4 pb-2 text-green-600 dark:text-green-400 flex-shrink-0 truncate border-b dark:border-gray-700" title={slot2State.modelName || 'Slot 2'}> {getModelDisplayName(slot2State.modelName)} </h2>
                     <div className="flex-grow overflow-y-auto text-sm p-4 space-y-3 custom-scrollbar">
                       {!slot2State.modelName && <p className="text-gray-400 dark:text-gray-500 italic text-center mt-4">Slot empty.</p>}
                       {/* --- REVISED SECTION START --- */}
                       {slot2State.modelName && slot2State.conversationHistory.map((msg, index) => (
                         <div key={`${selectedHistoryId || 'new'}-2-${index}`}
                              // MODIFIED LINE: Added prose classes
                              className={`prose prose-sm dark:prose-invert max-w-none p-2 rounded-md max-w-[90%] ${msg.role === 'user' ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 ml-auto' : 'bg-green-50 dark:bg-green-900/30 text-gray-900 dark:text-gray-100 mr-auto'}`}>
                            {/* ReactMarkdown component itself remains unchanged */}
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                         </div>
                       ))}
                       {/* --- REVISED SECTION END --- */}
                       {slot2State.modelName && slot2State.loading && <p className="text-gray-500 dark:text-gray-400 animate-pulse mt-2 p-2">Loading...</p>}
                       {slot2State.modelName && slot2State.error && <p className="text-red-600 dark:text-red-400 mt-2 p-2">Error: {slot2State.error}</p>}
                     </div>
               {slot2State.modelName && !slot2State.loading && (selectedHistoryId || currentChatPrompt) && (
                 <div className="mt-auto p-4 pt-2 border-t dark:border-gray-600 flex space-x-2 flex-shrink-0">
                   <input type="text" value={slot2State.followUpInput} onChange={(e) => setSlot2State(prev => ({ ...prev, followUpInput: e.target.value }))} placeholder={`Reply...`} className="flex-grow p-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-green-500 focus:outline-none" onKeyDown={(e) => { if (e.key === 'Enter' && slot2State.followUpInput.trim()) handleReplyToSlot(2); }} disabled={isProcessingSlot2} />
                   <button onClick={() => handleReplyToSlot(2)} disabled={!slot2State.followUpInput.trim() || isProcessingSlot2} className="px-3 py-1 bg-green-500 hover:bg-green-600 text-white text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0" title={`Send follow-up to ${getModelDisplayName(slot2State.modelName)}`}> Send </button>
                 </div>
               )}
            </div>
            {/* Panel 3 */}
            <div className={`border rounded-lg bg-white dark:bg-gray-800 shadow-md flex flex-col min-h-[250px] border-gray-200 dark:border-gray-700 overflow-hidden ${!slot3State.modelName ? 'opacity-60 pointer-events-none' : ''}`}>
                     <h2 className="text-lg md:text-xl font-semibold p-4 pb-2 text-purple-600 dark:text-purple-400 flex-shrink-0 truncate border-b dark:border-gray-700" title={slot3State.modelName || 'Slot 3'}> {getModelDisplayName(slot3State.modelName)} </h2>
                       <div className="flex-grow overflow-y-auto text-sm p-4 space-y-3 custom-scrollbar">
                         {!slot3State.modelName && <p className="text-gray-400 dark:text-gray-500 italic text-center mt-4">Slot empty.</p>}
                         {/* --- REVISED SECTION START --- */}
                         {slot3State.modelName && slot3State.conversationHistory.map((msg, index) => (
                           <div key={`${selectedHistoryId || 'new'}-3-${index}`}
                                // MODIFIED LINE: Added prose classes
                                className={`prose prose-sm dark:prose-invert max-w-none p-2 rounded-md max-w-[90%] ${msg.role === 'user' ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 ml-auto' : 'bg-purple-50 dark:bg-purple-900/30 text-gray-900 dark:text-gray-100 mr-auto'}`}>
                              {/* ReactMarkdown component itself remains unchanged */}
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {msg.content}
                              </ReactMarkdown>
                           </div>
                         ))}
                         {/* --- REVISED SECTION END --- */}
                         {slot3State.modelName && slot3State.loading && <p className="text-gray-500 dark:text-gray-400 animate-pulse mt-2 p-2">Loading...</p>}
                         {slot3State.modelName && slot3State.error && <p className="text-red-600 dark:text-red-400 mt-2 p-2">Error: {slot3State.error}</p>}
                       </div>
               {slot3State.modelName && !slot3State.loading && (selectedHistoryId || currentChatPrompt) && (
                 <div className="mt-auto p-4 pt-2 border-t dark:border-gray-600 flex space-x-2 flex-shrink-0">
                   <input type="text" value={slot3State.followUpInput} onChange={(e) => setSlot3State(prev => ({ ...prev, followUpInput: e.target.value }))} placeholder={`Reply...`} className="flex-grow p-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 focus:ring-purple-500 focus:outline-none" onKeyDown={(e) => { if (e.key === 'Enter' && slot3State.followUpInput.trim()) handleReplyToSlot(3); }} disabled={isProcessingSlot3} />
                   <button onClick={() => handleReplyToSlot(3)} disabled={!slot3State.followUpInput.trim() || isProcessingSlot3} className="px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0" title={`Send follow-up to ${getModelDisplayName(slot3State.modelName)}`}> Send </button>
                 </div>
               )}
            </div>
          </div>
        )}
        {/* Placeholder */}
        {(!showPanels || !canInteract) && ( <div className="flex-grow flex items-center justify-center text-gray-500 dark:text-gray-400 text-center px-4"> {canInteract ? "Click 'New Chat' or select an item from history to begin." : (isAuthLoading || settingsLoading) ? "Loading..." : "Please log in..."} </div> )}
      </main>
    </div>
  );
}
