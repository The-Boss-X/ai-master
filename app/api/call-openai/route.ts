/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import OpenAI from 'openai';
import crypto from 'crypto';
import { recordTokenUsage } from '../../../lib/tokenUtils';
import { Database } from '@/lib/database.types';

interface ConversationMessage {
  role: 'user' | 'assistant' | 'system' | 'model';
  content: string;
}

interface CallOpenAIRequest {
  prompt: string;
  model: string;
  slotNumber: 1 | 2 | 3 | 4 | 5 | 6;
  conversationHistory?: ConversationMessage[];
  interactionId?: string | null;
}

interface UserSettingsForOpenAI {
  openai_api_key_encrypted: string | null;
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
      throw new Error('Invalid encrypted data format.');
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
    console.error('Call OpenAI Error: API_KEY_ENCRYPTION_KEY missing or invalid.');
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    let payload: CallOpenAIRequest;
    try { payload = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
    const { prompt, model, slotNumber, conversationHistory, interactionId } = payload;

    if (!prompt || !model || !slotNumber) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    const { data: userSettings, error: fetchError } = await supabase
      .from('user_settings')
      .select('openai_api_key_encrypted, use_provided_keys, free_tokens_remaining, paid_tokens_remaining')
      .eq('user_id', userId)
      .single();

    if (fetchError || !userSettings) {
      console.error(`Call OpenAI: DB error or no settings for user ${userId}:`, fetchError);
      return NextResponse.json({ error: 'Could not retrieve user settings.' }, { status: 500 });
    }
    
    const settings = userSettings as UserSettingsForOpenAI;
    let apiKeyToUse: string | null = null;
    let keyType: 'user' | 'provided';

    if (settings.use_provided_keys) {
      apiKeyToUse = process.env.PROVIDED_OPENAI_API_KEY || null;
      keyType = 'provided';
      if (!apiKeyToUse) {
        console.error('Call OpenAI: PROVIDED_OPENAI_API_KEY is not set on the server.');
        return NextResponse.json({ error: 'Service API key not configured by admin.' }, { status: 503 });
      }
      const freeTokens = settings.free_tokens_remaining ?? 0;
      const paidTokens = settings.paid_tokens_remaining ?? 0;
      if (freeTokens + paidTokens <= 0) {
          return NextResponse.json({ error: 'Insufficient tokens to use this service.' }, { status: 402 });
      }
    } else {
      keyType = 'user';
      if (!settings.openai_api_key_encrypted) {
        return NextResponse.json({ error: 'OpenAI API Key not configured in Settings.' }, { status: 400 });
      }
      apiKeyToUse = decryptData(settings.openai_api_key_encrypted, serverEncryptionKey);
      if (!apiKeyToUse) {
        return NextResponse.json({ error: 'Could not decrypt API Key. Check API Key in Settings.' }, { status: 400 });
      }
    }

    const messagesForApi: OpenAI.Chat.ChatCompletionMessageParam[] = (conversationHistory || [])
      .filter(msg => msg.content?.trim())
      .map(msg => ({
        role: (msg.role === 'model' ? 'assistant' : msg.role) as 'user' | 'assistant' | 'system',
        content: msg.content
      }));

    if (messagesForApi.length === 0 || messagesForApi[messagesForApi.length - 1].role !== 'user' || messagesForApi[messagesForApi.length - 1].content !== prompt) {
      if (!(messagesForApi[messagesForApi.length - 1]?.role === 'user' && messagesForApi[messagesForApi.length - 1]?.content === prompt)) {
        messagesForApi.push({ role: 'user', content: prompt });
      }
    }
    
    const openai = new OpenAI({ apiKey: apiKeyToUse });
    try {
      const completion = await openai.chat.completions.create({
        model: model,
        messages: messagesForApi,
      });
      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) throw new Error('No response text received from OpenAI.');

      const inputTokens = completion.usage?.prompt_tokens ?? 0;
      const outputTokens = completion.usage?.completion_tokens ?? 0;
      const tokensUsed = inputTokens + outputTokens;

      if (keyType === 'provided' && tokensUsed > 0) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('decrement_user_tokens', {
          user_id_param: userId,
          tokens_to_deduct: tokensUsed,
        });
         if (rpcError) console.error(`Call OpenAI: Failed to decrement tokens for user ${userId}:`, rpcError);
         else console.log(`Call OpenAI: Decremented ${tokensUsed} tokens. New balances:`, rpcData);
      }

      await recordTokenUsage(supabase, userId, 'OpenAI', model, inputTokens, outputTokens, interactionId, slotNumber, keyType);

      return NextResponse.json({
        response: responseText.trim(),
        inputTokens,
        outputTokens
      }, { status: 200 });

    } catch (apiError: any) {
      console.error(`Call OpenAI: API Error (Model: ${model}, User: ${userId}, Slot: ${slotNumber}):`, apiError);
      let errorMessage = 'Failed to get response from OpenAI.';
      let errorStatus = 500;
      if (apiError instanceof OpenAI.APIError) {
        errorMessage = apiError.message || errorMessage;
        errorStatus = apiError.status || errorStatus;
        if (apiError.status === 401) errorMessage = `Invalid OpenAI API Key (${keyType} key). Please check your key.`;
        else if (apiError.status === 429) errorMessage = `OpenAI rate limit exceeded or quota reached.`;
        else if (apiError.code === 'model_not_found') { errorMessage = `OpenAI model '${model}' not found.`; errorStatus = 400; }
      }
      return NextResponse.json({ error: errorMessage }, { status: errorStatus });
    }
  } catch (error: any) {
    console.error('Call OpenAI: Unexpected error:', error);
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
