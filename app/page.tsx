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
const MAX_SLOTS = 6; // Max number of *comparison* slots

// --- Types ---
interface FetchedSettings {
    slot_1_model: string | null;
    slot_2_model: string | null;
    slot_3_model: string | null;
    slot_4_model: string | null;
    slot_5_model: string | null;
    slot_6_model: string | null;
    summary_model: string | null; // Added summary model
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
// Base colors for comparison slots
const PANEL_COLORS = [
    { border: 'border-blue-200 dark:border-blue-700/60', text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30', focusRing: 'focus:ring-blue-500', button: 'bg-blue-500 hover:bg-blue-600' },
    { border: 'border-green-200 dark:border-green-700/60', text: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/30', focusRing: 'focus:ring-green-500', button: 'bg-green-500 hover:bg-green-600' },
    { border: 'border-purple-200 dark:border-purple-700/60', text: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/30', focusRing: 'focus:ring-purple-500', button: 'bg-purple-500 hover:bg-purple-600' },
    { border: 'border-orange-200 dark:border-orange-700/60', text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/30', focusRing: 'focus:ring-orange-500', button: 'bg-orange-500 hover:bg-orange-600' },
    { border: 'border-teal-200 dark:border-teal-700/60', text: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/30', focusRing: 'focus:ring-teal-500', button: 'bg-teal-500 hover:bg-teal-600' },
    { border: 'border-pink-200 dark:border-pink-700/60', text: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-50 dark:bg-pink-900/30', focusRing: 'focus:ring-pink-500', button: 'bg-pink-500 hover:bg-pink-600' },
];
// Specific colors for the summary panel
const SUMMARY_PANEL_COLORS = {
    border: 'border-gray-300 dark:border-gray-600/80',
    text: 'text-gray-700 dark:text-gray-300',
    bg: 'bg-gray-50 dark:bg-gray-800/50',
    focusRing: 'focus:ring-gray-500', // Not applicable as it has no input
    button: '', // No buttons in summary panel
};

export default function Home() {
    // --- State Hooks ---
    const { user, isLoading: isAuthLoading } = useAuth();
    const [mainInputText, setMainInputText] = useState('');
    const [currentChatPrompt, setCurrentChatPrompt] = useState<string | null>(null); // The initial prompt of the current chat
    const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState<string | null>(null); // The most recent prompt submitted (initial or follow-up)
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [uiLocked, setUiLocked] = useState(false); // General UI lock (e.g., during history load)
    const [settingsError, setSettingsError] = useState<string | null>(null);
    const initialSlotState: AiSlotState = { modelName: null, loading: false, response: null, error: null, followUpInput: '', conversationHistory: [], isActiveInHistory: false, responseReceivedThisTurn: false };
    const [slotStates, setSlotStates] = useState<AiSlotState[]>([]); // State for comparison slots
    const [summaryModelState, setSummaryModelState] = useState<string | null>(null); // State for the configured summary model
    const [summaryText, setSummaryText] = useState<string | null>(null); // State for the generated summary content
    const [summaryLoading, setSummaryLoading] = useState(false); // Loading state for summary generation
    const [summaryError, setSummaryError] = useState<string | null>(null); // Error state for summary generation
    const [showPanels, setShowPanels] = useState(false); // Explicitly control panel visibility
    const mainInputRef = useRef<HTMLTextAreaElement>(null);
    const [history, setHistory] = useState<InteractionHistoryItem[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
    const [needsSummaryAndLog, setNeedsSummaryAndLog] = useState(false); // Flag to trigger summary generation and logging after initial responses
    const isProcessingSummaryAndLog = useRef(false); // Ref to prevent re-entry into summary/log effect

    // --- Data Fetching Callbacks ---

    // Fetches the list of past interactions. Should only be called when needed.
    const fetchHistory = useCallback(async (calledFrom?: string) => {
        if (isAuthLoading || !user) {
            setHistory([]); setHistoryLoading(false); return;
        }
        console.log(`fetchHistory called from: ${calledFrom || 'unknown'}`);
        setHistoryLoading(true); setHistoryError(null);
        try {
            const response = await fetch('/api/get-history');
            if (!response.ok) throw new Error(`History fetch failed (${response.status})`);
            const data: InteractionHistoryItem[] = await response.json();
            // Ensure created_at is valid before sorting
            data.sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return dateB - dateA; // Descending order
            });
            setHistory(data);
            console.log("History list fetched successfully.");
        } catch (e: any) {
            console.error("Error fetching history:", e);
            setHistoryError(e.message); setHistory([]);
        } finally {
            setHistoryLoading(false);
        }
    }, [user, isAuthLoading]); // Stable unless user/auth state changes

    // Fetches the user's current saved model settings (slots + summary)
    const fetchSettingsForNewChat = useCallback(async () => {
        if (!user) {
            console.warn("fetchSettingsForNewChat called without user.");
            setSlotStates([]); setSummaryModelState(null); setSettingsLoading(false);
            return;
        }
        console.log("fetchSettingsForNewChat called.");
        setSettingsLoading(true); setSettingsError(null);
        try {
            const response = await fetch('/api/settings/get-settings');
            if (!response.ok) { const d = await response.json().catch(()=>({})); throw new Error(d.error || `Settings fetch failed (${response.status})`); }
            const data: FetchedSettings | null = await response.json();

            const newSlotStates: AiSlotState[] = [];
            let fetchedSummaryModel: string | null = null;

            if (data) {
                // Process comparison slots
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
                // Process summary model
                if (data.summary_model && typeof data.summary_model === 'string' && data.summary_model.includes(': ')) {
                    fetchedSummaryModel = data.summary_model;
                } else if (data.summary_model) {
                     console.warn(`Invalid format for summary model in settings: "${data.summary_model}".`);
                }
            }
            setSlotStates(newSlotStates);
            setSummaryModelState(fetchedSummaryModel); // Set the fetched summary model
            console.log(`Applied settings for new chat. Active slots: ${newSlotStates.length}, Summary Model: ${fetchedSummaryModel || 'None'}`);
        } catch (e: any) {
            console.error("Error fetching settings for new chat:", e);
            setSettingsError(e.message);
            setSlotStates([]);
            setSummaryModelState(null);
        } finally {
            setSettingsLoading(false);
        }
    }, [user]); // Stable unless user changes

    // --- Initial Data Fetching Effect ---
    useEffect(() => {
        if (!isAuthLoading && user) {
            console.log("Auth loaded. User logged in. Fetching history.");
            fetchHistory("Initial Load / Auth Change");
            if (!selectedHistoryId) {
                console.log("No history selected, fetching settings for potential new chat.");
                fetchSettingsForNewChat();
            } else {
                console.log("History item selected, settings will load from history click if needed.");
                setSettingsLoading(false); // Avoid global loading indicator if viewing history
            }
        } else if (!isAuthLoading && !user) {
            console.log("Auth loaded. User logged out. Clearing state.");
            // Clear all relevant state
            setSlotStates([]); setHistory([]); setSettingsLoading(false); setHistoryLoading(false);
            setSelectedHistoryId(null); setCurrentChatPrompt(null); setLastSubmittedPrompt(null);
            setShowPanels(false); setUiLocked(false); setNeedsSummaryAndLog(false);
            setSettingsError(null); setHistoryError(null); setMainInputText('');
            setSummaryModelState(null); setSummaryText(null); setSummaryLoading(false); setSummaryError(null);
            isProcessingSummaryAndLog.current = false; // Reset ref on logout
        }
    }, [user, isAuthLoading, fetchHistory, fetchSettingsForNewChat]); // selectedHistoryId removed, handled by history click

    // --- MODIFIED: Call Summary API (Initial or Update) ---
    const callApiForSummary = useCallback(async (
        latestPrompt: string, // Can be initial prompt or latest follow-up prompt
        responses: AiSlotState[],
        currentHistoryId: string | null, // null for initial, ID for update
        previousSummaryText: string | null // null for initial, existing text for update
    ) => {
        if (!summaryModelState) {
            console.log("Skipping summary generation/update: No summary model configured.");
            return null; // Indicate no summary was generated/updated
        }

        const activeSlotResponses = responses
            .filter(s => s.modelName && s.responseReceivedThisTurn) // Only include slots that responded *this turn*
            .map(s => ({
                modelName: s.modelName!,
                response: s.response,
                error: s.error
            }));

        // Require at least 2 slots for initial summary, but allow update even if only 1 slot responded in the follow-up
        if (!currentHistoryId && activeSlotResponses.length < 2) {
            console.log("Skipping initial summary generation: Fewer than 2 slots responded.");
            return null;
        }
        // Don't update summary if no slots responded this turn
        if (currentHistoryId && activeSlotResponses.length === 0) {
             console.log("Skipping summary update: No slots responded this turn.");
             return null;
        }

        const isUpdate = !!currentHistoryId;
        console.log(`Attempting to ${isUpdate ? 'update' : 'generate initial'} summary using model: ${summaryModelState}`);
        setSummaryLoading(true);
        setSummaryError(null);
        // Don't clear summaryText immediately for updates, only for initial generation
        if (!isUpdate) {
             setSummaryText(null);
        }

        // Construct payload based on initial vs update
        const payload: Record<string, any> = {
            slotResponses: activeSlotResponses,
        };
        if (isUpdate) {
            payload.interactionId = currentHistoryId;
            payload.latestUserPrompt = latestPrompt; // The prompt that triggered these responses
            payload.previousSummary = previousSummaryText ?? ''; // Send current summary
        } else {
            payload.initialPrompt = latestPrompt; // The very first prompt
        }

        try {
            const apiResponse = await fetch('/api/call-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const result = await apiResponse.json().catch(() => ({ error: "Invalid JSON response from summary API" }));

            if (!apiResponse.ok) {
                throw new Error(result.error || `Summary API call failed (${apiResponse.status})`);
            }
            const generatedSummary = result.summary;
            // Allow empty summary string as valid result now
            if (typeof generatedSummary !== 'string') {
                 throw new Error("Summary API returned an invalid response type.");
            }
            console.log(`Summary ${isUpdate ? 'updated' : 'generated'} successfully.`);
            setSummaryText(generatedSummary); // Update local state with the new summary
            setSummaryLoading(false);
            return generatedSummary; // Return the new summary text

        } catch (error: any) {
            console.error(`Error calling summary API (${isUpdate ? 'update' : 'initial'}):`, error);
            setSummaryError(error.message || "Unknown summary generation error");
            setSummaryLoading(false);
            // Don't clear summary text on error if it was an update attempt
            // if (!isUpdate) {
            //     setSummaryText(null);
            // }
            return null; // Indicate summary generation/update failed
        }
    }, [summaryModelState]); // Depends only on the configured summary model


    // --- NEW: Function to Update Summary in DB ---
    const updateSummaryInDb = useCallback(async (interactionId: string, newSummary: string) => {
        if (!user || !interactionId) {
            console.warn("Skipping summary update in DB: Missing user or interactionId.");
            return;
        }
        console.log(`Attempting to update summary in DB for interaction ID: ${interactionId}`);
        try {
            const response = await fetch('/api/update-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ interactionId, newSummary }),
            });
            const result = await response.json().catch(() => ({ success: false, error: 'Invalid JSON response' }));

            if (!response.ok || !result.success) {
                const errorMsg = result?.error || `HTTP ${response.status}`;
                console.error('Failed to update summary in DB:', errorMsg);
                // Display a non-blocking error in the summary panel maybe?
                setSummaryError(prev => prev ? `${prev}\nSave Error.` : `Failed to save updated summary.`);
            } else {
                console.log(`Successfully updated summary in DB for interaction ID: ${interactionId}`);
                // Clear save error if it existed
                setSummaryError(prev => prev?.replace(/Failed to save updated summary\.?(\n|$)/, '') || null);
                 // Optional: Update history item locally if needed, but might not be necessary
                 // setHistory(prev => prev.map(h => h.id === interactionId ? { ...h, summary: newSummary } : h));
            }
        } catch (error) {
            console.error('Network error calling update-summary API:', error);
            const errorMsg = error instanceof Error ? error.message : 'Network error';
            setSummaryError(prev => prev ? `${prev}\nNetwork Save Error.` : `Network error saving summary.`);
        }
    }, [user]); // Depends on user session

    // --- Log Initial Interaction (Now includes Summary) ---
    const logInitialInteraction = useCallback(async (promptToLog: string, finalSlotStates: AiSlotState[], generatedSummary: string | null) => {
        if (!user || !promptToLog || finalSlotStates.every(s => !s.response && !s.error)) {
            console.log("Skipping initial log.");
            setNeedsSummaryAndLog(false); // Ensure flag is reset even if skipped
            return;
        }
        console.log("Attempting to log INITIAL interaction (including summary)...");
        let dataToLog: Record<string, any> = {};
        let shouldRefetchHistory = false; // Flag to control history refetch

        try {
            // Helper to build conversation history snippet for logging
            const buildLogHistory = (state: AiSlotState): ConversationMessage[] | null => {
                const userMessage = state.conversationHistory.findLast(m => m.role === 'user');
                const modelMessage = state.conversationHistory.findLast(m => m.role === 'model');
                // Log even if there's only a user prompt and an error
                if (userMessage && (modelMessage || state.error)) {
                     const historyToLog = [userMessage];
                     if (modelMessage) historyToLog.push(modelMessage);
                     // Optionally add error marker? For now, just log what exists.
                     return historyToLog;
                }
                // Fallback if structure is unexpected, but should capture user prompt + response/error
                 if (state.response || state.error) {
                     console.warn(`[Log] Incomplete history for slot ${state.modelName}. Logging prompt/response/error directly.`);
                     const userMsgContent = userMessage?.content === promptToLog ? userMessage.content : promptToLog;
                     const messages: ConversationMessage[] = [{ role: 'user', content: userMsgContent }];
                     if (state.response) messages.push({ role: 'model', content: state.response });
                     // Maybe add error as a special message type in future?
                     return messages;
                 }
                return null; // Don't log if no user prompt or no response/error
            };

            dataToLog = {
                prompt: promptToLog,
                title: promptToLog.substring(0, 50) + (promptToLog.length > 50 ? '...' : ''),
                summary: generatedSummary, // Include the generated summary
            };

            finalSlotStates.forEach((slotState, index) => {
                const slotNum = index + 1; const modelKey = `slot_${slotNum}_model_used`; const convKey = `slot_${slotNum}_conversation`;
                if (slotState.modelName) {
                    dataToLog[modelKey] = slotState.modelName;
                    // Log conversation if response OR error exists for this slot
                    if (slotState.response || slotState.error) {
                         dataToLog[convKey] = buildLogHistory(slotState);
                    } else {
                         dataToLog[convKey] = null;
                    }
                } else {
                    dataToLog[modelKey] = null; dataToLog[convKey] = null;
                }
            });
            // Ensure unused slots are null in the log
            for (let i = finalSlotStates.length; i < MAX_SLOTS; i++) { const slotNum = i + 1; dataToLog[`slot_${slotNum}_model_used`] = null; dataToLog[`slot_${slotNum}_conversation`] = null; }

            console.log("Data being sent to /api/log-interaction:", JSON.stringify(dataToLog, null, 2));
            const response = await fetch('/api/log-interaction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dataToLog) });
            const result = await response.json().catch(() => ({ success: false, error: 'Invalid JSON response' }));

            if (!response.ok || !result?.success || !result.loggedData?.[0]) {
                const errorMsg = result?.error || `HTTP ${response.status}`; console.error('Failed to log interaction:', errorMsg); setHistoryError(`Failed to save chat: ${errorMsg}`);
                // Update slots with error, but DON'T refetch history on failure
                setSlotStates(prevStates => prevStates.map((s, idx) => { if (s.modelName && dataToLog[`slot_${idx + 1}_conversation`]) { return { ...s, error: s.error ? `${s.error}\nLog Error.` : 'Failed to log initial turn.' }; } return s; }));
                if (generatedSummary) setSummaryError(prev => prev ? `${prev}\nLog Error.` : 'Failed to log summary.'); // Add log error to summary too
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
                            // Keep existing response/error, just update history
                            return { ...currentState, conversationHistory: loggedHistory, error: currentState.error }; // Preserve error if it existed pre-log
                        } return currentState;
                    }));
                    // Update summary state from logged data (should match current state)
                    setSummaryText(newLogEntry.summary || null);
                    setSummaryError(null); // Clear summary error on successful log

                    shouldRefetchHistory = true; // Flag to refetch history list later
                } else {
                    console.warn("Log success but no ID returned. Flagging for history refetch.");
                    shouldRefetchHistory = true; // Refetch to be safe
                }
            }
        } catch (error) {
            console.error('Error calling logging API:', error); const errorMsg = error instanceof Error ? error.message : 'Unknown error'; setHistoryError(`Failed to save chat: ${errorMsg}`);
            setSlotStates(prevStates => prevStates.map((s, idx) => { if (s.modelName && dataToLog[`slot_${idx + 1}_conversation`]) { return { ...s, error: s.error ? `${s.error}\nLog Error.` : `Log Error: ${errorMsg}` }; } return s; }));
            if (generatedSummary) setSummaryError(prev => prev ? `${prev}\nLog Error.` : `Log Error: ${errorMsg}`);
            // Do not refetch history on exception
        } finally {
            setNeedsSummaryAndLog(false); // Reset the flag regardless of outcome
            console.log("Logging attempt finished.");
            // Refetch history outside the main try/catch/finally if needed
            if (shouldRefetchHistory) {
                console.log("Refetching history after successful log or missing ID.");
                fetchHistory("After Log Interaction");
            }
        }
    }, [user, fetchHistory]); // fetchHistory is stable

    // --- MODIFIED: useEffect to Trigger Summary Generation/Update and Logging After AI Calls Complete ---
    useEffect(() => {
        const anySlotLoading = slotStates.some(slot => slot.loading);
        const anySummaryLoading = summaryLoading;
        const slotsJustFinished = slotStates.some(s => s.responseReceivedThisTurn && !s.loading); // Check if any slot *just* finished

        // Exit if summary model isn't set, or if slots/summary are still loading, or if already processing this step
        if (!summaryModelState || anySlotLoading || anySummaryLoading || isProcessingSummaryAndLog.current) {
            // console.log(`Summary Trigger Check: model=${!!summaryModelState}, slotLoading=${anySlotLoading}, summaryLoading=${anySummaryLoading}, processingRef=${isProcessingSummaryAndLog.current}`);
            return;
        }

        // Check if all *active* slots have received a response *this turn*
        const activeSlots = slotStates.filter(s => s.modelName);
        const allActiveSlotsRespondedThisTurn = activeSlots.length > 0 && activeSlots.every(s => s.responseReceivedThisTurn);

        // Determine if this is the initial prompt turn or a follow-up
        const isInitialTurn = !selectedHistoryId && needsSummaryAndLog;
        const isFollowUpTurn = !!selectedHistoryId && !!lastSubmittedPrompt && slotsJustFinished; // Trigger on follow-up when slots finish

        if (allActiveSlotsRespondedThisTurn && (isInitialTurn || isFollowUpTurn)) {
            console.log(`All active slots finished response for ${isInitialTurn ? 'initial' : 'follow-up'} turn. Proceeding with summary/log/update...`);
            isProcessingSummaryAndLog.current = true; // Set lock

            // Define async function to handle the sequence
            const processTurnCompletion = async () => {
                try {
                    const currentPromptForSummary = isInitialTurn ? currentChatPrompt : lastSubmittedPrompt;
                    if (!currentPromptForSummary) {
                        console.warn("Cannot process summary: Current prompt is missing.");
                        return; // Exit if prompt is somehow missing
                    }

                    // Call the summary API (handles both initial and update based on selectedHistoryId)
                    const newSummary = await callApiForSummary(
                        currentPromptForSummary,
                        slotStates,
                        selectedHistoryId, // null for initial, ID for update
                        summaryText // Current summary text (null for initial)
                    );

                    // --- Handle Outcome ---
                    if (isInitialTurn) {
                        // If it was the initial turn, log the interaction (includes the initial summary)
                        await logInitialInteraction(currentPromptForSummary, slotStates, newSummary);
                        // logInitialInteraction resets needsSummaryAndLog
                    } else if (isFollowUpTurn && typeof newSummary === 'string') {
                        // If it was a follow-up and summary was successfully updated, save it to DB
                        await updateSummaryInDb(selectedHistoryId, newSummary);
                        // Reset the 'last submitted prompt' after processing the follow-up summary to prevent re-triggering
                        // setLastSubmittedPrompt(null); // Maybe not needed if dependencies are right? Let's test without first.
                    } else if (isFollowUpTurn && newSummary === null) {
                        // Follow-up summary failed or was skipped
                        console.log("Summary update skipped or failed for follow-up turn.");
                    }

                } catch (error) {
                    console.error("Error during processTurnCompletion execution:", error);
                    // Ensure flags/locks are reset even on error
                    if (isInitialTurn) setNeedsSummaryAndLog(false);
                } finally {
                    isProcessingSummaryAndLog.current = false; // Release lock
                    // Reset the responseReceivedThisTurn flag for all slots after processing
                    setSlotStates(prev => prev.map(s => ({ ...s, responseReceivedThisTurn: false })));
                }
            };

            // Execute the sequence
            processTurnCompletion();

        } else {
             // Optional: Add logging for why it didn't trigger if needed for debugging
             // if (slotsJustFinished) { console.log("Summary trigger check: Not all active slots responded this turn."); }
        }
    // Dependencies: Trigger when slots change (specifically responseReceivedThisTurn),
    // or when flags/IDs controlling the turn type change.
    // Also include functions called.
    }, [
        slotStates, // Primary trigger: when slot responses/loading states change
        needsSummaryAndLog, // For initial turn logic
        selectedHistoryId, // To differentiate initial vs follow-up
        currentChatPrompt, // For initial summary context
        lastSubmittedPrompt, // For follow-up summary context
        summaryText, // For previous summary context
        summaryModelState, // To check if summary is configured
        summaryLoading, // Prevent re-entry while loading
        callApiForSummary,
        logInitialInteraction,
        updateSummaryInDb
    ]);


    // --- Handle Clicking a History Item ---
    const handleHistoryClick = useCallback(async (item: InteractionHistoryItem) => {
        if (!user || uiLocked || item.id === selectedHistoryId) {
            if(item.id === selectedHistoryId) console.log("Clicked already selected history item.");
            return;
        }
        console.log("--- handleHistoryClick triggered ---");
        console.log("Loading item ID:", item.id, "Title:", item.title);

        setUiLocked(true); // Lock UI
        setSelectedHistoryId(item.id); // Set the selected ID
        setCurrentChatPrompt(item.prompt); // Set the initial prompt from history
        setLastSubmittedPrompt(null); // Reset last submitted prompt
        setMainInputText(''); // Clear main input
        setNeedsSummaryAndLog(false); // Not generating summary/logging when loading history
        isProcessingSummaryAndLog.current = false; // Reset ref on history load
        setShowPanels(false); // Hide panels briefly during transition
        setSettingsError(null); setHistoryError(null); // Clear errors
        setSummaryError(null); setSummaryLoading(false); // Clear summary state
        setSettingsLoading(true); // Indicate processing (acts like settings load for UI)

        const loadedSlotStates: AiSlotState[] = [];
        let loadedSummaryText: string | null = null;
        const loadedSummaryModel: string | null = null; // Track if summary model was used

        for (let i = 0; i < MAX_SLOTS; i++) {
            const slotNum = i + 1; const modelKey = `slot_${slotNum}_model_used` as keyof InteractionHistoryItem; const conversationKey = `slot_${slotNum}_conversation` as keyof InteractionHistoryItem;
            const modelName = item[modelKey] as string | null; const rawHistory: any[] | null = item[conversationKey] as any[] | null;
            let conversationHistory: ConversationMessage[] = [];
            if (Array.isArray(rawHistory)) { conversationHistory = rawHistory.filter(msg => msg && (msg.role === 'user' || msg.role === 'model') && typeof msg.content === 'string').map(msg => ({ role: msg.role as 'user' | 'model', content: msg.content })); }
            else if (rawHistory) { console.warn(`[Slot ${slotNum}] History data is not an array:`, rawHistory); }

            const isActive = !!modelName || conversationHistory.length > 0;
            const isValidModel = typeof modelName === 'string' && modelName.includes(': ');
            if (modelName && !isValidModel) { console.warn(`Invalid model format in history ${item.id} slot ${slotNum}: "${modelName}".`); }

            loadedSlotStates.push({
                 ...initialSlotState,
                 modelName: isValidModel ? modelName : null,
                 response: conversationHistory.findLast(m => m.role === 'model')?.content || null,
                 // Error is not saved in history, reset it
                 error: null,
                 conversationHistory: conversationHistory,
                 isActiveInHistory: isActive,
                 // Assume response was received if history exists
                 responseReceivedThisTurn: conversationHistory.some(m => m.role === 'model'),
                 followUpInput: '',
             });
        }
        // Load the saved summary text
        loadedSummaryText = item.summary || null;
        // Infer if summary was likely used (if text exists and >1 slot was active)
        const activeSlotCountInHistory = loadedSlotStates.filter(s => s.isActiveInHistory).length;
        // We don't know the exact summary model used from history, so we can't set summaryModelState here.
        // We only need to display the text.

        setSlotStates(loadedSlotStates); // Update the state with all loaded slots
        setSummaryText(loadedSummaryText); // Update summary text state
        setSummaryModelState(null); // Clear summary model state when loading history (it's not regenerated)
        console.log(`Prepared ${loadedSlotStates.filter(s=>s.isActiveInHistory).length} active states from history ${item.id}. Summary loaded: ${!!loadedSummaryText}`);

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
    const handleNewChat = useCallback(() => {
        if (!user || uiLocked) return;
        console.log("Starting New Chat");
        setUiLocked(true);
        setSelectedHistoryId(null); // Clear selected history
        setCurrentChatPrompt(null);
        setLastSubmittedPrompt(null);
        setMainInputText('');
        setShowPanels(false); // Hide panels initially for new chat
        setNeedsSummaryAndLog(false);
        isProcessingSummaryAndLog.current = false; // Reset ref on new chat
        setSlotStates([]); // Clear slots immediately
        setHistoryError(null);
        setSettingsError(null);
        setSummaryText(null); setSummaryLoading(false); setSummaryError(null); // Clear summary state

        // Fetch the latest settings (including summary model) for the new chat.
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
        // Helper to update state for a specific slot
        const updateSlotState = (updateFn: (prevState: AiSlotState) => AiSlotState) => {
            setSlotStates(prevStates => prevStates.map((state, index) => index === slotIndex ? updateFn(state) : state ));
        };

        if (!modelString || !promptToSend) {
            console.warn(`[Slot ${slotNumber}] callApiForSlot skipped: Missing model or prompt.`);
            updateSlotState(prev => ({ ...prev, loading: false, error: "Missing model or prompt.", responseReceivedThisTurn: true })); // Mark as 'responded' even on error
            return;
        }

        const newUserMessage: ConversationMessage = { role: 'user', content: promptToSend };
        // Ensure history is always an array, even if null/undefined was passed
        const validHistoryBeforeThisTurn = Array.isArray(historyBeforeThisTurn) ? historyBeforeThisTurn : [];
        // History to send to API includes the current user prompt
        const historyIncludingUserPrompt: ConversationMessage[] = [...validHistoryBeforeThisTurn, newUserMessage];

        console.log(`[Slot ${slotNumber}] History BEFORE this turn being sent:`, JSON.parse(JSON.stringify(validHistoryBeforeThisTurn)));

        // Set loading state and clear previous response/error for this turn
        updateSlotState(prev => ({
            ...prev,
            loading: true,
            response: null, // Clear previous response
            error: null, // Clear previous error
            conversationHistory: historyIncludingUserPrompt, // Update history with user prompt *before* API call
            responseReceivedThisTurn: false, // Reset flag
        }));
        console.log(`[Slot ${slotNumber}] (${modelString}): Sending prompt...`);

        let modelResponseText: string | null = null;
        let newModelMessage: ConversationMessage | null = null;
        try {
            // Determine API endpoint based on provider
            const parts = modelString.split(': '); if (parts.length !== 2) throw new Error(`Invalid model format: ${modelString}`);
            const provider = parts[0]; const specificModel = parts[1]; let apiUrl = '';
            if (provider === 'ChatGPT') apiUrl = '/api/call-openai';
            else if (provider === 'Gemini') apiUrl = '/api/call-gemini';
            else if (provider === 'Anthropic') apiUrl = '/api/call-anthropic';
            else throw new Error(`Unsupported provider: ${provider}`);

            // Call the specific API endpoint
            const apiResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Send the history *including* the current user prompt
                body: JSON.stringify({ prompt: promptToSend, model: specificModel, slotNumber, conversationHistory: historyIncludingUserPrompt })
            });
            const result = await apiResponse.json().catch(() => ({ error: "Invalid JSON response from AI API" }));

            if (!apiResponse.ok) {
                throw new Error(result.error || `AI API call failed (${apiResponse.status} ${apiResponse.statusText})`);
            }
            modelResponseText = result.response;
            if (!modelResponseText) {
                // Treat empty response as an error case
                 throw new Error("AI API returned an empty response.");
            }

            // --- Success Path ---
            newModelMessage = { role: 'model', content: modelResponseText };
            updateSlotState(prev => {
                // History should already include the user message from the pre-call update
                const currentHistory = Array.isArray(prev.conversationHistory) ? prev.conversationHistory : [];
                // Make sure we don't add duplicate model messages if something re-runs
                 if (currentHistory.length > 0 && currentHistory[currentHistory.length - 1].role === 'model') {
                     console.warn(`[Slot ${slotNumber}] Model message already exists. Overwriting/confirming.`);
                     const historyWithoutLastModel = currentHistory.slice(0, -1);
                     const finalHistory = [...historyWithoutLastModel, newModelMessage!];
                     return { ...prev, response: modelResponseText, error: null, loading: false, conversationHistory: finalHistory, responseReceivedThisTurn: true };
                 } else {
                    const finalHistory = [...currentHistory, newModelMessage!];
                    console.log(`[Slot ${slotNumber}] Updating state on SUCCESS. Final history:`, JSON.parse(JSON.stringify(finalHistory)));
                    return { ...prev, response: modelResponseText, error: null, loading: false, conversationHistory: finalHistory, responseReceivedThisTurn: true };
                 }
            });
            console.log(`[Slot ${slotNumber}] (${modelString}) received response.`);

            // --- Append to DB (only for follow-ups, initial log handles first turn) ---
            if (currentInteractionId && newUserMessage && newModelMessage) {
                console.log(`[Slot ${slotNumber}] Attempting to APPEND turn to DB (ID: ${currentInteractionId}).`);
                fetch('/api/append-conversation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        interactionId: currentInteractionId,
                        slotNumber: slotNumber,
                        newUserMessage: newUserMessage,
                        newModelMessage: newModelMessage
                    })
                })
                .then(async appendResponse => {
                    if (!appendResponse.ok) {
                        const appendErrorData = await appendResponse.json().catch(() => ({ error: `HTTP ${appendResponse.status}` }));
                        const errorMsg = appendErrorData.error || `HTTP ${appendResponse.status}`;
                        console.error(`[Slot ${slotNumber}] Error appending conversation (ID: ${currentInteractionId}):`, errorMsg);
                        // Add a non-blocking error message to the slot UI
                        updateSlotState(prev => ({ ...prev, error: prev.error ? `${prev.error}\nSave Error.` : `Failed to save this turn (${errorMsg}).` }));
                    } else {
                        console.log(`[Slot ${slotNumber}] Successfully appended conversation to ID ${currentInteractionId}`);
                        // Optionally clear the save error if it existed
                        updateSlotState(prev => ({ ...prev, error: prev.error?.replace(/Failed to save this turn.*?\)?\.?(\n|$)/, '') || null }));
                    }
                })
                .catch(appendErr => {
                    console.error(`[Slot ${slotNumber}] Network error calling append-conversation API:`, appendErr);
                    const errorMsg = appendErr instanceof Error ? appendErr.message : 'Network error';
                    updateSlotState(prev => ({ ...prev, error: prev.error ? `${prev.error}\nNetwork Save Error.` : `Network error saving turn (${errorMsg}).` }));
                });
            } else if (currentInteractionId && (!newUserMessage || !newModelMessage)) {
                 // This case should ideally not happen if logic is correct
                 console.error(`[Slot ${slotNumber}] Cannot append turn: Missing messages.`);
                 updateSlotState(prev => ({ ...prev, error: prev.error ? `${prev.error}\nSave Error.` : `Internal error saving.` }));
            }

        } catch (error: any) {
            // --- Error Path ---
            console.error(`Error in callApiForSlot (Slot ${slotNumber}, Model: ${modelString}):`, error);
            // History already includes the user prompt from the pre-call update
            const historyOnError = historyIncludingUserPrompt;
            console.log(`[Slot ${slotNumber}] Final history on ERROR:`, JSON.parse(JSON.stringify(historyOnError)));
            updateSlotState(prev => ({
                ...prev,
                response: null, // Ensure response is null on error
                error: error.message || 'Unknown AI error',
                loading: false,
                conversationHistory: historyOnError, // Keep history including the failed user prompt
                responseReceivedThisTurn: true, // Mark as responded (with an error)
            }));
        }
    }, []); // Stable callback, no external state dependencies

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
        const isSummaryProcessing = summaryLoading; // Also check if summary is processing
        if (isAnySlotProcessing || isSummaryProcessing) { console.log("handleProcessText skipped: A slot or summary is already processing."); return; }

        const isFirstPromptOfChat = !selectedHistoryId;
        const promptToSend = currentInput;
        console.log(`Processing ${isFirstPromptOfChat ? 'initial' : 'follow-up'} prompt: "${promptToSend}"`);

        // --- Update Core Chat State ---
        if (isFirstPromptOfChat) {
            setCurrentChatPrompt(promptToSend); // Set the initial prompt for the chat
            setNeedsSummaryAndLog(true); // Flag that summary/logging is needed after responses
            isProcessingSummaryAndLog.current = false; // Ensure ref is reset for new chat
            // Clear previous summary state for the new chat
            setSummaryText(null);
            setSummaryError(null);
            setSummaryLoading(false);
        } else {
            setNeedsSummaryAndLog(false); // Not the first prompt, no summary/initial log needed
        }
        setLastSubmittedPrompt(promptToSend); // Track the latest submitted text
        setShowPanels(true); // Ensure panels are shown
        if (mainInputRef.current) mainInputRef.current.blur(); // Unfocus input
        setMainInputText(''); // Clear the main input field

        const currentInteractionIdForUpdate = selectedHistoryId; // ID for appending follow-ups

        // --- Prepare Slots for API Calls (Set Loading Flags etc.) ---
        setSlotStates(prevSlotStates => {
            return prevSlotStates.map((s) => {
                // Only process slots that have a model configured
                if (s.modelName && activeSlotsForCall.some(active => active.modelName === s.modelName)) {
                    // For the first prompt, clear history. For follow-ups, keep existing history.
                    const historyToKeep = isFirstPromptOfChat ? [] : s.conversationHistory;
                    return {
                        ...s,
                        loading: true,
                        response: null, // Clear previous response
                        error: null, // Clear previous error
                        responseReceivedThisTurn: false, // Reset flag
                        conversationHistory: historyToKeep, // Set history for the call
                        isActiveInHistory: isFirstPromptOfChat ? true : s.isActiveInHistory, // Mark as active if first prompt
                    };
                }
                // If it's the first prompt, reset inactive slots too
                if (isFirstPromptOfChat && !s.modelName) {
                     return {...initialSlotState, isActiveInHistory: false }; // Reset fully
                }
                // Otherwise, leave the slot state as is (e.g., inactive slots remain inactive)
                return s;
            });
        });

        // --- Initiate API Calls Concurrently for Comparison Slots ---
        const promises = activeSlotsForCall.map((slotStateFromSnapshot) => {
            const originalIndex = currentStateSnapshot.findIndex(s => s === slotStateFromSnapshot);
            if (originalIndex !== -1 && slotStateFromSnapshot.modelName) {
                // Determine history to send based on whether it's the first prompt
                const historyForApi: ConversationMessage[] = isFirstPromptOfChat ? [] : (slotStateFromSnapshot.conversationHistory as ConversationMessage[]);
                console.log(`[Slot ${originalIndex + 1}] Calling API via handleProcessText. History length: ${historyForApi.length}`);
                // Call the API for this specific slot
                return callApiForSlot(
                    originalIndex,
                    slotStateFromSnapshot.modelName,
                    promptToSend,
                    historyForApi, // Pass the correct history context
                    currentInteractionIdForUpdate // Pass ID for potential follow-up appends
                );
            }
            // This should not happen if activeSlotsForCall is derived correctly
            console.error("Error finding slot index/model in handleProcessText loop.");
            return Promise.resolve(); // Return a resolved promise to avoid breaking Promise.allSettled
        });

        // Wait for all API call *initiations* (not completions)
        Promise.allSettled(promises).then(() => {
            console.log("All main API call initiations complete via handleProcessText.");
            // Individual slots manage their own loading state via callApiForSlot.
            // Summary loading is handled by the useEffect hook.
            setShowPanels(true); // Re-assert showPanels just in case
        });

    }, [
        mainInputText, user, isAuthLoading, settingsLoading, selectedHistoryId,
        slotStates, callApiForSlot, uiLocked, summaryLoading, summaryModelState // Added summaryLoading, summaryModelState
    ]); // Stable deps

    // --- Handle Individual Follow-up Replies ---
    const handleReplyToSlot = useCallback((slotIndex: number) => {
        const currentStateSnapshot = [...slotStates];
        const targetState = currentStateSnapshot[slotIndex];

        // --- Validations ---
        if (!targetState) { console.error(`handleReplyToSlot: Invalid slotIndex ${slotIndex}`); return; }
        const followUpPrompt = targetState.followUpInput.trim(); const modelName = targetState.modelName;
        if (!followUpPrompt) { console.warn("Cannot send reply: Input empty."); return; }
        if (!modelName) { console.warn("Cannot send reply: No model assigned."); return; }
        if (!user) { console.warn("Cannot send reply: Not logged in."); return; }
        if (!selectedHistoryId) { console.warn("Cannot send reply: Chat not saved (no history ID)."); return; } // Should not happen if input is enabled
        if (targetState.loading) { console.log(`Reply blocked for slot ${slotIndex+1}: Processing.`); return; }
        if (uiLocked) { console.log(`Reply blocked for slot ${slotIndex+1}: UI Locked.`); return; } // Check global lock too
        if (summaryLoading) { console.log(`Reply blocked for slot ${slotIndex+1}: Summary processing.`); return; } // Block during summary generation

        console.log(`Sending follow-up to Slot ${slotIndex + 1} (${modelName}): "${followUpPrompt}"`);
        setLastSubmittedPrompt(followUpPrompt); // Update last submitted prompt
        setNeedsSummaryAndLog(false); // Follow-ups don't trigger summary/initial log

        // Clear input for this slot immediately
        setSlotStates(prevStates => prevStates.map((state, index) => index === slotIndex ? { ...state, followUpInput: '' } : state ));

        // Get the conversation history *before* this follow-up turn
        const historyBeforeThisTurn = targetState.conversationHistory;
        console.log(`[Slot ${slotIndex + 1}] Calling API from Reply. History length: ${historyBeforeThisTurn.length}`);

        // Call the API for this specific slot's follow-up
        callApiForSlot(
            slotIndex,
            modelName,
            followUpPrompt,
            historyBeforeThisTurn,
            selectedHistoryId // Pass the history ID for appending
        );
    }, [user, slotStates, callApiForSlot, selectedHistoryId, uiLocked, summaryLoading]); // Added uiLocked, summaryLoading


    // --- Determine Overall UI State ---
    const isProcessingAnySlot = slotStates.some(slot => slot.loading);
    const isProcessingSummary = summaryLoading;
    const isProcessingAnything = isProcessingAnySlot || isProcessingSummary || isProcessingSummaryAndLog.current; // Include ref lock state
    const canInteractGenerally = !!user && !isAuthLoading && !settingsLoading && !uiLocked;
    const hasAnyComparisonModelsConfigured = slotStates.some(s => s.modelName);
    // Can use main input if logged in, not loading, not processing, and either viewing history OR has models configured
    const canUseMainInput = canInteractGenerally && !isProcessingAnything && (!!selectedHistoryId || hasAnyComparisonModelsConfigured);

    // Determine slots to display (either active in history or configured for new chat)
    const comparisonSlotsToDisplay = slotStates.filter(slotState => selectedHistoryId ? slotState.isActiveInHistory : !!slotState.modelName );
    const numberOfComparisonSlotsToDisplay = comparisonSlotsToDisplay.length;

    // Determine if the summary panel should be displayed
    // Conditions:
    // 1. Viewing history AND the history item has summary text OR
    // 2. It's a new chat's initial prompt turn (needsSummaryAndLog is true or summary is loading/has error/has text) AND a summary model is configured AND >= 2 comparison slots are active
    const shouldDisplaySummaryPanel =
        (selectedHistoryId && !!summaryText) || // Viewing history with a saved summary
        (
            !selectedHistoryId && // It's a new chat
            (needsSummaryAndLog || summaryLoading || !!summaryError || !!summaryText) && // In the process of/has finished summary gen for *this turn*
            !!summaryModelState && // Summary model is configured
            numberOfComparisonSlotsToDisplay >= 2 // At least 2 comparison slots are active
        );


    // Total number of panels including the potential summary panel
    const totalPanelsToDisplay = numberOfComparisonSlotsToDisplay + (shouldDisplaySummaryPanel ? 1 : 0);

    // Determine if the main panel area should be rendered at all
    const shouldRenderPanelsArea = user && !settingsLoading && (showPanels || !!selectedHistoryId) && slotStates.length > 0 && totalPanelsToDisplay > 0;


    // --- Helper to get Display Name ---
    const getModelDisplayName = (modelString: string | null): string => { if (!modelString) return "Slot Empty"; return modelString; };

    // --- Dynamic Grid Class Functions (Updated for Summary Panel) ---
    const getGridContainerClass = (totalCount: number): string => {
        // Base classes
        let classes = 'w-full max-w-7xl grid gap-4 self-center flex-grow px-1 pb-4 overflow-y-auto custom-scrollbar ';

        // Grid columns based on TOTAL number of panels (slots + summary)
        if (totalCount <= 1) classes += 'grid-cols-1'; // Only 1 comparison slot, no summary
        else if (totalCount === 2) classes += 'grid-cols-1 lg:grid-cols-2'; // 2 comparison slots OR 1 slot + summary (shouldn't happen based on rules)
        else if (totalCount === 3) classes += 'grid-cols-1 lg:grid-cols-3'; // 3 comparison slots OR 2 slots + summary
        else if (totalCount === 4) classes += 'grid-cols-1 md:grid-cols-4'; // 4 comparison slots OR 3 slots + summary (Arrange as 2x2 + tall summary?) -> Let's try 4 columns first.
        else if (totalCount === 5) classes += 'grid-cols-1 md:grid-cols-2 lg:grid-cols-5'; // 5 comparison slots OR 4 slots + summary (Arrange 2x2 + tall summary) -> Use 5 columns for flexibility?
        else if (totalCount === 6) classes += 'grid-cols-1 md:grid-cols-3 lg:grid-cols-6'; // 6 comparison slots OR 5 slots + summary (Arrange 3+2 + tall summary) -> Use 6 columns
        else if (totalCount === 7) classes += 'grid-cols-1 md:grid-cols-4 lg:grid-cols-7'; // 6 slots + summary (Arrange 3x2 + tall summary) -> Use 7 columns?
        else classes += 'grid-cols-1 md:grid-cols-3'; // Default fallback

        console.log(`Grid Class for ${totalCount} panels: ${classes}`);
        return classes;
    };

    // Function to get specific column/row spans based on total count and index
    // This implements the layout rules provided by the user
    const getItemLayoutClass = (index: number, totalCount: number, isSummary: boolean): string => {
        // Index is 0-based position in the displayed items array
        // totalCount includes the summary panel if displayed

        // Base case: No special layout needed
        let itemClasses = 'col-span-1 row-span-1'; // Default for smaller screens or simple layouts

        if (totalCount === 1) { // 1 comparison slot, no summary
              itemClasses = 'md:col-span-1';
        } else if (totalCount === 2) { // 2 comparison slots, no summary
              itemClasses = 'md:col-span-1';
        } else if (totalCount === 3) { // 3 comparison slots OR 2 slots + summary
              if (isSummary) { // 2 slots + summary: Summary is the 3rd item (index 2)
                  itemClasses = 'md:col-span-1'; // Place summary in the 3rd column
              } else { // Regular slot in a 3-panel layout
                  itemClasses = 'md:col-span-1';
              }
        } else if (totalCount === 4) { // 3 slots + summary
              // Let's stick to the original plan for now and refine if needed.
              // Assuming grid-cols-4 for totalCount=4:
              if (isSummary) { // Summary is 4th item (index 3)
                   itemClasses = 'md:col-span-1'; // Place in 4th column
              } else {
                   itemClasses = 'md:col-span-1'; // Slots 1, 2, 3 in first 3 columns
              }
        } else if (totalCount === 5) { // 4 slots + summary
             // User: "for 4 slots, there are 2 on the top and 2 on the bottom. now add one long one on the right that is on the top and bottom."
             // This suggests a grid like: [S1 S2 Sum] [S3 S4 Sum] -> 3 columns needed.
             // Let's adjust getGridContainerClass for this.
             // getGridContainerClass should return 'grid-cols-1 md:grid-cols-3' for totalCount 5
             if (isSummary) { // Summary is 5th item (index 4)
                 itemClasses = 'md:col-start-3 md:row-span-2';
             } else if (index === 0) { itemClasses = 'md:col-start-1 md:row-start-1'; } // Slot 1 (top-left)
             else if (index === 1) { itemClasses = 'md:col-start-2 md:row-start-1'; } // Slot 2 (top-right)
             else if (index === 2) { itemClasses = 'md:col-start-1 md:row-start-2'; } // Slot 3 (bottom-left)
             else if (index === 3) { itemClasses = 'md:col-start-2 md:row-start-2'; } // Slot 4 (bottom-right)

        } else if (totalCount === 6) { // 5 slots + summary
             // User: "for 5 slots there are 3 on the top, and two centered panels on the bottom. change that so that there are 3 on the the top, and 3 on the bottom because of the new summary panel."
             // This implies 3x2 layout + summary. Where does summary go? "on the very right side next to the 3 on the top and 3 on the bottom there is 1 long one" - This applies to 6 slots + summary.
             // Let's assume for 5 slots + summary (total 6), it's 3x2 grid.
             // getGridContainerClass should return 'grid-cols-1 md:grid-cols-3' for totalCount 6
             // Let's try the 3x2 layout:
             if (index < 3) { // Slots 1, 2, 3 (top row)
                 itemClasses = `md:col-span-1 md:row-start-1`;
             } else { // Slots 4, 5 + Summary (indices 3, 4, 5) (bottom row)
                 itemClasses = `md:col-span-1 md:row-start-2`;
             }

        } else if (totalCount === 7) { // 6 slots + summary
             // User: "When its 6 slots there are 3 on the top and 3 on the bottom, but on the very right side next to the 3 on the top and 3 on the bottom there is 1 long one that is onthe top and bottom."
             // This implies a 3x2 grid for slots + 1 tall column for summary -> 4 columns total.
             // getGridContainerClass should return 'grid-cols-1 md:grid-cols-4' for totalCount 7
             if (isSummary) { // Summary is 7th item (index 6)
                 itemClasses = 'md:col-start-4 md:row-span-2'; // Tall summary in 4th column
             } else if (index < 3) { // Slots 1, 2, 3 (top row, cols 1-3)
                 itemClasses = `md:col-span-1 md:row-start-1`;
             } else { // Slots 4, 5, 6 (indices 3, 4, 5) (bottom row, cols 1-3)
                 itemClasses = `md:col-span-1 md:row-start-2`;
             }
        }

        // console.log(`Layout Class for index ${index}, total ${totalCount}, isSummary ${isSummary}: ${itemClasses}`);
        return itemClasses;
    };

     // REVISED Grid Container Class based on specific rules
     const getRevisedGridContainerClass = (comparisonSlotCount: number, includeSummary: boolean): string => {
        let classes = 'w-full max-w-7xl grid gap-4 self-center flex-grow px-1 pb-4 overflow-y-auto custom-scrollbar ';
        const totalCount = comparisonSlotCount + (includeSummary ? 1 : 0);

        if (comparisonSlotCount === 1 && !includeSummary) classes += 'grid-cols-1';
        else if (comparisonSlotCount === 2 && !includeSummary) classes += 'grid-cols-1 md:grid-cols-2';
        else if (comparisonSlotCount === 3 && !includeSummary) classes += 'grid-cols-1 md:grid-cols-3';
        else if (comparisonSlotCount === 4 && !includeSummary) classes += 'grid-cols-1 md:grid-cols-2'; // 2x2 layout
        else if (comparisonSlotCount === 5 && !includeSummary) classes += 'grid-cols-1 md:grid-cols-6'; // 3 top (2 span), 2 bottom (3 span) - original layout
        else if (comparisonSlotCount === 6 && !includeSummary) classes += 'grid-cols-1 md:grid-cols-3'; // 3x2 layout

        // Layouts WITH Summary
        else if (comparisonSlotCount === 2 && includeSummary) classes += 'grid-cols-1 md:grid-cols-3'; // 2 slots + summary = 3 cols
        else if (comparisonSlotCount === 3 && includeSummary) classes += 'grid-cols-1 md:grid-cols-4'; // 3 slots + summary = 4 cols
        else if (comparisonSlotCount === 4 && includeSummary) classes += 'grid-cols-1 md:grid-cols-3'; // 4 slots (2x2) + summary (tall) = 3 cols
        else if (comparisonSlotCount === 5 && includeSummary) classes += 'grid-cols-1 md:grid-cols-3'; // 5 slots (3x2 layout) + summary = 3 cols? Place summary in last spot.
        else if (comparisonSlotCount === 6 && includeSummary) classes += 'grid-cols-1 md:grid-cols-4'; // 6 slots (3x2) + summary (tall) = 4 cols

        else classes += 'grid-cols-1 md:grid-cols-3'; // Fallback

        // console.log(`Revised Grid Class for ${comparisonSlotCount} slots, summary ${includeSummary}: ${classes}`);
        return classes;
    };


    // --- Render Component JSX ---
    return (
        <div className="flex h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
            {/* History Sidebar */}
            <HistorySidebar
                history={history} historyLoading={historyLoading || isAuthLoading} historyError={historyError}
                selectedHistoryId={selectedHistoryId} handleHistoryClick={handleHistoryClick}
                fetchHistory={() => fetchHistory("Manual Refresh")} // Pass fetch function for refresh button
                onUpdateTitle={handleUpdateTitle} onDeleteItem={handleDeleteItem}
                isLoggedIn={!!user} handleNewChat={handleNewChat}
            />

            {/* Main Content Area */}
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
                    <div className="text-sm text-red-500 dark:text-red-400 truncate" title={settingsError ?? historyError ?? summaryError ?? ''}>
                         {/* Display first available error */}
                         {settingsError && `Settings Error: ${settingsError}`}
                         {historyError && !settingsError && `History Error: ${historyError}`}
                         {summaryError && !settingsError && !historyError && `Summary Error: ${summaryError}`}
                    </div>
                    {user && !isAuthLoading && (<Link href="/settings" className={`text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline whitespace-nowrap ${uiLocked ? 'pointer-events-none opacity-50' : ''}`}>⚙️ Settings</Link>)}
                    {!user && !isAuthLoading && <div className="h-5"></div>} {/* Placeholder for alignment */}
                </div>

                {/* Login Prompt */}
                {!user && !isAuthLoading && (
                    <div className="w-full max-w-3xl mb-6 self-center p-4 bg-yellow-100 border border-yellow-300 rounded-md text-center text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-100 dark:border-yellow-700">
                        Please <Link href="/auth" className="font-semibold underline hover:text-yellow-900 dark:hover:text-yellow-200">Sign In or Sign Up</Link> to use the tool.
                    </div>
                )}

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
                            !selectedHistoryId && !hasAnyComparisonModelsConfigured ? "No AI models configured. Go to Settings." :
                            isProcessingAnything ? "Processing..." :
                            selectedHistoryId ? "Send follow-up to all active slots..." :
                            "Enter initial prompt to compare models..."
                        }
                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 shadow-sm disabled:bg-gray-200 dark:disabled:bg-gray-700/50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 resize-none overflow-y-auto min-h-[44px] max-h-[128px]"
                        style={{ height: 'auto' }} // Start with auto height
                        onInput={(e) => { // Adjust height dynamically on input
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = 'auto'; // Reset height
                            target.style.height = `${target.scrollHeight}px`; // Set to scroll height
                        }}
                        onKeyDown={(e) => { // Submit on Enter (not Shift+Enter)
                            if (e.key === 'Enter' && !e.shiftKey && canUseMainInput && mainInputText.trim() !== '') {
                                e.preventDefault();
                                handleProcessText();
                            }
                        }}
                        disabled={!canUseMainInput} // Disable based on combined state
                        aria-label="Main prompt input"
                    />
                    <button
                        onClick={handleProcessText}
                        disabled={!canUseMainInput || mainInputText.trim() === ''} // Disable if cannot interact or text is empty
                        className={`w-full mt-2 p-3 text-white rounded-md font-semibold transition-colors duration-200 ${
                            !canUseMainInput || mainInputText.trim() === ''
                            ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                        }`}
                    >
                        {isProcessingAnything ? 'Processing...' : (selectedHistoryId) ? 'Send Follow-up to All' : 'Send Initial Prompt'}
                    </button>
                </div>

                {/* AI Response Panels Area - Conditional Rendering */}
                {shouldRenderPanelsArea && (
                    <div className={getRevisedGridContainerClass(numberOfComparisonSlotsToDisplay, shouldDisplaySummaryPanel)}>
                        {/* Render Comparison Slots */}
                        {comparisonSlotsToDisplay.map((slotState, displayIndex) => {
                            const originalIndex = slotStates.findIndex(s => s === slotState);
                            if (originalIndex === -1) { console.error("Render Error: Could not find original index for slot. Skipping panel.", slotState); return null; }
                            const colors = PANEL_COLORS[originalIndex % PANEL_COLORS.length];
                            const isSlotProcessing = slotState.loading;
                            const hasModel = !!slotState.modelName;
                            const panelLayoutClass = getItemLayoutClass(displayIndex, totalPanelsToDisplay, false); // Get layout for this slot
                            const panelHeightClass = totalPanelsToDisplay >= 4 ? 'min-h-[350px]' : 'min-h-[250px]'; // Dynamic height
                            const canEnableFollowUpInput = canInteractGenerally && !isProcessingAnything && !!selectedHistoryId && hasModel; // Can use if logged in, not processing, viewing history, and has model
                            const canEnableFollowUpButton = canEnableFollowUpInput && slotState.followUpInput.trim() !== '';

                            return (
                                <div
                                    key={`panel-${originalIndex}-${selectedHistoryId || 'new'}`}
                                    className={`border rounded-lg bg-white dark:bg-gray-800 shadow-md flex flex-col ${colors.border} overflow-hidden ${panelHeightClass} ${panelLayoutClass}`}
                                    role="article" aria-labelledby={`panel-heading-${originalIndex}`}
                                >
                                    {/* Panel Header */}
                                    <h2 id={`panel-heading-${originalIndex}`} className={`text-lg md:text-xl font-semibold p-4 pb-2 ${colors.text} flex-shrink-0 truncate border-b dark:border-gray-700`} title={slotState.modelName || `Slot ${originalIndex + 1} (Empty)`}>
                                        {getModelDisplayName(slotState.modelName)} (Slot {originalIndex + 1})
                                    </h2>

                                    {/* Conversation Area */}
                                    <div className="flex-grow overflow-y-auto text-sm p-4 space-y-3 custom-scrollbar" role="log">
                                        {!hasModel && slotState.conversationHistory.length === 0 && !slotState.isActiveInHistory && <p className="text-gray-400 dark:text-gray-500 italic text-center mt-4">Slot empty.</p>}
                                        {/* Render conversation messages */}
                                        {Array.isArray(slotState.conversationHistory) && slotState.conversationHistory.map((msg, msgIndex) => (
                                            <div
                                                key={`msg-${originalIndex}-${msgIndex}`}
                                                className={`prose prose-sm dark:prose-invert max-w-none p-2 rounded-md ${
                                                    msg.role === 'user'
                                                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 ml-auto max-w-[90%]' // User message style
                                                    : `${colors.bg} text-gray-900 dark:text-gray-100 mr-auto max-w-[90%]` // Model message style
                                                }`}
                                                aria-label={`${msg.role} message ${msgIndex + 1}`}
                                            >
                                                {/* Use ReactMarkdown for rendering */}
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content || ''}</ReactMarkdown>
                                            </div>
                                        ))}
                                        {/* Loading Indicator */}
                                        {isSlotProcessing && (
                                            <div className="flex items-center justify-center p-2 mt-2">
                                                <svg className="animate-spin h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg>
                                                <p className="text-gray-500 dark:text-gray-400 text-xs">Loading...</p>
                                            </div>
                                        )}
                                        {/* Error Message */}
                                        {slotState.error && <p className="text-red-600 dark:text-red-400 mt-2 p-2 text-xs whitespace-pre-wrap" role="alert">Error: {slotState.error}</p>}
                                        {/* Indicator if model was removed from history */}
                                        {!hasModel && slotState.isActiveInHistory && Array.isArray(slotState.conversationHistory) && slotState.conversationHistory.length > 0 && <p className="text-gray-400 dark:text-gray-500 italic text-center mt-4 text-xs">Model removed.</p>}
                                    </div>

                                    {/* Follow-up Input Area (only if model exists and history is selected) */}
                                    {hasModel && selectedHistoryId && (
                                        <div className="mt-auto p-4 pt-2 border-t dark:border-gray-600 flex items-end space-x-2 flex-shrink-0">
                                            <textarea
                                                rows={1}
                                                value={slotState.followUpInput}
                                                onChange={(e) => setSlotStates(prev => prev.map((s, i) => i === originalIndex ? { ...s, followUpInput: e.target.value } : s))}
                                                placeholder={`Reply...`}
                                                className={`flex-grow p-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 ${colors.focusRing} focus:outline-none disabled:bg-gray-200 dark:disabled:bg-gray-700/50 disabled:cursor-not-allowed resize-none overflow-y-auto min-h-[40px] max-h-[100px]`}
                                                style={{ height: 'auto' }} // Dynamic height
                                                onInput={(e) => { const target = e.target as HTMLTextAreaElement; target.style.height = 'auto'; target.style.height = `${target.scrollHeight}px`; }}
                                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && canEnableFollowUpButton) { e.preventDefault(); handleReplyToSlot(originalIndex); } }}
                                                disabled={!canEnableFollowUpInput} // Disable based on combined state
                                                aria-label={`Follow-up input for Slot ${originalIndex + 1}`}
                                            />
                                            <button
                                                onClick={() => handleReplyToSlot(originalIndex)}
                                                disabled={!canEnableFollowUpButton} // Disable if cannot send
                                                className={`px-3 py-2 ${colors.button} text-white text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 self-end mb-[1px] transition-opacity`}
                                                title={`Send follow-up`}
                                                aria-label={`Send follow-up to Slot ${originalIndex + 1}`}
                                            >
                                                {isSlotProcessing ? '...' : 'Send'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Render Summary Panel (Conditionally) */}
                        {shouldDisplaySummaryPanel && (
                             <div
                                 key={`panel-summary-${selectedHistoryId || 'new'}`}
                                 className={`border rounded-lg bg-white dark:bg-gray-800 shadow-md flex flex-col ${SUMMARY_PANEL_COLORS.border} overflow-hidden ${getItemLayoutClass(numberOfComparisonSlotsToDisplay, totalPanelsToDisplay, true)} ${totalPanelsToDisplay >= 4 ? 'min-h-[350px]' : 'min-h-[250px]'}`} // Use layout class, dynamic height
                                 role="article" aria-labelledby="panel-heading-summary"
                             >
                                {/* Summary Panel Header */}
                                <h2 id="panel-heading-summary" className={`text-lg md:text-xl font-semibold p-4 pb-2 ${SUMMARY_PANEL_COLORS.text} flex-shrink-0 truncate border-b dark:border-gray-700`} title={summaryModelState || 'Aggregated Summary'}>
                                     Summary {summaryModelState ? `(${getModelDisplayName(summaryModelState)})` : ''}
                                </h2>

                                {/* Summary Content Area */}
                                <div className="flex-grow overflow-y-auto text-sm p-4 space-y-3 custom-scrollbar" role="log">
                                     {/* Loading Indicator */}
                                     {summaryLoading && (
                                         <div className="flex items-center justify-center p-2 mt-2">
                                             <svg className="animate-spin h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg>
                                             <p className="text-gray-500 dark:text-gray-400 text-xs">Generating summary...</p>
                                         </div>
                                     )}
                                     {/* Error Message */}
                                     {summaryError && !summaryLoading && <p className="text-red-600 dark:text-red-400 mt-2 p-2 text-xs whitespace-pre-wrap" role="alert">Summary Error: {summaryError}</p>}
                                     {/* Summary Text */}
                                     {summaryText && !summaryLoading && !summaryError && (
                                         <div className={`prose prose-sm dark:prose-invert max-w-none p-2 rounded-md ${SUMMARY_PANEL_COLORS.bg} text-gray-900 dark:text-gray-100`} aria-label="Generated summary">
                                             <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryText}</ReactMarkdown>
                                         </div>
                                     )}
                                     {/* Placeholder if not loading, no error, no text (e.g., skipped) */}
                                     {!summaryLoading && !summaryError && !summaryText && (
                                         <p className="text-gray-400 dark:text-gray-500 italic text-center mt-4">
                                             { !summaryModelState ? "Summary model not configured." :
                                               numberOfComparisonSlotsToDisplay < 2 ? "Requires 2+ comparison slots." :
                                               selectedHistoryId ? "Summary not generated for historical chats." : // Should be covered by shouldDisplaySummaryPanel logic
                                               "Summary will appear here after initial responses." }
                                         </p>
                                     )}
                                </div>
                                {/* No input area for summary panel */}
                             </div>
                        )}
                    </div>
                )}

                {/* Placeholder Section (shown when panels aren't visible) */}
                {!shouldRenderPanelsArea && user && !settingsLoading && hasAnyComparisonModelsConfigured && (
                    <div className="flex-grow flex items-center justify-center text-gray-500 dark:text-gray-400 text-center px-4">
                        Enter a prompt or select a chat to begin.
                    </div>
                )}
                {!shouldRenderPanelsArea && user && !settingsLoading && !hasAnyComparisonModelsConfigured && (
                    <div className="flex-grow flex items-center justify-center text-gray-500 dark:text-gray-400 text-center px-4">
                        No models configured. Visit&nbsp;<Link href="/settings" className="underline text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">Settings</Link>.
                    </div>
                )}
                 {/* Fallback empty div when logged out */}
                {!shouldRenderPanelsArea && !user && !isAuthLoading && (
                    <div className="flex-grow"></div>
                )}

            </main>
        </div>
    );
}
