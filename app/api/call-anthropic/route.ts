/* eslint-disable @typescript-eslint/no-unused-vars */
// app/api/call-anthropic/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
 import { createServerClient, type CookieOptions } from '@supabase/ssr';
 import { cookies } from 'next/headers';
 import { NextResponse } from 'next/server';
 import type { NextRequest } from 'next/server';
 import Anthropic from '@anthropic-ai/sdk';
 import crypto from 'crypto';
 import { recordTokenUsage } from '../../../lib/tokenUtils'; // Adjusted path
 
 interface ConversationMessage {
     role: 'user' | 'model';
     content: string;
 }
 
 interface CallAnthropicRequest {
   prompt: string; // This is the latest user prompt, should be part of conversationHistory
   model: string;
   slotNumber: 1 | 2 | 3 | 4 | 5 | 6;
   conversationHistory?: ConversationMessage[];
   interactionId?: string | null;
 }
 
 interface UserAnthropicSettings {
     anthropic_api_key_encrypted: string | null;
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
        console.error('Call Anthropic Error: API_KEY_ENCRYPTION_KEY environment variable is missing or invalid.');
        return NextResponse.json({ error: 'Server configuration error: Unable to process request securely.' }, { status: 500 });
    }

   try {
     const { data: { session }, error: sessionError } = await supabase.auth.getSession();
     if (sessionError || !session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
     const userId = session.user.id;
 
     let payload: CallAnthropicRequest;
     try { payload = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
     const { model, slotNumber, conversationHistory, interactionId, prompt } = payload;
 
     // Ensure conversationHistory is provided and not empty, as it contains the prompt
     if (!model || !slotNumber || !conversationHistory || conversationHistory.length === 0) {
       return NextResponse.json({ error: 'Missing required fields (model, slotNumber, conversationHistory with prompt).' }, { status: 400 });
     }
 
     const { data: settingsData, error: fetchError } = await supabase
         .from('user_settings')
         .select('anthropic_api_key_encrypted')
         .eq('user_id', userId)
         .maybeSingle();
     const settings = settingsData as UserAnthropicSettings | null;

      if (fetchError) {
         console.error(`Call Anthropic: Database error fetching API key for user ${userId}:`, fetchError);
         return NextResponse.json({ error: 'Database error fetching API Key.' }, { status: 500 });
     }
      if (!settings || !settings.anthropic_api_key_encrypted) {
         console.warn(`Call Anthropic: Anthropic API Key not found or null for user ${userId}.`);
         return NextResponse.json({ error: 'Anthropic API Key not configured. Please add it in Settings.' }, { status: 400 });
     }
      const decryptedApiKey = decryptData(settings.anthropic_api_key_encrypted, encryptionKey);
      if (!decryptedApiKey) {
         console.error(`Call Anthropic: Failed to decrypt Anthropic API key for user ${userId}.`);
         return NextResponse.json({ error: 'Could not authenticate with Anthropic. Check API Key in Settings.' }, { status: 400 });
     }

     const messagesForApi: Anthropic.Messages.MessageParam[] = conversationHistory
        .filter(msg => msg.content?.trim())
        .map(msg => ({
            role: msg.role === 'model' ? 'assistant' : 'user',
            content: msg.content
        }));
 
     if (messagesForApi.length === 0 || messagesForApi[messagesForApi.length - 1].role !== 'user') {
        console.error(`Call Anthropic: Invalid history format for user ${userId}. Last message not from user or history empty.`);
        return NextResponse.json({ error: 'Internal error: Invalid conversation history format.' }, { status: 500 });
     }
 
     try {
       const anthropic = new Anthropic({ apiKey: decryptedApiKey });
       console.log(`Calling Anthropic model ${model} for user ${userId} (Slot ${slotNumber}) with ${messagesForApi.length} messages.`);
 
       const response = await anthropic.messages.create({
         model: model,
         max_tokens: 1024, 
         messages: messagesForApi,
       });
 
       let responseText = '';
       if (response.content && response.content.length > 0 && response.content[0].type === 'text') {
            responseText = response.content[0].text;
       } else {
            if (response.stop_reason === 'max_tokens') throw new Error('Anthropic response truncated due to max token limit.');
            else if (response.stop_reason) throw new Error(`Anthropic response stopped unexpectedly. Reason: ${response.stop_reason}`);
            throw new Error('Anthropic response was empty or in an unexpected format.');
       }
       if (responseText.trim() === "") throw new Error('Anthropic response was empty.');

       const inputTokens = response.usage?.input_tokens ?? 0;
       const outputTokens = response.usage?.output_tokens ?? 0;

       const tokenLogResult = await recordTokenUsage(
         supabase,
         userId,
         'Anthropic',
         model,
         inputTokens,
         outputTokens,
         interactionId,
         slotNumber
       );
        if (!tokenLogResult.success) {
            console.warn(`Call Anthropic: Token usage logging failed for user ${userId}, model ${model}. Error: ${tokenLogResult.error}`);
        }
 
       return NextResponse.json({ 
         response: responseText.trim(),
         inputTokens,
         outputTokens 
       }, { status: 200 });
 
     } catch (apiError: any) {
       console.error(`Call Anthropic: API Error (Model: ${model}, User: ${userId}, Slot: ${slotNumber}):`, apiError);
       const errorMessage = 'Failed to get response from Anthropic.'; const errorStatus = 500;
       if (apiError instanceof Anthropic.APIError) { /* ... existing error handling ... */ }
       return NextResponse.json({ error: errorMessage }, { status: errorStatus });
     }
 
   } catch (error: any) {
     console.error('Call Anthropic: Unexpected error:', error);
     if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON payload received.' }, { status: 400 });
     return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
   }
 }
