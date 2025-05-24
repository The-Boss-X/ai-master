/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

// Types copied from original settings page
export interface TokenLogEntry {
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
  settings_last_updated: string | null; // This might come from a different endpoint or be part of user settings
  all_logs: TokenLogEntry[];
  loading: boolean;
  error: string | null;
  logs_error: string | null;
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleString();
  } catch (e) {
    return dateString; // if parsing fails, return original string
  }
};

const TokenUsageDisplay: React.FC = () => {
  const { user, isLoading: isAuthLoading } = useAuth();
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

  const fetchTokenData = useCallback(async () => {
    if (!user || isAuthLoading) {
      setTokenUsage(prev => ({ 
        ...prev, 
        loading: false, 
        total_tokens_overall_user_keys: 0,
        free_tokens_remaining: 0,
        paid_tokens_remaining: 0,
        free_tokens_last_reset_at: null,
        settings_last_updated: null,
        all_logs: [],
        error: null,
        logs_error: null,
      }));
      return;
    }

    setTokenUsage(prev => ({ ...prev, loading: true, error: null, logs_error: null }));

    try {
      // First, get token balances from user settings endpoint
      const settingsResponse = await fetch('/api/settings/get-settings');
      if (!settingsResponse.ok) {
        const errorData = await settingsResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch token balances (${settingsResponse.status})`);
      }
      const userSettingsData = await settingsResponse.json();

      // Then, get usage logs from token usage endpoint
      const usageLogResponse = await fetch('/api/get-token-usage');
      if (!usageLogResponse.ok) {
        const logErrorData = await usageLogResponse.json().catch(() => ({}));
        throw new Error(logErrorData.error || `Failed to fetch usage logs (${usageLogResponse.status})`);
      }
      const usageLogData = await usageLogResponse.json();

      setTokenUsage({
        total_tokens_overall_user_keys: userSettingsData?.total_tokens_used_overall ?? usageLogData?.total_tokens_used_overall ?? 0,
        free_tokens_remaining: userSettingsData?.free_tokens_remaining ?? 0,
        paid_tokens_remaining: userSettingsData?.paid_tokens_remaining ?? 0,
        free_tokens_last_reset_at: userSettingsData?.free_tokens_last_reset_at ?? null,
        settings_last_updated: userSettingsData?.updated_at ?? usageLogData?.settings_last_updated ?? null, // Prefer userSettings updated_at if available
        all_logs: usageLogData?.all_logs || usageLogData?.recent_logs || [],
        loading: false,
        error: null,
        logs_error: usageLogData?.logs_error || usageLogData?.error || null,
      });

    } catch (err: unknown) {
      console.error("Error fetching token data:", err);
      setTokenUsage(prev => ({
        ...prev,
        loading: false,
        error: (err instanceof Error ? err.message : String(err)) || "An unknown error occurred fetching token data.",
      }));
    }
  }, [user, isAuthLoading]);

  useEffect(() => {
    fetchTokenData();
  }, [fetchTokenData]);

  if (tokenUsage.loading) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[200px]">
        <svg className="animate-spin h-6 w-6 text-sky-500 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading token usage...</p>
      </div>
    );
  }

  if (tokenUsage.error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-lg">
        <p className="text-red-700 dark:text-red-300 font-medium">Error loading token data:</p>
        <p className="text-red-600 dark:text-red-400 text-sm mt-1">{tokenUsage.error}</p>
        <button onClick={fetchTokenData} className="mt-3 px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md">Try Again</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h5 className="text-md font-semibold text-slate-700 dark:text-slate-300 mb-2">Platform Token Balances</h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="p-3 bg-slate-100 dark:bg-slate-700/50 rounded-md">
            <p className="text-slate-500 dark:text-slate-400">Free Tokens Remaining:</p>
            <p className="font-semibold text-slate-800 dark:text-slate-200 text-lg">{tokenUsage.free_tokens_remaining?.toLocaleString() ?? 'N/A'}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Resets: {formatDate(tokenUsage.free_tokens_last_reset_at)}</p>
          </div>
          <div className="p-3 bg-slate-100 dark:bg-slate-700/50 rounded-md">
            <p className="text-slate-500 dark:text-slate-400">Paid Tokens Remaining:</p>
            <p className="font-semibold text-slate-800 dark:text-slate-200 text-lg">{tokenUsage.paid_tokens_remaining?.toLocaleString() ?? 'N/A'}</p>
          </div>
          <div className="p-3 bg-slate-100 dark:bg-slate-700/50 rounded-md">
            <p className="text-slate-500 dark:text-slate-400">Usage with Own Keys:</p>
            <p className="font-semibold text-slate-800 dark:text-slate-200 text-lg">{tokenUsage.total_tokens_overall_user_keys?.toLocaleString() ?? 'N/A'}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Total tokens (approx.)</p>
          </div>
        </div>
        {/* <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Settings last updated: {formatDate(tokenUsage.settings_last_updated)}</p> */}
      </section>

      <section>
        <div className="flex justify-between items-center mb-2">
            <h5 className="text-md font-semibold text-slate-700 dark:text-slate-300">Recent Token Usage Log</h5>
            <button 
                onClick={fetchTokenData} 
                disabled={tokenUsage.loading}
                className="px-2.5 py-1 text-xs font-medium rounded-md bg-sky-100 text-sky-700 hover:bg-sky-200 dark:bg-sky-700/30 dark:text-sky-300 dark:hover:bg-sky-700/50 disabled:opacity-50 transition-colors"
            >
                {tokenUsage.loading ? 'Refreshing...' : 'Refresh Log'}
            </button>
        </div>
        {tokenUsage.logs_error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/50 rounded-lg mb-3">
            <p className="text-red-700 dark:text-red-300 font-medium text-sm">Error loading usage logs:</p>
            <p className="text-red-600 dark:text-red-400 text-xs mt-1">{tokenUsage.logs_error}</p>
          </div>
        )}
        {tokenUsage.all_logs.length === 0 && !tokenUsage.logs_error && (
          <p className="text-sm text-slate-500 dark:text-slate-400 italic text-center py-4">No token usage logged yet.</p>
        )}
        {tokenUsage.all_logs.length > 0 && (
          <div className="overflow-x-auto max-h-80 custom-scrollbar border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800/30">
            <table className="min-w-full text-sm divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 dark:text-slate-300">Date</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 dark:text-slate-300">Provider & Model</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600 dark:text-slate-300">In Tokens</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600 dark:text-slate-300">Out Tokens</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600 dark:text-slate-300">Total</th>
                  <th className="px-3 py-2.5 text-center font-medium text-slate-600 dark:text-slate-300">Key Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {tokenUsage.all_logs.map((log, index) => (
                  <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400">{formatDate(log.created_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {log.provider}: {log.model_name}
                        {log.slot_number && <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">(Slot {log.slot_number})</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-slate-500 dark:text-slate-400">{log.input_tokens.toLocaleString()}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-slate-500 dark:text-slate-400">{log.output_tokens.toLocaleString()}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-medium text-slate-600 dark:text-slate-300">{log.total_tokens_for_call.toLocaleString()}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-center text-slate-500 dark:text-slate-400">
                        <span className={`px-1.5 py-0.5 text-xs rounded-full ${log.key_type === 'user' ? 'bg-blue-100 text-blue-700 dark:bg-blue-700/30 dark:text-blue-300' : log.key_type === 'provided' ? 'bg-green-100 text-green-700 dark:bg-green-700/30 dark:text-green-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-300'}`}>
                            {log.key_type ? log.key_type.charAt(0).toUpperCase() + log.key_type.slice(1) : 'N/A'}
                        </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default TokenUsageDisplay; 