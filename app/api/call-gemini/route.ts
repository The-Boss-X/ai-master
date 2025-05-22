/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Content, FinishReason } from '@google/generative-ai';
import crypto from 'crypto';
import { recordTokenUsage } from '../../../lib/tokenUtils';
import { Database } from '@/lib/database.types';

interface ConversationMessage {
  role: 'user' | 'model';
  content: string;
}

interface CallGeminiRequest {
  prompt: string;
  model: string;
  slotNumber: 1 | 2 | 3 | 4 | 5 | 6;
  conversationHistory?: ConversationMessage[];
  interactionId?: string | null;
}

interface UserSettingsForGemini {
  gemini_api_key_encrypted: string | null;
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
    console.error('Call Gemini Error: API_KEY_ENCRYPTION_KEY missing or invalid.');
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    let payload: CallGeminiRequest;
    try { payload = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
    const { prompt, model, slotNumber, conversationHistory, interactionId } = payload;

    if (!prompt || !model || !slotNumber) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    const { data: userSettings, error: fetchError } = await supabase
      .from('user_settings')
      .select('gemini_api_key_encrypted, use_provided_keys, free_tokens_remaining, paid_tokens_remaining')
      .eq('user_id', userId)
      .single();

    if (fetchError || !userSettings) {
      console.error(`Call Gemini: DB error or no settings for user ${userId}:`, fetchError);
      return NextResponse.json({ error: 'Could not retrieve user settings.' }, { status: 500 });
    }
    
    const settings = userSettings as UserSettingsForGemini;
    let apiKeyToUse: string | null = null;
    let keyType: 'user' | 'provided';

    if (settings.use_provided_keys) {
      apiKeyToUse = process.env.PROVIDED_GEMINI_API_KEY || null;
      keyType = 'provided';
      if (!apiKeyToUse) {
        console.error('Call Gemini: PROVIDED_GEMINI_API_KEY is not set on the server.');
        return NextResponse.json({ error: 'Service API key not configured by admin.' }, { status: 503 });
      }
      const freeTokens = settings.free_tokens_remaining ?? 0;
      const paidTokens = settings.paid_tokens_remaining ?? 0;
      if (freeTokens + paidTokens <= 0) {
          return NextResponse.json({ error: 'Insufficient tokens to use this service.' }, { status: 402 });
      }
    } else {
      keyType = 'user';
      if (!settings.gemini_api_key_encrypted) {
        return NextResponse.json({ error: 'Gemini API Key not configured. Please add it in Settings.' }, { status: 400 });
      }
      apiKeyToUse = decryptData(settings.gemini_api_key_encrypted, serverEncryptionKey);
      if (!apiKeyToUse) {
        return NextResponse.json({ error: 'Could not decrypt API Key. Check API Key in Settings.' }, { status: 400 });
      }
    }

    const historyForStartChat: Content[] = (conversationHistory || [])
      .slice(0, -1) // Remove the last user prompt as it's sent separately
      .filter(msg => msg.content?.trim())
      .map(msg => ({
        role: msg.role, // 'user' or 'model'
        parts: [{ text: msg.content }]
      }));

    try {
      const genAI = new GoogleGenerativeAI(apiKeyToUse);
      const generativeModel = genAI.getGenerativeModel({ model: model });
      const chat = generativeModel.startChat({ history: historyForStartChat });
      const result = await chat.sendMessage(prompt);
      const response = result.response;

      const promptFeedback = response.promptFeedback;
      const finishReason = response.candidates?.[0]?.finishReason;

      if (promptFeedback?.blockReason || finishReason === FinishReason.SAFETY || finishReason === FinishReason.OTHER) {
        const reason = promptFeedback?.blockReason || finishReason || 'Unknown Safety/Block Reason';
        return NextResponse.json({ error: `Gemini response blocked due to ${reason}.` }, { status: 400 });
      }

      const responseText = response.text();
      if (responseText === undefined || responseText === null || responseText.trim() === "") {
        const reason = finishReason || 'Unknown';
        return NextResponse.json({ error: `Gemini returned an empty response (Finish Reason: ${reason}).` }, { status: 500 });
      }

      const inputTokens = result.response.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = result.response.usageMetadata?.candidatesTokenCount ?? 0;
      const tokensUsed = inputTokens + outputTokens;

      if (keyType === 'provided' && tokensUsed > 0) {
         const { data: rpcData, error: rpcError } = await supabase.rpc('decrement_user_tokens', {
          user_id_param: userId,
          tokens_to_deduct: tokensUsed,
        });
        if (rpcError) console.error(`Call Gemini: Failed to decrement tokens for user ${userId}:`, rpcError);
        else console.log(`Call Gemini: Decremented ${tokensUsed} tokens. New balances:`, rpcData);

      }

      await recordTokenUsage(supabase, userId, 'Gemini', model, inputTokens, outputTokens, interactionId, slotNumber, keyType);

      return NextResponse.json({
        response: responseText.trim(),
        inputTokens,
        outputTokens
      }, { status: 200 });

    } catch (apiError: any) {
      console.error(`Call Gemini: API Error (Model: ${model}, User: ${userId}, Slot: ${slotNumber}):`, apiError);
      let errorMessage = 'Failed to get response from Google AI.';
      let errorStatus = 500;
      if (apiError.status && typeof apiError.status === 'number') errorStatus = apiError.status;
      if (apiError.message) errorMessage = apiError.message;
      if (apiError.message?.includes("API key not valid")) {
        errorMessage = `Invalid Google AI API Key (${keyType} key). Please check your key.`;
        errorStatus = 401;
      } else if (apiError.message?.includes("billing account")) {
         errorMessage = `Your Google Cloud project for this API key (${keyType} key) may have billing issues or the API is not enabled.`;
         errorStatus = 403;
      }
      return NextResponse.json({ error: errorMessage }, { status: errorStatus });
    }

  } catch (error: any) {
    console.error('Call Gemini: Unexpected error:', error);
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
