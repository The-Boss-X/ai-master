/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/tokenUtils.ts
// NEW FILE: Utility functions for token logging

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Records token usage to the token_usage_log table and updates the user's total.
 * IMPORTANT: The update to user_settings.total_tokens_used_overall is NOT ATOMIC here.
 * For true atomicity and to prevent race conditions with concurrent calls,
 * consider using a Supabase Edge Function (RPC) to perform the increment.
 * This function should only be called from server-side routes.
 */
export async function recordTokenUsage(
  supabase: SupabaseClient, // Pass the Supabase client instance
  userId: string,
  provider: string,
  modelName: string,
  inputTokens: number,
  outputTokens: number,
  interactionId?: string | null, // Optional: if the call is part of a saved interaction
  slotNumber?: number | null     // Optional: if the call is for a specific slot
): Promise<{ success: boolean; error?: any }> {
  try {
    const totalTokensForCall = inputTokens + outputTokens;

    // 1. Log to token_usage_log
    // Ensure RLS is set up for this table to allow inserts where user_id matches auth.uid()
    // or if this function is called from a trusted server environment with service_role key.
    // If using user session context, user_id should match auth.uid().
    const { error: logError } = await supabase.from('token_usage_log').insert({
      user_id: userId, // Ensure this is the authenticated user's ID
      provider,
      model_name: modelName,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens_for_call: totalTokensForCall,
      interaction_id: interactionId,
      slot_number: slotNumber,
    });

    if (logError) {
      console.error(`TokenUtils: Error logging to token_usage_log for user ${userId}. Provider: ${provider}, Model: ${modelName}. Error:`, logError);
      // Do not stop here; still attempt to update the aggregate if possible,
      // but return the specific error for the detailed log.
      // The overall success might depend on whether the aggregate update succeeds.
    }

    // 2. Update user_settings (Non-atomic increment - potential race condition)
    // Fetch current total
    // RLS must allow select on user_settings for the user_id.
    const { data: settingsData, error: fetchSettingsError } = await supabase
      .from('user_settings')
      .select('total_tokens_used_overall')
      .eq('user_id', userId)
      .single();

    if (fetchSettingsError && fetchSettingsError.code !== 'PGRST116') { // PGRST116: 0 rows, means no settings row yet
      console.error(`TokenUtils: Error fetching user_settings for token update (user ${userId}). Error:`, fetchSettingsError);
      return { success: !logError, error: logError || `Failed to fetch total for update: ${fetchSettingsError.message}` };
    }

    const currentTotal = settingsData?.total_tokens_used_overall ?? 0;
    const newTotal = currentTotal + totalTokensForCall;

    // RLS must allow update on user_settings for the user_id.
    // Upsert ensures a row is created if it doesn't exist (e.g., first time logging tokens for a user)
    const { error: updateSettingsError } = await supabase
      .from('user_settings')
      .upsert(
        { user_id: userId, total_tokens_used_overall: newTotal, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' } // Specify the conflict target for upsert
      )
      .eq('user_id', userId); // This .eq might be redundant with onConflict but ensures targeting

    if (updateSettingsError) {
      console.error(`TokenUtils: Error updating total_tokens_used_overall in user_settings for user ${userId}. Error:`, updateSettingsError);
      return { success: !logError, error: logError || `Failed to update total: ${updateSettingsError.message}` };
    }
    
    if (logError) { // If individual log failed but aggregate update was attempted (or succeeded)
        return { success: false, error: `Individual log failed: ${logError.message}. Aggregate update status may vary.` };
    }

    console.log(`TokenUtils: Token usage recorded successfully for user ${userId}. Provider: ${provider}, Model: ${modelName}, Input: ${inputTokens}, Output: ${outputTokens}. New overall total: ${newTotal}`);
    return { success: true };

  } catch (error: any) {
    console.error('TokenUtils: Unexpected error in recordTokenUsage:', error);
    return { success: false, error: error.message || 'Unknown error recording token usage' };
  }
}