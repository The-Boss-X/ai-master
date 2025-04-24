/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/settings/save-settings/route.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto'; // Import Node.js crypto module

// Ensure this route is always dynamic
export const dynamic = 'force-dynamic';

// Define expected request body structure from the client
interface SaveSettingsPayload {
  slot_1_model?: string | null;
  slot_2_model?: string | null;
  slot_3_model?: string | null;
  slot_1_api_key?: string | null; // Plain text key received from client
  slot_2_api_key?: string | null; // Plain text key received from client
  slot_3_api_key?: string | null; // Plain text key received from client
}

// --- Encryption Helper ---
const algorithm = 'aes-256-gcm';
const IV_LENGTH = 16; // AES-GCM recommended IV length
const AUTH_TAG_LENGTH = 16; // AES-GCM recommended auth tag length

function encryptData(text: string, secretKeyHex: string): string | null {
  try {
    if (!text) return null;
    // Ensure the key is 32 bytes (64 hex characters)
    if (secretKeyHex.length !== 64) {
        throw new Error('Encryption key must be a 64-character hex string (32 bytes).');
    }
    const key = Buffer.from(secretKeyHex, 'hex');
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    // Prepend IV and AuthTag for storage: IV(hex) + AuthTag(hex) + EncryptedData(hex)
    return iv.toString('hex') + authTag.toString('hex') + encrypted;
  } catch (error) {
    console.error('Encryption failed:', error);
    return null; // Return null or throw error based on desired handling
  }
}
// --- End Encryption Helper ---


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
      console.error('Save Settings Error: API_KEY_ENCRYPTION_KEY environment variable is missing or invalid.');
      return NextResponse.json({ error: 'Server configuration error: Unable to secure data.' }, { status: 500 });
  }
  // --- End Get Encryption Key ---

  try {
    // 1. Get the current user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Parse the request body
    let settingsPayload: SaveSettingsPayload;
    try {
        settingsPayload = await request.json();
    } catch (parseError) {
        return NextResponse.json({ error: 'Invalid JSON payload received.' }, { status: 400 });
    }

    // 3. Encrypt API Keys if provided
    let encryptedKey1: string | null = null;
    let encryptedKey2: string | null = null;
    let encryptedKey3: string | null = null;
    let encryptionError = false;

    if (settingsPayload.slot_1_api_key) {
        encryptedKey1 = encryptData(settingsPayload.slot_1_api_key, encryptionKey);
        if (!encryptedKey1) encryptionError = true;
    }
    if (settingsPayload.slot_2_api_key) {
        encryptedKey2 = encryptData(settingsPayload.slot_2_api_key, encryptionKey);
        if (!encryptedKey2) encryptionError = true;
    }
     if (settingsPayload.slot_3_api_key) {
        encryptedKey3 = encryptData(settingsPayload.slot_3_api_key, encryptionKey);
        if (!encryptedKey3) encryptionError = true;
    }

    if (encryptionError) {
        // Logged internally by encryptData
        return NextResponse.json({ error: 'Failed to process API key data securely.' }, { status: 500 });
    }

    // 4. Prepare data for Supabase upsert operation
    // Use Record<string, any> for flexibility with conditional key inclusion
    const settingsDataToSave: Record<string, any> = {
      user_id: userId,
      slot_1_model: settingsPayload.slot_1_model || null,
      slot_2_model: settingsPayload.slot_2_model || null,
      slot_3_model: settingsPayload.slot_3_model || null,
      updated_at: new Date().toISOString(),
    };

    // Only add ENCRYPTED keys to the update object if they were successfully encrypted
    // This prevents overwriting existing keys with null if the user didn't provide a new key
    if (encryptedKey1) settingsDataToSave.slot_1_api_key_encrypted = encryptedKey1;
    if (encryptedKey2) settingsDataToSave.slot_2_api_key_encrypted = encryptedKey2;
    if (encryptedKey3) settingsDataToSave.slot_3_api_key_encrypted = encryptedKey3;

    // 5. Use upsert to insert or update the user's settings row
    const { data, error: upsertError } = await supabase
      .from('user_settings')
      .upsert(settingsDataToSave, { onConflict: 'user_id' })
      .select('slot_1_model, slot_2_model, slot_3_model') // Select non-sensitive fields back
      .single();

    if (upsertError) {
      console.error(`Error saving user settings for user ${userId}:`, upsertError);
       if (upsertError.code === '42501') {
         return NextResponse.json({ error: 'Permission denied to save settings.' }, { status: 403 });
       }
      return NextResponse.json({ error: `Failed to save settings to database. DB Error: ${upsertError.message}` }, { status: 500 });
    }

    // 6. Return success response
    console.log(`Saved settings for user ${userId} (keys encrypted).`);
    return NextResponse.json({ success: true, savedSettings: data }, { status: 200 });

  } catch (error: any) {
    console.error('Unexpected error in save-settings route:', error);
     if (error instanceof SyntaxError) { // Should be caught earlier
       return NextResponse.json({ error: 'Invalid JSON payload received.' }, { status: 400 });
     }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
