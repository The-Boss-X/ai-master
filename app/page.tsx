 /* eslint-disable @typescript-eslint/no-unused-vars */
 /* eslint-disable @typescript-eslint/no-explicit-any */
 /* eslint-disable react-hooks/exhaustive-deps */
 // app/page.tsx
 // Combined version incorporating refinements based on previous discussion.
 // Addresses history fetching frequency and UI glitch (gray screen).
 'use client';

 import React, { useState, useRef, useEffect, useCallback } from 'react';
 import Link from 'next/link';
 import { useAuth } from './context/AuthContext';
 import type { InteractionHistoryItem, ConversationMessage } from './types/InteractionHistoryItem';
 import HistorySidebar from './components/HistorySidebar';
 import ReactMarkdown from 'react-markdown';
 import remarkGfm from 'remark-gfm';

 // --- Constants ---
 const MAX_SLOTS = 6;

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
     response: string | null; // Last successful response content
     error: string | null;
     followUpInput: string;
     conversationHistory: ConversationMessage[];
     isActiveInHistory: boolean; // Was this slot used in the loaded history item?
     responseReceivedThisTurn: boolean; // Flag if response/error received this turn
 }

 // --- Panel Colors ---
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
     const initialSlotState: AiSlotState = { modelName: null, loading: false, response: null, error: null, followUpInput: '', conversationHistory: [], isActiveInHistory: false, responseReceivedThisTurn: false };
     const [slotStates, setSlotStates] = useState<AiSlotState[]>([]);
     const [showPanels, setShowPanels] = useState(false); // Explicitly control panel visibility
     const mainInputRef = useRef<HTMLTextAreaElement>(null);
     const [history, setHistory] = useState<InteractionHistoryItem[]>([]);
     const [historyLoading, setHistoryLoading] = useState(false);
     const [historyError, setHistoryError] = useState<string | null>(null);
     const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
     const [needsLogging, setNeedsLogging] = useState(false);

     // --- Data Fetching Callbacks ---

     // Fetches the list of past interactions. Should only be called when needed.
     const fetchHistory = useCallback(async (calledFrom?: string) => {
         // Prevent fetch if auth is still loading or user is not logged in
         if (isAuthLoading || !user) {
             setHistory([]); // Clear history if not logged in
             setHistoryLoading(false);
             return;
         }
         console.log(`fetchHistory called from: ${calledFrom || 'unknown'}`);
         setHistoryLoading(true);
         setHistoryError(null);
         try {
             const response = await fetch('/api/get-history');
             if (!response.ok) throw new Error(`History fetch failed (${response.status})`);
             const data: InteractionHistoryItem[] = await response.json();
             data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
             setHistory(data); // Update the history list
             console.log("History list fetched successfully.");
         } catch (e: any) {
             console.error("Error fetching history:", e);
             setHistoryError(e.message);
             setHistory([]); // Clear history on error
         } finally {
             setHistoryLoading(false); // Mark history loading as complete
         }
     }, [user, isAuthLoading]); // Stable unless user/auth state changes

     // Fetches the user's current saved model settings (used ONLY for NEW chats or initial load)
     const fetchSettingsForNewChat = useCallback(async () => {
         if (!user) {
             console.warn("fetchSettingsForNewChat called without user.");
             setSlotStates([]);
             setSettingsLoading(false);
             return;
         }
         console.log("fetchSettingsForNewChat called.");
         setSettingsLoading(true);
         setSettingsError(null);
         try {
             const response = await fetch('/api/settings/get-settings');
             if (!response.ok) { const d = await response.json().catch(()=>({})); throw new Error(d.error || `Settings fetch failed (${response.status})`); }
             const data: FetchedSettings | null = await response.json();
             const newSlotStates: AiSlotState[] = [];
             if (data) {
                 for (let i = 0; i < MAX_SLOTS; i++) {
                     const modelKey = `slot_${i + 1}_model` as keyof FetchedSettings;
                     let modelName: string | null = null;
                     if (data[modelKey] && typeof data[modelKey] === 'string' && data[modelKey]?.includes(': ')) {
                         modelName = data[modelKey] as string;
                     } else if (data[modelKey]) {
                         console.warn(`Invalid format in settings slot ${i+1}: "${data[modelKey]}".`);
                     }
                     if (modelName) {
                         newSlotStates.push({ ...initialSlotState, modelName: modelName });
                     }
                 }
             }
             setSlotStates(newSlotStates);
             console.log(`Applied settings for new chat. Active slots: ${newSlotStates.length}`);
         } catch (e: any) {
             console.error("Error fetching settings for new chat:", e);
             setSettingsError(e.message);
             setSlotStates([]);
         } finally {
             setSettingsLoading(false);
         }
     }, [user]); // Stable unless user changes

     // --- Initial Data Fetching Effect ---
     // Fetches history ONCE on auth state change (login).
     // Fetches settings if logged in and no history is selected.
     useEffect(() => {
         if (!isAuthLoading && user) {
             console.log("Auth loaded. User logged in. Fetching history.");
             fetchHistory("Initial Load / Auth Change"); // Fetch history list on login

             if (!selectedHistoryId) {
                 console.log("No history selected, fetching settings for potential new chat.");
                 fetchSettingsForNewChat();
             } else {
                 console.log("History item selected, settings will load from history click if needed.");
                 setSettingsLoading(false); // Avoid global loading indicator if viewing history
             }
         } else if (!isAuthLoading && !user) {
             // User is logged out, clear state
             console.log("Auth loaded. User logged out. Clearing state.");
             setSlotStates([]); setHistory([]); setSettingsLoading(false); setHistoryLoading(false);
             setSelectedHistoryId(null); setCurrentChatPrompt(null); setLastSubmittedPrompt(null);
             setShowPanels(false); setUiLocked(false); setNeedsLogging(false);
             setSettingsError(null); setHistoryError(null); setMainInputText('');
         }
     // Re-run ONLY when auth state changes. fetchHistory/fetchSettingsForNewChat are stable callbacks.
     // selectedHistoryId is NOT needed here; its change doesn't require refetching history/settings here.
     }, [user, isAuthLoading, fetchHistory, fetchSettingsForNewChat]);

     // --- Log Initial Interaction ---
     // Logs the first turn of a new chat. Refetches history ONLY on success with a new ID.
     const logInitialInteraction = useCallback(async (promptToLog: string, finalSlotStates: AiSlotState[]) => {
         if (!user || !promptToLog || finalSlotStates.every(s => !s.response && !s.error)) {
             console.log("Skipping initial log.");
             setNeedsLogging(false);
             return;
         }
         console.log("Attempting to log INITIAL interaction...");
         let dataToLog: Record<string, any> = {};
         let shouldRefetchHistory = false; // Flag to control history refetch
         try {
             const buildLogHistory = (state: AiSlotState): ConversationMessage[] | null => {
                 const userMessage = state.conversationHistory.findLast(m => m.role === 'user');
                 const modelMessage = state.conversationHistory.findLast(m => m.role === 'model');
                 if (!userMessage || !modelMessage || !state.modelName || !state.response) {
                    console.warn(`[Log] Incomplete data for slot ${state.modelName}. Logging prompt/response directly.`);
                    const userMsgContent = userMessage?.content === promptToLog ? userMessage.content : promptToLog;
                    if (!state.response) return null;
                    return [{ role: 'user', content: userMsgContent }, { role: 'model', content: state.response }];
                 }
                 return [ userMessage, modelMessage ];
             };
             dataToLog = { prompt: promptToLog, title: promptToLog.substring(0, 50) + (promptToLog.length > 50 ? '...' : '') };
             finalSlotStates.forEach((slotState, index) => {
                 const slotNum = index + 1; const modelKey = `slot_${slotNum}_model_used`; const convKey = `slot_${slotNum}_conversation`;
                 if (slotState.modelName) {
                     dataToLog[modelKey] = slotState.modelName;
                     if(slotState.response || slotState.error) { dataToLog[convKey] = buildLogHistory(slotState); }
                     else { dataToLog[convKey] = null; }
                 } else { dataToLog[modelKey] = null; dataToLog[convKey] = null; }
             });
             for (let i = finalSlotStates.length; i < MAX_SLOTS; i++) { const slotNum = i + 1; dataToLog[`slot_${slotNum}_model_used`] = null; dataToLog[`slot_${slotNum}_conversation`] = null; }

             console.log("Data being sent to /api/log-interaction:", JSON.stringify(dataToLog, null, 2));
             const response = await fetch('/api/log-interaction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dataToLog) });
             const result = await response.json().catch(() => ({ success: false, error: 'Invalid JSON response' }));

             if (!response.ok || !result?.success || !result.loggedData?.[0]) {
                 const errorMsg = result?.error || `HTTP ${response.status}`; console.error('Failed to log interaction:', errorMsg); setHistoryError(`Failed to save chat: ${errorMsg}`);
                 // Update slots with error, but DON'T refetch history on failure
                 setSlotStates(prevStates => prevStates.map((s, idx) => { if (s.modelName && dataToLog[`slot_${idx + 1}_conversation`]) { return { ...s, error: s.error ? `${s.error}\nLog Error.` : 'Failed to log initial turn.' }; } return s; }));
             } else {
                 const newLogEntry = result.loggedData[0] as InteractionHistoryItem;
                 if (newLogEntry?.id) {
                     console.log(`Interaction logged successfully. New ID: ${newLogEntry.id}`);
                     // Update history locally first for immediate feedback
                     setHistory(prev => [newLogEntry, ...prev.filter(h => h.id !== newLogEntry.id)]);
                     setSelectedHistoryId(newLogEntry.id); // Select the new chat
                     setHistoryError(null);
                     // Update slot states with confirmed logged history
                     setSlotStates(prevStates => prevStates.map((currentState, index) => {
                         const slotNum = index + 1; const modelKey = `slot_${slotNum}_model_used` as keyof InteractionHistoryItem; const convKey = `slot_${slotNum}_conversation` as keyof InteractionHistoryItem;
                         const loggedHistory = (newLogEntry[convKey] as ConversationMessage[] | null) || [];
                         if (currentState.modelName === newLogEntry[modelKey]) {
                             console.log(`[Slot ${slotNum}] Updating history from successful log:`, loggedHistory);
                             return { ...currentState, conversationHistory: loggedHistory, responseReceivedThisTurn: true, error: null };
                         } return currentState;
                     }));
                     // Set flag to refetch history *after* state updates, only if a new item was truly added.
                     shouldRefetchHistory = true;
                 } else {
                     console.warn("Log success but no ID returned. Flagging for history refetch.");
                     shouldRefetchHistory = true; // Refetch to be safe
                 }
             }
         } catch (error) {
             console.error('Error calling logging API:', error); const errorMsg = error instanceof Error ? error.message : 'Unknown error'; setHistoryError(`Failed to save chat: ${errorMsg}`);
             setSlotStates(prevStates => prevStates.map((s, idx) => { if (s.modelName && dataToLog[`slot_${idx + 1}_conversation`]) { return { ...s, error: s.error ? `${s.error}\nLog Error.` : `Log Error: ${errorMsg}` }; } return s; }));
             // Do not refetch history on exception
         } finally {
             setNeedsLogging(false);
             console.log("Logging attempt finished.");
             // Refetch history outside the main try/catch/finally if needed
             if (shouldRefetchHistory) {
                 console.log("Refetching history after successful log or missing ID.");
                 fetchHistory("After Log Interaction");
             }
         }
     }, [user, fetchHistory]); // fetchHistory is stable

     // --- useEffect to Trigger Logging After Initial AI Calls Complete ---
     useEffect(() => {
         const anySlotLoading = slotStates.some(slot => slot.loading);
         if (!needsLogging || anySlotLoading) { return; }
         if (currentChatPrompt && slotStates.length > 0) {
             const activeSlots = slotStates.filter(s => s.modelName);
             const allActiveSlotsResponded = activeSlots.every(s => s.responseReceivedThisTurn);
             if (allActiveSlotsResponded) {
                 console.log("All active slots finished initial response, triggering log...");
                 logInitialInteraction(currentChatPrompt, slotStates);
             } else {
                 const notResponded = activeSlots.filter(s => !s.responseReceivedThisTurn);
                 if (notResponded.length > 0) { console.log(`Waiting for slots to respond before logging: ${notResponded.map((s, i) => `Slot ${slotStates.findIndex(st => st === s) + 1}`).join(', ')}`); }
                 else if (activeSlots.length > 0) { console.log("Waiting for all active slots to respond before logging (state inconsistency?)."); }
             }
         }
     }, [ slotStates, needsLogging, currentChatPrompt, logInitialInteraction ]);

     // --- Handle Clicking a History Item ---
     // Loads state, does NOT refetch history list.
     const handleHistoryClick = useCallback(async (item: InteractionHistoryItem) => {
         if (!user || uiLocked || item.id === selectedHistoryId) {
            if(item.id === selectedHistoryId) console.log("Clicked already selected history item.");
            return; // Prevent action if not logged in, UI locked, or already selected
         }
         console.log("--- handleHistoryClick triggered ---");
         console.log("Loading item ID:", item.id);

         setUiLocked(true); // Lock UI
         setSelectedHistoryId(item.id); // Set the selected ID
         setCurrentChatPrompt(item.prompt); // Set the initial prompt from history
         setLastSubmittedPrompt(null);
         setMainInputText(''); // Clear main input
         setNeedsLogging(false); // Not logging when loading history
         setShowPanels(false); // Hide panels briefly during transition
         setSettingsError(null); // Clear errors
         setHistoryError(null);
         setSettingsLoading(true); // Indicate processing (acts like settings load for UI)

         const loadedSlotStates: AiSlotState[] = [];
         for (let i = 0; i < MAX_SLOTS; i++) {
             const slotNum = i + 1; const modelKey = `slot_${slotNum}_model_used` as keyof InteractionHistoryItem; const conversationKey = `slot_${slotNum}_conversation` as keyof InteractionHistoryItem;
             const modelName = item[modelKey] as string | null; const rawHistory: any[] | null = item[conversationKey] as any[] | null;
             let conversationHistory: ConversationMessage[] = [];
             if (Array.isArray(rawHistory)) { conversationHistory = rawHistory.filter(msg => msg && (msg.role === 'user' || msg.role === 'model') && typeof msg.content === 'string').map(msg => ({ role: msg.role as 'user' | 'model', content: msg.content })); }
             else if (rawHistory) { console.warn(`[Slot ${slotNum}] History data is not an array:`, rawHistory); }
             const isActive = !!modelName || conversationHistory.length > 0; const isValidModel = typeof modelName === 'string' && modelName.includes(': ');
             if (modelName && !isValidModel) { console.warn(`Invalid model format in history ${item.id} slot ${slotNum}: "${modelName}".`); }
             loadedSlotStates.push({ ...initialSlotState, modelName: isValidModel ? modelName : null, response: conversationHistory.findLast(m => m.role === 'model')?.content || null, conversationHistory: conversationHistory, isActiveInHistory: isActive, responseReceivedThisTurn: conversationHistory.some(m => m.role === 'model'), followUpInput: '', });
         }
         setSlotStates(loadedSlotStates); // Update the state with all loaded slots
         console.log(`Prepared ${loadedSlotStates.filter(s=>s.isActiveInHistory).length} active states from history ${item.id}.`);

         setSettingsLoading(false); // History loaded, no longer "settings" loading

         // Use timeout to ensure state update renders before showing panels/unlocking
         setTimeout(() => {
             setShowPanels(true); // Ensure panels are shown after loading history
             setUiLocked(false); // Unlock UI
             console.log(`State updated, UI unlocked for history ${item.id}.`);
             mainInputRef.current?.focus();
         }, 50);

     }, [user, uiLocked, selectedHistoryId]); // Added selectedHistoryId dependency

      // --- Handle "New Chat" Button Click ---
      // Resets state, fetches settings, does NOT refetch history list.
      const handleNewChat = useCallback(() => {
          if (!user || uiLocked) return;
          console.log("Starting New Chat");
          setUiLocked(true);
          setSelectedHistoryId(null); // Clear selected history
          setCurrentChatPrompt(null);
          setLastSubmittedPrompt(null);
          setMainInputText('');
          setShowPanels(false); // Hide panels initially for new chat
          setNeedsLogging(false);
          setSlotStates([]); // Clear slots immediately
          setHistoryError(null);
          setSettingsError(null);

          // Fetch the latest settings for the new chat.
          fetchSettingsForNewChat().finally(() => {
              setUiLocked(false);
              console.log("New Chat setup complete, UI unlocked.");
              mainInputRef.current?.focus();
              // Do NOT set showPanels here; let the first prompt trigger it.
          });
      }, [user, uiLocked, fetchSettingsForNewChat]); // fetchSettingsForNewChat is stable

      // --- Handle Update Title & Delete Item ---
      const handleUpdateTitle = useCallback(async (id: string, newTitle: string): Promise<boolean> => {
          if (!user) return false;
          try {
              const response = await fetch('/api/update-history-title', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title: newTitle }) });
              const result = await response.json();
              if (!response.ok || !result.success) { throw new Error(result.error || 'Failed to update title'); }
              // Update title locally ONLY
              setHistory(prev => prev.map(item => item.id === id ? { ...item, title: newTitle } : item));
              setHistoryError(null);
              return true;
          } catch (error: any) { console.error("Error updating title:", error); setHistoryError(`Update failed: ${error.message}`); return false; }
      }, [user]); // Stable

      const handleDeleteItem = useCallback(async (id: string): Promise<boolean> => {
          if (!user) return false;
          // Optional: Add confirmation dialog here
          try {
              const response = await fetch('/api/delete-history-item', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
              const result = await response.json();
              if (!response.ok || !result.success) { throw new Error(result.error || 'Failed to delete item'); }
              // Remove item from local state immediately
              setHistory(prev => prev.filter(item => item.id !== id));
              if (selectedHistoryId === id) {
                  console.log("Deleting selected chat, switching to New Chat state.");
                  handleNewChat(); // Reset to new chat state
              }
              setHistoryError(null);
              // Consider fetching history here if local update isn't reliable enough, but try without first.
              // fetchHistory("After Delete Item");
              return true;
          } catch (error: any) { console.error("Error deleting item:", error); setHistoryError(`Delete failed: ${error.message}`); return false; }
      }, [user, selectedHistoryId, handleNewChat]); // handleNewChat is stable


      // --- Helper Function to Call AI API & Append Conversation ---
      const callApiForSlot = useCallback(async (
          slotIndex: number, modelString: string | null, promptToSend: string,
          historyBeforeThisTurn: ConversationMessage[], currentInteractionId: string | null
      ) => {
          const slotNumber = slotIndex + 1;
          const updateSlotState = (updateFn: (prevState: AiSlotState) => AiSlotState) => {
              setSlotStates(prevStates => prevStates.map((state, index) => index === slotIndex ? updateFn(state) : state ));
          };

          if (!modelString || !promptToSend) { updateSlotState(prev => ({ ...prev, loading: false, error: "Missing model or prompt.", responseReceivedThisTurn: true })); return; }

          const newUserMessage: ConversationMessage = { role: 'user', content: promptToSend };
          const validHistoryBeforeThisTurn = Array.isArray(historyBeforeThisTurn) ? historyBeforeThisTurn : [];
          const historyIncludingUserPrompt: ConversationMessage[] = [...validHistoryBeforeThisTurn, newUserMessage];

          console.log(`[Slot ${slotNumber}] History BEFORE this turn being sent:`, JSON.parse(JSON.stringify(validHistoryBeforeThisTurn)));

          updateSlotState(prev => ({ ...prev, loading: true, response: null, error: null, conversationHistory: historyIncludingUserPrompt, responseReceivedThisTurn: false, }));
          console.log(`[Slot ${slotNumber}] (${modelString}): Sending prompt...`);

          let modelResponseText: string | null = null; let newModelMessage: ConversationMessage | null = null;
          try {
              const parts = modelString.split(': '); if (parts.length !== 2) throw new Error(`Invalid model format: ${modelString}`);
              const provider = parts[0]; const specificModel = parts[1]; let apiUrl = '';
              if (provider === 'ChatGPT') apiUrl = '/api/call-openai'; else if (provider === 'Gemini') apiUrl = '/api/call-gemini'; else if (provider === 'Anthropic') apiUrl = '/api/call-anthropic'; else throw new Error(`Unsupported provider: ${provider}`);

              const apiResponse = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: promptToSend, model: specificModel, slotNumber, conversationHistory: historyIncludingUserPrompt }) });
              const result = await apiResponse.json().catch(() => ({ error: "Invalid JSON response from AI API" }));
              if (!apiResponse.ok) { throw new Error(result.error || `AI API call failed (${apiResponse.status} ${apiResponse.statusText})`); }
              modelResponseText = result.response; if (!modelResponseText) { throw new Error("AI API returned an empty response."); }

              newModelMessage = { role: 'model', content: modelResponseText };
              updateSlotState(prev => {
                  const currentHistory = Array.isArray(prev.conversationHistory) ? prev.conversationHistory : [];
                  if (currentHistory.length > 0 && currentHistory[currentHistory.length - 1].role === 'model' && currentHistory[currentHistory.length - 1].content === newModelMessage!.content) {
                      console.warn(`[Slot ${slotNumber}] Skipping duplicate model message update.`);
                      return { ...prev, response: modelResponseText, error: null, loading: false, responseReceivedThisTurn: true };
                  }
                  const historyWithUser = currentHistory.findLast(m => m.role === 'user')?.content === newUserMessage.content ? currentHistory : [...validHistoryBeforeThisTurn, newUserMessage];
                  const finalHistory = [...historyWithUser, newModelMessage!];
                  console.log(`[Slot ${slotNumber}] Updating state on SUCCESS. Final history:`, JSON.parse(JSON.stringify(finalHistory)));
                  return { ...prev, response: modelResponseText, error: null, loading: false, conversationHistory: finalHistory, responseReceivedThisTurn: true, };
              });
              console.log(`[Slot ${slotNumber}] (${modelString}) received response.`);

              if (currentInteractionId && newUserMessage && newModelMessage) {
                  console.log(`[Slot ${slotNumber}] Attempting to APPEND turn to DB (ID: ${currentInteractionId}).`);
                  fetch('/api/append-conversation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interactionId: currentInteractionId, slotNumber: slotNumber, newUserMessage: newUserMessage, newModelMessage: newModelMessage }) })
                  .then(async appendResponse => {
                      if (!appendResponse.ok) { const appendErrorData = await appendResponse.json().catch(() => ({ error: `HTTP ${appendResponse.status}` })); const errorMsg = appendErrorData.error || `HTTP ${appendResponse.status}`; console.error(`[Slot ${slotNumber}] Error appending conversation (ID: ${currentInteractionId}):`, errorMsg); updateSlotState(prev => ({ ...prev, error: prev.error ? `${prev.error}\nSave Error.` : `Failed to save this turn (${errorMsg}).` })); }
                      else { console.log(`[Slot ${slotNumber}] Successfully appended conversation to ID ${currentInteractionId}`); updateSlotState(prev => ({ ...prev, error: prev.error?.replace(/Failed to save this turn.*?\)?\.?(\n|$)/, '') || null })); }
                  })
                  .catch(appendErr => { console.error(`[Slot ${slotNumber}] Network error calling append-conversation API:`, appendErr); const errorMsg = appendErr instanceof Error ? appendErr.message : 'Network error'; updateSlotState(prev => ({ ...prev, error: prev.error ? `${prev.error}\nNetwork Save Error.` : `Network error saving turn (${errorMsg}).` })); });
              } else if (currentInteractionId && (!newUserMessage || !newModelMessage)) { console.error(`[Slot ${slotNumber}] Cannot append turn: Missing messages.`); updateSlotState(prev => ({ ...prev, error: prev.error ? `${prev.error}\nSave Error.` : `Internal error saving.` })); }

          } catch (error: any) {
              console.error(`Error in callApiForSlot (Slot ${slotNumber}, Model: ${modelString}):`, error);
              const historyOnError = historyIncludingUserPrompt; console.log(`[Slot ${slotNumber}] Final history on ERROR:`, JSON.parse(JSON.stringify(historyOnError)));
              updateSlotState(prev => ({ ...prev, response: null, error: error.message || 'Unknown AI error', loading: false, conversationHistory: historyOnError, responseReceivedThisTurn: true, }));
          }
      }, []); // Stable callback

     // --- Handle Processing New Prompt / Main Follow-up ---
     const handleProcessText = useCallback(async () => {
         const currentInput = mainInputText.trim();
         const currentStateSnapshot = [...slotStates]; // Snapshot state BEFORE updates
         const activeSlotsForCall = currentStateSnapshot.filter(s => s.modelName);

         // --- Validations ---
         if (currentInput === '') { console.log("handleProcessText skipped: Input empty."); return; }
         if (!user) { console.log("handleProcessText skipped: Not logged in."); return; }
         if (isAuthLoading) { console.log("handleProcessText skipped: Auth loading."); return; }
         if (settingsLoading) { console.log("handleProcessText skipped: Settings loading."); return; }
         if (activeSlotsForCall.length === 0) { console.log("handleProcessText skipped: No active models."); setSettingsError("No AI models configured."); return; }
         if (uiLocked) { console.log("handleProcessText skipped: UI Locked."); return; }
         const isAnySlotProcessing = currentStateSnapshot.some(s => s.loading);
         if (isAnySlotProcessing) { console.log("handleProcessText skipped: A slot is already processing."); return; }

         const isFirstPromptOfChat = !selectedHistoryId;
         const promptToSend = currentInput;
         console.log(`Processing ${isFirstPromptOfChat ? 'initial' : 'follow-up'} prompt: "${promptToSend}"`);

         // --- Update Core Chat State ---
         if (isFirstPromptOfChat) { setCurrentChatPrompt(promptToSend); setNeedsLogging(true); }
         else { setNeedsLogging(false); }
         setLastSubmittedPrompt(promptToSend);
         setShowPanels(true); // <<< Ensure panels are set to show HERE
         if (mainInputRef.current) mainInputRef.current.blur();
         setMainInputText('');

         const currentInteractionIdForUpdate = selectedHistoryId;

         // --- Prepare Slots for API Calls (Set Loading Flags etc.) ---
         setSlotStates(prevSlotStates => {
             return prevSlotStates.map((s) => {
                 if (s.modelName && activeSlotsForCall.some(active => active.modelName === s.modelName)) {
                     const historyToKeep = isFirstPromptOfChat ? [] : s.conversationHistory;
                     return { ...s, loading: true, response: null, error: null, responseReceivedThisTurn: false, conversationHistory: historyToKeep, isActiveInHistory: isFirstPromptOfChat ? true : s.isActiveInHistory, };
                 }
                 if (isFirstPromptOfChat && !s.modelName) { return {...s, conversationHistory: [], response: null, error: null, isActiveInHistory: false }; }
                 return s;
             });
         });

         // --- Initiate API Calls Concurrently ---
         const promises = activeSlotsForCall.map((slotStateFromSnapshot) => {
             const originalIndex = currentStateSnapshot.findIndex(s => s === slotStateFromSnapshot);
             if (originalIndex !== -1 && slotStateFromSnapshot.modelName) {
                 const historyForApi: ConversationMessage[] = isFirstPromptOfChat ? [] : (slotStateFromSnapshot.conversationHistory as ConversationMessage[]);
                 console.log(`[Slot ${originalIndex + 1}] Calling API via handleProcessText. History:`, historyForApi.length);
                 return callApiForSlot( originalIndex, slotStateFromSnapshot.modelName, promptToSend, historyForApi, currentInteractionIdForUpdate );
             }
             console.error("Error finding slot index/model in handleProcessText loop."); return Promise.resolve();
         });

         Promise.allSettled(promises).then(() => {
             console.log("All main API call initiations complete via handleProcessText.");
             // Individual slots manage their loading state. No global loading change needed here.
             // Ensure panels remain visible after processing
             setShowPanels(true); // <<< Re-assert showPanels just in case
         });

     }, [ mainInputText, user, isAuthLoading, settingsLoading, selectedHistoryId, slotStates, callApiForSlot, uiLocked ]); // Stable deps

     // --- Handle Individual Follow-up Replies ---
     const handleReplyToSlot = useCallback((slotIndex: number) => {
         const currentStateSnapshot = [...slotStates];
         const targetState = currentStateSnapshot[slotIndex];

         if (!targetState) { console.error(`handleReplyToSlot: Invalid slotIndex ${slotIndex}`); return; }
         const followUpPrompt = targetState.followUpInput.trim(); const modelName = targetState.modelName;
         if (!followUpPrompt) { console.warn("Cannot send reply: Input empty."); return; }
         if (!modelName) { console.warn("Cannot send reply: No model assigned."); return; }
         if (!user) { console.warn("Cannot send reply: Not logged in."); return; }
         if (!selectedHistoryId) { console.warn("Cannot send reply: Chat not saved."); return; }
         if (targetState.loading) { console.log(`Reply blocked for slot ${slotIndex+1}: Processing.`); return; }

         console.log(`Sending follow-up to Slot ${slotIndex + 1} (${modelName}): "${followUpPrompt}"`);
         setLastSubmittedPrompt(followUpPrompt); setNeedsLogging(false);

         // Clear input for this slot immediately
         setSlotStates(prevStates => prevStates.map((state, index) => index === slotIndex ? { ...state, followUpInput: '' } : state ));

         const historyBeforeThisTurn = targetState.conversationHistory;
         console.log(`[Slot ${slotIndex + 1}] Calling API from Reply. History:`, historyBeforeThisTurn.length);
         callApiForSlot( slotIndex, modelName, followUpPrompt, historyBeforeThisTurn, selectedHistoryId );
     }, [user, slotStates, callApiForSlot, selectedHistoryId]); // Stable deps


     // --- Determine Overall UI State ---
     const isProcessingAny = slotStates.some(slot => slot.loading);
     const canInteractGenerally = !!user && !isAuthLoading && !settingsLoading && !uiLocked;
     const hasAnyModelsConfigured = slotStates.some(s => s.modelName);
     const canUseMainInput = canInteractGenerally && !isProcessingAny && (!!selectedHistoryId || hasAnyModelsConfigured);
     const slotsToDisplay = slotStates.filter(slotState => selectedHistoryId ? slotState.isActiveInHistory : !!slotState.modelName );
     const numberOfSlotsToDisplay = slotsToDisplay.length;
     // Determine if the panel area should be rendered
     const shouldRenderPanels = user && !settingsLoading && (showPanels || !!selectedHistoryId) && slotStates.length > 0 && numberOfSlotsToDisplay > 0;


     // --- Helper to get Display Name ---
     const getModelDisplayName = (modelString: string | null): string => { if (!modelString) return "Slot Empty"; return modelString; };

     // --- Dynamic Grid Class Functions ---
     const getGridContainerClass = (count: number): string => { let classes = 'w-full max-w-7xl grid gap-4 self-center flex-grow px-1 pb-4 overflow-y-auto custom-scrollbar '; if (count <= 1) classes += 'grid-cols-1'; else if (count === 2) classes += 'grid-cols-1 lg:grid-cols-2'; else if (count === 3) classes += 'grid-cols-1 lg:grid-cols-3'; else if (count === 4) classes += 'grid-cols-1 md:grid-cols-2'; else if (count === 5) classes += 'grid-cols-1 md:grid-cols-6'; else if (count >= 6) classes += 'grid-cols-1 md:grid-cols-3'; else classes += 'grid-cols-1 md:grid-cols-3'; return classes; };
     const getFiveItemLayoutClass = (index: number): string => { if (index < 3) { return 'md:col-span-2'; } else if (index === 3) { return 'md:col-start-2 md:col-span-2'; } else { return 'md:col-start-4 md:col-span-2'; } };


     // --- Render Component JSX ---
     return (
         <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
             <HistorySidebar
                 history={history} historyLoading={historyLoading || isAuthLoading} historyError={historyError}
                 selectedHistoryId={selectedHistoryId} handleHistoryClick={handleHistoryClick}
                 fetchHistory={() => fetchHistory("Manual Refresh")} // Pass fetch function for refresh button
                 onUpdateTitle={handleUpdateTitle} onDeleteItem={handleDeleteItem}
                 isLoggedIn={!!user} handleNewChat={handleNewChat}
             />
             <main className="relative flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
                 {/* Loading Overlay */}
                 {(uiLocked || (settingsLoading && !selectedHistoryId) || isAuthLoading) && (
                     <div className="absolute inset-0 bg-gray-400/30 dark:bg-gray-900/50 flex items-center justify-center z-50" aria-label="Loading content">
                         <svg className="animate-spin h-8 w-8 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                         <span className="ml-3 text-gray-700 dark:text-gray-300">Loading...</span>
                     </div>
                 )}

                 {/* Top Bar: Error display and Settings link */}
                 <div className="w-full max-w-7xl mb-4 self-center flex justify-between items-center px-1 h-5 flex-shrink-0">
                     <div className="text-sm text-red-500 dark:text-red-400 truncate" title={settingsError ?? historyError ?? ''}>{settingsError && `Settings Error: ${settingsError}`}{historyError && !settingsError && `History Error: ${historyError}`}</div>
                     {user && !isAuthLoading && (<Link href="/settings" className={`text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline whitespace-nowrap ${uiLocked ? 'pointer-events-none opacity-50' : ''}`}>⚙️ Settings</Link>)}
                     {!user && !isAuthLoading && <div className="h-5"></div>}
                 </div>

                 {/* Login Prompt */}
                 {!user && !isAuthLoading && ( <div className="w-full max-w-3xl mb-6 self-center p-4 bg-yellow-100 border border-yellow-300 rounded-md text-center text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-100 dark:border-yellow-700">Please <Link href="/auth" className="font-semibold underline hover:text-yellow-900 dark:hover:text-yellow-200">Sign In or Sign Up</Link> to use the tool.</div> )}

                 {/* Main Input Area */}
                 <div className="w-full max-w-3xl mb-4 self-center flex-shrink-0 px-1">
                     <textarea
                         ref={mainInputRef} rows={1} value={mainInputText} onChange={(e) => setMainInputText(e.target.value)}
                         placeholder={ !user ? "Please log in" : settingsLoading ? "Loading settings..." : !selectedHistoryId && !hasAnyModelsConfigured ? "No AI models configured. Go to Settings." : isProcessingAny ? "Processing..." : selectedHistoryId ? "Send follow-up to all active slots..." : "Enter initial prompt to compare models..." }
                         className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 shadow-sm disabled:bg-gray-200 dark:disabled:bg-gray-700/50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 resize-none overflow-y-auto min-h-[44px] max-h-[128px]"
                         style={{ height: 'auto' }}
                         onInput={(e) => { const target = e.target as HTMLTextAreaElement; target.style.height = 'auto'; target.style.height = `${target.scrollHeight}px`; }}
                         onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && canUseMainInput && mainInputText.trim() !== '') { e.preventDefault(); handleProcessText(); } }}
                         disabled={!canUseMainInput} aria-label="Main prompt input"
                     />
                     <button onClick={handleProcessText} disabled={!canUseMainInput || mainInputText.trim() === ''} className={`w-full mt-2 p-3 text-white rounded-md font-semibold transition-colors duration-200 ${ !canUseMainInput || mainInputText.trim() === '' ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600' }`}>
                         {isProcessingAny ? 'Processing...' : (selectedHistoryId) ? 'Send Follow-up to All' : 'Send Initial Prompt'}
                     </button>
                 </div>

                 {/* AI Response Panels Area - Conditional Rendering */}
                 {shouldRenderPanels && (
                     <div className={getGridContainerClass(numberOfSlotsToDisplay)}>
                         {slotsToDisplay.map((slotState, displayIndex) => {
                             const originalIndex = slotStates.findIndex(s => s === slotState);
                             if (originalIndex === -1) { console.error("Render Error: Could not find original index for slot. Skipping panel.", slotState); return null; }
                             const colors = PANEL_COLORS[originalIndex % PANEL_COLORS.length];
                             const isSlotProcessing = slotState.loading; const hasModel = !!slotState.modelName;
                             let panelSpecificClasses = ''; if (numberOfSlotsToDisplay === 5) { panelSpecificClasses = getFiveItemLayoutClass(displayIndex); }
                             const panelHeightClass = numberOfSlotsToDisplay >= 4 ? 'min-h-[350px]' : 'min-h-[250px]';
                             const canEnableFollowUpInput = canInteractGenerally && !isSlotProcessing;
                             const canEnableFollowUpButton = canInteractGenerally && hasModel && !isSlotProcessing && !!selectedHistoryId && slotState.followUpInput.trim() !== '';

                             return (
                                 <div key={`panel-${originalIndex}-${selectedHistoryId || 'new'}`} className={`border rounded-lg bg-white dark:bg-gray-800 shadow-md flex flex-col ${colors.border} overflow-hidden ${panelHeightClass} ${panelSpecificClasses}`} role="article" aria-labelledby={`panel-heading-${originalIndex}`}>
                                     <h2 id={`panel-heading-${originalIndex}`} className={`text-lg md:text-xl font-semibold p-4 pb-2 ${colors.text} flex-shrink-0 truncate border-b dark:border-gray-700`} title={slotState.modelName || `Slot ${originalIndex + 1} (Empty)`}>{getModelDisplayName(slotState.modelName)} (Slot {originalIndex + 1})</h2>
                                     <div className="flex-grow overflow-y-auto text-sm p-4 space-y-3 custom-scrollbar" role="log">
                                         {!hasModel && slotState.conversationHistory.length === 0 && !slotState.isActiveInHistory && <p className="text-gray-400 dark:text-gray-500 italic text-center mt-4">Slot empty.</p>}
                                         {Array.isArray(slotState.conversationHistory) && slotState.conversationHistory.map((msg, msgIndex) => ( <div key={`msg-${originalIndex}-${msgIndex}`} className={`prose prose-sm dark:prose-invert max-w-none p-2 rounded-md ${ msg.role === 'user' ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 ml-auto max-w-[90%]' : `${colors.bg} text-gray-900 dark:text-gray-100 mr-auto max-w-[90%]` }`} aria-label={`${msg.role} message ${msgIndex + 1}`}> <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content || ''}</ReactMarkdown> </div> ))}
                                         {isSlotProcessing && ( <div className="flex items-center justify-center p-2 mt-2"><svg className="animate-spin h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg><p className="text-gray-500 dark:text-gray-400 text-xs">Loading...</p></div> )}
                                         {slotState.error && <p className="text-red-600 dark:text-red-400 mt-2 p-2 text-xs whitespace-pre-wrap" role="alert">Error: {slotState.error}</p>}
                                         {!hasModel && slotState.isActiveInHistory && Array.isArray(slotState.conversationHistory) && slotState.conversationHistory.length > 0 && <p className="text-gray-400 dark:text-gray-500 italic text-center mt-4 text-xs">Model removed.</p>}
                                     </div>
                                     {hasModel && selectedHistoryId && (
                                         <div className="mt-auto p-4 pt-2 border-t dark:border-gray-600 flex items-end space-x-2 flex-shrink-0">
                                             <textarea rows={1} value={slotState.followUpInput} onChange={(e) => setSlotStates(prev => prev.map((s, i) => i === originalIndex ? { ...s, followUpInput: e.target.value } : s))} placeholder={`Reply...`} className={`flex-grow p-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 ${colors.focusRing} focus:outline-none disabled:bg-gray-200 dark:disabled:bg-gray-700/50 disabled:cursor-not-allowed resize-none overflow-y-auto min-h-[40px] max-h-[100px]`} style={{ height: 'auto' }} onInput={(e) => { const target = e.target as HTMLTextAreaElement; target.style.height = 'auto'; target.style.height = `${target.scrollHeight}px`; }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && canEnableFollowUpButton) { e.preventDefault(); handleReplyToSlot(originalIndex); } }} disabled={!canEnableFollowUpInput} aria-label={`Follow-up input for Slot ${originalIndex + 1}`} />
                                             <button onClick={() => handleReplyToSlot(originalIndex)} disabled={!canEnableFollowUpButton} className={`px-3 py-2 ${colors.button} text-white text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 self-end mb-[1px] transition-opacity`} title={`Send follow-up`} aria-label={`Send follow-up to Slot ${originalIndex + 1}`}> {isSlotProcessing ? '...' : 'Send'} </button>
                                         </div>
                                     )}
                                 </div>
                             );
                         })}
                     </div>
                 )}

                 {/* Placeholder Section (shown when panels aren't visible) */}
                 {!shouldRenderPanels && user && !settingsLoading && hasAnyModelsConfigured && ( <div className="flex-grow flex items-center justify-center text-gray-500 dark:text-gray-400 text-center px-4">Enter a prompt or select a chat to begin.</div> )}
                 {!shouldRenderPanels && user && !settingsLoading && !hasAnyModelsConfigured && ( <div className="flex-grow flex items-center justify-center text-gray-500 dark:text-gray-400 text-center px-4">No models configured. Visit&nbsp;<Link href="/settings" className="underline text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">Settings</Link>.</div> )}
                 {!shouldRenderPanels && !user && !isAuthLoading && ( <div className="flex-grow"></div> )} {/* Empty div for logged out state below login prompt */}

             </main>
         </div>
     );
 }

