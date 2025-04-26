/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/call-summary/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto'; // Import Node.js crypto module for decryption

// Ensure this route is always dynamic
export const dynamic = 'force-dynamic';

// Structure for a single message (mirrors frontend/type definition)
interface ConversationMessage {
    role: 'user' | 'model';
    content: string;
}

// Expected request body structure
interface CallSummaryPayload {
    initialPrompt: string;
    slotResponses: { // Array of responses from the active slots
        modelName: string;
        response: string | null; // Only the response text is needed
        error?: string | null; // Include errors for context if needed
    }[];
}

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

// --- AI Provider Call Helpers (Simplified - Adapt from your existing API routes) ---
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
            temperature: 0.5, // Adjust temperature for summary task
            max_tokens: 500, // Adjust max tokens as needed
        }),
    });
    const data = await response.json();
    if (!response.ok) {
        console.error("OpenAI Summary Error:", data);
        throw new Error(data.error?.message || `OpenAI API Error (${response.status})`);
    }
    return data.choices[0]?.message?.content?.trim() || '';
}

async function callGeminiForSummary(apiKey: string, model: string, prompt: string): Promise<string> {
     // IMPORTANT: Adjust the API endpoint based on the Gemini model version if necessary
    const apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            // Optional: Add generationConfig if needed (temperature, maxOutputTokens etc.)
             generationConfig: {
                 temperature: 0.5,
                 maxOutputTokens: 500,
             }
        }),
    });
    const data = await response.json();
     if (!response.ok || !data.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.error("Gemini Summary Error:", data);
        throw new Error(data.error?.message || `Gemini API Error (${response.status})`);
    }
    return data.candidates[0].content.parts[0].text.trim();
}

async function callAnthropicForSummary(apiKey: string, model: string, prompt: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01', // Use the appropriate API version
        },
        body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 500, // Adjust as needed
            temperature: 0.5,
        }),
    });
    const data = await response.json();
    if (!response.ok || !data.content?.[0]?.text) {
        console.error("Anthropic Summary Error:", data);
        throw new Error(data.error?.message || `Anthropic API Error (${response.status})`);
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
                set(name: string, value: string, options: CookieOptions) { try { cookieStore.set({ name, value, ...options }); } catch (error) {} },
                remove(name: string, options: CookieOptions) { try { cookieStore.set({ name, value: '', ...options }); } catch (error) {} },
            },
        }
    );

    // --- Get Encryption Key ---
    const encryptionKey = process.env.API_KEY_ENCRYPTION_KEY;
    if (!encryptionKey || encryptionKey.length !== 64) {
        console.error('Call Summary Error: API_KEY_ENCRYPTION_KEY missing or invalid.');
        return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }

    try {
        // 1. Check session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;

        // 2. Parse request body
        let payload: CallSummaryPayload;
        try {
            payload = await request.json();
        } catch (e) {
            return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
        }
        const { initialPrompt, slotResponses } = payload;
        if (!initialPrompt || !Array.isArray(slotResponses) || slotResponses.length === 0) {
            return NextResponse.json({ error: 'Missing initial prompt or slot responses.' }, { status: 400 });
        }

        // 3. Fetch user's summary model and encrypted API keys
        const { data: settings, error: settingsError } = await supabase
            .from('user_settings')
            .select('summary_model, gemini_api_key_encrypted, openai_api_key_encrypted, anthropic_api_key_encrypted')
            .eq('user_id', userId)
            .single(); // Use single as settings should exist if summary is called

        if (settingsError || !settings) {
            console.error(`Call Summary Error: Failed to fetch settings for user ${userId}:`, settingsError);
            return NextResponse.json({ error: 'Could not retrieve user settings.' }, { status: 500 });
        }

        const summaryModelString = settings.summary_model;
        if (!summaryModelString || !summaryModelString.includes(': ')) {
            return NextResponse.json({ error: 'Summary model not configured or invalid format.' }, { status: 400 });
        }

        // 4. Determine provider and decrypt necessary key
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

        // 5. Construct the prompt for the summary model
        let summaryPrompt = `Please provide an unbiased, aggregated summary based *only* on the following AI responses to the user's prompt.\n\n`;
        summaryPrompt += `User Prompt: "${initialPrompt}"\n\n`;
        summaryPrompt += `AI Responses:\n`;
        slotResponses.forEach((slot, index) => {
            summaryPrompt += `--- Response ${index + 1} (${slot.modelName}) ---\n`;
            if (slot.response) {
                summaryPrompt += `${slot.response}\n`;
            } else if (slot.error) {
                summaryPrompt += `Error: ${slot.error}\n`;
            } else {
                summaryPrompt += `(No response or error received)\n`;
            }
            summaryPrompt += `---\n\n`;
        });
        summaryPrompt += `Generate a concise, neutral summary combining the key information from these responses. Focus on presenting the aggregated facts or points without adding interpretation or bias.`;

        console.log(`Call Summary: Constructed prompt for ${summaryModelString}:\n${summaryPrompt}`);


        // 6. Call the appropriate AI provider API
        let summaryResult = '';
        try {
            if (provider === 'ChatGPT') {
                summaryResult = await callOpenAIForSummary(apiKey, specificModel, summaryPrompt);
            } else if (provider === 'Gemini') {
                summaryResult = await callGeminiForSummary(apiKey, specificModel, summaryPrompt);
            } else if (provider === 'Anthropic') {
                summaryResult = await callAnthropicForSummary(apiKey, specificModel, summaryPrompt);
            }
        } catch (aiError: any) {
            console.error(`Call Summary Error: AI API call failed for ${summaryModelString}:`, aiError);
            return NextResponse.json({ error: `Failed to generate summary: ${aiError.message}` }, { status: 502 }); // 502 Bad Gateway
        }

        // 7. Return the summary
        console.log(`Call Summary: Successfully generated summary using ${summaryModelString}.`);
        return NextResponse.json({ summary: summaryResult }, { status: 200 });

    } catch (error: any) {
        console.error('Unexpected error in call-summary route:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
