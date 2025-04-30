/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/call-summary/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto'; // Import Node.js crypto module for decryption

// Define expected FinishReason values (if not importable)
enum FinishReason {
    STOP = "STOP",
    MAX_TOKENS = "MAX_TOKENS",
    SAFETY = "SAFETY",
    RECITATION = "RECITATION",
    OTHER = "OTHER",
    UNSPECIFIED = "FINISH_REASON_UNSPECIFIED",
}

// Ensure this route is always dynamic
export const dynamic = 'force-dynamic';

// Structure for a single message (mirrors frontend/type definition)
interface ConversationMessage {
    role: 'user' | 'model';
    content: string;
}

// --- MODIFIED: Expected request body structure ---
interface CallSummaryPayload {
    // For initial summary:
    initialPrompt?: string; // The very first user prompt of the chat

    // For updating summary:
    interactionId?: string; // ID of the chat being updated
    latestUserPrompt?: string; // The most recent user prompt that got new responses
    previousSummary?: string | null; // The existing summary text

    // Always required:
    slotResponses: { // Array of responses from the active slots for the *latest* turn
        modelName: string;
        response: string | null;
        error?: string | null;
    }[];
}
// --- End MODIFIED Structure ---

// --- Decryption Helper ---
const algorithm = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function decryptData(encryptedTextHex: string, secretKeyHex: string): string | null {
    try {
        if (!encryptedTextHex) return null;
        if (secretKeyHex.length !== 64) {
            throw new Error('Decryption key must be a 64-character hex string (32 bytes).');
        }
        const key = Buffer.from(secretKeyHex, 'hex');
        const dataBuffer = Buffer.from(encryptedTextHex, 'hex');

        if (dataBuffer.length < IV_LENGTH + AUTH_TAG_LENGTH) {
            throw new Error('Invalid encrypted data format: too short.');
        }

        const iv = dataBuffer.subarray(0, IV_LENGTH);
        const authTag = dataBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const encryptedData = dataBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedData.toString('hex'), 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error('Decryption failed:', error);
        return null; // Return null on decryption error
    }
}
// --- End Decryption Helper ---

// --- AI Provider Call Helpers (Keep previous versions without max_tokens) ---
async function callOpenAIForSummary(apiKey: string, model: string, prompt: string): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5,
        }),
    });
    const data = await response.json();
    if (!response.ok || !data.choices?.[0]?.message?.content) {
        console.error("OpenAI Summary Error:", data);
        const errorMsg = data.error?.message || `OpenAI API Error (${response.status})`;
        if (errorMsg.includes('context_length_exceeded')) {
             throw new Error('OpenAI Error: Input prompt is too long for the selected model.');
        }
        if (data.choices?.[0]?.finish_reason === 'length') {
             console.warn("OpenAI Summary Truncated: Reached model's maximum token limit.");
             throw new Error("OpenAI summary truncated: Maximum output length reached.");
        }
        throw new Error(errorMsg);
    }
    if (data.choices?.[0]?.finish_reason === 'length') {
        console.warn("OpenAI Summary Truncated (reported on success): Reached model's maximum token limit.");
        throw new Error("OpenAI summary truncated: Maximum output length reached.");
    }
    return data.choices[0].message.content.trim();
}

async function callGeminiForSummary(apiKey: string, model: string, prompt: string): Promise<string> {
    const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                 temperature: 0.5,
             }
        }),
    });
    const data = await response.json();
    if (!response.ok) {
        console.error("Gemini Summary HTTP Error:", response.status, data);
        throw new Error(data?.error?.message || `Gemini API HTTP Error (${response.status})`);
    }
    const candidate = data.candidates?.[0];
    const finishReason = candidate?.finishReason as FinishReason | undefined;
    const responseText = candidate?.content?.parts?.[0]?.text;
    const safetyRatings = candidate?.safetyRatings;
    if (finishReason === FinishReason.SAFETY || finishReason === FinishReason.OTHER) {
        console.warn(`Gemini Summary Blocked: Reason: ${finishReason}`, safetyRatings);
        throw new Error(`Gemini summary blocked due to ${finishReason}.`);
    }
    if (!responseText || responseText.trim() === "") {
        if (finishReason === FinishReason.MAX_TOKENS) {
             console.warn(`Gemini Summary Truncated (Model Limit): Resulted in empty text.`);
             return "";
        }
        console.error("Gemini Summary Error: Response text is empty.", data);
        throw new Error(`Gemini returned an empty summary (Finish Reason: ${finishReason || 'Unknown'}).`);
    }
    if (finishReason === FinishReason.MAX_TOKENS) {
        console.warn(`Gemini Summary Truncated (Model Limit): Returning partial text.`);
    }
    return responseText.trim();
}

