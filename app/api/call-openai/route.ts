/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/call-openai/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import OpenAI from 'openai';
import crypto from 'crypto'; // Import Node.js crypto module

// Define expected request body structure
interface CallOpenAIRequest {
  prompt: string;
  model: string;
  slotNumber: 1 | 2 | 3;
}

// Explicitly type the expected shape of the settings object fetched from Supabase
// Include all potential key columns, allowing them to be null
interface UserSettingsKeys {
    slot_1_api_key_encrypted: string | null;
    slot_2_api_key_encrypted: string | null;
    slot_3_api_key_encrypted: string | null;
}


export const dynamic = 'force-dynamic';

// --- Decryption Helper ---
const algorithm = 'aes-256-gcm';
const IV_LENGTH = 16; // For extraction
const AUTH_TAG_LENGTH = 16; // For extraction

function decryptData(encryptedTextHex: string, secretKeyHex: string): string | null {
  try {
    if (!encryptedTextHex) return null;
     // Ensure the key is 32 bytes (64 hex characters)
    if (secretKeyHex.length !== 64) {
        throw new Error('Decryption key must be a 64-character hex string (32 bytes).');
    }
    const key = Buffer.from(secretKeyHex, 'hex');

    // Extract IV, AuthTag, and Encrypted Data from the combined hex string
    // Format: IV(hex) + AuthTag(hex) + EncryptedData(hex)
    const ivHex = encryptedTextHex.slice(0, IV_LENGTH * 2);
    const authTagHex = encryptedTextHex.slice(IV_LENGTH * 2, (IV_LENGTH + AUTH_TAG_LENGTH) * 2);
    const encryptedDataHex = encryptedTextHex.slice((IV_LENGTH + AUTH_TAG_LENGTH) * 2);

    // Validate extracted lengths
    if (ivHex.length !== IV_LENGTH * 2 || authTagHex.length !== AUTH_TAG_LENGTH * 2 || !encryptedDataHex) {
        throw new Error('Invalid encrypted data format (IV, AuthTag, or Data length mismatch).');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag); // Set the authentication tag for verification

    let decrypted = decipher.update(encryptedDataHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8'); // Finalize decryption
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    return null; // Return null on decryption failure
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
      console.error('Call OpenAI Error: API_KEY_ENCRYPTION_KEY environment variable is missing or invalid.');
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
    let payload: CallOpenAIRequest;
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
    // Fetch all potential keys and explicitly type the result
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
             console.warn(`Call OpenAI: No settings found for user ${userId}. Cannot retrieve API keys.`);
             return NextResponse.json({ error: `API Key settings not configured for user.` }, { status: 400 });
        }
        console.error(`Call OpenAI: Error fetching API keys for user ${userId}:`, fetchError);
        return NextResponse.json({ error: `Database error fetching API Keys.` }, { status: 500 });
    }
    if (!settings) { // Check if settings object is null after fetch
         console.warn(`Call OpenAI: Settings object null for user ${userId}.`);
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
         console.warn(`Call OpenAI: API Key for Slot ${slotNumber} is missing or null for user ${userId}.`);
         return NextResponse.json({ error: `API Key for Slot ${slotNumber} is missing.` }, { status: 400 });
    }

    // 4. Decrypt the API Key
    const decryptedApiKey = decryptData(encryptedApiKey, encryptionKey);

    if (!decryptedApiKey) {
        console.error(`Call OpenAI: Failed to decrypt API key for user ${userId}, slot ${slotNumber}. Key might be invalid or corrupted.`);
        return NextResponse.json({ error: 'Could not authenticate with AI service. Please check your API key configuration in Settings.' }, { status: 400 });
    }

    // 5. Call the actual OpenAI API
    const openai = new OpenAI({ apiKey: decryptedApiKey });

    try {
      console.log(`Calling OpenAI model ${model} for user ${userId}, slot ${slotNumber}`);
      const completion = await openai.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        // max_tokens: 150,
        // temperature: 0.7,
      });

      const responseText = completion.choices[0]?.message?.content;

      if (responseText === undefined || responseText === null) {
        console.warn(`Call OpenAI: No response text received from OpenAI model ${model} for user ${userId}. Completion:`, completion);
        throw new Error('No response text received from OpenAI.');
      }

      // 6. Return the successful response
      return NextResponse.json({ response: responseText.trim() }, { status: 200 });

    } catch (apiError: any) {
      // Handle errors from the OpenAI API call
      console.error(`Call OpenAI: OpenAI API Error (Model: ${model}, User: ${userId}, Slot: ${slotNumber}):`, apiError);
      let errorMessage = 'Failed to get response from OpenAI.';
      let errorStatus = 500;

      if (apiError instanceof OpenAI.APIError) {
          errorMessage = apiError.message || errorMessage;
          errorStatus = apiError.status || errorStatus;
          if (apiError.status === 401) {
              errorMessage = "Invalid OpenAI API Key provided. Please check your key in Settings.";
          } else if (apiError.status === 429) {
              errorMessage = "OpenAI rate limit exceeded. Please try again later.";
          } else if (apiError.code === 'model_not_found') {
              errorMessage = `OpenAI model '${model}' not found or unavailable.`;
              errorStatus = 400;
          }
      } else if (apiError.message) {
          errorMessage = apiError.message;
      }

      return NextResponse.json({ error: errorMessage }, { status: errorStatus });
    }

  } catch (error: any) {
    console.error('Call OpenAI: Unexpected error in route handler:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload received.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error processing OpenAI request.' }, { status: 500 });
  }
}
