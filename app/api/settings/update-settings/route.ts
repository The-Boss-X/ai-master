/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { Database } from '@/lib/database.types';
import crypto from 'crypto';

const algorithm = 'aes-256-gcm';
const IV_LENGTH = 16;

function encryptData(text: string, secretKeyHex: string): string | null {
  try {
    if (secretKeyHex.length !== 64) throw new Error('Encryption key must be a 64-character hex string (32 bytes).');
    const key = Buffer.from(secretKeyHex, 'hex');
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + authTag.toString('hex') + encrypted;
  } catch (error: any) {
    console.error('Encryption failed:', error.message);
    return null;
  }
}

interface UpdateSettingsRequest {
  enable_streaming?: boolean;
  enable_search?: boolean;
  slot_1_model?: string | null;
  slot_2_model?: string | null;
  slot_3_model?: string | null;
  slot_4_model?: string | null;
  slot_5_model?: string | null;
  slot_6_model?: string | null;
  summary_model?: string | null;
  use_provided_keys?: boolean;
  gemini_api_key?: string | null;
  openai_api_key?: string | null;
  anthropic_api_key?: string | null;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => {
          const cookie = cookieStore.get(name);
          return cookie?.value;
        },
        set: (name: string, value: string, options: CookieOptions) => {
          cookieStore.set(name, value, options);
        },
        remove: (name: string, options: CookieOptions) => {
          cookieStore.set(name, '', options);
        },
      },
    }
  );

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Error getting session:', sessionError.message);
      return NextResponse.json({ error: 'Failed to authenticate: ' + sessionError.message }, { status: 401 });
    }

    if (!session) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    const userId = session.user.id;
    if (!userId) {
      return NextResponse.json({ error: 'User ID not found in session' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      enable_streaming, 
      enable_search,
      slot_1_model,
      slot_2_model,
      slot_3_model,
      slot_4_model,
      slot_5_model,
      slot_6_model,
      summary_model,
      use_provided_keys,
      gemini_api_key,
      openai_api_key,
      anthropic_api_key
    } = body as UpdateSettingsRequest;

    const serverEncryptionKey = process.env.API_KEY_ENCRYPTION_KEY;
    if (!serverEncryptionKey || serverEncryptionKey.length !== 64) {
        console.error('Update Settings Error: API_KEY_ENCRYPTION_KEY missing or invalid.');
        return NextResponse.json({ error: 'Server configuration error for key encryption.' }, { status: 500 });
    }

    // Validate enable_streaming if present
    if (body.hasOwnProperty('enable_streaming') && typeof enable_streaming !== 'boolean') {
      return NextResponse.json({ error: 'Invalid input: enable_streaming must be a boolean' }, { status: 400 });
    }

    // Validate enable_search if present
    if (body.hasOwnProperty('enable_search') && typeof enable_search !== 'boolean') {
      return NextResponse.json({ error: 'Invalid input: enable_search must be a boolean' }, { status: 400 });
    }

    // Validate use_provided_keys if present
    if (body.hasOwnProperty('use_provided_keys') && typeof use_provided_keys !== 'boolean') {
      return NextResponse.json({ error: 'Invalid input: use_provided_keys must be a boolean' }, { status: 400 });
    }
    
    // Validate model selections if present (must be string or null)
    for (let i = 1; i <= 6; i++) {
        const slotKey = `slot_${i}_model` as keyof UpdateSettingsRequest;
        if (body.hasOwnProperty(slotKey) && typeof body[slotKey] !== 'string' && body[slotKey] !== null) {
            return NextResponse.json({ error: `Invalid input: ${slotKey} must be a string or null` }, { status: 400 });
        }
    }
    if (body.hasOwnProperty('summary_model') && typeof summary_model !== 'string' && summary_model !== null) {
        return NextResponse.json({ error: 'Invalid input: summary_model must be a string or null' }, { status: 400 });
    }

    // Validate API keys if present (must be string or null)
    if (body.hasOwnProperty('gemini_api_key') && typeof gemini_api_key !== 'string' && gemini_api_key !== null) {
        return NextResponse.json({ error: 'Invalid input: gemini_api_key must be a string or null' }, { status: 400 });
    }
    if (body.hasOwnProperty('openai_api_key') && typeof openai_api_key !== 'string' && openai_api_key !== null) {
        return NextResponse.json({ error: 'Invalid input: openai_api_key must be a string or null' }, { status: 400 });
    }
    if (body.hasOwnProperty('anthropic_api_key') && typeof anthropic_api_key !== 'string' && anthropic_api_key !== null) {
        return NextResponse.json({ error: 'Invalid input: anthropic_api_key must be a string or null' }, { status: 400 });
    }

    const updatePayload: any = { updated_at: new Date().toISOString() };
    if (body.hasOwnProperty('enable_streaming')) {
      updatePayload.enable_streaming = enable_streaming;
    }
    if (body.hasOwnProperty('enable_search')) {
      updatePayload.enable_search = enable_search;
    }

    // Add model selections to payload
    for (let i = 1; i <= 6; i++) {
      const slotKey = `slot_${i}_model` as keyof UpdateSettingsRequest;
      if (body.hasOwnProperty(slotKey)) {
        updatePayload[slotKey] = body[slotKey];
      }
    }
    if (body.hasOwnProperty('summary_model')) {
      updatePayload.summary_model = summary_model;
    }

    // Handle use_provided_keys and API keys
    if (body.hasOwnProperty('use_provided_keys')) {
      updatePayload.use_provided_keys = use_provided_keys;
      if (use_provided_keys === true) {
        // If using provided keys, nullify encrypted user keys
        updatePayload.gemini_api_key_encrypted = null;
        updatePayload.openai_api_key_encrypted = null;
        updatePayload.anthropic_api_key_encrypted = null;
      } else {
        // If not using provided keys, encrypt and store any provided keys
        if (body.hasOwnProperty('gemini_api_key')) {
          updatePayload.gemini_api_key_encrypted = gemini_api_key ? encryptData(gemini_api_key, serverEncryptionKey) : null;
          if (gemini_api_key && !updatePayload.gemini_api_key_encrypted) {
            return NextResponse.json({ error: 'Failed to encrypt Gemini API key.' }, { status: 500 });
          }
        }
        if (body.hasOwnProperty('openai_api_key')) {
          updatePayload.openai_api_key_encrypted = openai_api_key ? encryptData(openai_api_key, serverEncryptionKey) : null;
           if (openai_api_key && !updatePayload.openai_api_key_encrypted) {
            return NextResponse.json({ error: 'Failed to encrypt OpenAI API key.' }, { status: 500 });
          }
        }
        if (body.hasOwnProperty('anthropic_api_key')) {
          updatePayload.anthropic_api_key_encrypted = anthropic_api_key ? encryptData(anthropic_api_key, serverEncryptionKey) : null;
           if (anthropic_api_key && !updatePayload.anthropic_api_key_encrypted) {
            return NextResponse.json({ error: 'Failed to encrypt Anthropic API key.' }, { status: 500 });
          }
        }
      }
    } else {
        // If use_provided_keys is not in body, but individual keys are, update them if they exist
        // This handles the case where user might be saving only API keys without touching the checkbox
        if (body.hasOwnProperty('gemini_api_key') && typeof use_provided_keys === 'undefined' && body.gemini_api_key !== undefined) {
             updatePayload.gemini_api_key_encrypted = body.gemini_api_key ? encryptData(body.gemini_api_key, serverEncryptionKey) : null;
             if (body.gemini_api_key && !updatePayload.gemini_api_key_encrypted) return NextResponse.json({ error: 'Failed to encrypt Gemini API key.' }, { status: 500 });
        }
        if (body.hasOwnProperty('openai_api_key') && typeof use_provided_keys === 'undefined' && body.openai_api_key !== undefined) {
            updatePayload.openai_api_key_encrypted = body.openai_api_key ? encryptData(body.openai_api_key, serverEncryptionKey) : null;
            if (body.openai_api_key && !updatePayload.openai_api_key_encrypted) return NextResponse.json({ error: 'Failed to encrypt OpenAI API key.' }, { status: 500 });
        }
        if (body.hasOwnProperty('anthropic_api_key') && typeof use_provided_keys === 'undefined' && body.anthropic_api_key !== undefined) {
            updatePayload.anthropic_api_key_encrypted = body.anthropic_api_key ? encryptData(body.anthropic_api_key, serverEncryptionKey) : null;
            if (body.anthropic_api_key && !updatePayload.anthropic_api_key_encrypted) return NextResponse.json({ error: 'Failed to encrypt Anthropic API key.' }, { status: 500 });
        }
    }

    if (Object.keys(updatePayload).length === 1) { // Only updated_at
        return NextResponse.json({ success: true, message: 'No settings to update.', updatedSettings: null });
    }

    const { data, error } = await supabase
      .from('user_settings')
      .update(updatePayload)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating user_settings:', error.message);
      return NextResponse.json({ error: 'Failed to update settings: ' + error.message }, { status: 500 });
    }

    if (!data) {
        console.warn('No settings found for user to update, or RLS prevented update for user_id:', userId);
        return NextResponse.json({ error: 'Settings not found for user, or update failed post-check.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Settings updated successfully', updatedSettings: data });

  } catch (e: any) {
    console.error('Unexpected error in update-settings:', e.message);
    if (e instanceof SyntaxError && e.message.includes('JSON')) {
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    return NextResponse.json({ error: 'An unexpected error occurred: ' + e.message }, { status: 500 });
  }
} 