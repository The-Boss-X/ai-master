/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import crypto from 'crypto';
import { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

interface SaveSettingsPayload {
  slot_1_model?: string | null;
  slot_2_model?: string | null;
  slot_3_model?: string | null;
  slot_4_model?: string | null;
  slot_5_model?: string | null;
  slot_6_model?: string | null;
  summary_model?: string | null;
  gemini_api_key?: string | null;
  openai_api_key?: string | null;
  anthropic_api_key?: string | null;
  use_provided_keys?: boolean; // Added
}

const algorithm = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function encryptData(text: string, secretKeyHex: string): string | null {
  try {
    if (!text) return null;
    if (secretKeyHex.length !== 64) {
      throw new Error('Encryption key must be a 64-character hex string (32 bytes).');
    }
    const key = Buffer.from(secretKeyHex, 'hex');
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + authTag.toString('hex') + encrypted;
  } catch (error) {
    console.error('Encryption failed:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
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
    console.error('Save Settings Error: API_KEY_ENCRYPTION_KEY environment variable is missing or invalid.');
    return NextResponse.json({ error: 'Server configuration error: Unable to secure data.' }, { status: 500 });
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;

    let settingsPayload: SaveSettingsPayload;
    try {
      settingsPayload = await request.json();
    } catch (parseError) {
      return NextResponse.json({ error: 'Invalid JSON payload received.' }, { status: 400 });
    }

    let encryptedGeminiKey: string | null = null;
    let encryptedOpenAIKey: string | null = null;
    let encryptedAnthropicKey: string | null = null;
    let encryptionError = false;

    if (settingsPayload.gemini_api_key) {
      encryptedGeminiKey = encryptData(settingsPayload.gemini_api_key, encryptionKey);
      if (!encryptedGeminiKey) encryptionError = true;
    }
    if (settingsPayload.openai_api_key) {
      encryptedOpenAIKey = encryptData(settingsPayload.openai_api_key, encryptionKey);
      if (!encryptedOpenAIKey) encryptionError = true;
    }
    if (settingsPayload.anthropic_api_key) {
      encryptedAnthropicKey = encryptData(settingsPayload.anthropic_api_key, encryptionKey);
      if (!encryptedAnthropicKey) encryptionError = true;
    }

    if (encryptionError) {
      return NextResponse.json({ error: 'Failed to process API key data securely.' }, { status: 500 });
    }

    const settingsDataToSave: Partial<Database['public']['Tables']['user_settings']['Update']> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
      summary_model: settingsPayload.summary_model === undefined ? undefined : (settingsPayload.summary_model || null),
      use_provided_keys: settingsPayload.use_provided_keys === undefined ? undefined : settingsPayload.use_provided_keys,
    };
    
    // Explicitly handle boolean default if not provided by client for use_provided_keys
    if (settingsPayload.use_provided_keys === undefined) {
        // If client doesn't send it, don't update it, or set a default if this is an insert.
        // For upsert, if it's not in payload, it won't be changed unless you explicitly set it to null/false.
        // If you want to ensure it's always present, you might query current settings first or set a default.
        // For simplicity here, if not provided, it's not included in the update object, so DB keeps its value or default.
    } else {
        settingsDataToSave.use_provided_keys = settingsPayload.use_provided_keys;
    }


    for (let i = 1; i <= 6; i++) {
      const modelKey = `slot_${i}_model` as keyof SaveSettingsPayload;
      if (settingsPayload[modelKey] !== undefined) { // Only include if explicitly passed
        (settingsDataToSave as any)[modelKey] = settingsPayload[modelKey] || null;
      }
    }

    if (encryptedGeminiKey !== undefined) settingsDataToSave.gemini_api_key_encrypted = encryptedGeminiKey;
    if (encryptedOpenAIKey !== undefined) settingsDataToSave.openai_api_key_encrypted = encryptedOpenAIKey;
    if (encryptedAnthropicKey !== undefined) settingsDataToSave.anthropic_api_key_encrypted = encryptedAnthropicKey;

    // If use_provided_keys is true, we might want to null out the user's keys.
    // However, it's often better to let users keep their keys stored even if they toggle,
    // so they don't have to re-enter them. The API call logic will decide which key to use.
    // If you want to clear them:
    // if (settingsDataToSave.use_provided_keys === true) {
    //   settingsDataToSave.gemini_api_key_encrypted = null;
    //   settingsDataToSave.openai_api_key_encrypted = null;
    //   settingsDataToSave.anthropic_api_key_encrypted = null;
    // }


    const selectColumns = [
      'slot_1_model', 'slot_2_model', 'slot_3_model',
      'slot_4_model', 'slot_5_model', 'slot_6_model',
      'summary_model', 'use_provided_keys', 'free_tokens_remaining', 'paid_tokens_remaining', 'free_tokens_last_reset_at', 'total_tokens_used_overall'
    ].join(', ');

    const { data, error: upsertError } = await supabase
      .from('user_settings')
      .upsert(settingsDataToSave, { onConflict: 'user_id' })
      .select(selectColumns)
      .single();

    if (upsertError) {
      console.error(`Error saving user settings for user ${userId}:`, upsertError);
      if (upsertError.code === '42501') {
        return NextResponse.json({ error: 'Permission denied to save settings.' }, { status: 403 });
      }
      if (upsertError.message.includes('column') && upsertError.message.includes('does not exist')) {
        console.error(`!!! DB Schema Mismatch: Column likely missing in 'user_settings'. Expected: ${Object.keys(settingsDataToSave).join(', ')} !!!`);
        return NextResponse.json({ error: `Database schema error: ${upsertError.message}. Ensure all columns exist.` }, { status: 500 });
      }
      return NextResponse.json({ error: `Failed to save settings to database. DB Error: ${upsertError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, savedSettings: data }, { status: 200 });

  } catch (error: any) {
    console.error('Unexpected error in save-settings route:', error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON payload received.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
