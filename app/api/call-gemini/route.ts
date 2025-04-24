/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/call-gemini/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import crypto from 'crypto'; // Import Node.js crypto module

// Define expected request body structure
interface CallGeminiRequest {
  prompt: string;
  model: string;
  slotNumber: 1 | 2 | 3;
}

// Explicitly type the expected shape of the settings object fetched from Supabase
interface UserSettingsKeys {
    slot_1_api_key_encrypted: string | null;
    slot_2_api_key_encrypted: string | null;
    slot_3_api_key_encrypted: string | null;
}


export const dynamic = 'force-dynamic';

// --- Decryption Helper (Same as in call-openai) ---
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
    const ivHex = encryptedTextHex.slice(0, IV_LENGTH * 2);
    const authTagHex = encryptedTextHex.slice(IV_LENGTH * 2, (IV_LENGTH + AUTH_TAG_LENGTH) * 2);
    const encryptedDataHex = encryptedTextHex.slice((IV_LENGTH + AUTH_TAG_LENGTH) * 2);

    if (ivHex.length !== IV_LENGTH * 2 || authTagHex.length !== AUTH_TAG_LENGTH * 2 || !encryptedDataHex) {
        throw new Error('Invalid encrypted data format (IV, AuthTag, or Data length mismatch).');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedDataHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
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

  // --- Get Encryption Key from Environment ---
  const encryptionKey = process.env.API_KEY_ENCRYPTION_KEY;
  if (!encryptionKey || encryptionKey.length !== 64) {
      console.error('Call Gemini Error: API_KEY_ENCRYPTION_KEY environment variable is missing or invalid.');
      return NextResponse.json({ error: 'Server configuration error: Unable to process request securely.' }, { status: 500 });
  }
  // --- End Get Encryption Key ---

  try {
    // 1. Authenticate the user
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Parse request body
    let payload: CallGeminiRequest;
     try {
        payload = await request.json();
    } catch (parseError) {
        return NextResponse.json({ error: 'Invalid JSON payload received.' }, { status: 400 });
    }
    const { prompt, model, slotNumber } = payload;

    if (!prompt || !model || !slotNumber || ![1, 2, 3].includes(slotNumber)) {
      return NextResponse.json({ error: 'Missing or invalid required fields: prompt, model, slotNumber (1, 2, or 3)' }, { status: 400 });
    }

    // 3. Fetch User's Encrypted API Keys for ALL slots
    const { data, error: fetchError } = await supabase
      .from('user_settings')
      .select('slot_1_api_key_encrypted, slot_2_api_key_encrypted, slot_3_api_key_encrypted') // Select all key columns
      .eq('user_id', userId)
      .single(); // Expect one settings row for the user

    // Explicitly cast the fetched data to our defined type
    const settings = data as UserSettingsKeys | null;


    // Handle errors fetching the keys
    if (fetchError) {
        if (fetchError.code === 'PGRST116') { // Resource not found
             console.warn(`Call Gemini: No settings found for user ${userId}. Cannot retrieve API keys.`);
             return NextResponse.json({ error: `API Key settings not configured for user.` }, { status: 400 });
        }
        console.error(`Call Gemini: Error fetching API keys for user ${userId}:`, fetchError);
        return NextResponse.json({ error: `Database error fetching API Keys.` }, { status: 500 });
    }
     if (!settings) { // Check if settings object is null after fetch
         console.warn(`Call Gemini: Settings object null for user ${userId}.`);
         return NextResponse.json({ error: `API Key settings not found.` }, { status: 400 });
    }

    // Select the correct encrypted key based on slotNumber using explicit property access
    let encryptedApiKey: string | null = null;
    if (slotNumber === 1) {
        encryptedApiKey = settings.slot_1_api_key_encrypted;
    } else if (slotNumber === 2) {
        encryptedApiKey = settings.slot_2_api_key_encrypted;
    } else if (slotNumber === 3) {
        encryptedApiKey = settings.slot_3_api_key_encrypted;
    }


    if (!encryptedApiKey) {
         console.warn(`Call Gemini: API Key for Slot ${slotNumber} is missing or null for user ${userId}.`);
         return NextResponse.json({ error: `API Key for Slot ${slotNumber} is missing.` }, { status: 400 });
    }

    // 4. Decrypt the API Key
    const decryptedApiKey = decryptData(encryptedApiKey, encryptionKey);

    if (!decryptedApiKey) {
        console.error(`Call Gemini: Failed to decrypt API key for user ${userId}, slot ${slotNumber}. Key might be invalid or corrupted.`);
        return NextResponse.json({ error: 'Could not authenticate with AI service. Please check your API key configuration in Settings.' }, { status: 400 });
    }

    // 5. Call the Google AI API
    try {
      const genAI = new GoogleGenerativeAI(decryptedApiKey);
      const generativeModel = genAI.getGenerativeModel({
          model: model,
          // Optional: Configure safety settings
          // safetySettings: [ ... ],
      });

      console.log(`Calling Google AI model ${model} for user ${userId}, slot ${slotNumber}`);
      const result = await generativeModel.generateContent(prompt);
      const response = result.response;
      const responseText = response.text();

      if (responseText === undefined || responseText === null || responseText.trim() === "") {
          const blockReason = response.promptFeedback?.blockReason;
          const safetyRatings = response.candidates?.[0]?.safetyRatings;
          console.warn(`Call Gemini: Response empty or blocked for user ${userId}, model ${model}. Reason: ${blockReason || 'None Provided'}. Safety Ratings:`, safetyRatings);
          if (blockReason) {
               throw new Error(`Gemini response blocked due to ${blockReason}.`);
          } else {
               throw new Error('Gemini response was empty.');
          }
      }

      // 6. Return the successful response
      return NextResponse.json({ response: responseText.trim() }, { status: 200 });

    } catch (apiError: any) {
      // Handle errors from the Google AI API call
      console.error(`Call Gemini: Google AI API Error (Model: ${model}, User: ${userId}, Slot: ${slotNumber}):`, apiError);
      let errorMessage = 'Failed to get response from Google AI.';
      let errorStatus = 500;

      if (apiError.message) {
          errorMessage = apiError.message;
          if (apiError.message.includes('API key not valid') || apiError.message.includes('permission denied') || (apiError.status === 400 && apiError.message.includes('API_KEY_INVALID'))) {
              errorMessage = "Invalid or unauthorized Google AI API Key provided. Please check your key in Settings.";
              errorStatus = 400;
          } else if (apiError.message.includes('quota')) {
              errorMessage = "Google AI quota exceeded. Please check your usage limits.";
              errorStatus = 429;
          } else if (apiError.message.includes('model') && apiError.message.includes('not found')) {
               errorMessage = `Google AI model '${model}' not found or unavailable.`;
               errorStatus = 400;
          }
      }
      if (apiError.status) {
          errorStatus = apiError.status;
      }

      return NextResponse.json({ error: errorMessage }, { status: errorStatus });
    }

  } catch (error: any) {
    console.error('Call Gemini: Unexpected error in route handler:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload received.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error processing Google AI request.' }, { status: 500 });
  }
}
