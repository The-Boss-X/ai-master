/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/call-gemini/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// Import the Google AI SDK types
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Content, FinishReason } from '@google/generative-ai'; // Added FinishReason
import crypto from 'crypto';

// Define structure for a single message in the history (matches client)
interface ConversationMessage {
    role: 'user' | 'model';
    content: string;
}

// Define expected request body structure
interface CallGeminiRequest {
  prompt: string; // Latest user prompt
  model: string; // Specific Gemini model name (e.g., 'gemini-1.5-pro')
  slotNumber: 1 | 2 | 3; // Still needed for context/logging if desired, but not for key fetching
  conversationHistory?: ConversationMessage[]; // History *including* the latest user prompt
}

// Explicitly type the expected shape of the relevant settings object fetched from Supabase
interface UserGeminiSettings {
    gemini_api_key_encrypted: string | null;
    // Add other settings if needed, but only the key is required here
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

    if (!prompt || !model || !slotNumber) { // slotNumber still useful for logging/context
      return NextResponse.json({ error: 'Missing required fields (prompt, model, slotNumber).' }, { status: 400 });
    }

    // Fetch and decrypt the centralized Gemini API Key
    const { data: settingsData, error: fetchError } = await supabase
        .from('user_settings')
        .select('gemini_api_key_encrypted') // Select the specific column
        .eq('user_id', userId)
        .single();

    // Cast fetched data to the specific type
    const settings = settingsData as UserGeminiSettings | null;

    if (fetchError) {
        if (fetchError?.code === 'PGRST116') { // Handle case where user has no settings row yet
            console.warn(`Call Gemini: No settings found for user ${userId}.`);
            // Corrected error message: Refers to the general Gemini key
            return NextResponse.json({ error: 'Gemini API Key not configured. Please add it in Settings.' }, { status: 400 });
        }
        console.error(`Call Gemini: Database error fetching API key for user ${userId}:`, fetchError);
        return NextResponse.json({ error: 'Database error fetching API Key.' }, { status: 500 });
    }

    if (!settings) { // Should be caught by PGRST116, but double-check
        console.warn(`Call Gemini: Settings object null for user ${userId} even after successful fetch.`);
        // Corrected error message
        return NextResponse.json({ error: 'Gemini API Key not configured. Please add it in Settings.' }, { status: 400 });
    }

    const encryptedApiKey = settings.gemini_api_key_encrypted;
    if (!encryptedApiKey) {
        console.warn(`Call Gemini: Gemini API Key is missing or null for user ${userId}.`);
         // Corrected error message
        return NextResponse.json({ error: 'Gemini API Key is missing. Please add it in Settings.' }, { status: 400 });
    }

    const decryptedApiKey = decryptData(encryptedApiKey, encryptionKey);
    if (!decryptedApiKey) {
        console.error(`Call Gemini: Failed to decrypt Gemini API key for user ${userId}.`);
        // This error message is okay as is, but ensures consistency
        return NextResponse.json({ error: 'Could not authenticate with Gemini. Check API Key in Settings.' }, { status: 400 });
    }
    // --- End API Key Fetch/Decrypt ---


    // --- Prepare history for Google AI SDK ---
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
      const generativeModel = genAI.getGenerativeModel({
          model: model,
          // Optional: Configure safety settings if needed
          // safetySettings: [
          //   { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          //   { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          //   { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          //   { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
          // ],
       });

      // Start chat session with the history *excluding* the latest prompt
      const chat = generativeModel.startChat({
          history: historyForStartChat,
          // generationConfig: { maxOutputTokens: 100 }, // Optional config
      });

      console.log(`Calling Google AI model ${model} for user ${userId} (via slot ${slotNumber}) with history length ${historyForStartChat.length}`);
      // Send ONLY the latest prompt using sendMessage
      const result = await chat.sendMessage(prompt);
      const response = result.response;

      // --- REVISED: Check for blocking or empty response ---
      const promptFeedback = response.promptFeedback;
      // Access finishReason safely using optional chaining
      const finishReason = response.candidates?.[0]?.finishReason;

      // Check if blocked based on promptFeedback or finishReason
      if (promptFeedback?.blockReason || finishReason === FinishReason.SAFETY || finishReason === FinishReason.OTHER) {
          const reason = promptFeedback?.blockReason || finishReason || 'Unknown Safety/Block Reason';
          console.warn(`Call Gemini: Response blocked. Reason: ${reason}. User: ${userId}, Model: ${model}`);
          // Return a specific 400 error for blocked content
          return NextResponse.json({ error: `Gemini response blocked due to ${reason}. Please revise your prompt.` }, { status: 400 });
      }

      // Get text *after* checking feedback/reason
      const responseText = response.text();

      // Check if the response text is empty, even if not explicitly blocked
      if (responseText === undefined || responseText === null || responseText.trim() === "") {
          // Check if finishReason indicates a normal stop but empty text (less likely but possible)
          const reason = finishReason || 'Unknown';
          console.warn(`Call Gemini: Response empty. Finish Reason: ${reason}. User: ${userId}, Model: ${model}`);
          // Return a specific error for empty response, maybe 500 or a custom 4xx? Let's use 500 for unexpected empty.
          return NextResponse.json({ error: `Gemini returned an empty response (Finish Reason: ${reason}).` }, { status: 500 });
      }
      // --- End REVISED Check ---

      // Success: Return the valid response text
      return NextResponse.json({ response: responseText.trim() }, { status: 200 });

    } catch (apiError: any) {
      // This catch block now primarily handles SDK/network errors, not empty/blocked responses handled above
      console.error(`Call Gemini: Google AI API Error (Model: ${model}, User: ${userId}, Slot: ${slotNumber}):`, apiError);
      let errorMessage = 'Failed to get response from Google AI.'; let errorStatus = 500;

      // Attempt to use status/message from the error object if available (more reliable for SDK errors)
      if (apiError.status && typeof apiError.status === 'number') {
          errorStatus = apiError.status;
      }
      if (apiError.message) {
          errorMessage = apiError.message;
      }

      // Fallback message parsing if needed (can refine based on observed errors)
      if (errorMessage === 'Failed to get response from Google AI.') { // Only parse if generic message is still set
          if (apiError.message?.includes('API key not valid')) {
              errorMessage = "Invalid Gemini API Key provided. Please check your key in Settings.";
              errorStatus = 401;
          } else if (apiError.message?.includes('quota')) {
              errorMessage = "Gemini API quota exceeded. Please check your usage or plan.";
              errorStatus = 429;
          } else if (apiError.message?.includes('model_not_found') || apiError.message?.includes('not found')) {
              errorMessage = `Gemini model '${model}' not found or unavailable.`;
              errorStatus = 400;
          } else if (apiError.message?.includes('Invalid JSON payload')) {
              errorMessage = `Invalid request format sent to Gemini. ${apiError.message}`;
              errorStatus = 400;
          }
      }

      return NextResponse.json({ error: errorMessage }, { status: errorStatus });
    }

  } catch (error: any) {
    console.error('Call Gemini: Unexpected error:', error);
     if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON payload received.' }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
