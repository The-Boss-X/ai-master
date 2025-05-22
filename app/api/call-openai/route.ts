// app/api/call-openai/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import OpenAI from 'openai';
import crypto from 'crypto';
import { recordTokenUsage } from '../../../lib/tokenUtils'; // Adjusted path

// Define structure for a single message in the history
interface ConversationMessage {
    role: 'user' | 'assistant' | 'system' | 'model'; // Allow 'model' from client state
    content: string;
}

// Define expected request body structure (including history)
interface CallOpenAIRequest {
  prompt: string; // The latest user prompt
  model: string; // Specific OpenAI model name (e.g., 'gpt-4o')
  slotNumber: 1 | 2 | 3 | 4 | 5 | 6; // Updated to 6 slots
  conversationHistory?: ConversationMessage[]; // Optional: History sent from client
  interactionId?: string | null; // Added to link token usage to an interaction
}

// Explicitly type the expected shape of the relevant settings object fetched from Supabase
interface UserOpenAISettings {
    openai_api_key_encrypted: string | null;
}


export const dynamic = 'force-dynamic';

// --- Decryption Helper ---
const algorithm = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
function decryptData(encryptedTextHex: string, secretKeyHex: string): string | null {
  try {
    if (!encryptedTextHex) return null;
    if (secretKeyHex.length !== 64) throw new Error('Decryption key must be a 64-character hex string (32 bytes).');
    const key = Buffer.from(secretKeyHex, 'hex');
    
    // Extract IV, AuthTag, and EncryptedData from the combined hex string
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
    decipher.setAuthTag(authTag); // Set the authentication tag

    let decrypted = decipher.update(encryptedDataHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error: any) { 
    console.error('Decryption failed:', error.message, error.stack); 
    return null; 
  }
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
    const { prompt, model, slotNumber, conversationHistory, interactionId } = payload;

    if (!prompt || !model || !slotNumber) {
      return NextResponse.json({ error: 'Missing required fields (prompt, model, slotNumber).' }, { status: 400 });
    }

    const { data: settingsData, error: fetchError } = await supabase
        .from('user_settings')
        .select('openai_api_key_encrypted')
        .eq('user_id', userId)
        .single();
    const settings = settingsData as UserOpenAISettings | null;

    if (fetchError) {
        if (fetchError?.code === 'PGRST116') {
            console.warn(`Call OpenAI: No settings found for user ${userId}.`);
            return NextResponse.json({ error: 'OpenAI API Key not configured in Settings.' }, { status: 400 });
        }
        console.error(`Call OpenAI: Database error fetching API key for user ${userId}:`, fetchError);
        return NextResponse.json({ error: 'Database error fetching API Key.' }, { status: 500 });
    }
     if (!settings) {
        console.warn(`Call OpenAI: Settings object null for user ${userId}.`);
        return NextResponse.json({ error: 'OpenAI API Key not configured in Settings.' }, { status: 400 });
    }
    if (!settings.openai_api_key_encrypted) {
        console.warn(`Call OpenAI: OpenAI API Key is missing or null for user ${userId}.`);
        return NextResponse.json({ error: 'OpenAI API Key is missing in Settings.' }, { status: 400 });
    }

    const decryptedApiKey = decryptData(settings.openai_api_key_encrypted, encryptionKey);
    if (!decryptedApiKey) {
        console.error(`Call OpenAI: Failed to decrypt OpenAI API key for user ${userId}.`);
        return NextResponse.json({ error: 'Could not authenticate with AI service. Check API Key in Settings.' }, { status: 400 });
    }

    const messagesForApi: OpenAI.Chat.ChatCompletionMessageParam[] = (conversationHistory || [])
        .filter(msg => msg.content?.trim())
        .map(msg => ({
            role: (msg.role === 'model' ? 'assistant' : msg.role) as 'user' | 'assistant' | 'system',
            content: msg.content
        }));

     if (messagesForApi.length === 0 || messagesForApi[messagesForApi.length - 1].role !== 'user' || messagesForApi[messagesForApi.length - 1].content !== prompt) {
         if(!(messagesForApi[messagesForApi.length - 1]?.role === 'user' && messagesForApi[messagesForApi.length - 1]?.content === prompt)) {
            messagesForApi.push({ role: 'user', content: prompt });
         }
    }

    const openai = new OpenAI({ apiKey: decryptedApiKey });
    try {
      console.log(`Calling OpenAI model ${model} for user ${userId} (Slot ${slotNumber}) with history length ${messagesForApi.length}`);
      const completion = await openai.chat.completions.create({
        model: model,
        messages: messagesForApi,
      });
      const responseText = completion.choices[0]?.message?.content;
      if (!responseText) throw new Error('No response text received from OpenAI.');

      const inputTokens = completion.usage?.prompt_tokens ?? 0;
      const outputTokens = completion.usage?.completion_tokens ?? 0;
      
      // Log token usage
      const tokenLogResult = await recordTokenUsage(
        supabase,
        userId,
        'OpenAI',
        model,
        inputTokens,
        outputTokens,
        interactionId,
        slotNumber
      );
      if (!tokenLogResult.success) {
        console.warn(`Call OpenAI: Token usage logging failed for user ${userId}, model ${model}. Error: ${tokenLogResult.error}`);
        // Decide if you want to return an error to the client or just log it
      }

      return NextResponse.json({ 
        response: responseText.trim(),
        inputTokens,
        outputTokens 
      }, { status: 200 });

    } catch (apiError: any) {
        console.error(`Call OpenAI: OpenAI API Error (Model: ${model}, User: ${userId}, Slot: ${slotNumber}):`, apiError);
        let errorMessage = 'Failed to get response from OpenAI.'; let errorStatus = 500;
        if (apiError instanceof OpenAI.APIError) {
            errorMessage = apiError.message || errorMessage;
            errorStatus = apiError.status || errorStatus;
            if (apiError.status === 401) errorMessage = "Invalid OpenAI API Key provided. Please check your key in Settings.";
            else if (apiError.status === 429) errorMessage = "OpenAI rate limit exceeded or quota reached. Please check your usage or try again later.";
            else if (apiError.code === 'model_not_found') { errorMessage = `OpenAI model '${model}' not found or unavailable.`; errorStatus = 400; }
            else if (apiError.status === 400) {
                 errorMessage = `OpenAI request failed (Bad Request): ${apiError.message || 'Check request format/parameters.'}`;
            }
        } else if (apiError.message) { errorMessage = apiError.message; }
        return NextResponse.json({ error: errorMessage }, { status: errorStatus });
    }
  } catch (error: any) {
    console.error('Call OpenAI: Unexpected error:', error);
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON payload received.' }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
