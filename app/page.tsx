 /* eslint-disable @typescript-eslint/no-unused-vars */
 /* eslint-disable @typescript-eslint/no-explicit-any */
 /* eslint-disable react-hooks/exhaustive-deps */
 // app/page.tsx
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
     // Flag to indicate if *any* response (success or error) has been received for the current turn/load
     responseReceivedThisTurn: boolean;
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
    const [currentChatPrompt, setCurrentChatPrompt] = useState<string | null>(null); // The initial prompt that started the current chat
    const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState<string | null>(null); // The most recent prompt submitted (initial or follow-up)
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [uiLocked, setUiLocked] = useState(false); // Lock UI only for major transitions (history load, new chat start)
    const [settingsError, setSettingsError] = useState<string | null>(null);
    const initialSlotState: AiSlotState = { modelName: null, loading: false, response: null, error: null, followUpInput: '', conversationHistory: [], isActiveInHistory: false, responseReceivedThisTurn: false };
    const [slotStates, setSlotStates] = useState<AiSlotState[]>([]);
    const [showPanels, setShowPanels] = useState(false); // Controls visibility of the response panel area
    const mainInputRef = useRef<HTMLTextAreaElement>(null);
    const [history, setHistory] = useState<InteractionHistoryItem[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null); // ID of the currently selected chat history item
    const [needsLogging, setNeedsLogging] = useState(false); // Flag to indicate if the *initial* interaction needs to be logged

    // --- Data Fetching Callbacks ---

    // Fetches the user's *current* saved model settings (used for NEW chats)
    const fetchSettings = useCallback(async (isForNewChat: boolean) => {
        if (!user || uiLocked) {
            if (uiLocked) console.log("fetchSettings skipped: UI is locked.");
            if (!user) { setSlotStates([]); setSettingsLoading(false); } // Clear slots if logged out
            return;
        }
        console.log("fetchSettings called, isForNewChat:", isForNewChat);
        setSettingsLoading(true); setSettingsError(null);
        try {
            const response = await fetch('/api/settings/get-settings');
            if (!response.ok) { const d = await response.json().catch(()=>({})); throw new Error(d.error || `Settings fetch failed (${response.status})`); }
            const data: FetchedSettings | null = await response.json();

            if (isForNewChat) { // Only apply settings if setting up a new chat
                const newSlotStates: AiSlotState[] = [];
                if (data) {
                    for (let i = 0; i < MAX_SLOTS; i++) {
                        const modelKey = `slot_${i + 1}_model` as keyof FetchedSettings;
                        let modelName: string | null = null;
                        // Validate format "Provider: Model Name"
                        if (data[modelKey] && typeof data[modelKey] === 'string' && data[modelKey]?.includes(': ')) {
                             modelName = data[modelKey] as string;
                        } else if (data[modelKey]) {
                             console.warn(`Invalid format in settings slot ${i+1}: "${data[modelKey]}". Expected "Provider: Model Name".`);
                        }
                        // Only add slots that have a valid model assigned
                        if (modelName) {
                            newSlotStates.push({ ...initialSlotState, modelName: modelName });
                        }
                    }
                }
                setSlotStates(newSlotStates);
                console.log(`Applied settings for NEW CHAT. Active slots: ${newSlotStates.length}`);
            } else {
                 console.log("Skipping settings application (not for new chat).");
            }
        } catch (e: any) {
            console.error("Error fetching settings:", e);
            setSettingsError(e.message);
            if (isForNewChat) setSlotStates([]); // Clear slots on error during new chat setup
        } finally {
            setSettingsLoading(false);
        }
    }, [user, uiLocked]); // Depends on user and uiLocked state

    // Fetches the list of past interactions for the sidebar
    const fetchHistory = useCallback(async () => {
        if (isAuthLoading || !user) {
             setHistory([]); setHistoryLoading(false); return; // Don't fetch if not logged in or auth still loading
        }
        setHistoryLoading(true); setHistoryError(null);
        try {
            const response = await fetch('/api/get-history');
            if (!response.ok) throw new Error(`History fetch failed (${response.status})`);
            const data: InteractionHistoryItem[] = await response.json();
            // Sort history by creation date, newest first
            data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            setHistory(data);
        } catch (e: any) {
            console.error("Error fetching history:", e);
            setHistoryError(e.message);
            setHistory([]); // Clear history on error
        } finally {
            setHistoryLoading(false);
        }
    }, [user, isAuthLoading]); // Depends on user and auth loading state

    // --- Initial Data Fetching Effect ---
    useEffect(() => {
        if (!isAuthLoading && user) {
            console.log("Auth loaded. User logged in.");
            fetchHistory(); // Fetch history list
            if (!selectedHistoryId) {
                // If no chat is selected, fetch settings to prepare for a potential new chat
                console.log("No history selected, fetching settings for potential new chat.");
                fetchSettings(true);
            } else {
                // If a chat IS selected, settings will be loaded when the history item is clicked
                console.log("History item selected, settings will load from history click.");
                setSettingsLoading(false); // Avoid showing global settings loading indicator
            }
        } else if (!isAuthLoading && !user) {
            // User is logged out
            console.log("Auth loaded. User logged out.");
            // Clear all relevant state
            setSlotStates([]); setHistory([]); setSettingsLoading(false); setHistoryLoading(false);
            setSelectedHistoryId(null); setCurrentChatPrompt(null); setLastSubmittedPrompt(null);
            setShowPanels(false); setUiLocked(false); setNeedsLogging(false);
            setSettingsError(null); setHistoryError(null);
        }
         // Only run when auth state changes or user logs in/out
    }, [user, isAuthLoading]); // Rerun when user or auth loading state changes

    // --- Log Initial Interaction ---
    // This function logs the *first* turn of a *new* chat to the database.
    const logInitialInteraction = useCallback(async (promptToLog: string, finalSlotStates: AiSlotState[]) => {
        if (!user || !promptToLog || finalSlotStates.every(s => !s.response && !s.error)) {
            console.log("Skipping initial log (no user, prompt, or responses/errors).");
            setNeedsLogging(false); // Reset flag even if skipped
            return;
        }
        console.log("Attempting to log INITIAL interaction...");
        // **NO UI LOCK HERE** - Logging happens in the background. Rely on individual slot loading states.
        try {
            // Helper to build the conversation history for logging (only successful turns)
            const buildLogHistory = (prompt: string, state: AiSlotState): ConversationMessage[] | null => {
                if (!prompt || !state.modelName || !state.response) return null; // Only log if model ran and gave a response
                return [ { role: 'user', content: prompt }, { role: 'model', content: state.response } ];
            };

            // Prepare data payload for the API
            const dataToLog: Record<string, any> = {
                 prompt: promptToLog,
                 title: promptToLog.substring(0, 50) + (promptToLog.length > 50 ? '...' : '') // Default title
            };

            // Add data for each slot that was active
            finalSlotStates.forEach((slotState, index) => {
                const slotNum = index + 1;
                const modelKey = `slot_${slotNum}_model_used`;
                const convKey = `slot_${slotNum}_conversation`;
                if (slotState.modelName) { // Only log slots that had a model assigned
                    dataToLog[modelKey] = slotState.modelName;
                    // Only log conversation history if the model produced a response
                    dataToLog[convKey] = buildLogHistory(promptToLog, slotState);
                } else {
                    dataToLog[modelKey] = null;
                    dataToLog[convKey] = null;
                }
            });
            // Ensure remaining slots are explicitly nulled in the log
            for (let i = finalSlotStates.length; i < MAX_SLOTS; i++) {
                const slotNum = i + 1;
                dataToLog[`slot_${slotNum}_model_used`] = null;
                dataToLog[`slot_${slotNum}_conversation`] = null;
            }

            // Call the logging API endpoint
            const response = await fetch('/api/log-interaction', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify(dataToLog)
            });
            const result = await response.json().catch(() => ({ success: false, error: 'Invalid JSON response' }));

            if (!response.ok || !result?.success || !result.loggedData?.[0]) {
                // Handle logging failure
                console.error('Failed to log interaction:', result?.error || `HTTP ${response.status}`);
                setHistoryError(`Failed to save chat: ${result?.error || 'Unknown error'}`);
            } else {
                // Handle logging success
                const newLogEntry = result.loggedData[0] as InteractionHistoryItem;
                if (newLogEntry?.id) {
                    console.log(`Interaction logged successfully. New ID: ${newLogEntry.id}`);
                    // Add the new entry to the top of the history list in the UI
                    setHistory(prev => [newLogEntry, ...prev.filter(h => h.id !== newLogEntry.id)]);
                    // Set the ID of the newly created chat as the selected one
                    setSelectedHistoryId(newLogEntry.id);
                    setHistoryError(null); // Clear previous history errors
                } else {
                    // Log succeeded but didn't return expected data, refetch history as fallback
                    console.warn("Log success but no ID returned. Refetching history.");
                    fetchHistory();
                }
            }
        } catch (error) {
            console.error('Error calling logging API:', error);
            setHistoryError(`Failed to save chat: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setNeedsLogging(false); // Reset the logging flag regardless of outcome
            console.log("Logging attempt finished.");
        }
    }, [user, fetchHistory]); // Depends on user and fetchHistory function

    // --- useEffect to Trigger Logging After Initial AI Calls Complete ---
    // This effect watches the loading state of the AI slots. When a new chat's
    // initial prompt has been sent (`needsLogging` is true) and all slots
    // have finished processing (`!anySlotLoading`), it triggers the logging function.
    useEffect(() => {
        const anySlotLoading = slotStates.some(slot => slot.loading); // Check if *any* slot is still loading
        if (needsLogging && currentChatPrompt && slotStates.length > 0 && !anySlotLoading) {
            console.log("All slots finished initial response, triggering log...");
            // Call the function to log the initial interaction data
            logInitialInteraction(currentChatPrompt, slotStates);
            // logInitialInteraction now resets needsLogging in its finally block
        }
    }, [ slotStates, needsLogging, currentChatPrompt, logInitialInteraction ]); // Rerun when slot states, logging flag, or prompt changes


    // --- Handle Clicking a History Item ---
    // Loads the selected chat interaction from the sidebar into the main view.
    const handleHistoryClick = useCallback(async (item: InteractionHistoryItem) => {
        if (!user || uiLocked) return; // Prevent action if not logged in or UI is locked
        console.log("handleHistoryClick triggered for item:", item.id);

        setUiLocked(true); // Lock UI during transition
        setSelectedHistoryId(item.id); // Set the selected history item ID
        setCurrentChatPrompt(item.prompt); // Set the initial prompt display
        setLastSubmittedPrompt(null); // Clear last submitted prompt (it's implicitly the last user message in history)
        setMainInputText(''); // Clear the main input textarea
        setNeedsLogging(false); // Not a new chat, no initial logging needed
        setShowPanels(false); // Hide panels briefly during state update
        setSettingsError(null); // Clear errors
        setHistoryError(null);

        // Prepare the state for each AI slot based on the loaded history data
        const loadedSlotStates: AiSlotState[] = [];
        for (let i = 0; i < MAX_SLOTS; i++) {
            const slotNum = i + 1;
            const modelKey = `slot_${slotNum}_model_used` as keyof InteractionHistoryItem;
            const conversationKey = `slot_${slotNum}_conversation` as keyof InteractionHistoryItem;

            const modelName = item[modelKey] as string | null;
            // Ensure the loaded history conforms to ConversationMessage[] type
            // Filter out any messages that might not have the correct role
            const rawHistory = (item[conversationKey] as any[] | null) || [];
            const conversationHistory: ConversationMessage[] = rawHistory
                .filter(msg => msg && (msg.role === 'user' || msg.role === 'model') && typeof msg.content === 'string')
                .map(msg => ({ role: msg.role as 'user' | 'model', content: msg.content }));


            // Determine if this slot was active in the saved chat
            const isActive = !!modelName || conversationHistory.length > 0;
            // Check if the model name format is valid
            const isValidModel = typeof modelName === 'string' && modelName.includes(': ');
            if (modelName && !isValidModel) {
                 console.warn(`Invalid model format in history ${item.id} slot ${slotNum}: "${modelName}".`);
            }

            loadedSlotStates.push({
                ...initialSlotState, // Start with default state
                modelName: isValidModel ? modelName : null, // Use model name only if valid format
                // Find the last model response in the history for display
                response: conversationHistory.findLast(m => m.role === 'model')?.content || null,
                conversationHistory: conversationHistory, // Load the validated/mapped conversation
                isActiveInHistory: isActive, // Mark if the slot was used
                // Assume response was received if there's any model message in history
                responseReceivedThisTurn: conversationHistory.some(m => m.role === 'model'),
                // Clear follow-up input when loading history
                followUpInput: '',
            });
        }
        setSlotStates(loadedSlotStates); // Update the state with the loaded data
        console.log(`Prepared ${loadedSlotStates.filter(s=>s.isActiveInHistory).length} active states from history ${item.id}.`);

        // Use a short timeout to allow React to process the state update before revealing panels and unlocking UI
        setTimeout(() => {
            setShowPanels(true); // Show the AI response panels
            setUiLocked(false); // Unlock UI
            console.log(`State updated, UI unlocked for history ${item.id}.`);
            mainInputRef.current?.focus(); // Focus main input for follow-up
        }, 50); // Small delay (50ms)

    }, [user, uiLocked]); // Depends on user and uiLocked state

     // --- Handle "New Chat" Button Click ---
     // Resets the UI to a state ready for a new initial prompt.
     const handleNewChat = useCallback(() => {
        if (!user || uiLocked) return; // Prevent action if not logged in or UI locked
        console.log("Starting New Chat");

        setUiLocked(true); // Lock UI during reset and settings fetch
        setSelectedHistoryId(null); // Clear selected history ID
        setCurrentChatPrompt(null); // Clear displayed initial prompt
        setLastSubmittedPrompt(null); // Clear last submitted prompt
        setMainInputText(''); // Clear main input textarea
        setShowPanels(false); // Hide AI panels
        setNeedsLogging(false); // Reset logging flag
        setSlotStates([]); // Clear existing slot states
        setHistoryError(null); // Clear errors
        setSettingsError(null);

        // Fetch the user's current settings to configure slots for the new chat
        fetchSettings(true).finally(() => {
            setUiLocked(false); // Unlock UI after settings are fetched (or fetch fails)
            console.log("New Chat setup complete, UI unlocked.");
            mainInputRef.current?.focus(); // Focus the main input area
        });
     }, [user, uiLocked, fetchSettings]); // Depends on user, lock state, and fetchSettings function

     // --- Handle Update Title & Delete Item (Passed to Sidebar) ---
     // Updates the title of a history item in the database and UI.
     const handleUpdateTitle = useCallback(async (id: string, newTitle: string): Promise<boolean> => {
         if (!user) return false; // Requires user login
         try {
             const response = await fetch('/api/update-history-title', {
                 method: 'PATCH',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ id, title: newTitle })
             });
             const result = await response.json();
             if (!response.ok || !result.success) {
                 throw new Error(result.error || 'Failed to update title');
             }
             // Update title in the local history state
             setHistory(prev => prev.map(item => item.id === id ? { ...item, title: newTitle } : item));
             setHistoryError(null); // Clear previous errors
             return true;
         } catch (error: any) {
             setHistoryError(`Update failed: ${error.message}`);
             return false;
         }
     }, [user]); // Depends on user

     // Deletes a history item from the database and UI.
     const handleDeleteItem = useCallback(async (id: string): Promise<boolean> => {
         if (!user) return false; // Requires user login
         try {
             const response = await fetch('/api/delete-history-item', {
                 method: 'DELETE',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ id })
             });
             const result = await response.json();
             if (!response.ok || !result.success) {
                 throw new Error(result.error || 'Failed to delete item');
             }
             // Remove item from the local history state
             setHistory(prev => prev.filter(item => item.id !== id));
             // If the deleted item was the currently selected one, reset to "New Chat" state
             if (selectedHistoryId === id) {
                 console.log("Deleting selected chat, switching to New Chat.");
                 handleNewChat(); // Use the existing new chat logic
             }
             setHistoryError(null); // Clear previous errors
             return true;
         } catch (error: any) {
             setHistoryError(`Delete failed: ${error.message}`);
             return false;
         }
     }, [user, selectedHistoryId, handleNewChat]); // Depends on user, selected ID, and new chat handler


     // --- Helper Function to Call AI API & Append Conversation ---
     // Handles the API call for a single AI slot and updates its state.
     const callApiForSlot = useCallback(async (
         slotIndex: number,
         modelString: string | null,
         promptToSend: string,
         currentHistory: ConversationMessage[], // History *before* this turn's user message
         currentInteractionId: string | null // null for initial prompt, ID for follow-ups
     ) => {
         const slotNumber = slotIndex + 1; // 1-based index for logging/API

         // Helper to update the state for *only* this specific slot
         const updateSlotState = (updateFn: (prevState: AiSlotState) => AiSlotState) => {
             setSlotStates(prevStates => prevStates.map((state, index) =>
                 index === slotIndex ? updateFn(state) : state
             ));
         };

         // Abort if no model or prompt provided
         if (!modelString || !promptToSend) {
             updateSlotState(prev => ({ ...prev, loading: false, error: "Missing model or prompt." }));
             return;
         }

         // Prepare the user message and the history to send to the API
         const newUserMessage: ConversationMessage = { role: 'user', content: promptToSend };
         // Ensure currentHistory is correctly typed before spreading
         const validCurrentHistory = Array.isArray(currentHistory) ? currentHistory : [];
         const historyToSend: ConversationMessage[] = [...validCurrentHistory, newUserMessage]; // Include the new user message

         // --- Immediate UI Update (Start Processing) ---
         updateSlotState(prev => ({
             ...prev,
             loading: true, // Set loading state
             response: null, // Clear previous response
             error: null, // Clear previous error
             conversationHistory: historyToSend, // Show user message immediately
             responseReceivedThisTurn: false, // Reset response flag for this turn
         }));
         console.log(`Slot ${slotNumber} (${modelString}): Sending prompt...`);

         let modelResponseText: string | null = null;
         try {
             // --- Prepare API Call ---
             const parts = modelString.split(': ');
             if (parts.length !== 2) throw new Error(`Invalid model format: ${modelString}`);
             const provider = parts[0];
             const specificModel = parts[1];

             let apiUrl = '';
             if (provider === 'ChatGPT') apiUrl = '/api/call-openai';
             else if (provider === 'Gemini') apiUrl = '/api/call-gemini';
             else if (provider === 'Anthropic') apiUrl = '/api/call-anthropic';
             else throw new Error(`Unsupported provider: ${provider}`);

             // --- Make API Call ---
             const apiResponse = await fetch(apiUrl, {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                     prompt: promptToSend, // Send only the current prompt text
                     model: specificModel,
                     slotNumber, // Pass slot number for potential backend logic
                     conversationHistory: historyToSend // Send the full history including the latest user message
                 })
             });
             const result = await apiResponse.json().catch(() => ({ error: "Invalid JSON response from API" }));

             if (!apiResponse.ok) {
                 throw new Error(result.error || `API call failed (${apiResponse.status})`);
             }
             modelResponseText = result.response;
             if (!modelResponseText) {
                 throw new Error("API returned an empty response.");
             }

             // --- UI Update on Success ---
             const newModelMessage: ConversationMessage = { role: 'model', content: modelResponseText };
             updateSlotState(prev => ({
                 ...prev,
                 response: modelResponseText, // Store the successful response
                 error: null, // Clear any previous error
                 loading: false, // Clear loading state
                 conversationHistory: [...historyToSend, newModelMessage], // Append model response to history
                 responseReceivedThisTurn: true, // Mark response as received for this turn
             }));
             console.log(`Slot ${slotNumber} (${modelString}) received response.`);

             // --- Append to DB (Only for follow-ups in existing chats) ---
             if (currentInteractionId) {
                 console.log(`Attempting to append turn to DB for interaction ${currentInteractionId}, slot ${slotNumber}`);
                 const finalHistoryForAppend = [...historyToSend, newModelMessage]; // Full history including new turn
                 // Fire-and-forget call to append endpoint (handle errors locally)
                 fetch('/api/append-conversation', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({
                         interactionId: currentInteractionId,
                         slotNumber: slotNumber,
                         conversation: finalHistoryForAppend // Send the complete updated history
                     })
                 })
                 .then(async appendResponse => {
                     if (!appendResponse.ok) {
                         const appendError = await appendResponse.json().catch(() => ({}));
                         console.error(`Error appending conversation for slot ${slotNumber}:`, appendError.error || `HTTP ${appendResponse.status}`);
                         // Show error in main UI, maybe less intrusive than historyError?
                         updateSlotState(prev => ({ ...prev, error: prev.error ? `${prev.error}\nSave Error.` : 'Failed to save this turn.' }));
                         // Optionally set a less intrusive error state specific to saving?
                         // setHistoryError(`Error saving follow-up for Slot ${slotNumber}.`);
                     } else {
                         console.log(`Successfully appended conversation for slot ${slotNumber} to ID ${currentInteractionId}`);
                         // Clear specific save errors if needed, or rely on next interaction clearing general errors
                         // setHistoryError(null);
                     }
                 })
                 .catch(appendErr => {
                     console.error(`Network/fetch error calling append-conversation API for slot ${slotNumber}:`, appendErr);
                     updateSlotState(prev => ({ ...prev, error: prev.error ? `${prev.error}\nNetwork Save Error.` : 'Network error saving turn.' }));
                     // setHistoryError(`Network error saving follow-up for Slot ${slotNumber}.`);
                 });
             }

         } catch (error: any) {
             // --- UI Update on Error ---
             console.error(`Error in callApiForSlot (Slot ${slotNumber}, Model: ${modelString}):`, error);
             updateSlotState(prev => ({
                 ...prev,
                 response: null, // Clear any previous response
                 error: error.message || 'Unknown error occurred', // Show error message
                 loading: false, // Clear loading state
                 // Keep user message in history even on error
                 conversationHistory: historyToSend,
                 responseReceivedThisTurn: true, // Mark turn as finished (even though it errored)
             }));
         }
     }, []); // No external state dependencies needed inside, setSlotStates handles updates correctly

    // --- Handle Processing New Prompt / Main Follow-up ---
    // Called when the user submits text in the main input area.
    const handleProcessText = useCallback(async () => {
        const currentInput = mainInputText.trim();
        // Use a fresh read of slotStates to determine active models for *this* call
        // Filter slots based on whether a model is assigned *at this moment*
        const activeSlotsForCall = slotStates.filter(s => s.modelName);

        // --- Pre-conditions Check ---
        if (currentInput === '' || !user || isAuthLoading || settingsLoading || activeSlotsForCall.length === 0 || uiLocked) {
            let reason = "Unknown";
            if (currentInput === '') reason = "Input empty";
            else if (!user) reason = "Not logged in";
            else if (isAuthLoading) reason = "Auth loading";
            else if (settingsLoading) reason = "Settings loading";
            else if (activeSlotsForCall.length === 0) reason = "No active models";
            else if (uiLocked) reason = "UI Locked";
            console.log(`handleProcessText skipped: ${reason}.`);
            return;
        }

        const isFirstPromptOfChat = !selectedHistoryId; // Is this the very first prompt of a new chat?
        const promptToSend = currentInput;

        console.log(`Processing ${isFirstPromptOfChat ? 'initial' : 'follow-up'} prompt: "${promptToSend}" for ${activeSlotsForCall.length} slots`);

        // --- Update UI State Before API Calls ---
        if (isFirstPromptOfChat) {
             setCurrentChatPrompt(promptToSend); // Set the initial prompt display for the chat
             setNeedsLogging(true); // Flag that this initial interaction needs logging after responses
        } else {
             setNeedsLogging(false); // Not the first prompt, no initial logging needed
        }
        setLastSubmittedPrompt(promptToSend); // Record the prompt being sent
        setShowPanels(true); // Ensure panels are visible
        if (mainInputRef.current) mainInputRef.current.blur(); // Unfocus main input
        setMainInputText(''); // Clear the main input textarea

        // Get the current history ID (will be null for the first prompt)
        const currentInteractionIdForUpdate = selectedHistoryId;

        // --- Prepare Slots for API Calls ---
        // Use a state updater function to ensure we're working with the latest state
        setSlotStates(currentSlotStates => {
            // Map over the *current* state to reset flags and add user message
            return currentSlotStates.map(s => {
                // Only modify slots that have a model assigned for this turn
                if (s.modelName) {
                    // Determine the history to build upon
                    // For the first prompt, history is empty. For follow-ups, use existing history.
                    const historyForThisTurn = isFirstPromptOfChat ? [] : s.conversationHistory;
                    const userMessage: ConversationMessage = { role: 'user', content: promptToSend };
                    return {
                        ...s,
                        loading: true, // Set loading immediately
                        response: null, error: null, // Clear previous outputs
                        conversationHistory: [...historyForThisTurn, userMessage], // Add user message now
                        responseReceivedThisTurn: false, // Reset flag for this turn
                        // Reset isActiveInHistory only for the very first prompt
                        isActiveInHistory: isFirstPromptOfChat ? true : s.isActiveInHistory, // Mark as active if it wasn't already
                    };
                }
                return s; // Return unchanged state for inactive slots
            });
        });

        // --- Initiate API Calls Concurrently ---
        // Iterate over the slots determined to be active *before* the state update was queued.
        const promises = activeSlotsForCall.map((slotState) => {
            // Find the original index in the main slotStates array to call the correct slot
            const originalIndex = slotStates.findIndex(s => s === slotState); // Find index based on the pre-update state

            if (originalIndex !== -1 && slotState.modelName) { // Check modelName again just in case
                // Pass the history *before* adding the user message for this turn.
                // callApiForSlot will add the user message internally.
                // Use the history from the state *before* the update was queued.
                // **FIX**: Explicitly cast the result of slice to ConversationMessage[]
                const historyForApi: ConversationMessage[] = isFirstPromptOfChat
                    ? []
                    : (slotState.conversationHistory.slice(0, -1) as ConversationMessage[]);

                return callApiForSlot(
                    originalIndex,
                    slotState.modelName,
                    promptToSend,
                    historyForApi, // Pass the correctly typed history slice
                    currentInteractionIdForUpdate // Pass history ID (null for initial)
                );
            }
            return Promise.resolve(); // Return resolved promise for inactive slots
        });


        // Wait for all API call initiations (not necessarily completion)
        Promise.allSettled(promises).then(() => {
            console.log("All main API call initiations complete.");
            // Note: Logging of initial interaction happens in the useEffect hook watching slotStates
        });

    }, [ mainInputText, user, isAuthLoading, settingsLoading, selectedHistoryId, slotStates, callApiForSlot, uiLocked ]); // Dependencies


     // --- Handle Individual Follow-up Replies ---
     // Called when the user sends a reply from a specific AI slot's input.
     const handleReplyToSlot = useCallback((slotIndex: number) => {
         // No uiLocked check here, rely on the individual slot's loading state
         const targetState = slotStates[slotIndex];
         if (!targetState) { console.error(`handleReplyToSlot: Invalid slotIndex ${slotIndex}`); return; }

         const followUpPrompt = targetState.followUpInput.trim();
         const modelName = targetState.modelName;
         const currentHistory = targetState.conversationHistory; // History up to the last model response

         // --- Pre-conditions Check ---
         // Require history ID (chat must be saved), model, user, and non-empty input
         if (!followUpPrompt || !modelName || !user || !selectedHistoryId) {
             if (!selectedHistoryId) console.warn("Cannot send reply: Chat not saved yet (no history ID).");
             if (!followUpPrompt) console.warn("Cannot send reply: Input empty.");
             if (!modelName) console.warn("Cannot send reply: No model assigned to slot.");
             if (!user) console.warn("Cannot send reply: User not logged in.");
             return;
         }
         // Prevent sending if this specific slot is already processing a request
         if (targetState.loading) {
             console.log(`Reply blocked for slot ${slotIndex+1}: Already processing.`);
             return;
         }

         console.log(`Sending follow-up to Slot ${slotIndex + 1} (${modelName}): "${followUpPrompt}"`);
         setLastSubmittedPrompt(followUpPrompt); // Record the prompt being sent
         setNeedsLogging(false); // Follow-ups don't trigger initial logging

         // Clear the input field for *this specific slot* immediately
         setSlotStates(prevStates => prevStates.map((state, index) =>
             index === slotIndex ? { ...state, followUpInput: '' } : state
         ));

         // Call the API function for this slot
         callApiForSlot(
             slotIndex,
             modelName,
             followUpPrompt,
             currentHistory, // Pass the existing conversation history
             selectedHistoryId // Pass the history ID for appending
         );
     }, [user, slotStates, callApiForSlot, selectedHistoryId]); // Dependencies


    // --- Determine Overall UI State ---
    const isProcessingAny = slotStates.some(slot => slot.loading); // Is any slot currently loading?
    const canInteractGenerally = !!user && !isAuthLoading && !settingsLoading && !uiLocked; // Can user interact with non-processing elements?
    const hasAnyModelsConfigured = slotStates.some(s => s.modelName); // Are there any models configured (either from settings or loaded history)?
    // Can the main input be used? Requires general interaction + nothing processing + (either a saved chat exists OR models are configured for a new chat)
    const canUseMainInput = canInteractGenerally && !isProcessingAny && (!!selectedHistoryId || hasAnyModelsConfigured);

    // Determine which slots to actually display based on current context
    // If history is selected, show slots active in that history.
    // If it's a new chat, show slots configured in settings.
    const slotsToDisplay = slotStates.filter(slotState =>
         selectedHistoryId ? slotState.isActiveInHistory : !!slotState.modelName
     );
    const numberOfSlotsToDisplay = slotsToDisplay.length;


    // --- Helper to get Display Name ---
    const getModelDisplayName = (modelString: string | null): string => {
        if (!modelString) return "Slot Empty";
        // Optionally shorten long model names if needed
        return modelString;
    };

    // --- Dynamic Grid Class Function ---
    // Calculates Tailwind grid classes based on the number of panels to display.
    const getGridContainerClass = (count: number): string => {
        let classes = 'w-full max-w-7xl grid gap-4 self-center flex-grow px-1 pb-4 overflow-hidden '; // Base classes
        // Responsive grid column setup
        if (count <= 1)       classes += 'grid-cols-1'; // Single column
        else if (count === 2) classes += 'grid-cols-1 lg:grid-cols-2'; // 1 col on small, 2 on large+
        else if (count === 3) classes += 'grid-cols-1 lg:grid-cols-3'; // 1 col on small, 3 on large+
        else if (count === 4) classes += 'grid-cols-1 md:grid-cols-2'; // 1 col on small, 2x2 on medium+
        else if (count === 5) classes += 'grid-cols-1 md:grid-cols-6'; // Special 6-col base for 5 items (see below)
        else if (count >= 6)  classes += 'grid-cols-1 md:grid-cols-3'; // 1 col on small, 3x2 on medium+
        else                  classes += 'grid-cols-1 md:grid-cols-3'; // Default fallback
        return classes;
    };

    // --- Helper function for individual panel classes in the 5-item layout ---
    // Spans columns appropriately on medium screens and up for a 3-then-2 layout.
    const getFiveItemLayoutClass = (index: number): string => {
        // Assumes the container has 'md:grid-cols-6'
        if (index < 3) { return 'md:col-span-2'; } // First 3 items span 2 cols each (total 6)
        else if (index === 3) { return 'md:col-start-2 md:col-span-2'; } // 4th item starts at col 2, spans 2
        else { return 'md:col-start-4 md:col-span-2'; } // 5th item starts at col 4, spans 2
    };


    // --- Render Component JSX ---
    return (
        <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
            {/* History Sidebar */}
            <HistorySidebar
                history={history}
                historyLoading={historyLoading || isAuthLoading} // Show loading if history OR auth is loading
                historyError={historyError}
                selectedHistoryId={selectedHistoryId}
                handleHistoryClick={handleHistoryClick}
                fetchHistory={fetchHistory}
                onUpdateTitle={handleUpdateTitle}
                onDeleteItem={handleDeleteItem}
                isLoggedIn={!!user}
                handleNewChat={handleNewChat}
            />

            {/* Main Content Area */}
            <main className="relative flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
                {/* Loading Overlay for major transitions (History Load, New Chat, Auth Load) */}
                {/* IMPORTANT: This overlay does NOT cover the 'isProcessingAny' state */}
                {(uiLocked || (settingsLoading && !selectedHistoryId) || isAuthLoading) && (
                    <div className="absolute inset-0 bg-gray-400/30 dark:bg-gray-900/50 flex items-center justify-center z-50" aria-label="Loading content">
                        <svg className="animate-spin h-8 w-8 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="ml-3 text-gray-700 dark:text-gray-300">Loading...</span>
                    </div>
                )}

                {/* Top Bar: Error Display & Settings Link */}
                <div className="w-full max-w-7xl mb-4 self-center flex justify-between items-center px-1 h-5 flex-shrink-0">
                    {/* Display Settings or History errors */}
                    <div className="text-sm text-red-500 dark:text-red-400 truncate" title={settingsError ?? historyError ?? ''}>
                        {settingsError && `Settings Error: ${settingsError}`}
                        {historyError && !settingsError && `History Error: ${historyError}`}
                    </div>
                    {/* Settings Link (only if logged in) */}
                    {user && !isAuthLoading && (
                        <Link href="/settings" className={`text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline whitespace-nowrap ${uiLocked ? 'pointer-events-none opacity-50' : ''}`}>
                            ⚙️ Settings
                        </Link>
                    )}
                     {/* Placeholder for alignment when logged out */}
                    {!user && !isAuthLoading && <div className="h-5"></div>}
                </div>

                {/* Login Prompt (if not logged in) */}
                {!user && !isAuthLoading && (
                    <div className="w-full max-w-3xl mb-6 self-center p-4 bg-yellow-100 border border-yellow-300 rounded-md text-center text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-100 dark:border-yellow-700">
                        Please <Link href="/auth" className="font-semibold underline hover:text-yellow-900 dark:hover:text-yellow-200">Sign In or Sign Up</Link> to use the AI comparison tool.
                    </div>
                )}

                {/* Main Input Area (Textarea and Send Button) */}
                <div className="w-full max-w-3xl mb-4 self-center flex-shrink-0 px-1">
                    <textarea
                        ref={mainInputRef}
                        rows={1}
                        value={mainInputText}
                        onChange={(e) => setMainInputText(e.target.value)}
                        placeholder={
                            !user ? "Please log in" :
                            settingsLoading ? "Loading settings..." :
                            !selectedHistoryId && !hasAnyModelsConfigured ? "No AI models configured. Go to Settings." :
                            isProcessingAny ? "Processing..." : // Show processing if any slot is busy
                            selectedHistoryId ? "Send follow-up to all active slots..." :
                            "Enter initial prompt to compare models..."
                        }
                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 shadow-sm disabled:bg-gray-200 dark:disabled:bg-gray-700/50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 resize-none overflow-y-auto min-h-[44px] max-h-[128px]"
                        style={{ height: 'auto' }} // Auto-height based on content
                        // Auto-resize textarea height on input
                        onInput={(e) => { const target = e.target as HTMLTextAreaElement; target.style.height = 'auto'; target.style.height = `${target.scrollHeight}px`; }}
                        // Handle Enter key press (send if conditions met)
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && canUseMainInput && mainInputText.trim() !== '') { e.preventDefault(); handleProcessText(); } }}
                        // Disable based on calculated state
                        disabled={!canUseMainInput}
                        aria-label="Main prompt input"
                    />
                    <button
                        onClick={handleProcessText}
                        // Disable button based on calculated state and if input is empty
                        disabled={!canUseMainInput || mainInputText.trim() === ''}
                        className={`w-full mt-2 p-3 text-white rounded-md font-semibold transition-colors duration-200 ${
                            !canUseMainInput || mainInputText.trim() === ''
                            ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed' // Disabled style
                            : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600' // Enabled style
                        }`}
                    >
                        {/* Dynamic button text */}
                        {isProcessingAny ? 'Processing...' : (selectedHistoryId) ? 'Send Follow-up to All' : 'Send Initial Prompt'}
                    </button>
                </div>

                {/* AI Response Panels Section - Container */}
                {/* Show only if: logged in, settings loaded, (panels should be shown OR history selected), and there are slots */}
                {user && !settingsLoading && (showPanels || selectedHistoryId) && slotStates.length > 0 && (
                    <div className={getGridContainerClass(numberOfSlotsToDisplay)}>
                        {/* Map over the slots determined to be displayed */}
                        {slotsToDisplay.map((slotState, displayIndex) => {
                            // Find the original index of this slot in the main slotStates array
                            const originalIndex = slotStates.findIndex(s => s === slotState);
                            if (originalIndex === -1) return null; // Should not happen, but safety check

                            const colors = PANEL_COLORS[originalIndex % PANEL_COLORS.length]; // Cycle through colors
                            const isSlotProcessing = slotState.loading; // Is *this specific* slot loading?
                            const hasModel = !!slotState.modelName; // Does this slot have a model assigned?

                            // Apply special layout classes for 5 items
                            let panelSpecificClasses = '';
                            if (numberOfSlotsToDisplay === 5) {
                                 panelSpecificClasses = getFiveItemLayoutClass(displayIndex);
                            }
                            // Adjust min-height based on number of panels for better layout
                            const panelHeightClass = numberOfSlotsToDisplay >= 4 ? 'min-h-[350px]' : 'min-h-[250px]';

                            // --- Determine Follow-up Input/Button Enabled State ---
                            // Can TYPE in follow-up if generally allowed and this slot isn't processing
                            const canEnableFollowUpInput = canInteractGenerally && !isSlotProcessing;
                            // Can CLICK SEND if: generally allowed, model exists, slot not processing, chat is saved (has ID), and input has text
                            const canEnableFollowUpButton = canInteractGenerally && hasModel && !isSlotProcessing && !!selectedHistoryId && slotState.followUpInput.trim() !== '';

                            return (
                                <div
                                    key={`panel-${originalIndex}-${selectedHistoryId || 'new'}`} // Unique key including history ID
                                    className={`border rounded-lg bg-white dark:bg-gray-800 shadow-md flex flex-col ${colors.border} overflow-hidden ${panelHeightClass} ${panelSpecificClasses}`}
                                    role="article"
                                    aria-labelledby={`panel-heading-${originalIndex}`}
                                >
                                    {/* Panel Header */}
                                    <h2 id={`panel-heading-${originalIndex}`} className={`text-lg md:text-xl font-semibold p-4 pb-2 ${colors.text} flex-shrink-0 truncate border-b dark:border-gray-700`} title={slotState.modelName || `Slot ${originalIndex + 1} (Empty)`}>
                                        {getModelDisplayName(slotState.modelName)} (Slot {originalIndex + 1})
                                    </h2>

                                    {/* Conversation Area */}
                                    <div className="flex-grow overflow-y-auto text-sm p-4 space-y-3 custom-scrollbar" role="log">
                                        {/* Placeholder if slot is empty */}
                                        {!hasModel && slotState.conversationHistory.length === 0 && <p className="text-gray-400 dark:text-gray-500 italic text-center mt-4">Slot empty.</p>}

                                        {/* Render conversation messages */}
                                        {slotState.conversationHistory && slotState.conversationHistory.map((msg, msgIndex) => (
                                            <div
                                                key={`msg-${originalIndex}-${msgIndex}`}
                                                className={`prose prose-sm dark:prose-invert max-w-none p-2 rounded-md ${
                                                    msg.role === 'user'
                                                        ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 ml-auto max-w-[90%]' // User message style
                                                        : `${colors.bg} text-gray-900 dark:text-gray-100 mr-auto max-w-[90%]` // Model message style
                                                }`}
                                                aria-label={`${msg.role} message ${msgIndex + 1}`}
                                            >
                                                {/* Render Markdown content */}
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                                            </div>
                                        ))}

                                        {/* Loading indicator for this specific slot */}
                                        {isSlotProcessing && (
                                            <div className="flex items-center justify-center p-2 mt-2">
                                                <svg className="animate-spin h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg>
                                                <p className="text-gray-500 dark:text-gray-400 text-xs">Loading...</p>
                                            </div>
                                        )}
                                        {/* Error message for this specific slot */}
                                        {slotState.error && <p className="text-red-600 dark:text-red-400 mt-2 p-2 text-xs whitespace-pre-wrap" role="alert">Error: {slotState.error}</p>}
                                        {/* Indicator if model was used in history but isn't assigned now */}
                                        {!hasModel && slotState.isActiveInHistory && slotState.conversationHistory.length > 0 && <p className="text-gray-400 dark:text-gray-500 italic text-center mt-4 text-xs">Model not assigned in current settings.</p>}
                                    </div>

                                    {/* Follow-up Input Area for this Slot */}
                                    {/* Show only if model exists AND chat is saved (has history ID) */}
                                    {hasModel && selectedHistoryId && (
                                        <div className="mt-auto p-4 pt-2 border-t dark:border-gray-600 flex items-end space-x-2 flex-shrink-0">
                                            <textarea
                                                rows={1}
                                                value={slotState.followUpInput}
                                                onChange={(e) => setSlotStates(prev => prev.map((s, i) => i === originalIndex ? { ...s, followUpInput: e.target.value } : s))}
                                                placeholder={`Reply to Slot ${originalIndex + 1}...`}
                                                className={`flex-grow p-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 ${colors.focusRing} focus:outline-none disabled:bg-gray-200 dark:disabled:bg-gray-700/50 disabled:cursor-not-allowed resize-none overflow-y-auto min-h-[40px] max-h-[100px]`}
                                                style={{ height: 'auto' }} // Auto-height
                                                onInput={(e) => { const target = e.target as HTMLTextAreaElement; target.style.height = 'auto'; target.style.height = `${target.scrollHeight}px`; }}
                                                // Send on Enter if button is enabled
                                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && canEnableFollowUpButton) { e.preventDefault(); handleReplyToSlot(originalIndex); } }}
                                                // Disable typing if UI locked generally or *this slot* is processing
                                                disabled={!canInteractGenerally || isSlotProcessing}
                                                aria-label={`Follow-up input for Slot ${originalIndex + 1}`}
                                            />
                                            <button
                                                onClick={() => handleReplyToSlot(originalIndex)}
                                                // Disable button based on calculated logic
                                                disabled={!canEnableFollowUpButton}
                                                className={`px-3 py-2 ${colors.button} text-white text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 self-end mb-[1px] transition-opacity`}
                                                title={`Send follow-up to ${getModelDisplayName(slotState.modelName)} (Slot ${originalIndex + 1})`}
                                                aria-label={`Send follow-up to Slot ${originalIndex + 1}`}
                                            >
                                                {/* Show ellipsis if this slot is processing */}
                                                {isSlotProcessing ? '...' : 'Send'}
                                            </button>
                                        </div>
                                    )}
                                </div> // End panel
                            );
                        })} {/* End map */}
                    </div> // End grid container
                )}

                {/* Placeholder Section (when panels are not shown) */}
                {/* Case 1: Logged in, settings loaded, panels hidden, models ARE configured */}
                 {user && !settingsLoading && !(showPanels || selectedHistoryId) && hasAnyModelsConfigured && (
                     <div className="flex-grow flex items-center justify-center text-gray-500 dark:text-gray-400 text-center px-4">
                         Enter a prompt above or select a chat from the history to begin.
                     </div>
                 )}
                 {/* Case 2: Logged in, settings loaded, panels hidden, NO models configured */}
                 {user && !settingsLoading && !(showPanels || selectedHistoryId) && !hasAnyModelsConfigured && (
                     <div className="flex-grow flex items-center justify-center text-gray-500 dark:text-gray-400 text-center px-4">
                         No active AI models configured. Please visit <Link href="/settings" className="underline text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">Settings</Link>.
                     </div>
                 )}
                 {/* Case 3: Not logged in */}
                 {!user && !isAuthLoading && (
                     <div className="flex-grow flex items-center justify-center text-gray-500 dark:text-gray-400 text-center px-4">
                         {/* Intentionally empty or add a generic welcome message */}
                     </div>
                 )}

            </main> {/* End Main Content Area */}
        </div> // End Root Div
    );
 }
