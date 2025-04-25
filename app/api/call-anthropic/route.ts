/* eslint-disable @typescript-eslint/no-explicit-any */
 // app/api/call-anthropic/route.ts
 import { createServerClient, type CookieOptions } from '@supabase/ssr';
 import { cookies } from 'next/headers';
 import { NextResponse } from 'next/server';
 import type { NextRequest } from 'next/server';
 import Anthropic from '@anthropic-ai/sdk'; // Import Anthropic SDK
 import crypto from 'crypto';

 // Define structure for a single message in the history (matches client)
 interface ConversationMessage {
     role: 'user' | 'model'; // Role used in your client/DB
     content: string;
 }

 // Define expected request body structure
 interface CallAnthropicRequest {
   prompt: string; // Latest user prompt (may not be strictly needed if history includes it)
   model: string; // Specific Anthropic model name (e.g., 'claude-3-opus-20240229')
   slotNumber: number; // For context/logging
   conversationHistory?: ConversationMessage[]; // History *including* the latest user prompt
 }

 // Explicitly type the expected shape of the relevant settings object fetched from Supabase
 interface UserAnthropicSettings {
     anthropic_api_key_encrypted: string | null;
     // Add other settings if needed
 }

 export const dynamic = 'force-dynamic';

 // --- Decryption Helper (Copied from other API routes) ---
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
       console.error('Call Anthropic Error: API_KEY_ENCRYPTION_KEY environment variable is missing or invalid.');
       return NextResponse.json({ error: 'Server configuration error: Unable to process request securely.' }, { status: 500 });
   }

   try {
     // 1. Authentication & Authorization
     const { data: { session }, error: sessionError } = await supabase.auth.getSession();
     if (sessionError || !session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
     const userId = session.user.id;

     // 2. Parse Request Body
     let payload: CallAnthropicRequest;
     try { payload = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
     const { model, slotNumber, conversationHistory } = payload;

     // Validate required fields (model and slotNumber are essential, history is needed for context)
     if (!model || !slotNumber || !conversationHistory || conversationHistory.length === 0) {
       return NextResponse.json({ error: 'Missing required fields (model, slotNumber, conversationHistory).' }, { status: 400 });
     }

     // 3. Fetch and Decrypt API Key
     const { data: settingsData, error: fetchError } = await supabase
         .from('user_settings')
         .select('anthropic_api_key_encrypted') // Select the specific column
         .eq('user_id', userId)
         .maybeSingle(); // Use maybeSingle to handle no settings row gracefully

     // Cast fetched data to the specific type
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
     // --- End API Key Fetch/Decrypt ---

     // 4. Prepare History for Anthropic Messages API
     // Anthropic expects roles 'user' and 'assistant'. Map 'model' to 'assistant'.
     // The history from the client *already includes* the latest user prompt.
     const messagesForApi: Anthropic.Messages.MessageParam[] = conversationHistory
        .filter(msg => msg.content?.trim()) // Filter out empty messages
        .map(msg => ({
            role: msg.role === 'model' ? 'assistant' : 'user', // Map 'model' to 'assistant'
            content: msg.content
        }));

     // Basic validation: Last message should be from the user
     if (messagesForApi.length === 0 || messagesForApi[messagesForApi.length - 1].role !== 'user') {
        console.error(`Call Anthropic: Invalid history format for user ${userId}. Last message not from user or history empty.`);
        return NextResponse.json({ error: 'Internal error: Invalid conversation history format.' }, { status: 500 });
     }

     // 5. Call Anthropic API
     try {
       const anthropic = new Anthropic({ apiKey: decryptedApiKey });

       console.log(`Calling Anthropic model ${model} for user ${userId} (via slot ${slotNumber}) with ${messagesForApi.length} messages.`);

       const response = await anthropic.messages.create({
         model: model,
         max_tokens: 1024, // Adjust as needed
         messages: messagesForApi,
         // system: "Optional system prompt here", // Add if you use system prompts
       });

       // Extract the response text - check response structure carefully
       let responseText = '';
       if (response.content && response.content.length > 0 && response.content[0].type === 'text') {
            responseText = response.content[0].text;
       } else {
            // Handle cases where response might be empty or not text
            console.warn(`Call Anthropic: Received non-text or empty content block from model ${model} for user ${userId}. Response:`, response);
            // Check stop reason
            if (response.stop_reason === 'max_tokens') {
                throw new Error('Anthropic response truncated due to max token limit.');
            } else if (response.stop_reason) {
                 throw new Error(`Anthropic response stopped unexpectedly. Reason: ${response.stop_reason}`);
            }
             throw new Error('Anthropic response was empty or in an unexpected format.');
       }


       if (responseText.trim() === "") {
            console.warn(`Call Anthropic: Response text empty after trim. User: ${userId}, Model: ${model}`);
            throw new Error('Anthropic response was empty.');
       }

       return NextResponse.json({ response: responseText.trim() }, { status: 200 });

     } catch (apiError: any) {
       console.error(`Call Anthropic: API Error (Model: ${model}, User: ${userId}, Slot: ${slotNumber}):`, apiError);

       let errorMessage = 'Failed to get response from Anthropic.';
       let errorStatus = 500;

       // Check for specific Anthropic error types (refer to Anthropic SDK docs for details)
       if (apiError instanceof Anthropic.APIError) {
            errorStatus = apiError.status || 500;
            errorMessage = apiError.message || errorMessage; // Use Anthropic's message

            // More specific checks based on status or error type/message
            if (apiError.status === 401) { // AuthenticationError
                errorMessage = "Invalid Anthropic API Key provided. Please check your key in Settings.";
            } else if (apiError.status === 403) { // PermissionDeniedError
                 errorMessage = "Permission denied by Anthropic. Check API key permissions or account status.";
            } else if (apiError.status === 429) { // RateLimitError
                errorMessage = "Anthropic API rate limit exceeded. Please try again later.";
            } else if (apiError.status === 400) { // BadRequestError (includes invalid model, bad input etc.)
                 if (apiError.message.includes("model is invalid")) {
                     errorMessage = `Anthropic model '${model}' not found or invalid.`;
                 } else {
                     errorMessage = `Invalid request to Anthropic: ${apiError.message}`;
                 }
            } else if (apiError.status >= 500) { // InternalServerError
                 errorMessage = `Anthropic server error (${apiError.status}). Please try again later.`;
            }
       } else if (apiError.message) {
           // Fallback for other types of errors
           errorMessage = apiError.message;
       }

       return NextResponse.json({ error: errorMessage }, { status: errorStatus });
     }

   } catch (error: any) {
     console.error('Call Anthropic: Unexpected error:', error);
      if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON payload received.' }, { status: 400 });
     return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
   }
 }
