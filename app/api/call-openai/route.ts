/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/call-openai/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import OpenAI from 'openai';
import crypto from 'crypto';

// Define structure for a single message in the history
interface ConversationMessage {
    role: 'user' | 'assistant' | 'system' | 'model'; // Allow 'model' from client state
    content: string;
}

// Define expected request body structure (including history)
interface CallOpenAIRequest {
  prompt: string; // The latest user prompt
  model: string;
  slotNumber: 1 | 2 | 3;
  conversationHistory?: ConversationMessage[]; // Optional: History sent from client
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
      console.error('Call OpenAI Error: API_KEY_ENCRYPTION_KEY environment variable is missing or invalid.');
      return NextResponse.json({ error: 'Server configuration error: Unable to process request securely.' }, { status: 500 });
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    let payload: CallOpenAIRequest;
    try { payload = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
    const { prompt, model, slotNumber, conversationHistory } = payload;

    if (!prompt || !model || !slotNumber || ![1, 2, 3].includes(slotNumber)) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    // Fetch and decrypt API Key
    const apiKeyColumn = `slot_${slotNumber}_api_key_encrypted` as const;
    const { data: settingsData, error: fetchError } = await supabase.from('user_settings').select(apiKeyColumn).eq('user_id', userId).single();
    const settings = settingsData as UserSettingsKeys | null; // Cast fetched data

    if (fetchError || !settings) {
        if (fetchError?.code === 'PGRST116') return NextResponse.json({ error: `API Key for Slot ${slotNumber} not configured.` }, { status: 400 });
        console.error(`Call OpenAI: Error fetching API key for user ${userId}, slot ${slotNumber}:`, fetchError);
        return NextResponse.json({ error: `Database error fetching API Key for Slot ${slotNumber}.` }, { status: 500 });
    }
    const encryptedApiKey = settings[apiKeyColumn];
    if (!encryptedApiKey) return NextResponse.json({ error: `API Key for Slot ${slotNumber} is missing.` }, { status: 400 });
    const decryptedApiKey = decryptData(encryptedApiKey, encryptionKey);
    if (!decryptedApiKey) return NextResponse.json({ error: 'Could not authenticate with AI service. Check API Key in Settings.' }, { status: 400 });

    // Prepare messages for OpenAI API
    const messagesForApi: OpenAI.Chat.ChatCompletionMessageParam[] = (conversationHistory || [])
        .filter(msg => msg.content?.trim())
        .map(msg => ({
            // *** FIX: Explicitly cast the role to the expected type ***
            role: (msg.role === 'model' ? 'assistant' : msg.role) as 'user' | 'assistant' | 'system',
            content: msg.content
        }));

    // Add the current prompt as the last user message if it's not already there
     if (messagesForApi.length === 0 || messagesForApi[messagesForApi.length - 1].role !== 'user' || messagesForApi[messagesForApi.length - 1].content !== prompt) {
        // Check if last message is already the same user prompt to avoid duplicates
        if(messagesForApi[messagesForApi.length - 1]?.role !== 'user' || messagesForApi[messagesForApi.length - 1]?.content !== prompt) {
           messagesForApi.push({ role: 'user', content: prompt });
        }
    }


    // Call OpenAI API
    const openai = new OpenAI({ apiKey: decryptedApiKey });
    try {
      console.log(`Calling OpenAI model ${model} for user ${userId}, slot ${slotNumber} with history length ${messagesForApi.length}`);
      const completion = await openai.chat.completions.create({
        model: model,
        messages: messagesForApi, // Pass the prepared message history
      });
      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) throw new Error('No response text received from OpenAI.');
      return NextResponse.json({ response: responseText.trim() }, { status: 200 });
    } catch (apiError: any) {
       console.error(`Call OpenAI: OpenAI API Error (Model: ${model}, User: ${userId}, Slot: ${slotNumber}):`, apiError);
       let errorMessage = 'Failed to get response from OpenAI.'; let errorStatus = 500;
       if (apiError instanceof OpenAI.APIError) {
           errorMessage = apiError.message || errorMessage;
           errorStatus = apiError.status || errorStatus;
           if (apiError.status === 401) errorMessage = "Invalid OpenAI API Key provided. Please check your key in Settings.";
           else if (apiError.status === 429) errorMessage = "OpenAI rate limit exceeded. Please try again later.";
           else if (apiError.code === 'model_not_found') { errorMessage = `OpenAI model '${model}' not found or unavailable.`; errorStatus = 400; }
       } else if (apiError.message) { errorMessage = apiError.message; }
       return NextResponse.json({ error: errorMessage }, { status: errorStatus });
    }
  } catch (error: any) {
    console.error('Call OpenAI: Unexpected error:', error);
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON payload received.' }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
