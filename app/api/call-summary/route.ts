/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { recordTokenUsage } from '../../../lib/tokenUtils';
import OpenAI from 'openai';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, FinishReason as GeminiFinishReasonSDK, Part } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { Database } from '@/lib/database.types';

enum GeminiFinishReason {
  STOP = "STOP",
  MAX_TOKENS = "MAX_TOKENS",
  SAFETY = "SAFETY",
  RECITATION = "RECITATION",
  OTHER = "OTHER",
  UNSPECIFIED = "FINISH_REASON_UNSPECIFIED",
}

export const dynamic = 'force-dynamic';

interface CallSummaryPayload {
  initialPrompt?: string;
  interactionId?: string;
  latestUserPrompt?: string;
  previousSummary?: string | null;
  slotResponses: {
    modelName: string;
    response: string | null;
    error?: string | null;
  }[];
}

interface UserSettingsForSummary {
  summary_model: string | null;
  gemini_api_key_encrypted: string | null;
  openai_api_key_encrypted: string | null;
  anthropic_api_key_encrypted: string | null;
  use_provided_keys: boolean | null;
  free_tokens_remaining: number | null;
  paid_tokens_remaining: number | null;
}

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

async function callOpenAIForSummary(apiKey: string, model: string, prompt: string): Promise<{ summary: string; inputTokens: number; outputTokens: number }> {
  const openai = new OpenAI({ apiKey });
  const completion = await openai.chat.completions.create({
    model: model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
  });
  const summary = completion.choices[0]?.message?.content;
  if (!summary) throw new Error('OpenAI summary response was empty.');
  return {
    summary: summary.trim(),
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
  };
}

