'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext'; // Assuming AuthContext is one level up

// --- Copied from app/settings/page.tsx ---
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
  gemini_api_key?: string | null; 
  openai_api_key?: string | null;
  anthropic_api_key?: string | null;
}
// --- End Copied Types/Consts ---

interface ModelProviderSettingsFormProps {
    onSettingsSaved?: () => void; 
}

const ModelProviderSettingsForm: React.FC<ModelProviderSettingsFormProps> = ({ onSettingsSaved }) => {
  const { user, isLoading: isAuthLoading } = useAuth();

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
  
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!user) {
      setModelSettings({ modelSelections: Array(MAX_SLOTS).fill(''), summaryModelSelection: '' });
      setApiKeySettings({ geminiApiKey: '', openaiApiKey: '', anthropicApiKey: '' });
      setUseProvidedKeys(false);
      setNumberOfSlots(MIN_SLOTS);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setFetchError(null);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/settings/get-settings');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch settings (${response.status})`);
      }
      const fetchedData: FetchedUserSettings | null = await response.json();

      const fetchedModels: AiModelOption[] = Array(MAX_SLOTS).fill('');
      let fetchedSummaryModel: AiModelOption = '';
      let activeSlotsCount = MIN_SLOTS;

      if (fetchedData) {
        setUseProvidedKeys(fetchedData.use_provided_keys ?? false);
        setApiKeySettings({
            geminiApiKey: fetchedData.gemini_api_key || '',
            openaiApiKey: fetchedData.openai_api_key || '',
            anthropicApiKey: fetchedData.anthropic_api_key || '',
        });

        for (let i = 0; i < MAX_SLOTS; i++) {
          const modelKey = `slot_${i + 1}_model` as keyof FetchedUserSettings;
          if (fetchedData[modelKey]) {
            const isValidOption = MODEL_OPTIONS.includes(fetchedData[modelKey] as AiModelOption);
            if (isValidOption) {
              fetchedModels[i] = fetchedData[modelKey] as AiModelOption;
              activeSlotsCount = Math.max(activeSlotsCount, i + 1);
            } else { console.warn(`Fetched model \"${fetchedData[modelKey]}\" for slot ${i + 1} is no longer available. Clearing.`); }
          }
        }
        if (fetchedData.summary_model) {
          const isValidSummaryOption = MODEL_OPTIONS.includes(fetchedData.summary_model as AiModelOption);
          if (isValidSummaryOption) { fetchedSummaryModel = fetchedData.summary_model as AiModelOption; }
          else { console.warn(`Fetched summary model \"${fetchedData.summary_model}\" is no longer available. Clearing.`); }
        }
      } else {
        setUseProvidedKeys(false);
        setApiKeySettings({ geminiApiKey: '', openaiApiKey: '', anthropicApiKey: '' });
      }
      setModelSettings({ modelSelections: fetchedModels, summaryModelSelection: fetchedSummaryModel });
      setNumberOfSlots(Math.max(MIN_SLOTS, activeSlotsCount));
    } catch (error: unknown) {
      console.error("Error fetching model/API key settings:", error);
      setFetchError((error instanceof Error ? error.message : String(error)) || "An unknown error occurred while fetching settings.");
      const defaultModels = Array(MAX_SLOTS).fill('');
      if (MODEL_OPTIONS.length > 0) defaultModels[0] = MODEL_OPTIONS[0];
      setModelSettings({ modelSelections: defaultModels, summaryModelSelection: ''});
      setNumberOfSlots(MIN_SLOTS);
      setUseProvidedKeys(false);
      setApiKeySettings({ geminiApiKey: '', openaiApiKey: '', anthropicApiKey: '' });
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && !isAuthLoading) {
      fetchSettings();
    } else if (!user && !isAuthLoading) {
      setModelSettings({ modelSelections: Array(MAX_SLOTS).fill(''), summaryModelSelection: '' });
      setApiKeySettings({ geminiApiKey: '', openaiApiKey: '', anthropicApiKey: '' });
      setUseProvidedKeys(false);
      setNumberOfSlots(MIN_SLOTS);
      setIsLoading(false);
      setFetchError(null);
      setErrorMessage(null);
      setSaveStatus('idle');
    }
  }, [user, isAuthLoading, fetchSettings]);

  const handleModelChange = (index: number, value: AiModelOption) => {
    const newSelections = [...modelSettings.modelSelections];
    newSelections[index] = value;
    setModelSettings(prev => ({ ...prev, modelSelections: newSelections }));
  };

  const handleSummaryModelChange = (value: AiModelOption) => {
    setModelSettings(prev => ({ ...prev, summaryModelSelection: value }));
  };

  const handleApiKeyChange = (provider: 'gemini' | 'openai' | 'anthropic', value: string) => {
    setApiKeySettings(prev => ({ ...prev, [`${provider}ApiKey`]: value }));
  };

  const handleUseProvidedKeysChange = (checked: boolean) => {
    setUseProvidedKeys(checked);
  };

  const addSlot = () => setNumberOfSlots(prev => Math.min(prev + 1, MAX_SLOTS));
  const removeSlot = () => {
    const newNumberOfSlots = Math.max(MIN_SLOTS, numberOfSlots - 1);
    if (newNumberOfSlots < numberOfSlots && modelSettings.modelSelections[numberOfSlots -1] !== '') {
        if(confirm("Removing this slot will clear its selected model. Continue?")) {
            handleModelChange(numberOfSlots - 1, ''); 
            setNumberOfSlots(newNumberOfSlots);
        }    
    } else {
        setNumberOfSlots(newNumberOfSlots);
    }
  };

  const handleSaveSettings = async () => {
    if (!user) {
      setErrorMessage("You must be logged in to save settings.");
      return;
    }
    setSaveStatus('saving');
    setErrorMessage(null);

    const activeModelSelections = modelSettings.modelSelections.slice(0, numberOfSlots);
    if (activeModelSelections.every(sel => sel === '') && modelSettings.summaryModelSelection === '') {
        if (!confirm("You haven't selected any models. All model slots will be empty. Do you want to proceed?")) {
            setSaveStatus('idle');
            return;
        }
    }

    const payload = {
      models: activeModelSelections.map((sel, i) => ({ slot: i + 1, model_name: sel || null })),
      summary_model: modelSettings.summaryModelSelection || null,
      apiKeys: useProvidedKeys ? null : apiKeySettings,
      use_provided_keys: useProvidedKeys,
    };

    try {
      const response = await fetch('/api/settings/update-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || `Failed to save settings (${response.status})`);
      }
      setSaveStatus('success');
      if (onSettingsSaved) onSettingsSaved();
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error: unknown) {
      console.error("Error saving settings:", error);
      setErrorMessage((error instanceof Error ? error.message : String(error)) || "An unknown error occurred while saving.");
      setSaveStatus('error');
    }
  };

  if (isAuthLoading || isLoading) {
    return (
        <div className="p-6 flex flex-col items-center justify-center min-h-[300px]">
            <svg className="animate-spin h-8 w-8 text-sky-500 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <p className="text-slate-500 dark:text-slate-400">Loading model settings...</p>
        </div>
    );
  }

  if (fetchError) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-lg">
        <p className="text-red-700 dark:text-red-300 font-medium">Error loading settings:</p>
        <p className="text-red-600 dark:text-red-400 text-sm mt-1">{fetchError}</p>
        <button onClick={fetchSettings} className="mt-3 px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md">Try Again</button>
      </div>
    );
  }

  return (
    <div className="space-y-8 py-2">
      {/* Model Selection Section */}
      <section>
        <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-200 mb-1">Configure AI Model Slots</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Select which AI models to use for comparison. You can activate up to {MAX_SLOTS} slots.</p>
        <div className="space-y-4">
          {modelSettings.modelSelections.slice(0, numberOfSlots).map((selectedModel, index) => (
            <div key={`model-slot-${index}`} className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/30">
              <label htmlFor={`model-${index}`} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Comparison Slot {index + 1}
              </label>
              <select
                id={`model-${index}`}
                value={selectedModel}
                onChange={(e) => handleModelChange(index, e.target.value as AiModelOption)}
                className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm"
              >
                <option value="">-- Select Model --</option>
                {MODEL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center space-x-3">
          <button 
            onClick={addSlot} 
            disabled={numberOfSlots >= MAX_SLOTS}
            className="px-4 py-2 text-sm font-medium rounded-md bg-sky-500 text-white hover:bg-sky-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
          >
            Add Slot
          </button>
          <button 
            onClick={removeSlot} 
            disabled={numberOfSlots <= MIN_SLOTS}
            className="px-4 py-2 text-sm font-medium rounded-md bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Remove Slot
          </button>
        </div>
      </section>

      {/* Summary Model Selection */}
      <section>
        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-1">Summary Model</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Select a model to generate summaries of the comparison slots. Requires at least 2 active slots.</p>
        <select
          id="summary-model"
          value={modelSettings.summaryModelSelection}
          onChange={(e) => handleSummaryModelChange(e.target.value as AiModelOption)}
          className="w-full md:max-w-md p-2.5 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm"
        >
          <option value="">-- No Summary Model --</option>
          {MODEL_OPTIONS.map(opt => <option key={`summary-${opt}`} value={opt}>{opt}</option>)}
        </select>
      </section>

      {/* API Key Management Section */}
      <section>
        <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-200 mb-2">API Key Configuration</h2>
        <div className="flex items-center space-x-3 mb-4 p-3 bg-sky-50 dark:bg-sky-700/20 border border-sky-200 dark:border-sky-600/50 rounded-lg">
          <input
            type="checkbox"
            id="use-provided-keys"
            checked={useProvidedKeys}
            onChange={(e) => handleUseProvidedKeysChange(e.target.checked)}
            className="h-5 w-5 text-sky-600 border-slate-300 dark:border-slate-500 rounded focus:ring-sky-500"
          />
          <label htmlFor="use-provided-keys" className="text-sm font-medium text-slate-700 dark:text-sky-200">
            Use xavion.ai Platform Tokens (Recommended for ease of use)
          </label>
        </div>
        
        {!useProvidedKeys && (
          <div className="space-y-5 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/30">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Enter your own API keys below. Your keys are sent directly to the respective providers and are <strong className="font-semibold">not stored on our servers</strong>. Usage with your own keys will not consume your xavion.ai platform tokens.
            </p>
            <div>
              <label htmlFor="gemini-api-key" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Google Gemini API Key</label>
              <input type="password" id="gemini-api-key" autoComplete="off" value={apiKeySettings.geminiApiKey} onChange={(e) => handleApiKeyChange('gemini', e.target.value)} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 bg-white dark:bg-slate-700 text-sm" placeholder="Enter Gemini API Key" />
            </div>
            <div>
              <label htmlFor="openai-api-key" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">OpenAI API Key (ChatGPT)</label>
              <input type="password" id="openai-api-key" autoComplete="off" value={apiKeySettings.openaiApiKey} onChange={(e) => handleApiKeyChange('openai', e.target.value)} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 bg-white dark:bg-slate-700 text-sm" placeholder="Enter OpenAI API Key" />
            </div>
            <div>
              <label htmlFor="anthropic-api-key" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Anthropic API Key (Claude)</label>
              <input type="password" id="anthropic-api-key" autoComplete="off" value={apiKeySettings.anthropicApiKey} onChange={(e) => handleApiKeyChange('anthropic', e.target.value)} className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-sky-500 focus:border-sky-500 bg-white dark:bg-slate-700 text-sm" placeholder="Enter Anthropic API Key" />
            </div>
          </div>
        )}
      </section>

      {/* Save Button and Status Messages */}
      <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={handleSaveSettings}
          disabled={saveStatus === 'saving' || isLoading}
          className={`w-full md:w-auto px-6 py-3 text-base font-medium rounded-lg text-white transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-800
                      ${saveStatus === 'saving' ? 'bg-slate-400 dark:bg-slate-500 cursor-wait' : 
                       saveStatus === 'success' ? 'bg-green-500 hover:bg-green-600 focus:ring-green-500' : 
                       'bg-sky-600 hover:bg-sky-700 focus:ring-sky-500'}`}
        >
          {saveStatus === 'saving' && 'Saving...'}
          {saveStatus === 'success' && 'Settings Saved!'}
          {saveStatus === 'error' && 'Save Settings (Retry)'}
          {saveStatus === 'idle' && 'Save All Settings'}
        </button>
        {errorMessage && <p className="text-sm text-red-600 dark:text-red-400 mt-3 text-center md:text-left">{errorMessage}</p>}
        {saveStatus === 'success' && <p className="text-sm text-green-600 dark:text-green-400 mt-3 text-center md:text-left">Your settings have been updated successfully.</p>}
      </div>
    </div>
  );
}

export default ModelProviderSettingsForm; 