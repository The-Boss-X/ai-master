// app/api/call-summary/route.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { recordTokenUsage } from '../../../lib/tokenUtils'; // Adjust path if necessary
import OpenAI from 'openai'; // For OpenAI models
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, FinishReason, Part } from '@google/generative-ai'; // For Gemini, added Part
import Anthropic from '@anthropic-ai/sdk'; // For Anthropic

// Define expected FinishReason values (if not importable)
enum GeminiFinishReason {
    STOP = "STOP",
    MAX_TOKENS = "MAX_TOKENS",
    SAFETY = "SAFETY",
    RECITATION = "RECITATION",
    OTHER = "OTHER",
    UNSPECIFIED = "FINISH_REASON_UNSPECIFIED",
}

export const dynamic = 'force-dynamic';

interface ConversationMessage {
    role: 'user' | 'model';
    content: string;
}

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
        console.error('Decrypt Error: Invalid encrypted data format (lengths). IV_LENGTH_HEX:', ivHex.length, 'AUTH_TAG_LENGTH_HEX:', authTagHex.length);
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
    console.error('Decryption failed:', error.message, error.stack);
    return null;
  }
}

// --- AI Provider Call Helpers for Summary (with token counting) ---
async function callOpenAIForSummary(apiKey: string, model: string, prompt: string): Promise<{ summary: string; inputTokens: number; outputTokens: number }> {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
    });
    const summary = completion.choices[0]?.message?.content;
    if (!summary) throw new Error('OpenAI summary response was empty.');
    if (completion.choices[0]?.finish_reason === 'length') {
        console.warn("OpenAI Summary Truncated: Reached model's maximum token limit.");
        // Potentially throw an error or return partial with a flag
    }
    return {
        summary: summary.trim(),
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
    };
}

async function callGeminiForSummary(apiKey: string, model: string, prompt: string): Promise<{ summary: string; inputTokens: number; outputTokens: number }> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const generativeModel = genAI.getGenerativeModel({ model });
    // Corrected: Added role: "user" to the contents array
    const result = await generativeModel.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5 }
    });
    const response = result.response;
    const promptFeedback = response.promptFeedback;
    const finishReason = response.candidates?.[0]?.finishReason as GeminiFinishReason | undefined;

    if (promptFeedback?.blockReason || finishReason === GeminiFinishReason.SAFETY || finishReason === GeminiFinishReason.OTHER) {
        const reason = promptFeedback?.blockReason || finishReason || 'Unknown Safety/Block Reason';
        throw new Error(`Gemini summary blocked due to ${reason}.`);
    }
    const summary = response.text();
    if (summary === undefined || summary === null || summary.trim() === "") {
        if (finishReason === GeminiFinishReason.MAX_TOKENS) {
            console.warn(`Gemini Summary Truncated (Model Limit): Resulted in empty text.`);
            return { summary: "", inputTokens: response.usageMetadata?.promptTokenCount ?? 0, outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0 };
        }
        throw new Error(`Gemini returned an empty summary (Finish Reason: ${finishReason || 'Unknown'}).`);
    }
     if (finishReason === GeminiFinishReason.MAX_TOKENS) {
        console.warn(`Gemini Summary Truncated (Model Limit): Returning partial text.`);
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
        max_tokens: 1024, // Example, adjust as needed
    });
    let summary = '';
    if (response.content && response.content.length > 0 && response.content[0].type === 'text') {
        summary = response.content[0].text;
    } else {
        if (response.stop_reason === 'max_tokens') throw new Error('Anthropic summary truncated due to max token limit.');
        else if (response.stop_reason) throw new Error(`Anthropic response stopped unexpectedly. Reason: ${response.stop_reason}`);
        throw new Error('Anthropic response was empty or in an unexpected format.');
    }
    if (summary.trim() === "") throw new Error('Anthropic response was empty.');
     if (response.stop_reason === 'max_tokens') {
         console.warn(`Anthropic Summary Truncated: Reached model's maximum token limit.`);
    }
    return {
        summary: summary.trim(),
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
    };
}
// --- End AI Provider Call Helpers ---