async function callGeminiForSummary(apiKey: string, model: string, prompt: string): Promise<{ summary: string; inputTokens: number; outputTokens: number }> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const generativeModel = genAI.getGenerativeModel({ model });
  const result = await generativeModel.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.5 }
  });
  const response = result.response;
  const promptFeedback = response.promptFeedback;
  const finishReason = response.candidates?.[0]?.finishReason as GeminiFinishReasonSDK | undefined;

  if (promptFeedback?.blockReason || finishReason === GeminiFinishReasonSDK.SAFETY || finishReason === GeminiFinishReasonSDK.OTHER) {
    const reason = promptFeedback?.blockReason || finishReason || 'Unknown Safety/Block Reason';
    throw new Error(`Gemini summary blocked due to ${reason}.`);
  }
  const summary = response.text();
  if (summary === undefined || summary === null || summary.trim() === "") {
    throw new Error(`Gemini returned an empty summary (Finish Reason: ${finishReason || 'Unknown'}).`);
  }
  return {
    summary: summary.trim(),
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

async function callAnthropicForSummary(apiKey: string, model: string, prompt: string): Promise<{ summary: string; inputTokens: number; outputTokens: number }> {
  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
    max_tokens: 2048,
  });
  let summary = '';
  if (response.content && response.content.length > 0 && response.content[0].type === 'text') {
    summary = response.content[0].text;
  } else {
    if (response.stop_reason === 'max_tokens') throw new Error('Anthropic summary truncated.');
    throw new Error('Anthropic response was empty or in an unexpected format.');
  }
  if (summary.trim() === "") throw new Error('Anthropic response was empty.');
  return {
    summary: summary.trim(),
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
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
    console.error('Call Summary Error: API_KEY_ENCRYPTION_KEY missing or invalid.');
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    let payload: CallSummaryPayload;
    try { payload = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }

    const { initialPrompt, slotResponses, interactionId, latestUserPrompt, previousSummary } = payload;
    const isInitialSummary = !!initialPrompt && !interactionId && !latestUserPrompt && (previousSummary === undefined || previousSummary === null);
    const isUpdateSummary = !!interactionId && !!latestUserPrompt && typeof previousSummary === 'string' && !initialPrompt;

    if (!Array.isArray(slotResponses) || slotResponses.length === 0) {
      return NextResponse.json({ error: 'Missing slot responses.' }, { status: 400 });
    }
    if (!isInitialSummary && !isUpdateSummary) {
      return NextResponse.json({ error: 'Invalid payload for summary.' }, { status: 400 });
    }

    const { data: userSettings, error: settingsError } = await supabase
      .from('user_settings')
      .select('summary_model, gemini_api_key_encrypted, openai_api_key_encrypted, anthropic_api_key_encrypted, use_provided_keys, free_tokens_remaining, paid_tokens_remaining')
      .eq('user_id', userId)
      .single();

    if (settingsError || !userSettings) {
      console.error(`Call Summary: Failed to fetch settings for user ${userId}:`, settingsError);
      return NextResponse.json({ error: 'Could not retrieve user settings.' }, { status: 500 });
    }
    
    const settings = userSettings as UserSettingsForSummary;
    const summaryModelString = settings.summary_model;
    if (!summaryModelString || !summaryModelString.includes(': ')) {
      return NextResponse.json({ error: 'Summary model not configured or invalid.' }, { status: 400 });
    }

    const [provider, specificModel] = summaryModelString.split(': ');
    let apiKeyToUse: string | null = null;
    let keyType: 'user' | 'provided';

    if (settings.use_provided_keys) {
      keyType = 'provided';
      if (provider === 'ChatGPT') apiKeyToUse = process.env.PROVIDED_OPENAI_API_KEY || null;
      else if (provider === 'Gemini') apiKeyToUse = process.env.PROVIDED_GEMINI_API_KEY || null;
      else if (provider === 'Anthropic') apiKeyToUse = process.env.PROVIDED_ANTHROPIC_API_KEY || null;
      
      if (!apiKeyToUse) {
        console.error(`Call Summary: PROVIDED_${provider.toUpperCase()}_API_KEY is not set.`);
        return NextResponse.json({ error: `App's ${provider} API key not configured.` }, { status: 503 });
      }
      const freeTokens = settings.free_tokens_remaining ?? 0;
      const paidTokens = settings.paid_tokens_remaining ?? 0;
      if (freeTokens + paidTokens <= 0) {
          return NextResponse.json({ error: 'Insufficient tokens for summary.' }, { status: 402 });
      }
    } else {
      keyType = 'user';
      if (provider === 'ChatGPT') apiKeyToUse = settings.openai_api_key_encrypted ? decryptData(settings.openai_api_key_encrypted, serverEncryptionKey) : null;
      else if (provider === 'Gemini') apiKeyToUse = settings.gemini_api_key_encrypted ? decryptData(settings.gemini_api_key_encrypted, serverEncryptionKey) : null;
      else if (provider === 'Anthropic') apiKeyToUse = settings.anthropic_api_key_encrypted ? decryptData(settings.anthropic_api_key_encrypted, serverEncryptionKey) : null;
      
      if (!apiKeyToUse) {
        return NextResponse.json({ error: `API key for ${provider} not found or failed to decrypt.` }, { status: 400 });
      }
    }

    let summaryPrompt = '';
    if (isInitialSummary) {
      summaryPrompt = `Initial User Prompt: "${initialPrompt}"\n\nAI Responses:\n`;
      slotResponses.forEach((slot, index) => {
        summaryPrompt += `--- Response ${index + 1} (${slot.modelName}) ---\n${slot.response ? slot.response.substring(0, 1500) : (slot.error || '(No response)')}\n---\n\n`;
      });
      summaryPrompt += `Provide a concise, neutral, aggregated summary of these initial responses.`;
    } else { // isUpdateSummary
      summaryPrompt = `Existing Summary:\n${previousSummary || '(None)'}\n\nLatest User Prompt: "${latestUserPrompt}"\n\nLatest AI Responses:\n`;
      slotResponses.forEach((slot, index) => {
        summaryPrompt += `--- Response ${index + 1} (${slot.modelName}) ---\n${slot.response ? slot.response.substring(0, 1500) : (slot.error || '(No response)')}\n---\n\n`;
      });
      summaryPrompt += `Update the existing summary by incorporating the latest interaction. Output only the new, complete, updated summary.`;
    }

    let summaryResultData;
    try {
      if (provider === 'ChatGPT') summaryResultData = await callOpenAIForSummary(apiKeyToUse, specificModel, summaryPrompt);
      else if (provider === 'Gemini') summaryResultData = await callGeminiForSummary(apiKeyToUse, specificModel, summaryPrompt);
      else if (provider === 'Anthropic') summaryResultData = await callAnthropicForSummary(apiKeyToUse, specificModel, summaryPrompt);
      else throw new Error(`Unsupported provider for summary: ${provider}`);

      const { summary, inputTokens, outputTokens } = summaryResultData;
      const tokensUsed = inputTokens + outputTokens;

      if (keyType === 'provided' && tokensUsed > 0) {
        const { data: rpcData, error: rpcError } = await supabase.rpc('decrement_user_tokens', {
          user_id_param: userId,
          tokens_to_deduct: tokensUsed,
        });
        if (rpcError) console.error(`Call Summary: Failed to decrement tokens for user ${userId}:`, rpcError);
        else console.log(`Call Summary: Decremented ${tokensUsed} tokens. New balances:`, rpcData);
      }

      await recordTokenUsage(supabase, userId, provider, specificModel, inputTokens, outputTokens, interactionId, null, keyType);

      return NextResponse.json({ summary, inputTokens, outputTokens }, { status: 200 });

    } catch (aiError: any) {
      console.error(`Call Summary: AI API call failed for ${summaryModelString}:`, aiError);
      return NextResponse.json({ error: `Failed to generate summary: ${aiError.message}` }, { status: 502 });
    }

  } catch (error: any) {
    console.error('Unexpected error in call-summary route:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
