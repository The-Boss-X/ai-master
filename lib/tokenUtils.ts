/* eslint-disable @typescript-eslint/no-explicit-any */
import { type SupabaseClient } from '@supabase/supabase-js'; // Corrected import
import { Database } from '@/lib/database.types';

export async function recordTokenUsage(
  supabase: SupabaseClient<Database>, // This type is now correctly referenced
  userId: string,
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  interactionId: string | null | undefined,
  slotNumber: number | null | undefined,
  key_type: 'user' | 'provided'
): Promise<{ success: boolean; error?: string }> {
  const totalTokensForCall = inputTokens + outputTokens;

  try {
    const logEntry: Database['public']['Tables']['token_usage_log']['Insert'] = {
      user_id: userId,
      provider: provider,
      model_name: model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens_for_call: totalTokensForCall,
      key_type: key_type,
      interaction_id: interactionId || null,
      slot_number: slotNumber === undefined ? null : slotNumber,
    };

    const { error: logError } = await supabase.from('token_usage_log').insert(logEntry);

    if (logError) {
      console.error('Error logging token usage to token_usage_log:', logError);
      return { success: false, error: logError.message };
    }

    if (key_type === 'user' && totalTokensForCall > 0) {
      const { error: rpcError } = await supabase.rpc('increment_user_own_key_tokens', {
        p_user_id: userId,
        p_tokens_to_add: totalTokensForCall,
      });
      if (rpcError) {
        console.warn(`Failed to increment user's own key total tokens: ${rpcError.message}`);
      }
    }
    return { success: true };
  } catch (error: any) {
    console.error('Unexpected error in recordTokenUsage:', error);
    return { success: false, error: error.message || 'Unknown error in recordTokenUsage' };
  }
}
