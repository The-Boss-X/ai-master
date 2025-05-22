// app/api/call-gemini/route.ts
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Content, FinishReason } from '@google/generative-ai';
import crypto from 'crypto';
import { recordTokenUsage } from '../../../lib/tokenUtils'; // Adjusted path

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

interface UserGeminiSettings {
    gemini_api_key_encrypted: string | null;
}

export const dynamic = 'force-dynamic';

// --- Decryption Helper (ensure this is consistent) ---
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
    const { prompt, model, slotNumber, conversationHistory, interactionId } = payload;

    if (!prompt || !model || !slotNumber) {
      return NextResponse.json({ error: 'Missing required fields (prompt, model, slotNumber).' }, { status: 400 });
    }
    
    const { data: settingsData, error: fetchError } = await supabase
        .from('user_settings')
        .select('gemini_api_key_encrypted')
        .eq('user_id', userId)
        .single();
    const settings = settingsData as UserGeminiSettings | null;

     if (fetchError) {
        if (fetchError?.code === 'PGRST116') {
            console.warn(`Call Gemini: No settings found for user ${userId}.`);
            return NextResponse.json({ error: 'Gemini API Key not configured. Please add it in Settings.' }, { status: 400 });
        }
        console.error(`Call Gemini: Database error fetching API key for user ${userId}:`, fetchError);
        return NextResponse.json({ error: 'Database error fetching API Key.' }, { status: 500 });
    }
     if (!settings) {
        console.warn(`Call Gemini: Settings object null for user ${userId}.`);
        return NextResponse.json({ error: 'Gemini API Key not configured. Please add it in Settings.' }, { status: 400 });
    }
     if (!settings.gemini_api_key_encrypted) {
        console.warn(`Call Gemini: Gemini API Key is missing or null for user ${userId}.`);
        return NextResponse.json({ error: 'Gemini API Key is missing. Please add it in Settings.' }, { status: 400 });
    }
     const decryptedApiKey = decryptData(settings.gemini_api_key_encrypted, encryptionKey);
     if (!decryptedApiKey) {
        console.error(`Call Gemini: Failed to decrypt Gemini API key for user ${userId}.`);
        return NextResponse.json({ error: 'Could not authenticate with Gemini. Check API Key in Settings.' }, { status: 400 });
    }

    const historyForStartChat: Content[] = (conversationHistory || [])
        .slice(0, -1) 
        .filter(msg => msg.content?.trim())
        .map(msg => ({
            role: msg.role, // 'user' or 'model'
            parts: [{ text: msg.content }]
        }));

    try {
      const genAI = new GoogleGenerativeAI(decryptedApiKey);
      const generativeModel = genAI.getGenerativeModel({ model: model });
      const chat = generativeModel.startChat({ history: historyForStartChat });

      console.log(`Calling Google AI model ${model} for user ${userId} (Slot ${slotNumber}) with history length ${historyForStartChat.length}`);
      const result = await chat.sendMessage(prompt);
      const response = result.response;

      const promptFeedback = response.promptFeedback;
      const finishReason = response.candidates?.[0]?.finishReason;

      if (promptFeedback?.blockReason || finishReason === FinishReason.SAFETY || finishReason === FinishReason.OTHER) {
          const reason = promptFeedback?.blockReason || finishReason || 'Unknown Safety/Block Reason';
          console.warn(`Call Gemini: Response blocked. Reason: ${reason}. User: ${userId}, Model: ${model}`);
          return NextResponse.json({ error: `Gemini response blocked due to ${reason}. Please revise your prompt.` }, { status: 400 });
      }

      const responseText = response.text();
      if (responseText === undefined || responseText === null || responseText.trim() === "") {
          const reason = finishReason || 'Unknown';
          console.warn(`Call Gemini: Response empty. Finish Reason: ${reason}. User: ${userId}, Model: ${model}`);
          return NextResponse.json({ error: `Gemini returned an empty response (Finish Reason: ${reason}).` }, { status: 500 });
      }

      const inputTokens = result.response.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = result.response.usageMetadata?.candidatesTokenCount ?? 0;
      
      const tokenLogResult = await recordTokenUsage(
        supabase,
        userId,
        'Gemini',
        model,
        inputTokens,
        outputTokens,
        interactionId,
        slotNumber
      );
      if (!tokenLogResult.success) {
        console.warn(`Call Gemini: Token usage logging failed for user ${userId}, model ${model}. Error: ${tokenLogResult.error}`);
      }
      
      return NextResponse.json({ 
        response: responseText.trim(),
        inputTokens,
        outputTokens
      }, { status: 200 });

    } catch (apiError: any) {
      console.error(`Call Gemini: Google AI API Error (Model: ${model}, User: ${userId}, Slot: ${slotNumber}):`, apiError);
      let errorMessage = 'Failed to get response from Google AI.'; let errorStatus = 500;
      if (apiError.status && typeof apiError.status === 'number') errorStatus = apiError.status;
      if (apiError.message) errorMessage = apiError.message;
      // Add more specific error parsing if needed based on Google AI SDK error structure
      return NextResponse.json({ error: errorMessage }, { status: errorStatus });
    }

  } catch (error: any) {
    console.error('Call Gemini: Unexpected error:', error);
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON payload received.' }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