export async function POST(request: NextRequest) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) { return cookieStore.get(name)?.value; },
                set(name: string, value: string, options: CookieOptions) { try { cookieStore.set({ name, value, ...options }); } catch (error) { /* Ignore */ } },
                remove(name: string, options: CookieOptions) { try { cookieStore.set({ name, value: '', ...options }); } catch (error) { /* Ignore */ } },
            },
        }
    );

    const encryptionKey = process.env.API_KEY_ENCRYPTION_KEY;
    if (!encryptionKey || encryptionKey.length !== 64) {
        console.error('Call Summary Error: API_KEY_ENCRYPTION_KEY missing or invalid.');
        return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }

    try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;

        let payload: CallSummaryPayload;
        try {
            payload = await request.json();
        } catch (e) {
            return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
        }

        const { initialPrompt, slotResponses, interactionId, latestUserPrompt, previousSummary } = payload;
        const isInitialSummary = !!initialPrompt && !interactionId && !latestUserPrompt && (previousSummary === undefined || previousSummary === null); // Ensure previousSummary is not set for initial
        const isUpdateSummary = !!interactionId && !!latestUserPrompt && typeof previousSummary === 'string' && !initialPrompt;

        if (!Array.isArray(slotResponses) || slotResponses.length === 0) {
             return NextResponse.json({ error: 'Missing slot responses.' }, { status: 400 });
        }
        if (!isInitialSummary && !isUpdateSummary) {
            console.error("Call Summary Error: Invalid payload combination.", payload);
            return NextResponse.json({ error: 'Invalid payload. Provide either initialPrompt OR (interactionId, latestUserPrompt, previousSummary).' }, { status: 400 });
        }

        const { data: settings, error: settingsError } = await supabase
            .from('user_settings')
            .select('summary_model, gemini_api_key_encrypted, openai_api_key_encrypted, anthropic_api_key_encrypted')
            .eq('user_id', userId)
            .single();

        if (settingsError || !settings) {
            console.error(`Call Summary Error: Failed to fetch settings for user ${userId}:`, settingsError);
            return NextResponse.json({ error: 'Could not retrieve user settings.' }, { status: 500 });
        }

        const summaryModelString = settings.summary_model;
        if (!summaryModelString || !summaryModelString.includes(': ')) {
            return NextResponse.json({ error: 'Summary model not configured or invalid format.' }, { status: 400 });
        }

        const [provider, specificModel] = summaryModelString.split(': ');
        let apiKey: string | null = null;
        let apiKeyEncrypted: string | null = null;

        if (provider === 'ChatGPT') apiKeyEncrypted = settings.openai_api_key_encrypted;
        else if (provider === 'Gemini') apiKeyEncrypted = settings.gemini_api_key_encrypted;
        else if (provider === 'Anthropic') apiKeyEncrypted = settings.anthropic_api_key_encrypted;
        else return NextResponse.json({ error: `Unsupported summary provider: ${provider}` }, { status: 400 });

        if (!apiKeyEncrypted) return NextResponse.json({ error: `API key for ${provider} not found in settings.` }, { status: 400 });
        apiKey = decryptData(apiKeyEncrypted, encryptionKey);
        if (!apiKey) {
            console.error(`Call Summary Error: Failed to decrypt ${provider} API key for user ${userId}.`);
            return NextResponse.json({ error: 'Failed to decrypt API key.' }, { status: 500 });
        }

        let summaryPrompt = '';
        if (isInitialSummary) {
            summaryPrompt = `Please provide an unbiased, aggregated summary based *only* on the following AI responses to the user's initial prompt.\n\nUser's Initial Prompt: "${initialPrompt}"\n\nAI Responses:\n`;
            slotResponses.forEach((slot, index) => {
                summaryPrompt += `--- Response ${index + 1} (${slot.modelName}) ---\n${slot.response ? slot.response.substring(0, 1500) + (slot.response.length > 1500 ? '...' : '') : (slot.error || '(No response received)')}\n---\n\n`;
            });
            summaryPrompt += `Generate a concise, neutral summary combining the key information from these initial responses. Focus on presenting the aggregated facts or points without adding interpretation or bias.`;
        } else { // isUpdateSummary
            summaryPrompt = `Here is the existing summary of the conversation so far:\n\n--- Existing Summary ---\n${previousSummary || '(No previous summary provided)'}\n---\n\n`;
            summaryPrompt += `The latest interaction involved this user prompt:\n"${latestUserPrompt}"\n\nHere are the AI responses to that latest prompt:\n`;
            slotResponses.forEach((slot, index) => {
                summaryPrompt += `--- Response ${index + 1} (${slot.modelName}) ---\n${slot.response ? slot.response.substring(0, 1500) + (slot.response.length > 1500 ? '...' : '') : (slot.error || '(No response received)')}\n---\n\n`;
            });
            summaryPrompt += `Please update the existing summary by incorporating the key information from the latest user prompt and AI responses. Maintain a neutral tone and focus on aggregated facts. If the new information contradicts or significantly changes previous points, revise the summary accordingly. Output *only* the new, complete, updated summary.`;
        }

        let summaryResult = '';
        let inputTokens = 0;
        let outputTokens = 0;

        try {
            console.log(`Calling ${provider} model ${specificModel} for ${isInitialSummary ? 'initial' : 'updated'} summary...`);
            let aiResponse;
            if (provider === 'ChatGPT') aiResponse = await callOpenAIForSummary(apiKey, specificModel, summaryPrompt);
            else if (provider === 'Gemini') aiResponse = await callGeminiForSummary(apiKey, specificModel, summaryPrompt);
            else if (provider === 'Anthropic') aiResponse = await callAnthropicForSummary(apiKey, specificModel, summaryPrompt);
            else throw new Error(`Unsupported provider for summary: ${provider}`);

            summaryResult = aiResponse.summary;
            inputTokens = aiResponse.inputTokens;
            outputTokens = aiResponse.outputTokens;

            console.log(`Call Summary: Successfully generated ${isInitialSummary ? 'initial' : 'updated'} summary using ${summaryModelString}. Input: ${inputTokens}, Output: ${outputTokens}`);

            const tokenLogResult = await recordTokenUsage(
                supabase,
                userId,
                provider,
                specificModel,
                inputTokens,
                outputTokens,
                interactionId,
                null // Slot number is not applicable for summary call
            );
            if (!tokenLogResult.success) {
                console.warn(`Call Summary: Token usage logging for summary call failed. User: ${userId}, Model: ${specificModel}. Error: ${tokenLogResult.error}`);
            }

        } catch (aiError: any) {
            console.error(`Call Summary Error: AI API call failed for ${summaryModelString}:`, aiError);
            return NextResponse.json({ error: `Failed to generate summary: ${aiError.message}` }, { status: 502 });
        }

        return NextResponse.json({ summary: summaryResult, inputTokens, outputTokens }, { status: 200 });

    } catch (error: any) {
        console.error('Unexpected error in call-summary route:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
