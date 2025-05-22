/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

// --- Define Available Models (User's Original List) ---
const AVAILABLE_MODELS = {
    Gemini: [
        'gemini-2.5-pro-exp-03-25',
        'gemini-2.5-flash-preview-04-17',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemma-3-1b-it',
    ],
    ChatGPT: [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4.1',
        'gpt-4.1-mini',
        'gpt-4.1-nano',
    ],
    Anthropic: [
        'claude-3-7-sonnet-latest',
        'claude-3-5-haiku-latest',
        'claude-3-5-sonnet-latest',
        'claude-3-opus-latest',
        'claude-3-haiku-20240307',
    ],
} as const;

const MODEL_OPTIONS = Object.entries(AVAILABLE_MODELS).flatMap(
  ([provider, models]) => models.map(model => `${provider}: ${model}`)
);
type AiModelOption = typeof MODEL_OPTIONS[number] | '';

const MIN_SLOTS = 1;
const MAX_SLOTS = 6;

interface ModelSettingsState {
  modelSelections: AiModelOption[];
  summaryModelSelection: AiModelOption;
}

interface ApiKeySettingsState {
  geminiApiKey: string;
  openaiApiKey: string;
  anthropicApiKey: string;
}

interface FetchedUserSettings {
  slot_1_model: string | null;
  slot_2_model: string | null;
  slot_3_model: string | null;
  slot_4_model: string | null;
  slot_5_model: string | null;
  slot_6_model: string | null;
  summary_model: string | null;
  use_provided_keys: boolean | null;
  free_tokens_remaining: number | null;
  paid_tokens_remaining: number | null;
  free_tokens_last_reset_at: string | null;
  total_tokens_used_overall: number | null; // Tracks usage with user's own keys
}

interface TokenLogEntry {
  created_at: string;
  provider: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens_for_call: number;
  interaction_id?: string | null;
  slot_number?: number | null;
  key_type?: 'user' | 'provided' | null;
}

interface TokenUsageDisplayState {
  total_tokens_overall_user_keys: number;
  free_tokens_remaining: number;
  paid_tokens_remaining: number;
  free_tokens_last_reset_at: string | null;
  settings_last_updated: string | null;
  all_logs: TokenLogEntry[];
  loading: boolean;
  error: string | null;
  logs_error: string | null;
}


