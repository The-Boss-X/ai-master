// app/page.tsx
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import React, { useState, useRef, useEffect, useCallback, Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from './context/AuthContext';
import type { InteractionHistoryItem, ConversationMessage } from './types/InteractionHistoryItem';
import HistorySidebar from './components/HistorySidebar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import LandingPage from './components/LandingPage'; // Import the LandingPage
import SettingsModal from './components/SettingsModal';

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
    enable_streaming?: boolean | null; // Added for streaming
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
    inputTokensThisTurn: number | null;
    outputTokensThisTurn: number | null;
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

const MainAppInterface = () => {
    const { user, isLoading: isAuthLoading } = useAuth();
    const [mainInputText, setMainInputText] = useState('');
    const [currentChatPrompt, setCurrentChatPrompt] = useState<string | null>(null);
    const [lastSubmittedPrompt, setLastSubmittedPrompt] = useState<string | null>(null);
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [uiLocked, setUiLocked] = useState(false);
    const [settingsError, setSettingsError] = useState<string | null>(null);
    const initialSlotState = useMemo(() => ({ modelName: null, loading: false, response: null, error: null, followUpInput: '', conversationHistory: [], isActiveInHistory: false, responseReceivedThisTurn: false, inputTokensThisTurn: null, outputTokensThisTurn: null }), []);
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
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [userStreamingPreference, setUserStreamingPreference] = useState<boolean>(false); // Added for streaming

    const handleSettingsPossiblyChanged = () => {
        console.log("Settings modal closed, re-fetching settings for new chat if no history selected.");
        if (!selectedHistoryId) {
            fetchSettingsForNewChat();
        }
    };

    const fetchHistory = useCallback(async (calledFrom?: string) => {
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
            let fetchedStreamingPref = false; // Added for streaming
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
                fetchedStreamingPref = data.enable_streaming || false; // Added for streaming
            }
            setSlotStates(newSlotStates);
            setSummaryModelState(fetchedSummaryModel);
            setUserStreamingPreference(fetchedStreamingPref); // Added for streaming
            console.log(`Applied settings for new chat. Active slots: ${newSlotStates.length}, Summary Model: ${fetchedSummaryModel || 'None'}, Streaming: ${fetchedStreamingPref}`);
        } catch (e: any) {
            console.error("Error fetching settings for new chat:", e);
            setSettingsError(e.message); setSlotStates([]); setSummaryModelState(null);
            setUserStreamingPreference(false); // Added for streaming
        } finally {
            setSettingsLoading(false);
        }
    }, [user, initialSlotState]);

    const fetchCurrentSummaryModelPreference = useCallback(async () => {
        if (!user) {
            console.warn("fetchCurrentSummaryModelPreference called without user.");
            return null;
        }
        console.log("fetchCurrentSummaryModelPreference called.");
        try {
            const response = await fetch('/api/settings/get-settings');
            if (!response.ok) {
                const d = await response.json().catch(() => ({}));
                console.error(`fetchCurrentSummaryModelPreference: Settings fetch failed (${response.status})`, d.error);
                throw new Error(d.error || `Settings fetch failed (${response.status})`);
            }
            const data: FetchedSettings | null = await response.json();
            if (data && data.summary_model && typeof data.summary_model === 'string' && data.summary_model.includes(': ')) {
                console.log("fetchCurrentSummaryModelPreference: Found summary model:", data.summary_model);
                return data.summary_model;
            } else if (data && data.summary_model) {
                console.warn(`fetchCurrentSummaryModelPreference: Invalid format for summary model in settings: "${data.summary_model}".`);
            } else {
                console.log("fetchCurrentSummaryModelPreference: No summary model found in settings.");
            }
            return null;
        } catch (e: any) {
            console.error("Error fetching current summary model preference:", e);
            return null;
        }
    }, [user]);

    useEffect(() => {
        if (!isAuthLoading && user) {
            console.log("Auth loaded. User logged in. Fetching history.");
            fetchHistory("Initial Load / Auth Change");
            if (!selectedHistoryId && !uiLocked && !currentChatPrompt) {
                console.log("No history selected, not UI locked, and no current chat prompt. Fetching settings for new chat.");
                setShowPanels(false);
                fetchSettingsForNewChat();
            } else {
                console.log("History item selected, UI locked, or current chat prompt exists. Settings will load from history click or new chat setup if needed, or panels should be visible.");
                if (selectedHistoryId) setSettingsLoading(false); 
            }
        } else if (!isAuthLoading && !user) {
            console.log("Auth loaded. User logged out. Clearing state.");
            setSlotStates([]); setHistory([]); setSettingsLoading(false); setHistoryLoading(false);
            setSelectedHistoryId(null); setCurrentChatPrompt(null); setLastSubmittedPrompt(null);
            setShowPanels(false); setUiLocked(false); setNeedsSummaryAndLog(false);
            setSettingsError(null); setHistoryError(null); setMainInputText('');
            setSummaryModelState(null); setSummaryText(null); setSummaryLoading(false); setSummaryError(null);
            setUserStreamingPreference(false); // Reset streaming preference
            isProcessingSummaryAndLog.current = false;
        }
    }, [user, isAuthLoading, fetchHistory, fetchSettingsForNewChat, selectedHistoryId, uiLocked, currentChatPrompt]);

    const callApiForSummary = useCallback(async (
        latestPrompt: string,
        responses: AiSlotState[],
        currentHistoryId: string | null,
        previousSummaryText: string | null
    ) => {
        console.log('[callApiForSummary] Called. Prompt:', latestPrompt, 'History ID:', currentHistoryId, 'Is Update:', !!currentHistoryId);
        if (!summaryModelState) {
            console.log("[callApiForSummary] Skipping: No summary model configured.");
            return null;
        }

        const activeSlotResponses = responses
            .filter(s => s.modelName && s.responseReceivedThisTurn)
            .map(s => ({
                modelName: s.modelName!,
                response: s.response,
                error: s.error
            }));

        const isUpdate = !!currentHistoryId;
        if (!isUpdate && activeSlotResponses.length < 2) {
            console.log("Skipping initial summary generation: Fewer than 2 slots responded.");
            return null;
        }
        if (isUpdate && activeSlotResponses.length === 0) {
             console.log("[callApiForSummary] Skipping summary update: No slots responded this turn.");
             return null;
        }

        console.log(`[callApiForSummary] Attempting to ${isUpdate ? 'update' : 'generate initial'} summary using model: ${summaryModelState}`);
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
                throw new Error(result.error || `Summary API call failed (${apiResponse.status} ${apiResponse.statusText})`);
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

    const updateSummaryInDb = useCallback(async (interactionId: string, newSummary: string) => {
        if (!user || !interactionId) { console.warn("[updateSummaryInDb] Skipping: Missing user or interactionId."); return; }
        console.log(`[updateSummaryInDb] Attempting to update summary in DB for interaction ID: ${interactionId}`);
        try {
            const response = await fetch('/api/update-summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interactionId, newSummary }) });
            const result = await response.json().catch(() => ({ success: false, error: 'Invalid JSON response' }));
            if (!response.ok || !result.success) {
                const errorMsg = result?.error || `HTTP ${response.status}`; console.error('Failed to update summary in DB:', errorMsg);
                setSummaryError(prev => prev ? `${prev}\nSave Error.` : `Failed to save updated summary.`);
            } else {
                console.log(`Successfully updated summary in DB for interaction ID: ${interactionId}`);
                setSummaryError(prev => prev?.replace(/Failed to save updated summary.?(\n|$)/, '') || null);
            }
        } catch (error) {
            console.error('Network error calling update-summary API:', error);
            const errorMsg = error instanceof Error ? error.message : 'Network error';
            setSummaryError(prev => prev ? `${prev}\nNetwork Save Error.` : `Network error saving summary.`);
        }
    }, [user]);

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
            const buildLogHistory = (state: AiSlotState): ConversationMessage[] | null => {
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
                const inputTokensKey = `slot_${slotNum}_input_tokens`;
                const outputTokensKey = `slot_${slotNum}_output_tokens`;

                if (slotState.modelName) {
                    dataToLog[modelKey] = slotState.modelName;
                    if (slotState.response || slotState.error) {
                         dataToLog[convKey] = buildLogHistory(slotState);
                    } else {
                         dataToLog[convKey] = null;
                    }
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
                        const inputTokensKey = `slot_${slotNum}_input_tokens` as keyof InteractionHistoryItem;
                        const outputTokensKey = `slot_${slotNum}_output_tokens` as keyof InteractionHistoryItem;

                        const loggedHistory = (newLogEntry[convKey] as ConversationMessage[] | null) || [];
                        if (currentState.modelName === newLogEntry[modelKey]) {
                            return {
                                ...currentState,
                                conversationHistory: loggedHistory,
                                error: currentState.error,
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

    useEffect(() => {
        const anySlotLoading = slotStates.some(slot => slot.loading);
        const anySummaryLoading = summaryLoading;
        const slotsJustFinished = slotStates.some(s => s.responseReceivedThisTurn && !s.loading);

        console.log('[SummaryEffect] Triggered. anySlotLoading:', anySlotLoading, 'anySummaryLoading:', anySummaryLoading, 'isProcessingSummaryAndLog.current:', isProcessingSummaryAndLog.current);
        if (!summaryModelState || anySlotLoading || anySummaryLoading || isProcessingSummaryAndLog.current) {
            console.log('[SummaryEffect] Exiting early due to loading/processing state or no summary model.');
            return;
        }

        const activeSlots = slotStates.filter(s => s.modelName);
        const allActiveSlotsRespondedThisTurn = activeSlots.length > 0 && activeSlots.every(s => s.responseReceivedThisTurn);

        const isInitialTurn = !selectedHistoryId && needsSummaryAndLog;
        const isFollowUpTurn = !!selectedHistoryId && !!lastSubmittedPrompt && slotsJustFinished;

        console.log('[SummaryEffect] States: isInitialTurn:', isInitialTurn, 'isFollowUpTurn:', isFollowUpTurn, 'allActiveSlotsRespondedThisTurn:', allActiveSlotsRespondedThisTurn, 'slotsJustFinished:', slotsJustFinished, 'needsSummaryAndLog:', needsSummaryAndLog, 'lastSubmittedPrompt:', lastSubmittedPrompt);

        if ((isInitialTurn && allActiveSlotsRespondedThisTurn) || (isFollowUpTurn && slotsJustFinished)) {
            console.log(`[SummaryEffect] Conditions met for ${isInitialTurn ? 'initial' : 'follow-up'} turn. Proceeding with summary/log/update...`);
            isProcessingSummaryAndLog.current = true;

            const processTurnCompletion = async () => {
                try {
                    const currentPromptForSummary = isInitialTurn ? currentChatPrompt : lastSubmittedPrompt;
                    if (!currentPromptForSummary) { console.warn("[SummaryEffect] Cannot process summary: Current prompt is missing."); return; }

                    const newSummary = await callApiForSummary(currentPromptForSummary, slotStates, selectedHistoryId, summaryText);

                    if (isInitialTurn) {
                        await logInitialInteraction(currentPromptForSummary, slotStates, newSummary);
                    } else if (isFollowUpTurn && typeof newSummary === 'string') {
                        await updateSummaryInDb(selectedHistoryId!, newSummary);
                    } else if (isFollowUpTurn && newSummary === null) {
                        console.log("[SummaryEffect] Summary update skipped or failed for follow-up turn.");
                    }
                } catch (error) {
                    console.error("[SummaryEffect] Error during processTurnCompletion execution:", error);
                    if (isInitialTurn) setNeedsSummaryAndLog(false);
                } finally {
                    isProcessingSummaryAndLog.current = false;
                    setSlotStates(prev => prev.map(s => ({ ...s, responseReceivedThisTurn: false })));
                }
            };
            processTurnCompletion();
        }
    }, [slotStates, needsSummaryAndLog, selectedHistoryId, currentChatPrompt, lastSubmittedPrompt, summaryText, summaryModelState, summaryLoading, callApiForSummary, logInitialInteraction, updateSummaryInDb]);

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
            const inputTokensKey = `slot_${slotNum}_input_tokens` as keyof InteractionHistoryItem;
            const outputTokensKey = `slot_${slotNum}_output_tokens` as keyof InteractionHistoryItem;

            const modelName = item[modelKey] as string | null;
            const rawHistory: any[] | null = item[conversationKey] as any[] | null;
            let conversationHistory: ConversationMessage[] = [];
            if (Array.isArray(rawHistory)) {
                conversationHistory = rawHistory.filter(msg => msg && (msg.role === 'user' || msg.role === 'model') && typeof msg.content === 'string').map(msg => ({ role: msg.role as 'user' | 'model', content: msg.content }));
            } else if (rawHistory) {
                console.warn(`[Slot ${slotNum}] History data is not an array:`, rawHistory);
            }
            
            const isActive = !!modelName || conversationHistory.length > 0;
            const isValidModel = typeof modelName === 'string' && modelName.includes(': ');
            if(modelName && !isValidModel) { console.warn(`Invalid model format in history ${item.id} slot ${slotNum}: "${modelName}".`); }

            loadedSlotStates.push({
                 ...initialSlotState,
                 modelName: isValidModel ? modelName : null,
                 response: conversationHistory.findLast(m => m.role === 'model')?.content || null,
                 error: null, 
                 conversationHistory: conversationHistory,
                 isActiveInHistory: isActive, 
                 responseReceivedThisTurn: conversationHistory.some(m => m.role === 'model'), 
                 followUpInput: '',
                 inputTokensThisTurn: (item[inputTokensKey] as number | null) ?? null,
                 outputTokensThisTurn: (item[outputTokensKey] as number | null) ?? null,
             });
        }
        setSlotStates(loadedSlotStates);
        setSummaryText(loadedSummaryText);
        
        const currentSummaryModelPref = await fetchCurrentSummaryModelPreference();
        setSummaryModelState(currentSummaryModelPref);
        console.log(`Set summary model state to: ${currentSummaryModelPref || 'None'} for loaded history item ID: ${item.id}.`);

        console.log(`Prepared ${loadedSlotStates.filter(s=>s.isActiveInHistory).length} active states from history ${item.id}. Summary loaded: ${!!loadedSummaryText}`);
        setSettingsLoading(false); 
        setTimeout(() => { setShowPanels(true); setUiLocked(false); console.log(`State updated, UI unlocked for history ${item.id}.`); mainInputRef.current?.focus(); }, 50);
    }, [user, uiLocked, selectedHistoryId, initialSlotState, fetchCurrentSummaryModelPreference]);

    const handleNewChat = useCallback(() => {
        if (!user || uiLocked) return;
        console.log("Starting New Chat");
        setUiLocked(true); setSelectedHistoryId(null); setCurrentChatPrompt(null); setLastSubmittedPrompt(null);
        setMainInputText(''); setShowPanels(false); setNeedsSummaryAndLog(false); 
        isProcessingSummaryAndLog.current = false; setSlotStates([]); setHistoryError(null);
        setSettingsError(null); setSummaryText(null); setSummaryLoading(false); setSummaryError(null);
        fetchSettingsForNewChat().finally(() => { setUiLocked(false); console.log("New Chat setup complete, UI unlocked."); mainInputRef.current?.focus(); });
    }, [user, uiLocked, fetchSettingsForNewChat]);

    const handleUpdateTitle = useCallback(async (id: string, newTitle: string): Promise<boolean> => {
        if (!user) return false;
        try {
            const response = await fetch('/api/update-history-title', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title: newTitle }) });
            const result = await response.json();
            if (!response.ok || !result.success) { throw new Error(result.error || 'Failed to update title'); }
            setHistory(prev => prev.map(item => item.id === id ? { ...item, title: newTitle } : item));
            setHistoryError(null); return true;
        } catch (error: any) { console.error("Error updating title:", error); setHistoryError(`Update failed: ${error.message}`); return false; }
    }, [user]);

    const handleDeleteItem = useCallback(async (id: string): Promise<boolean> => {
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

    const callApiForSlot = useCallback(async (
        slotIndex: number,
        modelNameToUse: string,
        currentConversation: ConversationMessage[],
        interactionIdForLog: string | null,
        isStreamingEnabled: boolean
    ) => {
        console.log(`[DEBUG callApiForSlot - Slot ${slotIndex + 1}] Entry. isStreamingEnabled: ${isStreamingEnabled}, Model: ${modelNameToUse}`);
        const slotNumber = slotIndex + 1;
        const updateSlotState = (updateFn: (prevState: AiSlotState) => AiSlotState) => {
            setSlotStates(prevStates => prevStates.map((state, index) => index === slotIndex ? updateFn(state) : state ));
        };

        if (!modelNameToUse) {
            console.warn(`[Slot ${slotNumber}] callApiForSlot skipped: Missing model identifier.`);
            updateSlotState(prev => ({ ...prev, loading: false, error: "Missing model identifier.", responseReceivedThisTurn: true, inputTokensThisTurn: 0, outputTokensThisTurn: 0 }));
            return;
        }
        const lastUserMessage = currentConversation.findLast(m => m.role === 'user');
        if (!lastUserMessage || !lastUserMessage.content) {
            console.warn(`[Slot ${slotNumber}] callApiForSlot skipped: No user prompt in current conversation.`);
            updateSlotState(prev => ({ ...prev, loading: false, error: "No user prompt to send.", responseReceivedThisTurn: true }));
            return;
        }

        console.log(`[Slot ${slotNumber}] History BEFORE this turn being sent (Streaming: ${isStreamingEnabled}):`, JSON.parse(JSON.stringify(currentConversation)));
        updateSlotState(prev => ({
            ...prev, loading: true, response: null, error: null,
            conversationHistory: currentConversation, // Keep full history here for UI state
            responseReceivedThisTurn: false,
            inputTokensThisTurn: null,
            outputTokensThisTurn: null,
        }));
        console.log(`[Slot ${slotNumber}] (${modelNameToUse}): Sending prompt '${lastUserMessage.content.substring(0,30)}...'`);

        let modelResponseText: string | null = null;
        let newModelMessage: ConversationMessage | null = null;
        let inputTokens = 0;
        let outputTokens = 0;

        try {
            const parts = modelNameToUse.split(': '); if (parts.length !== 2) throw new Error(`Invalid model format: ${modelNameToUse}`);
            const provider = parts[0]; const specificModel = parts[1]; let apiUrl = '';
            if (provider === 'ChatGPT') apiUrl = '/api/call-openai';
            else if (provider === 'Gemini') apiUrl = '/api/call-gemini';
            else if (provider === 'Anthropic') apiUrl = '/api/call-anthropic';
            else throw new Error(`Unsupported provider: ${provider}`);

            const lastUserMessageContent = currentConversation.findLast(m => m.role === 'user')?.content;
            if (!lastUserMessageContent) {
                updateSlotState(prev => ({ ...prev, loading: false, error: "No user prompt content to send.", responseReceivedThisTurn: true }));
                return;
            }

            if (isStreamingEnabled) {
                console.log(`[DEBUG callApiForSlot - Slot ${slotNumber}] Path: STREAMING. EventSource URL: ${apiUrl} with params...`);
                
                // Add a placeholder for the model's response to the conversation history for incremental updates
                const initialModelMessagePlaceholder: ConversationMessage = { role: 'model', content: '' };

                updateSlotState(prev => ({
                    ...prev,
                    loading: true,
                    response: '', // Clear previous full response text
                    error: null,
                    // prev.conversationHistory already contains the latest user message from the caller
                    // Append the model's placeholder message to it
                    conversationHistory: [...prev.conversationHistory, initialModelMessagePlaceholder],
                    responseReceivedThisTurn: false,
                    inputTokensThisTurn: null,
                    outputTokensThisTurn: null,
                }));
                
                const paramsForEventSource: Record<string, string> = {
                    prompt: lastUserMessageContent, 
                    model: specificModel,
                    slotNumber: String(slotNumber),
                    stream: String(true),
                    conversationHistory: JSON.stringify(currentConversation) 
                };
                if (interactionIdForLog !== null && interactionIdForLog !== undefined) {
                    paramsForEventSource.interactionId = interactionIdForLog;
                }

                const eventSource = new EventSource(`${apiUrl}?${new URLSearchParams(paramsForEventSource)}`);
                let currentResponseText = "";
                let accumulatedInputTokens = 0;
                let accumulatedOutputTokens = 0;
                let backendErrorReceived = false;

                eventSource.onmessage = (event: MessageEvent) => { 
                    console.log(`[DEBUG EventSource - Slot ${slotNumber}] onmessage. Data:`, event.data);
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === 'chunk' && typeof data.token === 'string') {
                            currentResponseText += data.token; // Accumulate the full response
                            updateSlotState(prev => {
                                const newConversationHistory = prev.conversationHistory.map((msg, index) => {
                                    // Update the content of the last message if it's our model placeholder
                                    if (index === prev.conversationHistory.length - 1 && msg.role === 'model') {
                                        return { ...msg, content: currentResponseText };
                                    }
                                    return msg;
                                });
                                return {
                                    ...prev,
                                    conversationHistory: newConversationHistory, // This updates the UI incrementally
                                    response: currentResponseText, // Keep slotState.response up-to-date as well
                                    loading: true 
                                };
                            });
                        } else if (data.type === 'tokens' && typeof data.inputTokens === 'number' && typeof data.outputTokens === 'number') {
                            accumulatedInputTokens = data.inputTokens;
                            accumulatedOutputTokens = data.outputTokens;
                            console.log(`[Slot ${slotNumber}] Streamed tokens received: In: ${data.inputTokens}, Out: ${data.outputTokens}`);
                        } else if (data.type === 'error') {
                            backendErrorReceived = true;
                            console.error(`[Slot ${slotNumber}] Streaming error from backend event:`, data.error);
                            updateSlotState(prev => ({ 
                                ...prev, 
                                error: prev.error ? `${prev.error}\nStream Error: ${data.error || 'Unknown error from stream'}` : `Stream Error: ${data.error || 'Unknown error from stream'}`, 
                                loading: false, 
                                responseReceivedThisTurn: true 
                            }));
                            eventSource.close(); 
                        }
                    } catch (e) {
                        backendErrorReceived = true; // Assume parsing error is critical for this message
                        console.error(`[Slot ${slotNumber}] Error parsing streaming event data:`, event.data, e);
                        updateSlotState(prev => ({
                           ...prev,
                           error: prev.error ? `${prev.error}\nStream Error: Invalid event data received.` : 'Stream Error: Invalid event data received.',
                           loading: false,
                           responseReceivedThisTurn: true
                        }));
                        eventSource.close(); // Close if we can't parse a message, might be safest
                    }
                };

                eventSource.onerror = (errorEvent: Event) => { 
                    console.log(`[DEBUG EventSource - Slot ${slotNumber}] onerror. Event:`, errorEvent);
                    eventSource.close(); 
                    if (!backendErrorReceived) { // Only set generic error if a specific one wasn't received via onmessage
                        updateSlotState(prev => ({
                            ...prev, 
                            response: currentResponseText || null, 
                            error: prev.error || 'Connection error during streaming. Partial response shown if any.', 
                            loading: false, 
                            responseReceivedThisTurn: true,
                            inputTokensThisTurn: accumulatedInputTokens || null,
                            outputTokensThisTurn: accumulatedOutputTokens || null,
                        }));
                    }
                };

                eventSource.addEventListener('end', (event: Event) => {
                    console.log(`[DEBUG EventSource - Slot ${slotNumber}] "end" event. Event:`, event);
                    eventSource.close();
                    if (backendErrorReceived) return; 

                    // newModelMessage is no longer constructed here, history is already live
                    inputTokens = accumulatedInputTokens;
                    outputTokens = accumulatedOutputTokens;

                    updateSlotState(prev => {
                        // Ensure the final accumulated text is definitely in the history's last model message
                        const finalConversationHistory = prev.conversationHistory.map((msg, index) => {
                            if (index === prev.conversationHistory.length - 1 && msg.role === 'model') {
                                return { ...msg, content: currentResponseText };
                            }
                            return msg;
                        });
                        return {
                            ...prev, 
                            response: currentResponseText, // Final full response
                            error: null, 
                            loading: false, // Loading is now false
                            conversationHistory: finalConversationHistory, 
                            responseReceivedThisTurn: true,
                            inputTokensThisTurn: inputTokens, 
                            outputTokensThisTurn: outputTokens,
                        };
                    });
                    console.log(`[Slot ${slotNumber}] (${modelNameToUse}) streaming finished. Input: ${inputTokens}, Output: ${outputTokens}`);
                });

                // Simplified Promise for waiting; relies on error/end events to resolve/reject.
                await new Promise<void>((resolve, reject) => {
                    let ended = false;
                    eventSource.addEventListener('end', () => {
                        if (!ended) { ended = true; resolve(); }
                    });
                    eventSource.onerror = () => {
                        if (!ended) { 
                            ended = true; 
                            // Error state already set by onerror handler, just reject to stop the await
                            reject(new Error('Critical streaming connection failure reported by onerror')); 
                        }
                    }; 
                }).catch(e => {
                    // This catch is for the promise itself, primarily if onerror rejects.
                    // The UI state should already be handled by the eventSource.onerror callback.
                    console.warn(`[Slot ${slotNumber}] Promise rejected after EventSource error/end:`, e.message);
                });

            } else {
                // NON-STREAMING LOGIC
                const requestBody = { // Define requestBody here, within the non-streaming block
                    prompt: lastUserMessageContent,
                    model: specificModel,
                    slotNumber,
                    conversationHistory: currentConversation, 
                    interactionId: interactionIdForLog,
                    stream: false 
                };
                const apiResponse = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody) 
                });
                const result = await apiResponse.json().catch(() => ({ error: "Invalid JSON response from AI API" }));

                if (!apiResponse.ok) {
                    throw new Error(result.error || `AI API call failed (${apiResponse.status} ${apiResponse.statusText})`);
                }
                modelResponseText = result.response;
                inputTokens = result.inputTokens ?? 0;
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
                        inputTokensThisTurn: inputTokens,
                        outputTokensThisTurn: outputTokens,
                    };
                });
                console.log(`[Slot ${slotNumber}] (${modelNameToUse}) received response. Input: ${inputTokens}, Output: ${outputTokens}`);
            }

            // Common logic for appending to DB (after stream or regular call)
            if (interactionIdForLog && lastUserMessage && newModelMessage) {
                console.log(`[Slot ${slotNumber}] Attempting to APPEND turn to DB (ID: ${interactionIdForLog}).`);
                fetch('/api/append-conversation', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ interactionId: interactionIdForLog, slotNumber: slotNumber, newUserMessage: lastUserMessage, newModelMessage: newModelMessage })
                }).then(async appendResponse => {
                    if (!appendResponse.ok) {
                        const appendErrorData = await appendResponse.json().catch(() => ({ error: `HTTP ${appendResponse.status}` }));
                        const errorMsg = appendErrorData.error || `HTTP ${appendResponse.status}`;
                        console.error(`[Slot ${slotNumber}] Error appending conversation (ID: ${interactionIdForLog}):`, errorMsg);
                        updateSlotState(prev => ({ ...prev, error: prev.error ? `${prev.error}\nSave Error.` : `Failed to save this turn (${errorMsg}).` }));
                    } else {
                        console.log(`[Slot ${slotNumber}] Successfully appended conversation to ID ${interactionIdForLog}`);
                        updateSlotState(prev => ({ ...prev, error: prev.error?.replace(/Failed to save this turn(?:\s*\(.*?\))?\.?(\n|$)/, '') || null }));
                    }
                }).catch(appendErr => {
                    console.error(`[Slot ${slotNumber}] Network error calling append-conversation API:`, appendErr);
                    const errorMsg = appendErr instanceof Error ? appendErr.message : 'Network error';
                    updateSlotState(prev => ({ ...prev, error: prev.error ? `${prev.error}\nNetwork Save Error.` : `Network error saving turn (${errorMsg}).` }));
                });
            } else if (interactionIdForLog && (!lastUserMessage || !newModelMessage)) {
                 console.error(`[Slot ${slotNumber}] Cannot append turn: Missing messages for DB log.`);
                 updateSlotState(prev => ({ ...prev, error: prev.error ? `${prev.error}\nSave Error.` : `Internal error saving messages for turn.` }));
            }
        } catch (error: any) {
            console.error(`Error in callApiForSlot (Slot ${slotNumber}, Model: ${modelNameToUse}):`, error);
            console.log(`[Slot ${slotNumber}] Final history on ERROR:`, JSON.parse(JSON.stringify(currentConversation))); 
            updateSlotState(prev => ({
                ...prev, response: null, error: error.message || 'Unknown AI error', loading: false,
                conversationHistory: currentConversation,
                responseReceivedThisTurn: true,
                inputTokensThisTurn: 0,
                outputTokensThisTurn: 0,
            }));
        }
    }, [userStreamingPreference]); 

    const handleProcessText = useCallback(async () => {
        const currentInput = mainInputText.trim();
        const currentStateSnapshot = [...slotStates];
        const activeSlotsForCall = currentStateSnapshot.filter(s => s.modelName);
        const streamingIsEnabledForThisCall = userStreamingPreference; 
        console.log(`[DEBUG handleProcessText] Entry. userStreamingPreference: ${streamingIsEnabledForThisCall}. Prompt: "${currentInput.substring(0,30)}..."`);

        if (currentInput === '' || !user || isAuthLoading || settingsLoading || activeSlotsForCall.length === 0 || uiLocked) return;
        const isAnySlotProcessing = currentStateSnapshot.some(s => s.loading);
        const isSummaryProcessing = summaryLoading;
        if (isAnySlotProcessing || isSummaryProcessing) return;

        const isFirstPromptOfChat = !selectedHistoryId;
        const promptToSend = currentInput;
        console.log(`Processing ${isFirstPromptOfChat ? 'initial' : 'follow-up'} prompt: "${promptToSend}"`);
        
        setUiLocked(true);

        if (isFirstPromptOfChat) {
            setCurrentChatPrompt(promptToSend); setNeedsSummaryAndLog(true); 
            isProcessingSummaryAndLog.current = false; setSummaryText(null); 
            setSummaryError(null); setSummaryLoading(false);
        } else { setNeedsSummaryAndLog(false); }
        setLastSubmittedPrompt(promptToSend); 
        if (mainInputRef.current) mainInputRef.current.blur();
        setMainInputText('');

        const currentInteractionIdForLog = selectedHistoryId;

        const newUserMessage: ConversationMessage = { role: 'user', content: promptToSend };

        setSlotStates(prevSlotStates => {
            return prevSlotStates.map((s) => {
                if (s.modelName && activeSlotsForCall.some(active => active.modelName === s.modelName)) {
                    const historyForThisSlot = isFirstPromptOfChat ? [newUserMessage] : [...s.conversationHistory, newUserMessage];
                    return {
                        ...s, loading: true, response: null, error: null, responseReceivedThisTurn: false,
                        conversationHistory: historyForThisSlot, 
                        isActiveInHistory: isFirstPromptOfChat ? true : s.isActiveInHistory,
                        inputTokensThisTurn: null, outputTokensThisTurn: null,
                    };
                }
                if (isFirstPromptOfChat && !s.modelName) return {...initialSlotState, isActiveInHistory: false };
                if (isFirstPromptOfChat && s.modelName) return { ...initialSlotState, modelName: s.modelName, isActiveInHistory: false};
                return s;
            });
        });
        setShowPanels(true);
        
        const promises = activeSlotsForCall.map((slotStateFromSnapshot) => {
            const originalIndex = currentStateSnapshot.findIndex(s => s === slotStateFromSnapshot);
            if (originalIndex !== -1 && slotStateFromSnapshot.modelName) {
                const historyForApi: ConversationMessage[] = isFirstPromptOfChat 
                    ? [newUserMessage] 
                    : [...(currentStateSnapshot[originalIndex].conversationHistory || []), newUserMessage];
                
                console.log(`[Slot ${originalIndex + 1}] Calling API via handleProcessText. Model: ${slotStateFromSnapshot.modelName}. Streaming: ${streamingIsEnabledForThisCall}. History length: ${historyForApi.length}`);
                return callApiForSlot(
                    originalIndex, 
                    slotStateFromSnapshot.modelName,
                    historyForApi,
                    currentInteractionIdForLog,
                    streamingIsEnabledForThisCall // Pass streaming preference
                );
            }
            console.error("Error finding slot index/model in handleProcessText loop for API call prep.");
            return Promise.resolve();
        });

        Promise.allSettled(promises).then(() => {
            console.log("All main API call initiations complete via handleProcessText.");
            setUiLocked(false);
        });
    }, [mainInputText, user, isAuthLoading, settingsLoading, selectedHistoryId, slotStates, callApiForSlot, uiLocked, summaryLoading, summaryModelState, initialSlotState, userStreamingPreference]);

    const handleReplyToSlot = useCallback((slotIndex: number) => {
        const currentStateSnapshot = [...slotStates]; 
        const targetState = currentStateSnapshot[slotIndex];
        const streamingIsEnabledForThisCall = userStreamingPreference; 
        console.log(`[DEBUG handleReplyToSlot - Slot ${slotIndex + 1}] Entry. userStreamingPreference: ${streamingIsEnabledForThisCall}. Input: "${targetState?.followUpInput?.substring(0,30)}..."`);

        if (!targetState) { console.error(`handleReplyToSlot: Invalid slotIndex ${slotIndex}`); return; }

        const followUpPromptText = targetState.followUpInput.trim(); 
        const modelName = targetState.modelName;

        if (!followUpPromptText || !modelName || !user || !selectedHistoryId || targetState.loading || uiLocked || summaryLoading) return;

        console.log(`Sending follow-up to Slot ${slotIndex + 1} (${modelName}), Streaming: ${streamingIsEnabledForThisCall}: "${followUpPromptText}"`);
        setUiLocked(true);
        setLastSubmittedPrompt(followUpPromptText); 
        setNeedsSummaryAndLog(false);

        const newUserMessageForReply: ConversationMessage = { role: 'user', content: followUpPromptText };
        
        setSlotStates(prevStates => prevStates.map((state, index) => 
            index === slotIndex 
            ? { 
                ...state, 
                followUpInput: '', 
                loading: true, 
                response: null, 
                error: null, 
                responseReceivedThisTurn: false,
                conversationHistory: [...state.conversationHistory, newUserMessageForReply],
                inputTokensThisTurn: null, 
                outputTokensThisTurn: null,
              } 
            : state 
        ));
        
        const historyForApiReply = [...targetState.conversationHistory, newUserMessageForReply];

        console.log(`[Slot ${slotIndex + 1}] Calling API from Reply. Streaming: ${streamingIsEnabledForThisCall}. History length: ${historyForApiReply.length}`);
        callApiForSlot(
            slotIndex, 
            modelName, 
            historyForApiReply,
            selectedHistoryId,
            streamingIsEnabledForThisCall // Pass streaming preference
        ).finally(() => {
            setUiLocked(false);
        });

    }, [user, slotStates, callApiForSlot, selectedHistoryId, uiLocked, summaryLoading, userStreamingPreference]);

    const isProcessingAnySlot = slotStates.some(slot => slot.loading);
    const isProcessingSummary = summaryLoading;
    const isProcessingAnything = isProcessingAnySlot || isProcessingSummary || isProcessingSummaryAndLog.current || uiLocked;
    const canInteractGenerally = !!user && !isAuthLoading && !settingsLoading;
    const hasAnyComparisonModelsConfigured = slotStates.some(s => s.modelName);
    const canUseMainInput = canInteractGenerally && !isProcessingAnything && (!!selectedHistoryId || hasAnyComparisonModelsConfigured);
    
    const comparisonSlotsToDisplay = slotStates.filter(slotState => 
        (selectedHistoryId && slotState.isActiveInHistory) ||
        (!selectedHistoryId && !!slotState.modelName && showPanels)
    );
    const numberOfComparisonSlotsToDisplay = comparisonSlotsToDisplay.length;
    
    const shouldDisplaySummaryPanel = showPanels && (
        (!!summaryText || summaryLoading || !!summaryError) || 
        (!!summaryModelState && currentChatPrompt && numberOfComparisonSlotsToDisplay > 0)
    );

    const totalPanelsToDisplay = numberOfComparisonSlotsToDisplay + (shouldDisplaySummaryPanel ? 1 : 0);
    
    const shouldRenderPanelsArea = user && !settingsLoading && showPanels && (comparisonSlotsToDisplay.length > 0 || shouldDisplaySummaryPanel);

    const getModelDisplayName = (modelString: string | null): string => { if (!modelString) return "Slot Empty"; return modelString; };
    const getRevisedGridContainerClass = (comparisonSlotCount: number, includeSummary: boolean): string => {
        let classes = 'w-full max-w-7xl grid gap-4 self-center flex-grow px-1 pb-4 overflow-y-auto custom-scrollbar ';
        if (comparisonSlotCount >= 1 && comparisonSlotCount <= 3) {
            classes += includeSummary ? 'lg:grid-cols-4 md:grid-cols-2 grid-cols-1' : `md:grid-cols-${comparisonSlotCount} grid-cols-1`;
        } else if (comparisonSlotCount === 4) {
            classes += includeSummary ? 'md:grid-cols-3 grid-cols-1' : 'md:grid-cols-2 grid-cols-1';
        } else if (comparisonSlotCount === 5) {
            classes += 'md:grid-cols-3 grid-cols-1'; 
        } else if (comparisonSlotCount === 6) {
            classes += includeSummary ? 'md:grid-cols-4 grid-cols-1' : 'md:grid-cols-3 grid-cols-1';
        } else {
            classes += 'grid-cols-1 md:grid-cols-3'; 
        }
        return classes;
    };

    const handleOpenSettingsModal = () => setIsSettingsModalOpen(true);
    const handleCloseSettingsModal = () => {
        setIsSettingsModalOpen(false);
        handleSettingsPossiblyChanged();
    };

    return (
        <div className="flex h-full bg-gray-100 dark:bg-gray-900 text-slate-900 dark:text-slate-100">
            <HistorySidebar
                history={history}
                historyLoading={historyLoading}
                historyError={historyError}
                selectedHistoryId={selectedHistoryId}
                handleHistoryClick={handleHistoryClick}
                fetchHistory={() => fetchHistory("Manual Refresh")}
                onUpdateTitle={handleUpdateTitle}
                onDeleteItem={handleDeleteItem}
                isLoggedIn={!!user}
                handleNewChat={handleNewChat}
                onOpenSettings={handleOpenSettingsModal}
            />
            <main className="flex-1 flex flex-col overflow-hidden h-full bg-white dark:bg-slate-900">
                {(settingsLoading && !selectedHistoryId) && (
                     <div className="p-2 text-center text-sm text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700/50 flex-shrink-0">
                        Loading model configurations...
                     </div>
                )}
                {(settingsError && !selectedHistoryId) && (
                    <div className="p-2 text-center text-sm text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 border-b border-red-200 dark:border-red-700/50 flex-shrink-0">
                        Initial Model Settings Error: {settingsError}
                    </div>
                )}
                <div className={`flex-grow overflow-y-auto custom-scrollbar ${shouldRenderPanelsArea ? getRevisedGridContainerClass(numberOfComparisonSlotsToDisplay, Boolean(shouldDisplaySummaryPanel)) : 'flex flex-col items-center justify-center'} p-4`}>
                    {shouldRenderPanelsArea ? (
                        <>
                            {comparisonSlotsToDisplay.map((slotState, displayIndex) => {
                                const originalIndex = slotStates.findIndex(s => s === slotState);
                                if (originalIndex === -1) { console.error("Render Error: Could not find original index for slot.", slotState); return null; }
                                const colors = PANEL_COLORS[originalIndex % PANEL_COLORS.length];
                                const isSlotProcessing = slotState.loading;
                                const hasModel = !!slotState.modelName;
                                
                                let panelLayoutClass = 'col-span-1 row-span-1'; // Default
                                const numAi = numberOfComparisonSlotsToDisplay;
                                const hasSummary = Boolean(shouldDisplaySummaryPanel);

                                if (numAi === 4 && hasSummary) {
                                    // 2x2 AI, summary is 3rd col, row-span-2
                                    // This loop is for AI slots. Summary handled separately.
                                    // AI slots are 1,1; 1,2; 2,1; 2,2
                                    if (displayIndex === 0) panelLayoutClass = 'col-span-1 row-span-1 md:col-start-1 md:row-start-1';
                                    else if (displayIndex === 1) panelLayoutClass = 'col-span-1 row-span-1 md:col-start-2 md:row-start-1';
                                    else if (displayIndex === 2) panelLayoutClass = 'col-span-1 row-span-1 md:col-start-1 md:row-start-2';
                                    else if (displayIndex === 3) panelLayoutClass = 'col-span-1 row-span-1 md:col-start-2 md:row-start-2';
                                } else if (numAi === 5 && hasSummary) {
                                    // 3x2 grid, summary is bottom right (col 3, row 2)
                                    // AI: (0,1,2 top row), (3,4 bottom-left, bottom-mid)
                                    if (displayIndex <= 2) panelLayoutClass = `col-span-1 row-span-1 md:col-start-${displayIndex + 1} md:row-start-1`;
                                    else if (displayIndex === 3) panelLayoutClass = 'col-span-1 row-span-1 md:col-start-1 md:row-start-2';
                                    else if (displayIndex === 4) panelLayoutClass = 'col-span-1 row-span-1 md:col-start-2 md:row-start-2';
                                } else if (numAi === 6 && hasSummary) {
                                    // 3x2 AI, summary is 4th col, row-span-2
                                    // AI slots 0,1,2 top row cols 1,2,3
                                    // AI slots 3,4,5 bottom row cols 1,2,3
                                    if (displayIndex <= 2) panelLayoutClass = `col-span-1 row-span-1 md:col-start-${displayIndex + 1} md:row-start-1`;
                                    else if (displayIndex >=3 && displayIndex <=5) panelLayoutClass = `col-span-1 row-span-1 md:col-start-${displayIndex - 2} md:row-start-2`;
                                }
                                // For 1-3 AI slots, or cases without summary, or 4/6 AI without summary, they just flow.
                                // Handled by getRevisedGridContainerClass's grid-cols settings.
                                // No specific item classes needed beyond col-span-1 row-span-1 default.

                                const panelHeightClass = totalPanelsToDisplay >= 4 ? 'min-h-[370px]' : 'min-h-[270px]';
                                
                                const canEnableFollowUpInput = canInteractGenerally && !isProcessingAnything && !!selectedHistoryId && hasModel;
                                const canEnableFollowUpButton = canEnableFollowUpInput && slotState.followUpInput.trim() !== '';

                                return (
                                    <div key={`panel-${originalIndex}-${selectedHistoryId || 'new'}`} 
                                         className={`border dark:border-slate-700/80 rounded-xl bg-white dark:bg-slate-800 shadow-lg flex flex-col ${colors.border} overflow-hidden ${panelHeightClass} ${panelLayoutClass} transition-all duration-300`}
                                         role="article" aria-labelledby={`panel-heading-${originalIndex}`}>
                                        <h2 id={`panel-heading-${originalIndex}`} 
                                            className={`text-base font-semibold p-3.5 ${colors.text} flex-shrink-0 truncate border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800`}
                                            title={slotState.modelName || `Slot ${originalIndex + 1} (Empty)`}>
                                            {getModelDisplayName(slotState.modelName)} (Slot {originalIndex + 1})
                                        </h2>
                                        <div className="flex-grow overflow-y-auto text-sm p-3.5 space-y-3 custom-scrollbar-thin" role="log">
                                            {!hasModel && slotState.conversationHistory.length === 0 && !slotState.isActiveInHistory && <p className="text-slate-400 dark:text-slate-500 italic text-center py-4">Slot empty.</p>}
                                            {Array.isArray(slotState.conversationHistory) && slotState.conversationHistory.map((msg, msgIndex) => (
                                                <div key={`msg-${originalIndex}-${msgIndex}`} 
                                                     className={`max-w-none py-2 px-3 rounded-lg shadow-sm ` + 
                                                                (msg.role === 'user' 
                                                                    ? 'bg-sky-50 dark:bg-sky-700/20 ml-auto text-slate-800 dark:text-slate-100 max-w-[90%]' 
                                                                    : `${colors.bg} dark:bg-opacity-30 mr-auto text-slate-800 dark:text-slate-100 max-w-[90%]`)}
                                                     aria-label={`${msg.role} message ${msgIndex + 1}`}>
                                                    <div className="prose prose-sm dark:prose-invert max-w-none">
                                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content || ''}</ReactMarkdown>
                                                    </div>
                                                </div>
                                            ))}
                                            {isSlotProcessing && (
                                                <div className="flex items-center justify-center p-3 mt-2">
                                                    <svg className="animate-spin h-4 w-4 text-slate-500 dark:text-slate-400 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg>
                                                    <p className="text-slate-500 dark:text-slate-400 text-xs">Loading response...</p>
                                                </div>
                                            )}
                                            {slotState.error && <p className="text-red-600 dark:text-red-400 mt-2 p-2.5 text-xs whitespace-pre-wrap bg-red-50 dark:bg-red-900/30 rounded-md" role="alert">Error: {slotState.error}</p>}
                                            {(slotState.inputTokensThisTurn !== null || slotState.outputTokensThisTurn !== null) && !isSlotProcessing && (
                                                <div className="mt-2.5 pt-2.5 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                                                    Tokens (last turn): In: {slotState.inputTokensThisTurn?.toLocaleString() ?? 'N/A'} | Out: {slotState.outputTokensThisTurn?.toLocaleString() ?? 'N/A'}
                                                </div>
                                            )}
                                            {!hasModel && slotState.isActiveInHistory && Array.isArray(slotState.conversationHistory) && slotState.conversationHistory.length > 0 && <p className="text-slate-400 dark:text-slate-500 italic text-center py-3 text-xs">Model was removed or changed.</p>}
                                        </div>
                                        {hasModel && selectedHistoryId && (
                                            <div className={`mt-auto p-3 border-t border-slate-200 dark:border-slate-700 flex items-end space-x-2 flex-shrink-0 bg-slate-50 dark:bg-slate-800`}>
                                                <textarea rows={1} value={slotState.followUpInput} onChange={(e) => setSlotStates(prev => prev.map((s, i) => i === originalIndex ? { ...s, followUpInput: e.target.value } : s))} 
                                                          placeholder="Reply..."
                                                          className={`flex-grow p-2.5 border border-slate-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-300 focus:ring-1 ${colors.focusRing} focus:outline-none disabled:bg-slate-200 dark:disabled:bg-slate-600/50 disabled:cursor-not-allowed resize-none overflow-y-auto min-h-[46px] max-h-[120px] shadow-sm`} 
                                                          style={{ height: 'auto' }} 
                                                          onInput={(e) => { const target = e.target as HTMLTextAreaElement; target.style.height = 'auto'; target.style.height = `${Math.min(target.scrollHeight,120)}px`; }} 
                                                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && canEnableFollowUpButton) { e.preventDefault(); handleReplyToSlot(originalIndex); } }} 
                                                          disabled={!canEnableFollowUpInput} aria-label={`Follow-up input for Slot ${originalIndex + 1}`} />
                                                <button onClick={() => handleReplyToSlot(originalIndex)} disabled={!canEnableFollowUpButton} 
                                                        className={`px-3.5 py-2.5 ${colors.button} text-white text-sm font-medium rounded-lg disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0 self-end transition-opacity shadow hover:shadow-md`} 
                                                        title="Send follow-up"
                                                        aria-label={`Send follow-up to Slot ${originalIndex + 1}`}>
                                                    {isSlotProcessing ? '...' : 'Send'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {shouldDisplaySummaryPanel && ( 
                                <div key={`panel-summary-${selectedHistoryId || 'new'}`} 
                                     className={`border rounded-xl shadow-lg flex flex-col ${SUMMARY_PANEL_COLORS.border} ${SUMMARY_PANEL_COLORS.bg} overflow-hidden \
                                     ${(() => {
                                        const numAi = numberOfComparisonSlotsToDisplay;
                                        let summaryLayoutClass = 'col-span-1 row-span-1'; // Default
                                        if (numAi === 4) { // 2x2 AI, summary is 3rd col, row-span-2
                                            summaryLayoutClass = 'md:col-start-3 md:row-start-1 md:row-span-2 col-span-1';
                                        } else if (numAi === 5) { // 3x2 grid, summary is bottom right (col 3, row 2)
                                            summaryLayoutClass = 'md:col-start-3 md:row-start-2 col-span-1';
                                        } else if (numAi === 6) { // 3x2 AI, summary is 4th col, row-span-2
                                            summaryLayoutClass = 'md:col-start-4 md:row-start-1 md:row-span-2 col-span-1';
                                        }
                                        // For 1-3 AI slots, summary is just another column.
                                        // Default col-span-1 row-span-1 is fine.
                                        return summaryLayoutClass;
                                     })()} \
                                     ${totalPanelsToDisplay >= 4 ? 'min-h-[370px]' : 'min-h-[270px]'} transition-all duration-300`}
                                     role="article" aria-labelledby="summary-panel-heading">
                                    <h2 id="summary-panel-heading" 
                                        className={`text-base font-semibold p-3.5 ${SUMMARY_PANEL_COLORS.text} flex-shrink-0 truncate border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800`}>
                                        {summaryModelState ? `Summary (${getModelDisplayName(summaryModelState)})` : 'Summary'}
                                    </h2>
                                    <div className="flex-grow overflow-y-auto text-sm p-3.5 space-y-3 custom-scrollbar-thin" role="log">
                                        {summaryLoading && <p className="text-slate-500 dark:text-slate-400 italic">Generating summary...</p>}
                                        {summaryError && <p className="text-red-600 dark:text-red-400 whitespace-pre-wrap bg-red-50 dark:bg-red-900/30 p-2.5 rounded-md text-xs" role="alert">Error: {summaryError}</p>}
                                        {summaryText && !summaryLoading && 
                                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryText}</ReactMarkdown>
                                            </div>
                                        }
                                        {!summaryLoading && !summaryError && !summaryText && currentChatPrompt && <p className="text-slate-400 dark:text-slate-500 italic text-center py-4">Summary will appear here.</p>}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        user && !isAuthLoading && !settingsLoading && (
                            hasAnyComparisonModelsConfigured ? (
                                <div className="flex-grow flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 text-center px-4">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 text-slate-400 dark:text-slate-500 mb-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-6.75 3h9m-9 3H15m0 0a8.25 8.25 0 100-16.5 8.25 8.25 0 000 16.5z" />
                                    </svg>
                                    <h3 className="text-xl font-semibold mb-2">Welcome to AI Master</h3>
                                    <p className="max-w-md">
                                        Type your prompt below to get started. Responses from your configured AI models will appear here.
                                    </p>
                                    {settingsError && <p className="text-red-500 dark:text-red-400 mt-3">Error with model settings: {settingsError}</p>}
                                </div>
                            ) : (
                                <div className="flex-grow flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 text-center px-4">
                                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-16 h-16 text-slate-400 dark:text-slate-500 mb-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773 1.339a1.125 1.125 0 01-.217 1.457l-.535.54a1.125 1.125 0 00-.028 1.717l.028.028a1.125 1.125 0 001.717-.028l.54-.535a1.125 1.125 0 011.457-.217l1.339.773a1.125 1.125 0 01.12 1.45l-.527.737c-.25.35-.272.806-.108 1.204.166.397.506.71.93.78l.894.149c.542.09.94.56.94 1.11v1.093c0 .55-.398 1.02-.94 1.11l-.894.149c-.424.07-.764.383-.93.78-.164.398-.142.854.108 1.204l.527.738a1.125 1.125 0 01-.12 1.45l-1.339-.773a1.125 1.125 0 01-1.457-.217l-.54.535a1.125 1.125 0 00-1.717-.028l-.028-.028a1.125 1.125 0 00-.028-1.717l-.535-.54a1.125 1.125 0 01-.217-1.457l.773-1.339a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.205.108.397-.166.71-.506.78-.93l.149-.894c.09-.542.56-.94 1.11-.94h1.093zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" />
                                     </svg>
                                     <h3 className="text-xl font-semibold mb-2">No AI models configured</h3>
                                     <p className="max-w-md mb-3">Please go to Settings &gt; Model Providers to set up your AI models.</p>
                                     <button 
                                        onClick={handleOpenSettingsModal} 
                                        className="px-4 py-2 text-sm font-medium bg-sky-600 text-white rounded-md hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
                                     >
                                        Configure Model Providers
                                     </button>
                                </div>
                            )
                        )
                    )}
                     {!user && !isAuthLoading && (
                        <div className="flex-grow flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
                            Please log in to use the application.
                        </div>
                    )}
                </div>
                {user && (
                  <div className="input-bar-container sticky bottom-0 left-0 right-0 p-3 md:p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-shrink-0">
                      <form onSubmit={handleProcessText} className="flex items-end space-x-2 md:space-x-3 w-full max-w-3xl mx-auto">
                          <textarea
                              ref={mainInputRef}
                              value={mainInputText}
                              onChange={(e) => setMainInputText(e.target.value)}
                              onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey && mainInputText.trim() !== '' && canInteractGenerally && !isProcessingAnything) {
                                      e.preventDefault();
                                      handleProcessText();
                                  }
                              }}
                              placeholder={settingsLoading ? "Loading model settings..." : !hasAnyComparisonModelsConfigured ? "Configure models in settings first..." : isProcessingAnything ? "AI thinking..." : "Enter your prompt here..."}
                              className="flex-grow p-3 border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-shadow bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 placeholder-slate-400 dark:placeholder-slate-300 resize-none overflow-y-auto min-h-[50px] max-h-[200px] text-sm md:text-base"
                              rows={1}
                              style={{ height: 'auto' }}
                              onInput={(e) => { const target = e.target as HTMLTextAreaElement; target.style.height = 'auto'; target.style.height = `${Math.min(target.scrollHeight, 200)}px`; }}
                              disabled={uiLocked || settingsLoading || !hasAnyComparisonModelsConfigured || !canInteractGenerally || isProcessingAnything}
                              aria-label="Main prompt input"
                          />
                          <button
                              type="submit"
                              disabled={uiLocked || mainInputText.trim() === '' || settingsLoading || !hasAnyComparisonModelsConfigured || !canInteractGenerally || isProcessingAnything}
                              className="px-4 py-3 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 transition-all duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed self-end flex items-center justify-center h-[50px] aspect-square md:aspect-auto md:h-auto md:px-6"
                              aria-label="Send prompt"
                          >
                              <svg className="w-5 h-5 md:hidden" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd"></path></svg>
                              <span className="hidden md:block">Send</span>
                          </button>
                      </form>
                  </div>
                )}
            </main>
            {isSettingsModalOpen && (
                <SettingsModal 
                    isOpen={isSettingsModalOpen} 
                    onClose={handleCloseSettingsModal} 
                />
            )}
        </div>
    );
};

export default function Page() {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900">
                <p className="text-slate-500 dark:text-slate-400">Loading application...</p>
            </div>
        );
    }

    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900">
                <p className="text-slate-500 dark:text-slate-400">Loading interface...</p>
            </div>
        }>
            {user ? <MainAppInterface /> : <LandingPage />}
        </Suspense>
    );
}
