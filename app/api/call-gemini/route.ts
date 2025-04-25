/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/call-gemini/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// Import the Google AI SDK types
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Content } from '@google/generative-ai';
import crypto from 'crypto';

// Define structure for a single message in the history (matches client)
interface ConversationMessage {
    role: 'user' | 'model';
    content: string;
}

// Define expected request body structure
interface CallGeminiRequest {
  prompt: string; // Latest user prompt
  model: string;
  slotNumber: 1 | 2 | 3;
  conversationHistory?: ConversationMessage[]; // History *including* the latest user prompt
}

// Explicitly type the expected shape of the settings object fetched from Supabase
interface UserSettingsKeys {
    slot_1_api_key_encrypted: string | null;
    slot_2_api_key_encrypted: string | null;
    slot_3_api_key_encrypted: string | null;
}

export const dynamic = 'force-dynamic';

// --- Decryption Helper ---
const algorithm = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
function decryptData(encryptedTextHex: string, secretKeyHex: string): string | null {
  try {
    if (!encryptedTextHex) return null;
    if (secretKeyHex.length !== 64) throw new Error('Decryption key must be 64 hex chars.');
    const key = Buffer.from(secretKeyHex, 'hex');
    const ivHex = encryptedTextHex.slice(0, IV_LENGTH * 2);
    const authTagHex = encryptedTextHex.slice(IV_LENGTH * 2, (IV_LENGTH + AUTH_TAG_LENGTH) * 2);
    const encryptedDataHex = encryptedTextHex.slice((IV_LENGTH + AUTH_TAG_LENGTH) * 2);
    if (ivHex.length !== IV_LENGTH * 2 || authTagHex.length !== AUTH_TAG_LENGTH * 2 || !encryptedDataHex) throw new Error('Invalid encrypted data format.');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedDataHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) { console.error('Decryption failed:', error); return null; }
}
// --- End Decryption Helper ---

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }); },
        remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }); },
      },
    }
  );

  const encryptionKey = process.env.API_KEY_ENCRYPTION_KEY;
  if (!encryptionKey || encryptionKey.length !== 64) {
      console.error('Call Gemini Error: API_KEY_ENCRYPTION_KEY environment variable is missing or invalid.');
      return NextResponse.json({ error: 'Server configuration error: Unable to process request securely.' }, { status: 500 });
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    let payload: CallGeminiRequest;
    try { payload = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
    // Destructure the prompt (latest message) and the full history received from client
    const { prompt, model, slotNumber, conversationHistory } = payload;

    if (!prompt || !model || !slotNumber || ![1, 2, 3].includes(slotNumber)) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    // Fetch and decrypt API Key
    const apiKeyColumn = `slot_${slotNumber}_api_key_encrypted` as const;
    const { data: settingsData, error: fetchError } = await supabase.from('user_settings').select(apiKeyColumn).eq('user_id', userId).single();
    const settings = settingsData as UserSettingsKeys | null;

    if (fetchError || !settings) { /* ... error handling ... */ return NextResponse.json({ error: `API Key for Slot ${slotNumber} not configured.` }, { status: 400 }); }
    const encryptedApiKey = settings[apiKeyColumn];
    if (!encryptedApiKey) return NextResponse.json({ error: `API Key for Slot ${slotNumber} is missing.` }, { status: 400 });
    const decryptedApiKey = decryptData(encryptedApiKey, encryptionKey);
    if (!decryptedApiKey) return NextResponse.json({ error: 'Could not authenticate with AI service. Check API Key in Settings.' }, { status: 400 });


    // --- Prepare history for Google AI SDK ---
    // The history received from the client *includes* the latest user prompt.
    // We need to remove the last message before passing it to startChat,
    // as sendMessage will handle the latest prompt.
    const historyForStartChat = (conversationHistory || [])
        .slice(0, -1) // Remove the last element (which is the latest user prompt)
        .filter(msg => msg.content?.trim()) // Filter out empty messages
        .map(msg => ({ // Map to the required { role, parts } structure
            role: msg.role,
            parts: [{ text: msg.content }]
        }));
    // --- End Prepare history ---


    // Call Google AI API
    try {
      const genAI = new GoogleGenerativeAI(decryptedApiKey);
      const generativeModel = genAI.getGenerativeModel({ model: model /* safetySettings: [...] */ });

      // Start chat session with the history *excluding* the latest prompt
      const chat = generativeModel.startChat({
          history: historyForStartChat,
          // generationConfig: { maxOutputTokens: 100 }, // Optional config
      });

      console.log(`Calling Google AI model ${model} for user ${userId}, slot ${slotNumber} with history length ${historyForStartChat.length}`);
      // Send ONLY the latest prompt using sendMessage
      const result = await chat.sendMessage(prompt);
      const response = result.response;
      const responseText = response.text();

      if (responseText === undefined || responseText === null || responseText.trim() === "") {
          const blockReason = response.promptFeedback?.blockReason;
          console.warn(`Call Gemini: Response empty or blocked. Reason: ${blockReason || 'None Provided'}.`);
          if (blockReason) throw new Error(`Gemini response blocked due to ${blockReason}.`);
          else throw new Error('Gemini response was empty.');
      }

      return NextResponse.json({ response: responseText.trim() }, { status: 200 });

    } catch (apiError: any) {
      // ... (Same detailed Gemini error handling as before) ...
      console.error(`Call Gemini: Google AI API Error (Model: ${model}, User: ${userId}, Slot: ${slotNumber}):`, apiError);
      const errorMessage = 'Failed to get response from Google AI.'; let errorStatus = 500;
      if (apiError.message) { /* ... error mapping ... */ }
      if (apiError.status) { errorStatus = apiError.status; }
      return NextResponse.json({ error: errorMessage }, { status: errorStatus });
    }

  } catch (error: any) {
    console.error('Call Gemini: Unexpected error:', error);
     if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON payload received.' }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