async function callAnthropicForSummary(apiKey: string, model: string, prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5,
        }),
    });
    const data = await response.json();
    const stopReason = data.stop_reason;
    if (!response.ok || !data.content?.[0]?.text) {
        console.error("Anthropic Summary Error:", data);
        const errorMsg = data.error?.message || `Anthropic API Error (${response.status})`;
        if (stopReason === 'max_tokens') {
             throw new Error('Anthropic summary truncated: Maximum output length reached.');
        }
        throw new Error(errorMsg);
    }
    if (stopReason === 'max_tokens') {
         console.warn(`Anthropic Summary Truncated: Reached model's maximum token limit.`);
    }
    return data.content[0].text.trim();
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

        // --- MODIFIED: Validate payload based on initial vs update ---
        const { initialPrompt, slotResponses, interactionId, latestUserPrompt, previousSummary } = payload;
        const isInitialSummary = !!initialPrompt && !interactionId && !latestUserPrompt && !previousSummary;
        const isUpdateSummary = !!interactionId && !!latestUserPrompt && typeof previousSummary === 'string' && !initialPrompt; // previousSummary can be empty string

        if (!Array.isArray(slotResponses) || slotResponses.length === 0) {
             return NextResponse.json({ error: 'Missing slot responses.' }, { status: 400 });
        }

        if (!isInitialSummary && !isUpdateSummary) {
            console.error("Call Summary Error: Invalid payload combination.", payload);
            return NextResponse.json({ error: 'Invalid payload. Provide either initialPrompt OR (interactionId, latestUserPrompt, previousSummary).' }, { status: 400 });
        }
        // --- End MODIFIED Validation ---

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

        if (provider === 'ChatGPT') {
            apiKeyEncrypted = settings.openai_api_key_encrypted;
        } else if (provider === 'Gemini') {
            apiKeyEncrypted = settings.gemini_api_key_encrypted;
        } else if (provider === 'Anthropic') {
            apiKeyEncrypted = settings.anthropic_api_key_encrypted;
        } else {
            return NextResponse.json({ error: `Unsupported summary provider: ${provider}` }, { status: 400 });
        }

        if (!apiKeyEncrypted) {
            return NextResponse.json({ error: `API key for ${provider} not found in settings.` }, { status: 400 });
        }

        apiKey = decryptData(apiKeyEncrypted, encryptionKey);
        if (!apiKey) {
            console.error(`Call Summary Error: Failed to decrypt ${provider} API key for user ${userId}.`);
            return NextResponse.json({ error: 'Failed to decrypt API key.' }, { status: 500 });
        }

        // --- MODIFIED: Construct the prompt differently ---
        let summaryPrompt = '';
        if (isInitialSummary) {
            summaryPrompt = `Please provide an unbiased, aggregated summary based *only* on the following AI responses to the user's initial prompt.\n\n`;
            summaryPrompt += `User's Initial Prompt: "${initialPrompt}"\n\n`;
            summaryPrompt += `AI Responses:\n`;
            slotResponses.forEach((slot, index) => {
                summaryPrompt += `--- Response ${index + 1} (${slot.modelName}) ---\n`;
                if (slot.response) {
                    summaryPrompt += `${slot.response.substring(0, 1500)}${slot.response.length > 1500 ? '...' : ''}\n`;
                } else if (slot.error) {
                    summaryPrompt += `Error: ${slot.error}\n`;
                } else {
                    summaryPrompt += `(No response or error received)\n`;
                }
                summaryPrompt += `---\n\n`;
            });
            summaryPrompt += `Generate a concise, neutral summary combining the key information from these initial responses. Focus on presenting the aggregated facts or points without adding interpretation or bias.`;
        } else { // isUpdateSummary
            summaryPrompt = `Here is the existing summary of the conversation so far:\n\n`;
            summaryPrompt += `--- Existing Summary ---\n${previousSummary || '(No previous summary provided)'}\n---\n\n`;
            summaryPrompt += `The latest interaction involved this user prompt:\n"${latestUserPrompt}"\n\n`;
            summaryPrompt += `Here are the AI responses to that latest prompt:\n`;
            slotResponses.forEach((slot, index) => {
                summaryPrompt += `--- Response ${index + 1} (${slot.modelName}) ---\n`;
                if (slot.response) {
                    summaryPrompt += `${slot.response.substring(0, 1500)}${slot.response.length > 1500 ? '...' : ''}\n`;
                } else if (slot.error) {
                    summaryPrompt += `Error: ${slot.error}\n`;
                } else {
                    summaryPrompt += `(No response or error received)\n`;
                }
                summaryPrompt += `---\n\n`;
            });
            summaryPrompt += `Please update the existing summary by incorporating the key information from the latest user prompt and AI responses. Maintain a neutral tone and focus on aggregated facts. If the new information contradicts or significantly changes previous points, revise the summary accordingly. Output *only* the new, complete, updated summary.`;
        }
        // --- End MODIFIED Prompt Construction ---

        let summaryResult = '';
        try {
            console.log(`Calling ${provider} model ${specificModel} for ${isInitialSummary ? 'initial' : 'updated'} summary...`);
            if (provider === 'ChatGPT') {
                summaryResult = await callOpenAIForSummary(apiKey, specificModel, summaryPrompt);
            } else if (provider === 'Gemini') {
                summaryResult = await callGeminiForSummary(apiKey, specificModel, summaryPrompt);
            } else if (provider === 'Anthropic') {
                summaryResult = await callAnthropicForSummary(apiKey, specificModel, summaryPrompt);
            }
            console.log(`Call Summary: Successfully generated ${isInitialSummary ? 'initial' : 'updated'} summary using ${summaryModelString}.`);
        } catch (aiError: any) {
            console.error(`Call Summary Error: AI API call failed for ${summaryModelString}:`, aiError);
            return NextResponse.json({ error: `Failed to generate summary: ${aiError.message}` }, { status: 502 });
        }

        return NextResponse.json({ summary: summaryResult }, { status: 200 });

    } catch (error: any) {
        console.error('Unexpected error in call-summary route:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
