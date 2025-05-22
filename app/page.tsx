// app/page.tsx
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
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
    summary_model: string | null;
}

interface AiSlotState {
    modelName: string | null;
    loading: boolean;
    response: string | null;
    error: string | null;
    followUpInput: string;
    conversationHistory: ConversationMessage[];
    isActiveInHistory: boolean;
    responseReceivedThisTurn: boolean;
    inputTokensThisTurn: number | null; // Added
    outputTokensThisTurn: number | null; // Added
}

// --- Panel Colors (no changes) ---
const PANEL_COLORS = [
    { border: 'border-blue-200 dark:border-blue-700/60', text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30', focusRing: 'focus:ring-blue-500', button: 'bg-blue-500 hover:bg-blue-600' },
    { border: 'border-green-200 dark:border-green-700/60', text: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/30', focusRing: 'focus:ring-green-500', button: 'bg-green-500 hover:bg-green-600' },
    { border: 'border-purple-200 dark:border-purple-700/60', text: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/30', focusRing: 'focus:ring-purple-500', button: 'bg-purple-500 hover:bg-purple-600' },
    { border: 'border-orange-200 dark:border-orange-700/60', text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/30', focusRing: 'focus:ring-orange-500', button: 'bg-orange-500 hover:bg-orange-600' },
    { border: 'border-teal-200 dark:border-teal-700/60', text: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/30', focusRing: 'focus:ring-teal-500', button: 'bg-teal-500 hover:bg-teal-600' },
    { border: 'border-pink-200 dark:border-pink-700/60', text: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-50 dark:bg-pink-900/30', focusRing: 'focus:ring-pink-500', button: 'bg-pink-500 hover:bg-pink-600' },
];
const SUMMARY_PANEL_COLORS = {
    border: 'border-gray-300 dark:border-gray-600/80', text: 'text-gray-700 dark:text-gray-300', bg: 'bg-gray-50 dark:bg-gray-800/50', focusRing: 'focus:ring-gray-500', button: '',
};

export default function Home() {
    const { user, isLoading: isAuthLoading } = useAuth();
    const [mainInputText, setMainInputText] = useState('');
    const [currentChatPrompt, setCurrentChatPrompt] = useState<string | null>(null);
    const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState<string | null>(null);
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [uiLocked, setUiLocked] = useState(false);
    const [settingsError, setSettingsError] = useState<string | null>(null);
    const initialSlotState: AiSlotState = { modelName: null, loading: false, response: null, error: null, followUpInput: '', conversationHistory: [], isActiveInHistory: false, responseReceivedThisTurn: false, inputTokensThisTurn: null, outputTokensThisTurn: null }; // Added token fields
    const [slotStates, setSlotStates] = useState<AiSlotState[]>([]);
    const [summaryModelState, setSummaryModelState] = useState<string | null>(null);
    const [summaryText, setSummaryText] = useState<string | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryError, setSummaryError] = useState<string | null>(null);
    const [showPanels, setShowPanels] = useState(false);
    const mainInputRef = useRef<HTMLTextAreaElement>(null);
    const [history, setHistory] = useState<InteractionHistoryItem[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
    const [needsSummaryAndLog, setNeedsSummaryAndLog] = useState(false);
    const isProcessingSummaryAndLog = useRef(false);

    const fetchHistory = useCallback(async (calledFrom?: string) => { /* ... (no changes needed here) ... */ 
        if (isAuthLoading || !user) { setHistory([]); setHistoryLoading(false); return; }
        console.log(`fetchHistory called from: ${calledFrom || 'unknown'}`);
        setHistoryLoading(true); setHistoryError(null);
        try {
            const response = await fetch('/api/get-history');
            if (!response.ok) throw new Error(`History fetch failed (${response.status})`);
            const data: InteractionHistoryItem[] = await response.json();
            data.sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return dateB - dateA;
            });
            setHistory(data);
            console.log("History list fetched successfully.");
        } catch (e: any) {
            console.error("Error fetching history:", e);
            setHistoryError(e.message); setHistory([]);
        } finally {
            setHistoryLoading(false);
        }
    }, [user, isAuthLoading]);

    const fetchSettingsForNewChat = useCallback(async () => { /* ... (no changes needed here) ... */ 
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
                for (let i = 0; i < MAX_SLOTS; i++) {
                    const modelKey = `slot_${i + 1}_model` as keyof FetchedSettings;
                    let modelName: string | null = null;
                    if (data[modelKey] && typeof data[modelKey] === 'string' && data[modelKey]?.includes(': ')) {
                        modelName = data[modelKey] as string;
                    } else if (data[modelKey]) { console.warn(`Invalid format in settings slot ${i+1}: "${data[modelKey]}".`); }
                    if (modelName) { newSlotStates.push({ ...initialSlotState, modelName: modelName }); }
                }
                if (data.summary_model && typeof data.summary_model === 'string' && data.summary_model.includes(': ')) {
                    fetchedSummaryModel = data.summary_model;
                } else if (data.summary_model) { console.warn(`Invalid format for summary model in settings: "${data.summary_model}".`); }
            }
            setSlotStates(newSlotStates);
            setSummaryModelState(fetchedSummaryModel);
            console.log(`Applied settings for new chat. Active slots: ${newSlotStates.length}, Summary Model: ${fetchedSummaryModel || 'None'}`);
        } catch (e: any) {
            console.error("Error fetching settings for new chat:", e);
            setSettingsError(e.message); setSlotStates([]); setSummaryModelState(null);
        } finally {
            setSettingsLoading(false);
        }
    }, [user]);

    useEffect(() => { /* ... (no changes needed here) ... */ 
        if (!isAuthLoading && user) {
            console.log("Auth loaded. User logged in. Fetching history.");
            fetchHistory("Initial Load / Auth Change");
            if (!selectedHistoryId) {
                console.log("No history selected, fetching settings for potential new chat.");
                fetchSettingsForNewChat();
            } else {
                console.log("History item selected, settings will load from history click if needed.");
                setSettingsLoading(false);
            }
        } else if (!isAuthLoading && !user) {
            console.log("Auth loaded. User logged out. Clearing state.");
            setSlotStates([]); setHistory([]); setSettingsLoading(false); setHistoryLoading(false);
            setSelectedHistoryId(null); setCurrentChatPrompt(null); setLastSubmittedPrompt(null);
            setShowPanels(false); setUiLocked(false); setNeedsSummaryAndLog(false);
            setSettingsError(null); setHistoryError(null); setMainInputText('');
            setSummaryModelState(null); setSummaryText(null); setSummaryLoading(false); setSummaryError(null);
            isProcessingSummaryAndLog.current = false;
        }
    }, [user, isAuthLoading, fetchHistory, fetchSettingsForNewChat]);

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
        const isUpdate = !!currentHistoryId;
        if (!isUpdate && activeSlotResponses.length < 2) {
            console.log("Skipping initial summary generation: Fewer than 2 slots responded.");
            return null;
        }
        // Don't update summary if no slots responded this turn
        if (isUpdate && activeSlotResponses.length === 0) {
             console.log("Skipping summary update: No slots responded this turn.");
             return null;
        }

        console.log(`Attempting to ${isUpdate ? 'update' : 'generate initial'} summary using model: ${summaryModelState}`);
        setSummaryLoading(true);
        setSummaryError(null);
        if (!isUpdate) {
             setSummaryText(null);
        }

        const payload: Record<string, any> = {
            slotResponses: activeSlotResponses,
        };
        if (isUpdate) {
            payload.interactionId = currentHistoryId;
            payload.latestUserPrompt = latestPrompt; 
            payload.previousSummary = previousSummaryText ?? ''; 
        } else {
            payload.initialPrompt = latestPrompt; 
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
            if (typeof generatedSummary !== 'string') {
                 throw new Error("Summary API returned an invalid response type.");
            }
            console.log(`Summary ${isUpdate ? 'updated' : 'generated'} successfully.`);
            setSummaryText(generatedSummary); 
            setSummaryLoading(false);
            return generatedSummary; 

        } catch (error: any) {
            console.error(`Error calling summary API (${isUpdate ? 'update' : 'initial'}):`, error);
            setSummaryError(error.message || "Unknown summary generation error");
            setSummaryLoading(false);
            return null; 
        }
    }, [summaryModelState]);

    const updateSummaryInDb = useCallback(async (interactionId: string, newSummary: string) => { /* ... (no changes needed here) ... */ 
        if (!user || !interactionId) { console.warn("Skipping summary update in DB: Missing user or interactionId."); return; }
        console.log(`Attempting to update summary in DB for interaction ID: ${interactionId}`);
        try {
            const response = await fetch('/api/update-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interactionId, newSummary }) });
            const result = await response.json().catch(() => ({ success: false, error: 'Invalid JSON response' }));
            if (!response.ok || !result.success) {
                const errorMsg = result?.error || `HTTP ${response.status}`; console.error('Failed to update summary in DB:', errorMsg);
                setSummaryError(prev => prev ? `${prev}\nSave Error.` : `Failed to save updated summary.`);
            } else {
                console.log(`Successfully updated summary in DB for interaction ID: ${interactionId}`);
                setSummaryError(prev => prev?.replace(/Failed to save updated summary\.?(\n|$)/, '') || null);
            }
        } catch (error) {
            console.error('Network error calling update-summary API:', error);
            const errorMsg = error instanceof Error ? error.message : 'Network error';
            setSummaryError(prev => prev ? `${prev}\nNetwork Save Error.` : `Network error saving summary.`);
        }
    }, [user]);

    // MODIFIED: logInitialInteraction to include token counts
    const logInitialInteraction = useCallback(async (promptToLog: string, finalSlotStates: AiSlotState[], generatedSummary: string | null) => {
        if (!user || !promptToLog || finalSlotStates.every(s => !s.response && !s.error)) {
            console.log("Skipping initial log.");
            setNeedsSummaryAndLog(false);
            return;
        }
        console.log("Attempting to log INITIAL interaction (including summary and tokens)...");
        let dataToLog: Record<string, any> = {};
        let shouldRefetchHistory = false;

        try {
            const buildLogHistory = (state: AiSlotState): ConversationMessage[] | null => { /* ... (no changes here) ... */ 
                const userMessage = state.conversationHistory.findLast(m => m.role === 'user');
                const modelMessage = state.conversationHistory.findLast(m => m.role === 'model');
                if (userMessage && (modelMessage || state.error)) {
                     const historyToLog = [userMessage];
                     if (modelMessage) historyToLog.push(modelMessage);
                     return historyToLog;
                }
                 if (state.response || state.error) {
                     const userMsgContent = userMessage?.content === promptToLog ? userMessage.content : promptToLog;
                     const messages: ConversationMessage[] = [{ role: 'user', content: userMsgContent }];
                     if (state.response) messages.push({ role: 'model', content: state.response });
                     return messages;
                 }
                return null;
            };

            dataToLog = {
                prompt: promptToLog,
                title: promptToLog.substring(0, 50) + (promptToLog.length > 50 ? '...' : ''),
                summary: generatedSummary,
            };

            finalSlotStates.forEach((slotState, index) => {
                const slotNum = index + 1;
                const modelKey = `slot_${slotNum}_model_used`;
                const convKey = `slot_${slotNum}_conversation`;
                const inputTokensKey = `slot_${slotNum}_input_tokens`; // New key
                const outputTokensKey = `slot_${slotNum}_output_tokens`; // New key

                if (slotState.modelName) {
                    dataToLog[modelKey] = slotState.modelName;
                    if (slotState.response || slotState.error) {
                         dataToLog[convKey] = buildLogHistory(slotState);
                    } else {
                         dataToLog[convKey] = null;
                    }
                    // Add token counts for this slot
                    dataToLog[inputTokensKey] = slotState.inputTokensThisTurn ?? null;
                    dataToLog[outputTokensKey] = slotState.outputTokensThisTurn ?? null;
                } else {
                    dataToLog[modelKey] = null;
                    dataToLog[convKey] = null;
                    dataToLog[inputTokensKey] = null;
                    dataToLog[outputTokensKey] = null;
                }
            });
            for (let i = finalSlotStates.length; i < MAX_SLOTS; i++) {
                const slotNum = i + 1;
                dataToLog[`slot_${slotNum}_model_used`] = null;
                dataToLog[`slot_${slotNum}_conversation`] = null;
                dataToLog[`slot_${slotNum}_input_tokens`] = null;
                dataToLog[`slot_${slotNum}_output_tokens`] = null;
            }

            console.log("Data being sent to /api/log-interaction:", JSON.stringify(dataToLog, null, 2));
            const response = await fetch('/api/log-interaction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dataToLog) });
            const result = await response.json().catch(() => ({ success: false, error: 'Invalid JSON response' }));

            if (!response.ok || !result?.success || !result.loggedData?.[0]) {
                const errorMsg = result?.error || `HTTP ${response.status}`; console.error('Failed to log interaction:', errorMsg); setHistoryError(`Failed to save chat: ${errorMsg}`);
                setSlotStates(prevStates => prevStates.map((s, idx) => { if (s.modelName && dataToLog[`slot_${idx + 1}_conversation`]) { return { ...s, error: s.error ? `${s.error}\nLog Error.` : 'Failed to log initial turn.' }; } return s; }));
                if (generatedSummary) setSummaryError(prev => prev ? `${prev}\nLog Error.` : 'Failed to log summary.');
            } else {
                const newLogEntry = result.loggedData[0] as InteractionHistoryItem;
                if (newLogEntry?.id) {
                    console.log(`Interaction logged successfully. New ID: ${newLogEntry.id}`);
                    setHistory(prev => [newLogEntry, ...prev.filter(h => h.id !== newLogEntry.id)]);
                    setSelectedHistoryId(newLogEntry.id);
                    setHistoryError(null);
                    setSlotStates(prevStates => prevStates.map((currentState, index) => {
                        const slotNum = index + 1;
                        const modelKey = `slot_${slotNum}_model_used` as keyof InteractionHistoryItem;
                        const convKey = `slot_${slotNum}_conversation` as keyof InteractionHistoryItem;
                        const inputTokensKey = `slot_${slotNum}_input_tokens` as keyof InteractionHistoryItem; // New
                        const outputTokensKey = `slot_${slotNum}_output_tokens` as keyof InteractionHistoryItem; // New

                        const loggedHistory = (newLogEntry[convKey] as ConversationMessage[] | null) || [];
                        if (currentState.modelName === newLogEntry[modelKey]) {
                            return {
                                ...currentState,
                                conversationHistory: loggedHistory,
                                error: currentState.error, // Preserve error if it existed pre-log
                                // Update token counts from the logged entry for consistency
                                inputTokensThisTurn: (newLogEntry[inputTokensKey] as number | null) ?? null,
                                outputTokensThisTurn: (newLogEntry[outputTokensKey] as number | null) ?? null,
                            };
                        } return currentState;
                    }));
                    setSummaryText(newLogEntry.summary || null);
                    setSummaryError(null);
                    shouldRefetchHistory = true;
                } else {
                    console.warn("Log success but no ID returned. Flagging for history refetch.");
                    shouldRefetchHistory = true;
                }
            }
        } catch (error) {
            console.error('Error calling logging API:', error); const errorMsg = error instanceof Error ? error.message : 'Unknown error'; setHistoryError(`Failed to save chat: ${errorMsg}`);
            setSlotStates(prevStates => prevStates.map((s, idx) => { if (s.modelName && dataToLog[`slot_${idx + 1}_conversation`]) { return { ...s, error: s.error ? `${s.error}\nLog Error.` : `Log Error: ${errorMsg}` }; } return s; }));
            if (generatedSummary) setSummaryError(prev => prev ? `${prev}\nLog Error.` : `Log Error: ${errorMsg}`);
        } finally {
            setNeedsSummaryAndLog(false);
            console.log("Logging attempt finished.");
            if (shouldRefetchHistory) {
                console.log("Refetching history after successful log or missing ID.");
                fetchHistory("After Log Interaction");
            }
        }
    }, [user, fetchHistory]);

    useEffect(() => { /* ... (no changes needed in the logic, only in functions it calls) ... */ 
        const anySlotLoading = slotStates.some(slot => slot.loading);
        const anySummaryLoading = summaryLoading;
        const slotsJustFinished = slotStates.some(s => s.responseReceivedThisTurn && !s.loading);
        if (!summaryModelState || anySlotLoading || anySummaryLoading || isProcessingSummaryAndLog.current) return;
        const activeSlots = slotStates.filter(s => s.modelName);
        const allActiveSlotsRespondedThisTurn = activeSlots.length > 0 && activeSlots.every(s => s.responseReceivedThisTurn);
        const isInitialTurn = !selectedHistoryId && needsSummaryAndLog;
        const isFollowUpTurn = !!selectedHistoryId && !!lastSubmittedPrompt && slotsJustFinished;
        if (allActiveSlotsRespondedThisTurn && (isInitialTurn || isFollowUpTurn)) {
            console.log(`All active slots finished response for ${isInitialTurn ? 'initial' : 'follow-up'} turn. Proceeding with summary/log/update...`);
            isProcessingSummaryAndLog.current = true;
            const processTurnCompletion = async () => {
                try {
                    const currentPromptForSummary = isInitialTurn ? currentChatPrompt : lastSubmittedPrompt;
                    if (!currentPromptForSummary) { console.warn("Cannot process summary: Current prompt is missing."); return; }
                    const newSummary = await callApiForSummary(currentPromptForSummary, slotStates, selectedHistoryId, summaryText);
                    if (isInitialTurn) { await logInitialInteraction(currentPromptForSummary, slotStates, newSummary); }
                    else if (isFollowUpTurn && typeof newSummary === 'string') { await updateSummaryInDb(selectedHistoryId!, newSummary); }
                    else if (isFollowUpTurn && newSummary === null) { console.log("Summary update skipped or failed for follow-up turn."); }
                } catch (error) {
                    console.error("Error during processTurnCompletion execution:", error);
                    if (isInitialTurn) setNeedsSummaryAndLog(false);
                } finally {
                    isProcessingSummaryAndLog.current = false;
                    setSlotStates(prev => prev.map(s => ({ ...s, responseReceivedThisTurn: false })));
                }
            };
            processTurnCompletion();
        }
    }, [slotStates, needsSummaryAndLog, selectedHistoryId, currentChatPrompt, lastSubmittedPrompt, summaryText, summaryModelState, summaryLoading, callApiForSummary, logInitialInteraction, updateSummaryInDb]);

    // MODIFIED: handleHistoryClick to include token counts from history
    const handleHistoryClick = useCallback(async (item: InteractionHistoryItem) => {
        if (!user || uiLocked || item.id === selectedHistoryId) {
            if(item.id === selectedHistoryId) console.log("Clicked already selected history item.");
            return;
        }
        console.log("--- handleHistoryClick triggered ---");
        console.log("Loading item ID:", item.id, "Title:", item.title);
        setUiLocked(true); setSelectedHistoryId(item.id); setCurrentChatPrompt(item.prompt);
        setLastSubmittedPrompt(null); setMainInputText(''); setNeedsSummaryAndLog(false);
        isProcessingSummaryAndLog.current = false; setShowPanels(false);
        setSettingsError(null); setHistoryError(null); setSummaryError(null); setSummaryLoading(false);
        setSettingsLoading(true);

        const loadedSlotStates: AiSlotState[] = [];
        const loadedSummaryText: string | null = item.summary || null;

        for (let i = 0; i < MAX_SLOTS; i++) {
            const slotNum = i + 1;
            const modelKey = `slot_${slotNum}_model_used` as keyof InteractionHistoryItem;
            const conversationKey = `slot_${slotNum}_conversation` as keyof InteractionHistoryItem;
            const inputTokensKey = `slot_${slotNum}_input_tokens` as keyof InteractionHistoryItem; // New
            const outputTokensKey = `slot_${slotNum}_output_tokens` as keyof InteractionHistoryItem; // New

            const modelName = item[modelKey] as string | null;
            const rawHistory: any[] | null = item[conversationKey] as any[] | null;
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
                 error: null,
                 conversationHistory: conversationHistory,
                 isActiveInHistory: isActive,
                 responseReceivedThisTurn: conversationHistory.some(m => m.role === 'model'),
                 followUpInput: '',
                 // Load token counts for the initial turn from the history item
                 inputTokensThisTurn: (item[inputTokensKey] as number | null) ?? null,
                 outputTokensThisTurn: (item[outputTokensKey] as number | null) ?? null,
             });
        }
        setSlotStates(loadedSlotStates);
        setSummaryText(loadedSummaryText);
        setSummaryModelState(null);
        console.log(`Prepared ${loadedSlotStates.filter(s=>s.isActiveInHistory).length} active states from history ${item.id}. Summary loaded: ${!!loadedSummaryText}`);
        setSettingsLoading(false);
        setTimeout(() => { setShowPanels(true); setUiLocked(false); console.log(`State updated, UI unlocked for history ${item.id}.`); mainInputRef.current?.focus(); }, 50);
    }, [user, uiLocked, selectedHistoryId]);

    const handleNewChat = useCallback(() => { /* ... (no changes needed here) ... */ 
        if (!user || uiLocked) return;
        console.log("Starting New Chat");
        setUiLocked(true); setSelectedHistoryId(null); setCurrentChatPrompt(null); setLastSubmittedPrompt(null);
        setMainInputText(''); setShowPanels(false); setNeedsSummaryAndLog(false);
        isProcessingSummaryAndLog.current = false; setSlotStates([]); setHistoryError(null);
        setSettingsError(null); setSummaryText(null); setSummaryLoading(false); setSummaryError(null);
        fetchSettingsForNewChat().finally(() => { setUiLocked(false); console.log("New Chat setup complete, UI unlocked."); mainInputRef.current?.focus(); });
    }, [user, uiLocked, fetchSettingsForNewChat]);

    const handleUpdateTitle = useCallback(async (id: string, newTitle: string): Promise<boolean> => { /* ... (no changes needed here) ... */ 
        if (!user) return false;
        try {
            const response = await fetch('/api/update-history-title', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title: newTitle }) });
            const result = await response.json();
            if (!response.ok || !result.success) { throw new Error(result.error || 'Failed to update title'); }
            setHistory(prev => prev.map(item => item.id === id ? { ...item, title: newTitle } : item));
            setHistoryError(null); return true;
        } catch (error: any) { console.error("Error updating title:", error); setHistoryError(`Update failed: ${error.message}`); return false; }
    }, [user]);

    const handleDeleteItem = useCallback(async (id: string): Promise<boolean> => { /* ... (no changes needed here) ... */ 
        if (!user) return false;
        if (window.confirm('Are you sure you want to delete this history item? This action cannot be undone.')) {
            try {
                const response = await fetch('/api/delete-history-item', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
                const result = await response.json();
                if (!response.ok || !result.success) { throw new Error(result.error || 'Failed to delete item'); }
                setHistory(prev => prev.filter(item => item.id !== id));
                if (selectedHistoryId === id) { console.log("Deleting selected chat, switching to New Chat state."); handleNewChat(); }
                setHistoryError(null); return true;
            } catch (error: any) { console.error("Error deleting item:", error); setHistoryError(`Delete failed: ${error.message}`); return false; }
        } return false;
    }, [user, selectedHistoryId, handleNewChat]);

    // MODIFIED: callApiForSlot to handle token counts and pass interactionId
    const callApiForSlot = useCallback(async (
        slotIndex: number, modelString: string | null, promptToSend: string,
        historyBeforeThisTurn: ConversationMessage[], currentInteractionIdForLog: string | null // Renamed for clarity
    ) => {
        const slotNumber = slotIndex + 1;
        const updateSlotState = (updateFn: (prevState: AiSlotState) => AiSlotState) => {
            setSlotStates(prevStates => prevStates.map((state, index) => index === slotIndex ? updateFn(state) : state ));
        };

        if (!modelString || !promptToSend) {
            console.warn(`[Slot ${slotNumber}] callApiForSlot skipped: Missing model or prompt.`);
            updateSlotState(prev => ({ ...prev, loading: false, error: "Missing model or prompt.", responseReceivedThisTurn: true, inputTokensThisTurn: 0, outputTokensThisTurn: 0 }));
            return;
        }

        const newUserMessage: ConversationMessage = { role: 'user', content: promptToSend };
        const validHistoryBeforeThisTurn = Array.isArray(historyBeforeThisTurn) ? historyBeforeThisTurn : [];
        const historyIncludingUserPrompt: ConversationMessage[] = [...validHistoryBeforeThisTurn, newUserMessage];

        console.log(`[Slot ${slotNumber}] History BEFORE this turn being sent:`, JSON.parse(JSON.stringify(validHistoryBeforeThisTurn)));
        updateSlotState(prev => ({
            ...prev, loading: true, response: null, error: null,
            conversationHistory: historyIncludingUserPrompt,
            responseReceivedThisTurn: false,
            inputTokensThisTurn: null, // Reset token counts for the new call
            outputTokensThisTurn: null,
        }));
        console.log(`[Slot ${slotNumber}] (${modelString}): Sending prompt...`);

        let modelResponseText: string | null = null;
        let newModelMessage: ConversationMessage | null = null;
        let inputTokens = 0; // Initialize token counts
        let outputTokens = 0;

        try {
            const parts = modelString.split(': '); if (parts.length !== 2) throw new Error(`Invalid model format: ${modelString}`);
            const provider = parts[0]; const specificModel = parts[1]; let apiUrl = '';
            if (provider === 'ChatGPT') apiUrl = '/api/call-openai';
            else if (provider === 'Gemini') apiUrl = '/api/call-gemini';
            else if (provider === 'Anthropic') apiUrl = '/api/call-anthropic';
            else throw new Error(`Unsupported provider: ${provider}`);

            const apiResponse = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: promptToSend, // Still send current prompt for clarity in API route
                    model: specificModel,
                    slotNumber,
                    conversationHistory: historyIncludingUserPrompt,
                    interactionId: currentInteractionIdForLog // Pass interactionId for token logging
                })
            });
            const result = await apiResponse.json().catch(() => ({ error: "Invalid JSON response from AI API" }));

            if (!apiResponse.ok) {
                throw new Error(result.error || `AI API call failed (${apiResponse.status} ${apiResponse.statusText})`);
            }
            modelResponseText = result.response;
            inputTokens = result.inputTokens ?? 0; // Get token counts from response
            outputTokens = result.outputTokens ?? 0;

            if (!modelResponseText) throw new Error("AI API returned an empty response.");

            newModelMessage = { role: 'model', content: modelResponseText };
            updateSlotState(prev => {
                const currentHistory = Array.isArray(prev.conversationHistory) ? prev.conversationHistory : [];
                const finalHistory = [...currentHistory, newModelMessage!];
                console.log(`[Slot ${slotNumber}] Updating state on SUCCESS. Final history:`, JSON.parse(JSON.stringify(finalHistory)));
                return {
                    ...prev, response: modelResponseText, error: null, loading: false,
                    conversationHistory: finalHistory, responseReceivedThisTurn: true,
                    inputTokensThisTurn: inputTokens, // Store tokens
                    outputTokensThisTurn: outputTokens,
                };
            });
            console.log(`[Slot ${slotNumber}] (${modelString}) received response. Input: ${inputTokens}, Output: ${outputTokens}`);

            if (currentInteractionIdForLog && newUserMessage && newModelMessage) {
                console.log(`[Slot ${slotNumber}] Attempting to APPEND turn to DB (ID: ${currentInteractionIdForLog}).`);
                fetch('/api/append-conversation', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ interactionId: currentInteractionIdForLog, slotNumber: slotNumber, newUserMessage: newUserMessage, newModelMessage: newModelMessage })
                }).then(async appendResponse => { /* ... (no changes to append logic itself) ... */ 
                    if (!appendResponse.ok) {
                        const appendErrorData = await appendResponse.json().catch(() => ({ error: `HTTP ${appendResponse.status}` }));
                        const errorMsg = appendErrorData.error || `HTTP ${appendResponse.status}`;
                        console.error(`[Slot ${slotNumber}] Error appending conversation (ID: ${currentInteractionIdForLog}):`, errorMsg);
                        updateSlotState(prev => ({ ...prev, error: prev.error ? `${prev.error}\nSave Error.` : `Failed to save this turn (${errorMsg}).` }));
                    } else {
                        console.log(`[Slot ${slotNumber}] Successfully appended conversation to ID ${currentInteractionIdForLog}`);
                        updateSlotState(prev => ({ ...prev, error: prev.error?.replace(/Failed to save this turn.*?\)?\.?(\n|$)/, '') || null }));
                    }
                }).catch(appendErr => {
                    console.error(`[Slot ${slotNumber}] Network error calling append-conversation API:`, appendErr);
                    const errorMsg = appendErr instanceof Error ? appendErr.message : 'Network error';
                    updateSlotState(prev => ({ ...prev, error: prev.error ? `${prev.error}\nNetwork Save Error.` : `Network error saving turn (${errorMsg}).` }));
                });
            } else if (currentInteractionIdForLog && (!newUserMessage || !newModelMessage)) {
                 console.error(`[Slot ${slotNumber}] Cannot append turn: Missing messages.`);
                 updateSlotState(prev => ({ ...prev, error: prev.error ? `${prev.error}\nSave Error.` : `Internal error saving.` }));
            }
        } catch (error: any) {
            console.error(`Error in callApiForSlot (Slot ${slotNumber}, Model: ${modelString}):`, error);
            const historyOnError = historyIncludingUserPrompt;
            console.log(`[Slot ${slotNumber}] Final history on ERROR:`, JSON.parse(JSON.stringify(historyOnError)));
            updateSlotState(prev => ({
                ...prev, response: null, error: error.message || 'Unknown AI error', loading: false,
                conversationHistory: historyOnError, responseReceivedThisTurn: true,
                inputTokensThisTurn: 0, // Set to 0 on error for this turn
                outputTokensThisTurn: 0,
            }));
        }
    }, []);

    // MODIFIED: handleProcessText to pass interactionId
    const handleProcessText = useCallback(async () => {
        const currentInput = mainInputText.trim();
        const currentStateSnapshot = [...slotStates];
        const activeSlotsForCall = currentStateSnapshot.filter(s => s.modelName);

        if (currentInput === '' || !user || isAuthLoading || settingsLoading || activeSlotsForCall.length === 0 || uiLocked) return;
        const isAnySlotProcessing = currentStateSnapshot.some(s => s.loading);
        const isSummaryProcessing = summaryLoading;
        if (isAnySlotProcessing || isSummaryProcessing) return;

        const isFirstPromptOfChat = !selectedHistoryId;
        const promptToSend = currentInput;
        console.log(`Processing ${isFirstPromptOfChat ? 'initial' : 'follow-up'} prompt: "${promptToSend}"`);

        if (isFirstPromptOfChat) {
            setCurrentChatPrompt(promptToSend); setNeedsSummaryAndLog(true);
            isProcessingSummaryAndLog.current = false; setSummaryText(null);
            setSummaryError(null); setSummaryLoading(false);
        } else { setNeedsSummaryAndLog(false); }
        setLastSubmittedPrompt(promptToSend); setShowPanels(true);
        if (mainInputRef.current) mainInputRef.current.blur();
        setMainInputText('');

        const currentInteractionIdForLog = selectedHistoryId; // Use selectedHistoryId for logging

        setSlotStates(prevSlotStates => {
            return prevSlotStates.map((s) => {
                if (s.modelName && activeSlotsForCall.some(active => active.modelName === s.modelName)) {
                    const historyToKeep = isFirstPromptOfChat ? [] : s.conversationHistory;
                    return {
                        ...s, loading: true, response: null, error: null, responseReceivedThisTurn: false,
                        conversationHistory: historyToKeep, isActiveInHistory: isFirstPromptOfChat ? true : s.isActiveInHistory,
                        inputTokensThisTurn: null, outputTokensThisTurn: null, // Reset for new call
                    };
                }
                if (isFirstPromptOfChat && !s.modelName) return {...initialSlotState, isActiveInHistory: false };
                return s;
            });
        });

        const promises = activeSlotsForCall.map((slotStateFromSnapshot) => {
            const originalIndex = currentStateSnapshot.findIndex(s => s === slotStateFromSnapshot);
            if (originalIndex !== -1 && slotStateFromSnapshot.modelName) {
                const historyForApi: ConversationMessage[] = isFirstPromptOfChat ? [] : (slotStateFromSnapshot.conversationHistory as ConversationMessage[]);
                console.log(`[Slot ${originalIndex + 1}] Calling API via handleProcessText. History length: ${historyForApi.length}`);
                return callApiForSlot(
                    originalIndex, slotStateFromSnapshot.modelName, promptToSend, historyForApi,
                    currentInteractionIdForLog // Pass the ID for token logging
                );
            }
            console.error("Error finding slot index/model in handleProcessText loop.");
            return Promise.resolve();
        });
        Promise.allSettled(promises).then(() => {
            console.log("All main API call initiations complete via handleProcessText.");
            setShowPanels(true);
        });
    }, [mainInputText, user, isAuthLoading, settingsLoading, selectedHistoryId, slotStates, callApiForSlot, uiLocked, summaryLoading, summaryModelState]);

    // MODIFIED: handleReplyToSlot to pass interactionId
    const handleReplyToSlot = useCallback((slotIndex: number) => {
        const currentStateSnapshot = [...slotStates];
        const targetState = currentStateSnapshot[slotIndex];
        if (!targetState) { console.error(`handleReplyToSlot: Invalid slotIndex ${slotIndex}`); return; }
        const followUpPrompt = targetState.followUpInput.trim(); const modelName = targetState.modelName;
        if (!followUpPrompt || !modelName || !user || !selectedHistoryId || targetState.loading || uiLocked || summaryLoading) return;

        console.log(`Sending follow-up to Slot ${slotIndex + 1} (${modelName}): "${followUpPrompt}"`);
        setLastSubmittedPrompt(followUpPrompt); setNeedsSummaryAndLog(false);
        setSlotStates(prevStates => prevStates.map((state, index) => index === slotIndex ? { ...state, followUpInput: '' } : state ));
        const historyBeforeThisTurn = targetState.conversationHistory;
        console.log(`[Slot ${slotIndex + 1}] Calling API from Reply. History length: ${historyBeforeThisTurn.length}`);
        callApiForSlot(
            slotIndex, modelName, followUpPrompt, historyBeforeThisTurn,
            selectedHistoryId // Pass the ID for token logging
        );
    }, [user, slotStates, callApiForSlot, selectedHistoryId, uiLocked, summaryLoading]);

    // --- UI State and Render Logic (no major changes expected here, only minor display of token counts if desired) ---
    const isProcessingAnySlot = slotStates.some(slot => slot.loading);
    const isProcessingSummary = summaryLoading;
    const isProcessingAnything = isProcessingAnySlot || isProcessingSummary || isProcessingSummaryAndLog.current;
    const canInteractGenerally = !!user && !isAuthLoading && !settingsLoading && !uiLocked;
    const hasAnyComparisonModelsConfigured = slotStates.some(s => s.modelName);
    const canUseMainInput = canInteractGenerally && !isProcessingAnything && (!!selectedHistoryId || hasAnyComparisonModelsConfigured);
    const comparisonSlotsToDisplay = slotStates.filter(slotState => selectedHistoryId ? slotState.isActiveInHistory : !!slotState.modelName );
    const numberOfComparisonSlotsToDisplay = comparisonSlotsToDisplay.length;
    const shouldDisplaySummaryPanel = (selectedHistoryId && !!summaryText) || (!selectedHistoryId && (needsSummaryAndLog || summaryLoading || !!summaryError || !!summaryText) && !!summaryModelState && numberOfComparisonSlotsToDisplay >= 2);
    const totalPanelsToDisplay = numberOfComparisonSlotsToDisplay + (shouldDisplaySummaryPanel ? 1 : 0);
    const shouldRenderPanelsArea = user && !settingsLoading && (showPanels || !!selectedHistoryId) && slotStates.length > 0 && totalPanelsToDisplay > 0;
    const getModelDisplayName = (modelString: string | null): string => { if (!modelString) return "Slot Empty"; return modelString; };
    const getRevisedGridContainerClass = (comparisonSlotCount: number, includeSummary: boolean): string => { /* ... (no changes here) ... */ 
        let classes = 'w-full max-w-7xl grid gap-4 self-center flex-grow px-1 pb-4 overflow-y-auto custom-scrollbar ';
        const totalCount = comparisonSlotCount + (includeSummary ? 1 : 0);
        if (comparisonSlotCount === 1 && !includeSummary) classes += 'grid-cols-1';
        else if (comparisonSlotCount === 2 && !includeSummary) classes += 'grid-cols-1 md:grid-cols-2';
        else if (comparisonSlotCount === 3 && !includeSummary) classes += 'grid-cols-1 md:grid-cols-3';
        else if (comparisonSlotCount === 4 && !includeSummary) classes += 'grid-cols-1 md:grid-cols-2';
        else if (comparisonSlotCount === 5 && !includeSummary) classes += 'grid-cols-1 md:grid-cols-6';
        else if (comparisonSlotCount === 6 && !includeSummary) classes += 'grid-cols-1 md:grid-cols-3';
        else if (comparisonSlotCount === 2 && includeSummary) classes += 'grid-cols-1 md:grid-cols-3';
        else if (comparisonSlotCount === 3 && includeSummary) classes += 'grid-cols-1 md:grid-cols-4';
        else if (comparisonSlotCount === 4 && includeSummary) classes += 'grid-cols-1 md:grid-cols-3';
        else if (comparisonSlotCount === 5 && includeSummary) classes += 'grid-cols-1 md:grid-cols-3';
        else if (comparisonSlotCount === 6 && includeSummary) classes += 'grid-cols-1 md:grid-cols-4';
        else classes += 'grid-cols-1 md:grid-cols-3';
        return classes;
    };
    const getItemLayoutClass = (index: number, totalCount: number, isSummary: boolean): string => { /* ... (no changes here) ... */ 
        let itemClasses = 'col-span-1 row-span-1';
        if (totalCount === 1) { itemClasses = 'md:col-span-1'; }
        else if (totalCount === 2) { itemClasses = 'md:col-span-1'; }
        else if (totalCount === 3) { if (isSummary) { itemClasses = 'md:col-span-1'; } else { itemClasses = 'md:col-span-1'; }}
        else if (totalCount === 4) { if (isSummary) { itemClasses = 'md:col-span-1'; } else { itemClasses = 'md:col-span-1'; }}
        else if (totalCount === 5) { if (isSummary) { itemClasses = 'md:col-start-3 md:row-span-2'; } else if (index === 0) { itemClasses = 'md:col-start-1 md:row-start-1'; } else if (index === 1) { itemClasses = 'md:col-start-2 md:row-start-1'; } else if (index === 2) { itemClasses = 'md:col-start-1 md:row-start-2'; } else if (index === 3) { itemClasses = 'md:col-start-2 md:row-start-2'; }}
        else if (totalCount === 6) { if (index < 3) { itemClasses = `md:col-span-1 md:row-start-1`; } else { itemClasses = `md:col-span-1 md:row-start-2`; }}
        else if (totalCount === 7) { if (isSummary) { itemClasses = 'md:col-start-4 md:row-span-2'; } else if (index < 3) { itemClasses = `md:col-span-1 md:row-start-1`; } else { itemClasses = `md:col-span-1 md:row-start-2`; }}
        return itemClasses;
    };

    return (
        <div className="flex h-full bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
            <HistorySidebar
                history={history} historyLoading={historyLoading || isAuthLoading} historyError={historyError}
                selectedHistoryId={selectedHistoryId} handleHistoryClick={handleHistoryClick}
                fetchHistory={() => fetchHistory("Manual Refresh")}
                onUpdateTitle={handleUpdateTitle} onDeleteItem={handleDeleteItem}
                isLoggedIn={!!user} handleNewChat={handleNewChat}
            />
            <main className="relative flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
                {(uiLocked || (settingsLoading && !selectedHistoryId) || isAuthLoading) && ( /* ... loading overlay ... */ 
                    <div className="absolute inset-0 bg-gray-400/30 dark:bg-gray-900/50 flex items-center justify-center z-50" aria-label="Loading content">
                        <svg className="animate-spin h-8 w-8 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        <span className="ml-3 text-gray-700 dark:text-gray-300">Loading...</span>
                    </div>
                )}
                <div className="w-full max-w-7xl mb-4 self-center flex justify-between items-center px-1 h-5 flex-shrink-0">
                    <div className="text-sm text-red-500 dark:text-red-400 truncate" title={settingsError ?? historyError ?? summaryError ?? ''}>
                         {settingsError && `Settings Error: ${settingsError}`}
                         {historyError && !settingsError && `History Error: ${historyError}`}
                         {summaryError && !settingsError && !historyError && `Summary Error: ${summaryError}`}
                    </div>
                    {user && !isAuthLoading && (<Link href="/settings" className={`text-sm font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline whitespace-nowrap ${uiLocked ? 'pointer-events-none opacity-50' : ''}`}>⚙️ Settings</Link>)}
                    {!user && !isAuthLoading && <div className="h-5"></div>}
                </div>
                {!user && !isAuthLoading && ( /* ... login prompt ... */ 
                     <div className="w-full max-w-3xl mb-6 self-center p-4 bg-yellow-100 border border-yellow-300 rounded-md text-center text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-100 dark:border-yellow-700">
                        Please <Link href="/auth" className="font-semibold underline hover:text-yellow-900 dark:hover:text-yellow-200">Sign In or Sign Up</Link> to use the tool.
                    </div>
                )}
                <div className="w-full max-w-3xl mb-4 self-center flex-shrink-0 px-1">
                    <textarea
                        ref={mainInputRef} rows={1} value={mainInputText} onChange={(e) => setMainInputText(e.target.value)}
                        placeholder={!user ? "Please log in" : settingsLoading ? "Loading settings..." : !selectedHistoryId && !hasAnyComparisonModelsConfigured ? "No AI models configured. Go to Settings." : isProcessingAnything ? "Processing..." : selectedHistoryId ? "Send follow-up to all active slots..." : "Enter initial prompt to compare models..."}
                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 shadow-sm disabled:bg-gray-200 dark:disabled:bg-gray-700/50 disabled:cursor-not-allowed bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 resize-none overflow-y-auto min-h-[44px] max-h-[128px]"
                        style={{ height: 'auto' }}
                        onInput={(e) => { const target = e.target as HTMLTextAreaElement; target.style.height = 'auto'; target.style.height = `${target.scrollHeight}px`; }}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && canUseMainInput && mainInputText.trim() !== '') { e.preventDefault(); handleProcessText(); } }}
                        disabled={!canUseMainInput} aria-label="Main prompt input"
                    />
                    <button onClick={handleProcessText} disabled={!canUseMainInput || mainInputText.trim() === ''}
                        className={`w-full mt-2 p-3 text-white rounded-md font-semibold transition-colors duration-200 ${!canUseMainInput || mainInputText.trim() === '' ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'}`}>
                        {isProcessingAnything ? 'Processing...' : (selectedHistoryId) ? 'Send Follow-up to All' : 'Send Initial Prompt'}
                    </button>
                </div>

                {shouldRenderPanelsArea && (
                    <div className={getRevisedGridContainerClass(numberOfComparisonSlotsToDisplay, shouldDisplaySummaryPanel)}>
                        {comparisonSlotsToDisplay.map((slotState, displayIndex) => {
                            const originalIndex = slotStates.findIndex(s => s === slotState);
                            if (originalIndex === -1) { console.error("Render Error: Could not find original index for slot.", slotState); return null; }
                            const colors = PANEL_COLORS[originalIndex % PANEL_COLORS.length];
                            const isSlotProcessing = slotState.loading;
                            const hasModel = !!slotState.modelName;
                            const panelLayoutClass = getItemLayoutClass(displayIndex, totalPanelsToDisplay, false);
                            const panelHeightClass = totalPanelsToDisplay >= 4 ? 'min-h-[350px]' : 'min-h-[250px]';
                            const canEnableFollowUpInput = canInteractGenerally && !isProcessingAnything && !!selectedHistoryId && hasModel;
                            const canEnableFollowUpButton = canEnableFollowUpInput && slotState.followUpInput.trim() !== '';

                            return (
                                <div key={`panel-${originalIndex}-${selectedHistoryId || 'new'}`} className={`border rounded-lg bg-white dark:bg-gray-800 shadow-md flex flex-col ${colors.border} overflow-hidden ${panelHeightClass} ${panelLayoutClass}`} role="article" aria-labelledby={`panel-heading-${originalIndex}`}>
                                    <h2 id={`panel-heading-${originalIndex}`} className={`text-lg md:text-xl font-semibold p-4 pb-2 ${colors.text} flex-shrink-0 truncate border-b dark:border-gray-700`} title={slotState.modelName || `Slot ${originalIndex + 1} (Empty)`}>
                                        {getModelDisplayName(slotState.modelName)} (Slot {originalIndex + 1})
                                    </h2>
                                    <div className="flex-grow overflow-y-auto text-sm p-4 space-y-3 custom-scrollbar" role="log">
                                        {!hasModel && slotState.conversationHistory.length === 0 && !slotState.isActiveInHistory && <p className="text-gray-400 dark:text-gray-500 italic text-center mt-4">Slot empty.</p>}
                                        {Array.isArray(slotState.conversationHistory) && slotState.conversationHistory.map((msg, msgIndex) => (
                                            <div key={`msg-${originalIndex}-${msgIndex}`} className={`prose prose-sm dark:prose-invert max-w-none p-2 rounded-md ${msg.role === 'user' ? 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 ml-auto max-w-[90%]' : `${colors.bg} text-gray-900 dark:text-gray-100 mr-auto max-w-[90%]`}`} aria-label={`${msg.role} message ${msgIndex + 1}`}>
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content || ''}</ReactMarkdown>
                                            </div>
                                        ))}
                                        {isSlotProcessing && ( /* ... loading spinner ... */ 
                                            <div className="flex items-center justify-center p-2 mt-2">
                                                <svg className="animate-spin h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg>
                                                <p className="text-gray-500 dark:text-gray-400 text-xs">Loading...</p>
                                            </div>
                                        )}
                                        {slotState.error && <p className="text-red-600 dark:text-red-400 mt-2 p-2 text-xs whitespace-pre-wrap" role="alert">Error: {slotState.error}</p>}
                                        {/* Display token usage for the last turn in this slot */}
                                        {(slotState.inputTokensThisTurn !== null || slotState.outputTokensThisTurn !== null) && !isSlotProcessing && (
                                            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                                                Tokens (last turn): In: {slotState.inputTokensThisTurn?.toLocaleString() ?? 'N/A'} | Out: {slotState.outputTokensThisTurn?.toLocaleString() ?? 'N/A'}
                                            </div>
                                        )}
                                        {!hasModel && slotState.isActiveInHistory && Array.isArray(slotState.conversationHistory) && slotState.conversationHistory.length > 0 && <p className="text-gray-400 dark:text-gray-500 italic text-center mt-4 text-xs">Model removed.</p>}
                                    </div>
                                    {hasModel && selectedHistoryId && ( /* ... follow-up input ... */ 
                                        <div className="mt-auto p-4 pt-2 border-t dark:border-gray-600 flex items-end space-x-2 flex-shrink-0">
                                            <textarea rows={1} value={slotState.followUpInput} onChange={(e) => setSlotStates(prev => prev.map((s, i) => i === originalIndex ? { ...s, followUpInput: e.target.value } : s))} placeholder={`Reply...`} className={`flex-grow p-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-1 ${colors.focusRing} focus:outline-none disabled:bg-gray-200 dark:disabled:bg-gray-700/50 disabled:cursor-not-allowed resize-none overflow-y-auto min-h-[40px] max-h-[100px]`} style={{ height: 'auto' }} onInput={(e) => { const target = e.target as HTMLTextAreaElement; target.style.height = 'auto'; target.style.height = `${target.scrollHeight}px`; }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && canEnableFollowUpButton) { e.preventDefault(); handleReplyToSlot(originalIndex); } }} disabled={!canEnableFollowUpInput} aria-label={`Follow-up input for Slot ${originalIndex + 1}`} />
                                            <button onClick={() => handleReplyToSlot(originalIndex)} disabled={!canEnableFollowUpButton} className={`px-3 py-2 ${colors.button} text-white text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 self-end mb-[1px] transition-opacity`} title={`Send follow-up`} aria-label={`Send follow-up to Slot ${originalIndex + 1}`}>
                                                {isSlotProcessing ? '...' : 'Send'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {shouldDisplaySummaryPanel && ( /* ... summary panel ... */ 
                            <div key={`panel-summary-${selectedHistoryId || 'new'}`} className={`border rounded-lg bg-white dark:bg-gray-800 shadow-md flex flex-col ${SUMMARY_PANEL_COLORS.border} overflow-hidden ${getItemLayoutClass(numberOfComparisonSlotsToDisplay, totalPanelsToDisplay, true)} ${totalPanelsToDisplay >= 4 ? 'min-h-[350px]' : 'min-h-[250px]'}`} role="article" aria-labelledby="panel-heading-summary">
                                <h2 id="panel-heading-summary" className={`text-lg md:text-xl font-semibold p-4 pb-2 ${SUMMARY_PANEL_COLORS.text} flex-shrink-0 truncate border-b dark:border-gray-700`} title={summaryModelState || 'Aggregated Summary'}>Summary {summaryModelState ? `(${getModelDisplayName(summaryModelState)})` : ''}</h2>
                                <div className="flex-grow overflow-y-auto text-sm p-4 space-y-3 custom-scrollbar" role="log">
                                     {summaryLoading && ( /* ... spinner ... */ 
                                        <div className="flex items-center justify-center p-2 mt-2">
                                            <svg className="animate-spin h-4 w-4 text-gray-500 dark:text-gray-400 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg>
                                            <p className="text-gray-500 dark:text-gray-400 text-xs">Generating summary...</p>
                                        </div>
                                     )}
                                     {summaryError && !summaryLoading && <p className="text-red-600 dark:text-red-400 mt-2 p-2 text-xs whitespace-pre-wrap" role="alert">Summary Error: {summaryError}</p>}
                                     {summaryText && !summaryLoading && !summaryError && ( <div className={`prose prose-sm dark:prose-invert max-w-none p-2 rounded-md ${SUMMARY_PANEL_COLORS.bg} text-gray-900 dark:text-gray-100`} aria-label="Generated summary"><ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryText}</ReactMarkdown></div> )}
                                     {!summaryLoading && !summaryError && !summaryText && ( <p className="text-gray-400 dark:text-gray-500 italic text-center mt-4">{ !summaryModelState ? "Summary model not configured." : numberOfComparisonSlotsToDisplay < 2 ? "Requires 2+ comparison slots." : "Summary will appear here." }</p> )}
                                </div>
                             </div>
                        )}
                    </div>
                )}
                {!shouldRenderPanelsArea && user && !settingsLoading && hasAnyComparisonModelsConfigured && ( /* ... placeholder ... */ 
                    <div className="flex-grow flex items-center justify-center text-gray-500 dark:text-gray-400 text-center px-4">Enter a prompt or select a chat to begin.</div>
                )}
                {!shouldRenderPanelsArea && user && !settingsLoading && !hasAnyComparisonModelsConfigured && ( /* ... placeholder ... */ 
                    <div className="flex-grow flex items-center justify-center text-gray-500 dark:text-gray-400 text-center px-4">No models configured. Visit&nbsp;<Link href="/settings" className="underline text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">Settings</Link>.</div>
                )}
                {!shouldRenderPanelsArea && !user && !isAuthLoading && ( <div className="flex-grow"></div> )}
            </main>
        </div>
    );
}