export default function SettingsPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();

  const [modelSettings, setModelSettings] = useState<ModelSettingsState>({
    modelSelections: Array(MAX_SLOTS).fill(''),
    summaryModelSelection: '',
  });
  const [apiKeySettings, setApiKeySettings] = useState<ApiKeySettingsState>({
    geminiApiKey: '',
    openaiApiKey: '',
    anthropicApiKey: '',
  });
  const [useProvidedKeys, setUseProvidedKeys] = useState<boolean>(false);
  const [numberOfSlots, setNumberOfSlots] = useState<number>(MIN_SLOTS);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [tokenUsage, setTokenUsage] = useState<TokenUsageDisplayState>({
    total_tokens_overall_user_keys: 0,
    free_tokens_remaining: 0,
    paid_tokens_remaining: 0,
    free_tokens_last_reset_at: null,
    settings_last_updated: null,
    all_logs: [],
    loading: true,
    error: null,
    logs_error: null,
  });

  const fetchSettingsAndUsage = useCallback(async () => {
    console.log("fetchSettingsAndUsage called");
    if (!user) {
      console.log("No user, setting defaults and returning.");
      setModelSettings({ modelSelections: Array(MAX_SLOTS).fill(''), summaryModelSelection: '' });
      setApiKeySettings({ geminiApiKey: '', openaiApiKey: '', anthropicApiKey: '' });
      setUseProvidedKeys(false);
      setNumberOfSlots(MIN_SLOTS);
      setTokenUsage(prev => ({
         ...prev,
         total_tokens_overall_user_keys: 0,
         free_tokens_remaining: 0,
         paid_tokens_remaining: 0,
         free_tokens_last_reset_at: null,
         settings_last_updated: null,
         all_logs: [],
         loading: false,
         error: null,
         logs_error: null,
        }));
      setIsLoadingSettings(false);
      return;
    }

    setIsLoadingSettings(true);
    setFetchError(null);
    setErrorMessage(null);
    setTokenUsage(prev => ({ ...prev, loading: true, error: null, logs_error: null }));
    console.log("Starting to fetch settings and usage data...");

    try {
      console.log("Fetching /api/settings/get-settings...");
      const settingsResponse = await fetch('/api/settings/get-settings');
      console.log("get-settings response status:", settingsResponse.status);
      if (settingsResponse.status === 401) {
        setFetchError("Unauthorized. Please log in again.");
        setIsLoadingSettings(false);
        setTokenUsage(prev => ({ ...prev, loading: false, error: "Unauthorized" }));
        return;
      }
      if (!settingsResponse.ok) {
        const errorData = await settingsResponse.json().catch(() => ({ error: 'Failed to parse settings error' }));
        console.error("Error fetching settings:", errorData);
        throw new Error(errorData.error || `Failed to fetch settings (${settingsResponse.status})`);
      }
      const fetchedData: FetchedUserSettings | null = await settingsResponse.json();
      console.log("Fetched user settings data:", fetchedData);

      const fetchedModels: AiModelOption[] = Array(MAX_SLOTS).fill('');
      let fetchedSummaryModel: AiModelOption = '';
      let activeSlotsCount = MIN_SLOTS;

      if (fetchedData) {
        setUseProvidedKeys(fetchedData.use_provided_keys ?? false);
        setTokenUsage(prev => ({
          ...prev,
          total_tokens_overall_user_keys: fetchedData.total_tokens_used_overall ?? 0,
          free_tokens_remaining: fetchedData.free_tokens_remaining ?? 10000,
          paid_tokens_remaining: fetchedData.paid_tokens_remaining ?? 0,
          free_tokens_last_reset_at: fetchedData.free_tokens_last_reset_at ?? null,
        }));

        for (let i = 0; i < MAX_SLOTS; i++) {
          const modelKey = `slot_${i + 1}_model` as keyof FetchedUserSettings;
          if (fetchedData[modelKey]) {
            const isValidOption = MODEL_OPTIONS.includes(fetchedData[modelKey] as AiModelOption);
            if (isValidOption) {
              fetchedModels[i] = fetchedData[modelKey] as AiModelOption;
              activeSlotsCount = Math.max(activeSlotsCount, i + 1);
            } else { console.warn(`Fetched model "${fetchedData[modelKey]}" for slot ${i + 1} is no longer available. Clearing.`); }
          }
        }
        if (fetchedData.summary_model) {
          const isValidSummaryOption = MODEL_OPTIONS.includes(fetchedData.summary_model as AiModelOption);
          if (isValidSummaryOption) { fetchedSummaryModel = fetchedData.summary_model as AiModelOption; }
          else { console.warn(`Fetched summary model "${fetchedData.summary_model}" is no longer available. Clearing.`); }
        }
      } else {
        setUseProvidedKeys(false);
        setTokenUsage(prev => ({
            ...prev,
            total_tokens_overall_user_keys: 0,
            free_tokens_remaining: 10000,
            paid_tokens_remaining: 0,
            free_tokens_last_reset_at: null,
        }));
      }
      setModelSettings({ modelSelections: fetchedModels, summaryModelSelection: fetchedSummaryModel });
      setNumberOfSlots(activeSlotsCount);
      setIsLoadingSettings(false);
      console.log("Finished processing user settings.");

      console.log("Fetching /api/get-token-usage...");
      const usageLogResponse = await fetch('/api/get-token-usage');
      console.log("get-token-usage response status:", usageLogResponse.status);

      if (!usageLogResponse.ok) {
         const logErrorData = await usageLogResponse.json().catch(() => ({ error: 'Failed to parse token usage log error' }));
         console.error("Error fetching usage logs:", logErrorData);
         setTokenUsage(prev => ({...prev, loading: false, logs_error: logErrorData.error || `Failed to fetch usage logs (${usageLogResponse.status})`}));
      } else {
        const usageLogData = await usageLogResponse.json();
        console.log("Fetched usage log data from API:", usageLogData);

        // Try to get logs from 'all_logs' or 'recent_logs'
        const logs = usageLogData.all_logs || usageLogData.recent_logs || [];
        console.log("Processed logs to be set in state:", logs);

        setTokenUsage(prev => ({
            ...prev,
            all_logs: logs,
            total_tokens_overall_user_keys: usageLogData.total_tokens_used_overall ?? prev.total_tokens_overall_user_keys,
            settings_last_updated: usageLogData.settings_last_updated || null,
            logs_error: usageLogData.logs_error || usageLogData.error || null, // Check both possible error keys
            loading: false,
        }));
      }

    } catch (error: any) {
      console.error("Error in fetchSettingsAndUsage:", error);
      setFetchError(error.message || "An unknown error occurred.");
      const defaultModels = Array(MAX_SLOTS).fill('');
      defaultModels[0] = (MODEL_OPTIONS[0] || '') as AiModelOption;
      setModelSettings({ modelSelections: defaultModels, summaryModelSelection: '' });
      setUseProvidedKeys(false);
      setNumberOfSlots(MIN_SLOTS);
      setTokenUsage(prev => ({
        ...prev,
        loading: false,
        error: error.message || "Failed to load data.",
        total_tokens_overall_user_keys: 0,
        free_tokens_remaining: 0,
        paid_tokens_remaining: 0,
        all_logs: [],
    }));
      setIsLoadingSettings(false);
    }
    console.log("fetchSettingsAndUsage finished.");
  }, [user]);

  useEffect(() => {
    console.log("Auth state changed or component mounted. isAuthLoading:", isAuthLoading, "User:", user ? user.id : 'null');
    if (!isAuthLoading && user) {
      fetchSettingsAndUsage();
    } else if (!isAuthLoading && !user) {
      console.log("No user and not auth loading, clearing settings.");
      setIsLoadingSettings(false);
      setModelSettings({ modelSelections: Array(MAX_SLOTS).fill(''), summaryModelSelection: '' });
      setApiKeySettings({ geminiApiKey: '', openaiApiKey: '', anthropicApiKey: '' });
      setUseProvidedKeys(false);
      setNumberOfSlots(MIN_SLOTS);
      setTokenUsage({
        total_tokens_overall_user_keys: 0,
        free_tokens_remaining: 0,
        paid_tokens_remaining: 0,
        free_tokens_last_reset_at: null,
        settings_last_updated: null,
        all_logs: [],
        loading: false,
        error: null,
        logs_error: null,
    });
    }
  }, [user, isAuthLoading, fetchSettingsAndUsage]);

  const handleModelChange = (index: number, value: AiModelOption) => {
    setModelSettings(prev => {
      const newSelections = [...prev.modelSelections];
      newSelections[index] = value;
      return { ...prev, modelSelections: newSelections };
    });
    if (saveStatus !== 'idle') setSaveStatus('idle');
  };

  const handleSummaryModelChange = (value: AiModelOption) => {
    setModelSettings(prev => ({ ...prev, summaryModelSelection: value }));
    if (saveStatus !== 'idle') setSaveStatus('idle');
  };

  const handleApiKeyChange = (provider: 'gemini' | 'openai' | 'anthropic', value: string) => {
    if (saveStatus !== 'idle') setSaveStatus('idle');
    setApiKeySettings(prev => ({ ...prev, [`${provider}ApiKey`]: value }));
  };

  const handleUseProvidedKeysChange = (checked: boolean) => {
    setUseProvidedKeys(checked);
    if (saveStatus !== 'idle') setSaveStatus('idle');
  };

  const addSlot = () => setNumberOfSlots(prev => Math.min(prev + 1, MAX_SLOTS));
  const removeSlot = () => {
    handleModelChange(numberOfSlots - 1, '');
    setNumberOfSlots(prev => Math.max(prev - 1, MIN_SLOTS));
  };

  const handleSaveSettings = async () => {
    setSaveStatus('saving');
    setErrorMessage(null);
    setFetchError(null);

    const activeComparisonModels = modelSettings.modelSelections.slice(0, numberOfSlots).filter(Boolean);
    if (activeComparisonModels.length > 1 && new Set(activeComparisonModels).size !== activeComparisonModels.length) {
      setErrorMessage("Please select unique AI models for each active comparison slot.");
      setSaveStatus('error'); return;
    }

    const payload: Record<string, any> = {
      use_provided_keys: useProvidedKeys,
      summary_model: modelSettings.summaryModelSelection || null,
    };

    if (!useProvidedKeys) {
      payload.gemini_api_key = apiKeySettings.geminiApiKey || undefined;
      payload.openai_api_key = apiKeySettings.openaiApiKey || undefined;
      payload.anthropic_api_key = apiKeySettings.anthropicApiKey || undefined;
    }

    for (let i = 0; i < MAX_SLOTS; i++) {
      payload[`slot_${i + 1}_model`] = i < numberOfSlots ? (modelSettings.modelSelections[i] || null) : null;
    }
    console.log("Saving settings with payload:", payload);

    try {
      const response = await fetch('/api/settings/save-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      console.log("Save settings response:", result);
      if (!response.ok) throw new Error(result.error || `Failed to save settings (${response.status})`);

      setSaveStatus('success');
      if (result.savedSettings) {
        setUseProvidedKeys(result.savedSettings.use_provided_keys ?? false);
        setTokenUsage(prev => ({
            ...prev,
            free_tokens_remaining: result.savedSettings.free_tokens_remaining ?? 0,
            paid_tokens_remaining: result.savedSettings.paid_tokens_remaining ?? 0,
            free_tokens_last_reset_at: result.savedSettings.free_tokens_last_reset_at ?? null,
            total_tokens_overall_user_keys: result.savedSettings.total_tokens_used_overall ?? 0,
        }));
      }
      setApiKeySettings({ geminiApiKey: '', openaiApiKey: '', anthropicApiKey: '' });
      // Consider re-fetching logs if save might impact them, or rely on returned data for token counts
      // fetchSettingsAndUsage(); // Could be called here to refresh everything
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (error: any) {
      console.error("Error saving settings via API:", error);
      setErrorMessage(error.message || "An unknown error occurred while saving.");
      setSaveStatus('error');
    }
  };

  useEffect(() => {
    // This effect is just for logging the tokenUsage state when it changes.
    console.log("Final tokenUsage state after updates:", tokenUsage);
  }, [tokenUsage]);


  if (isAuthLoading || (isLoadingSettings && user)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className="flex items-center space-x-3">
          <svg className="animate-spin h-6 w-6 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-gray-600 dark:text-gray-400 text-lg">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!user && !isAuthLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
        <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Access Denied</h2>
          <p className="text-gray-600 dark:text-gray-300">You must be logged in to view and manage settings.</p>
          <Link href="/auth" className="mt-4 inline-block px-6 py-2 font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors">
            Sign In
          </Link>
          <div className="mt-6 text-sm">
            <Link href="/" className="text-blue-600 dark:text-blue-400 hover:underline">&larr; Back to Home</Link>
          </div>
        </div>
      </div>
    );
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString();
    } catch (e) {
      return 'Invalid Date';
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-4xl p-8 space-y-8 bg-white dark:bg-gray-800 rounded-lg shadow-xl">
        <div className="text-sm">
          <Link href="/" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline">&larr; Back to Home</Link>
        </div>
        <h2 className="text-3xl font-bold text-center text-gray-900 dark:text-gray-100">AI Master Settings</h2>

        {fetchError && (
          <div className="p-3 text-center text-red-700 bg-red-100 border border-red-300 rounded-md dark:bg-red-900/50 dark:text-red-200 dark:border-red-700/60">
            {fetchError}
          </div>
        )}
        {errorMessage && saveStatus === 'error' && (
          <div className="p-3 text-center text-red-700 bg-red-100 border border-red-300 rounded-md dark:bg-red-900/50 dark:text-red-200 dark:border-red-700/60">
            {errorMessage}
          </div>
        )}
        {saveStatus === 'success' && (
          <div className="p-3 text-center text-green-700 bg-green-100 border border-green-300 rounded-md dark:bg-green-900/50 dark:text-green-200 dark:border-green-700/60">
            Settings saved successfully!
          </div>
        )}

        {/* Token Plan Info Section */}
        <fieldset className="border p-6 rounded-lg shadow-sm bg-purple-50 dark:bg-gray-700/30 border-purple-200 dark:border-gray-600/50">
            <legend className="text-xl font-semibold px-2 text-gray-800 dark:text-gray-100">Token Plan & Usage Overview</legend>
            {isLoadingSettings && ( // Use isLoadingSettings for this section as it depends on get-settings
                 <div className="flex items-center justify-center p-4">
                    <svg className="animate-spin h-5 w-5 text-purple-600 dark:text-purple-400 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <p className="text-gray-600 dark:text-gray-400">Loading token plan...</p>
                 </div>
            )}
            {tokenUsage.error && !isLoadingSettings && ( // Show error if not loading and error exists
                <div className="p-3 text-center text-red-700 bg-red-100 border border-red-300 rounded-md dark:bg-red-900/50 dark:text-red-200 dark:border-red-700/60">
                  {tokenUsage.error}
                </div>
            )}
            {!isLoadingSettings && !tokenUsage.error && ( // Show content if not loading and no error
                <div className="space-y-4">
                  {useProvidedKeys ? (
                    <>
                      <div>
                        <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">Free Tokens Remaining:</h3>
                        <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                          {(tokenUsage.free_tokens_remaining ?? 0).toLocaleString()} / 10,000
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Resets weekly. Last reset: {formatDate(tokenUsage.free_tokens_last_reset_at)}
                        </p>
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">Paid Tokens Remaining:</h3>
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          {(tokenUsage.paid_tokens_remaining ?? 0).toLocaleString()}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div>
                      <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">Total Tokens Used (Your Keys):</h3>
                      <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                        {tokenUsage.total_tokens_overall_user_keys.toLocaleString()}
                      </p>
                      {tokenUsage.settings_last_updated && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          (Overall count last updated: {formatDate(tokenUsage.settings_last_updated)})
                        </p>
                      )}
                    </div>
                  )}
                </div>
            )}
        </fieldset>

        {/* Token Usage Log Section */}
        <fieldset className="border p-6 rounded-lg shadow-sm bg-green-50 dark:bg-gray-700/30 border-green-200 dark:border-gray-600/50">
            <legend className="text-xl font-semibold px-2 text-gray-800 dark:text-gray-100">Token Usage Log</legend>
            {tokenUsage.loading && !tokenUsage.logs_error && ( // Show loading if logs are loading and no specific log error
                 <div className="flex items-center justify-center p-4">
                    <svg className="animate-spin h-5 w-5 text-green-600 dark:text-green-400 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <p className="text-gray-600 dark:text-gray-400">Loading usage log...</p>
                 </div>
            )}
            {tokenUsage.logs_error && !tokenUsage.loading && ( // Show specific log error if not loading
                <div className="p-3 text-center text-red-700 bg-red-100 border border-red-300 rounded-md dark:bg-red-900/50 dark:text-red-200 dark:border-red-700/60">
                    {tokenUsage.logs_error}
                </div>
            )}
            {!tokenUsage.loading && !tokenUsage.logs_error && ( // Show logs if not loading and no specific log error
                <div className="space-y-4">
                    <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">Recent Calls ({tokenUsage.all_logs.length}):</h3>
                    {tokenUsage.all_logs.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No usage logs found.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700 max-h-[calc(7*2.8rem+2rem)] overflow-y-auto custom-scrollbar">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0 z-10">
                            <tr>
                              <th scope="col" className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Time</th>
                              <th scope="col" className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Key</th>
                              <th scope="col" className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Provider</th>
                              <th scope="col" className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Model</th>
                              <th scope="col" className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Input</th>
                              <th scope="col" className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Output</th>
                              <th scope="col" className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Total</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {tokenUsage.all_logs.map((log, index) => (
                              <tr key={index} className={index % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-800/70'}>
                                <td className="px-3 py-2.5 whitespace-nowrap text-gray-500 dark:text-gray-400">{formatDate(log.created_at)}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300 capitalize">{log.key_type || 'N/A'}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300">{log.provider}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300 truncate max-w-[120px] sm:max-w-xs" title={log.model_name}>{log.model_name}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300 text-right">{log.input_tokens.toLocaleString()}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-gray-700 dark:text-gray-300 text-right">{log.output_tokens.toLocaleString()}</td>
                                <td className="px-3 py-2.5 whitespace-nowrap text-gray-800 dark:text-gray-200 font-medium text-right">{log.total_tokens_for_call.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <button
                        onClick={fetchSettingsAndUsage}
                        disabled={tokenUsage.loading || isLoadingSettings} // Disable if any part is loading
                        className="mt-4 px-3 py-1.5 text-xs font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-800/70 disabled:opacity-50 transition-colors"
                    >
                        {(tokenUsage.loading || isLoadingSettings) ? 'Refreshing...' : 'Refresh All Settings & Logs'}
                    </button>
                </div>
            )}
        </fieldset>


        <form className="space-y-8" onSubmit={(e) => { e.preventDefault(); handleSaveSettings(); }}>
          <fieldset className="border p-6 rounded-lg shadow-sm bg-indigo-50 dark:bg-gray-700/30 border-indigo-200 dark:border-gray-600/50">
            <legend className="text-xl font-semibold px-2 text-gray-800 dark:text-gray-100">API Key Configuration</legend>
            <div className="mt-4 flex items-center space-x-3 p-2">
              <label htmlFor="use-provided-keys-toggle" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Use {process.env.NEXT_PUBLIC_APP_NAME || "Our App's"} API Keys & Token System:
              </label>
              <button
                type="button"
                id="use-provided-keys-toggle"
                role="switch"
                aria-checked={useProvidedKeys}
                onClick={() => handleUseProvidedKeysChange(!useProvidedKeys)}
                className={`${
                  useProvidedKeys ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
                } relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
              >
                <span className="sr-only">Use Provided API Keys</span>
                <span
                  aria-hidden="true"
                  className={`${
                    useProvidedKeys ? 'translate-x-5' : 'translate-x-0'
                  } pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200`}
                />
              </button>
            </div>
            {useProvidedKeys ? (
                 <p className="text-sm text-gray-600 dark:text-gray-400 px-2 mt-2">
                    You are using the provided API keys. Your usage will be tracked against your free/paid token allowance.
                 </p>
            ) : (
                 <p className="text-sm text-gray-600 dark:text-gray-400 px-2 mt-2">
                    You are using your own API keys. Usage will be billed by the respective AI providers.
                 </p>
            )}
          </fieldset>

          {!useProvidedKeys && (
            <fieldset className="border p-6 rounded-lg shadow-sm bg-blue-50 dark:bg-gray-700/30 border-blue-200 dark:border-gray-600/50">
              <legend className="text-xl font-semibold px-2 text-gray-800 dark:text-gray-100">Your API Keys</legend>
              <p className="text-sm text-gray-600 dark:text-gray-400 px-2 mb-4">Enter your API keys below. They will be stored securely.</p>
              <div className="mt-4 space-y-4">
                <div>
                  <label htmlFor="gemini-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gemini API Key</label>
                  <input id="gemini-key" type="password" autoComplete="new-password" value={apiKeySettings.geminiApiKey} onChange={(e) => handleApiKeyChange('gemini', e.target.value)} placeholder="Enter New Gemini Key to Update (Optional)" className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Required if using any Gemini models with your own key.</p>
                </div>
                <div>
                  <label htmlFor="openai-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">OpenAI API Key</label>
                  <input id="openai-key" type="password" autoComplete="new-password" value={apiKeySettings.openaiApiKey} onChange={(e) => handleApiKeyChange('openai', e.target.value)} placeholder="Enter New OpenAI Key to Update (Optional)" className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Required if using any ChatGPT models with your own key.</p>
                </div>
                <div>
                  <label htmlFor="anthropic-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Anthropic API Key</label>
                  <input id="anthropic-key" type="password" autoComplete="new-password" value={apiKeySettings.anthropicApiKey} onChange={(e) => handleApiKeyChange('anthropic', e.target.value)} placeholder="Enter New Anthropic Key to Update (Optional)" className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Required if using any Anthropic models with your own key.</p>
                </div>
              </div>
            </fieldset>
          )}

          <fieldset className="border p-6 rounded-lg shadow-sm border-gray-200 dark:border-gray-600/50">
            <legend className="text-xl font-semibold px-2 text-gray-800 dark:text-gray-100">Summary Model</legend>
            <p className="text-sm text-gray-600 dark:text-gray-400 px-2 mb-4">Select the AI model to generate the summary panel (requires 2 or more comparison slots to be active).</p>
            <div className="mt-4">
              <label htmlFor="summary-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 sr-only">Summary Model Selection</label>
              <select id="summary-model" value={modelSettings.summaryModelSelection} onChange={(e) => handleSummaryModelChange(e.target.value as AiModelOption)} className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                <option value="">-- Select Summary Model (Optional) --</option>
                {MODEL_OPTIONS.map(option => (<option key={`summary-${option}`} value={option}>{option}</option>))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">The summary panel will only appear if a model is selected here AND 2 or more comparison slots are active.</p>
            </div>
          </fieldset>

          <fieldset className="border p-6 rounded-lg shadow-sm border-gray-200 dark:border-gray-600/50">
            <legend className="text-xl font-semibold px-2 text-gray-800 dark:text-gray-100">Comparison Slots</legend>
            <p className="text-sm text-gray-600 dark:text-gray-400 px-2 mb-4">Configure the AI models you want to compare side-by-side. You can use between {MIN_SLOTS} and {MAX_SLOTS} slots.</p>
            <div className="flex justify-center space-x-4 my-4">
              <button type="button" onClick={removeSlot} disabled={numberOfSlots <= MIN_SLOTS || saveStatus === 'saving'} className="px-4 py-2 text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-800/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">- Remove Last Slot</button>
              <span className="text-lg font-medium text-gray-700 dark:text-gray-300 self-center px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-md">{numberOfSlots} Slot{numberOfSlots > 1 ? 's' : ''} Active</span>
              <button type="button" onClick={addSlot} disabled={numberOfSlots >= MAX_SLOTS || saveStatus === 'saving'} className="px-4 py-2 text-sm font-medium rounded-md text-green-700 bg-green-100 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:hover:bg-green-800/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">+ Add Slot</button>
            </div>
            <div className="space-y-6 mt-6">
              {modelSettings.modelSelections.slice(0, numberOfSlots).map((modelSelection, index) => (
                <div key={`slot-settings-${index}`} className="border p-4 rounded-md bg-gray-50 dark:bg-gray-700/60 border-gray-200 dark:border-gray-600/60">
                  <label htmlFor={`ai${index + 1}-model`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Slot {index + 1} Model</label>
                  <select id={`ai${index + 1}-model`} value={modelSelection} onChange={(e) => handleModelChange(index, e.target.value as AiModelOption)} className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    <option value="">-- Select Model --</option>
                    {MODEL_OPTIONS.map(option => (<option key={`slot${index}-${option}`} value={option}>{option}</option>))}
                  </select>
                </div>
              ))}
            </div>
          </fieldset>

          <div>
            <button type="submit" disabled={saveStatus === 'saving' || isLoadingSettings} className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-lg font-medium text-white transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${saveStatus === 'saving' || isLoadingSettings ? 'bg-indigo-400 dark:bg-indigo-800 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 focus:ring-indigo-500'}`}>
              {saveStatus === 'saving' ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
