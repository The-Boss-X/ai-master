/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { recordTokenUsage } from '../../../lib/tokenUtils';
import { Database } from '@/lib/database.types';

interface ConversationMessage {
  role: 'user' | 'model'; // 'model' from client, maps to 'assistant' for Anthropic
  content: string;
}

interface CallAnthropicRequest {
  prompt: string;
  model: string;
  slotNumber: 1 | 2 | 3 | 4 | 5 | 6;
  conversationHistory?: ConversationMessage[];
  interactionId?: string | null;
}

interface UserSettingsForAnthropic {
  anthropic_api_key_encrypted: string | null;
  use_provided_keys: boolean | null;
  free_tokens_remaining: number | null;
  paid_tokens_remaining: number | null;
}

export const dynamic = 'force-dynamic';

const algorithm = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function decryptData(encryptedTextHex: string, secretKeyHex: string): string | null {
  try {
    if (!encryptedTextHex) return null;
    if (secretKeyHex.length !== 64) throw new Error('Decryption key must be a 64-character hex string (32 bytes).');
    const key = Buffer.from(secretKeyHex, 'hex');
    const ivHex = encryptedTextHex.slice(0, IV_LENGTH * 2);
    const authTagHex = encryptedTextHex.slice(IV_LENGTH * 2, (IV_LENGTH + AUTH_TAG_LENGTH) * 2);
    const encryptedDataHex = encryptedTextHex.slice((IV_LENGTH + AUTH_TAG_LENGTH) * 2);
    if (ivHex.length !== IV_LENGTH * 2 || authTagHex.length !== AUTH_TAG_LENGTH * 2 || !encryptedDataHex) {
      throw new Error('Invalid encrypted data format: component lengths incorrect.');
    }
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedDataHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error: any) {
    console.error('Decryption failed:', error.message);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) { try { cookieStore.set({ name, value, ...options }); } catch (error) {} },
        remove(name: string, options: CookieOptions) { try { cookieStore.set({ name, value: '', ...options }); } catch (error) {} },
      },
    }
  );

  const serverEncryptionKey = process.env.API_KEY_ENCRYPTION_KEY;
  if (!serverEncryptionKey || serverEncryptionKey.length !== 64) {
    console.error('Call Anthropic Error: API_KEY_ENCRYPTION_KEY missing or invalid.');
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    let payload: CallAnthropicRequest;
    try { payload = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
    const { model, slotNumber, conversationHistory, interactionId, prompt } = payload;

    if (!model || !slotNumber || !conversationHistory || conversationHistory.length === 0) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    const { data: userSettings, error: fetchError } = await supabase
      .from('user_settings')
      .select('anthropic_api_key_encrypted, use_provided_keys, free_tokens_remaining, paid_tokens_remaining')
      .eq('user_id', userId)
      .single(); // Use single as settings should exist

    if (fetchError || !userSettings) {
      console.error(`Call Anthropic: DB error or no settings for user ${userId}:`, fetchError);
      return NextResponse.json({ error: 'Could not retrieve user settings.' }, { status: 500 });
    }
    
    const settings = userSettings as UserSettingsForAnthropic;
    let apiKeyToUse: string | null = null;
    let keyType: 'user' | 'provided';

    if (settings.use_provided_keys) {
      apiKeyToUse = process.env.PROVIDED_ANTHROPIC_API_KEY || null;
      keyType = 'provided';
      if (!apiKeyToUse) {
        console.error('Call Anthropic: PROVIDED_ANTHROPIC_API_KEY is not set on the server.');
        return NextResponse.json({ error: 'Service API key not configured by admin.' }, { status: 503 });
      }
      const freeTokens = settings.free_tokens_remaining ?? 0;
      const paidTokens = settings.paid_tokens_remaining ?? 0;
      if (freeTokens + paidTokens <= 0) { // Basic check, more sophisticated logic for "last query" might be needed
          return NextResponse.json({ error: 'Insufficient tokens to use this service.' }, { status: 402 });
      }
    } else {
      keyType = 'user';
      if (!settings.anthropic_api_key_encrypted) {
        return NextResponse.json({ error: 'Anthropic API Key not configured. Please add it in Settings.' }, { status: 400 });
      }
      apiKeyToUse = decryptData(settings.anthropic_api_key_encrypted, serverEncryptionKey);
      if (!apiKeyToUse) {
        return NextResponse.json({ error: 'Could not decrypt API Key. Check API Key in Settings.' }, { status: 400 });
      }
    }

    const messagesForApi: Anthropic.Messages.MessageParam[] = conversationHistory
      .filter(msg => msg.content?.trim())
      .map(msg => ({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: msg.content
      }));

    if (messagesForApi.length === 0 || messagesForApi[messagesForApi.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'Invalid conversation history format.' }, { status: 500 });
    }

    try {
      const anthropic = new Anthropic({ apiKey: apiKeyToUse });
      const response = await anthropic.messages.create({
        model: model,
        max_tokens: 4096, // Consider making this configurable or dynamic
        messages: messagesForApi,
      });

      let responseText = '';
      if (response.content && response.content.length > 0 && response.content[0].type === 'text') {
        responseText = response.content[0].text;
      } else {
        if (response.stop_reason === 'max_tokens') throw new Error('Response truncated due to max token limit.');
        else if (response.stop_reason) throw new Error(`Response stopped unexpectedly. Reason: ${response.stop_reason}`);
        throw new Error('Response was empty or in an unexpected format.');
      }
      if (responseText.trim() === "") throw new Error('Response was empty.');

      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;
      const tokensUsed = inputTokens + outputTokens;

      if (keyType === 'provided' && tokensUsed > 0) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('decrement_user_tokens', {
          user_id_param: userId,
          tokens_to_deduct: tokensUsed,
        });

        if (rpcError) {
          console.error(`Call Anthropic: Failed to decrement tokens for user ${userId}:`, rpcError);
          // Decide if this is a critical failure
        } else {
            // Optional: Check rpcData for new token balances if needed
            console.log(`Call Anthropic: Decremented ${tokensUsed} tokens. New balances:`, rpcData);
        }
      }

      await recordTokenUsage(supabase, userId, 'Anthropic', model, inputTokens, outputTokens, interactionId, slotNumber, keyType);

      return NextResponse.json({
        response: responseText.trim(),
        inputTokens,
        outputTokens
      }, { status: 200 });

    } catch (apiError: any) {
      console.error(`Call Anthropic: API Error (Model: ${model}, User: ${userId}, Slot: ${slotNumber}):`, apiError);
      let errorMessage = 'Failed to get response from Anthropic.';
      let errorStatus = 500;
      if (apiError instanceof Anthropic.APIError) {
        errorMessage = apiError.message || errorMessage;
        errorStatus = apiError.status || errorStatus;
         if (apiError.status === 401) errorMessage = `Invalid Anthropic API Key (${keyType} key).`;
         else if (apiError.status === 403 && keyType === 'provided') errorMessage = `App's Anthropic API key lacks permissions or has billing issues.`;
         else if (apiError.status === 403 && keyType === 'user') errorMessage = `Your Anthropic API key lacks permissions or has billing issues.`;
         else if (apiError.status === 429) errorMessage = `Anthropic rate limit exceeded or quota reached.`;
      }
      return NextResponse.json({ error: errorMessage }, { status: errorStatus });
    }

  } catch (error: any) {
    console.error('Call Anthropic: Unexpected error:', error);
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
