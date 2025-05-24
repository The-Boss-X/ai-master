/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { recordTokenUsage } from '../../../lib/tokenUtils';
import { Database } from '@/lib/database.types';

interface ConversationMessage {
  role: 'user' | 'model'; // 'model' from client, maps to 'assistant' for Anthropic
  content: string;
}

interface CallAnthropicRequest {
  prompt: string;
  model: string;
  slotNumber: 1 | 2 | 3 | 4 | 5 | 6;
  conversationHistory?: ConversationMessage[];
  interactionId?: string | null;
  stream?: boolean; // Added for streaming
  useSearch?: boolean; // Added for search
}

interface UserSettingsForAnthropic {
  anthropic_api_key_encrypted: string | null;
  use_provided_keys: boolean | null;
  free_tokens_remaining: number | null;
  paid_tokens_remaining: number | null;
}

export const dynamic = 'force-dynamic';

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
    console.error('Decryption failed:', error.message);
    return null;
  }
}

export async function POST(request: NextRequest) {
  return handleAnthropicRequest(request, false);
}

export async function GET(request: NextRequest) {
  return handleAnthropicRequest(request, true);
}

async function handleAnthropicRequest(request: NextRequest, isStreamingAttempt: boolean) {
  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) { try { cookieStore.set({ name, value, ...options }); } catch (error) {} },
        remove(name: string, options: CookieOptions) { try { cookieStore.set({ name, value: '', ...options }); } catch (error) {} },
      },
    }
  );

  const serverEncryptionKey = process.env.API_KEY_ENCRYPTION_KEY;
  if (!serverEncryptionKey || serverEncryptionKey.length !== 64) {
    console.error('[Anthropic API] Call Anthropic Error: API_KEY_ENCRYPTION_KEY missing or invalid.');
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  let slotNumberForLogging: CallAnthropicRequest['slotNumber'] | string = "N/A";
  let modelForLogging: string | undefined = undefined;

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = session.user.id;

    let payload: CallAnthropicRequest;
    let actualStreamFlag = false;

    if (isStreamingAttempt && request.method === 'GET') {
        const url = new URL(request.url);
        const queryParams = Object.fromEntries(url.searchParams.entries());
        payload = {
            prompt: queryParams.prompt || "", // Will be part of conversationHistory for Anthropic
            model: queryParams.model || "",
            slotNumber: parseInt(queryParams.slotNumber, 10) as CallAnthropicRequest['slotNumber'] || 1,
            conversationHistory: queryParams.conversationHistory ? JSON.parse(queryParams.conversationHistory) : [],
            interactionId: queryParams.interactionId === 'null' || queryParams.interactionId === undefined ? null : queryParams.interactionId,
            stream: true,
            useSearch: queryParams.useSearch === 'true' // Added for search
        };
        actualStreamFlag = true;
        if (!payload.model || !payload.slotNumber || !payload.conversationHistory || payload.conversationHistory.length === 0) {
          console.error(`[Anthropic API - Slot ${payload.slotNumber || 'N/A'}] Streaming GET missing required fields.`);
          return NextResponse.json({ error: 'Missing required fields for streaming (model, slotNumber, conversationHistory with prompt).' }, { status: 400 });
        }
    } else { 
        try {
            payload = await request.json();
            actualStreamFlag = payload.stream || false; 
        } catch {
            return NextResponse.json({ error: 'Invalid JSON for POST request.' }, { status: 400 });
        }
    }

    // Note: For Anthropic, the 'prompt' from payload is expected to be the last user message in conversationHistory.
    const { model, slotNumber, conversationHistory, interactionId, useSearch } = payload;
    slotNumberForLogging = slotNumber;
    modelForLogging = model;
    console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Processing request. Model: ${modelForLogging}, Streaming: ${actualStreamFlag}, UseSearch: ${useSearch}`);

    if (!model || !slotNumber || !conversationHistory || conversationHistory.length === 0) {
      console.error(`[Anthropic API - Slot ${slotNumberForLogging}] Missing required fields after parsing payload.`);
      return NextResponse.json({ error: 'Missing required fields (model, slotNumber, conversationHistory).' }, { status: 400 });
    }
    // Ensure the last message in conversationHistory is from the user, which is the effective prompt.
    if (conversationHistory[conversationHistory.length -1].role !== 'user') {
        console.error(`[Anthropic API - Slot ${slotNumberForLogging}] Invalid conversation history: Last message not from user.`);
        return NextResponse.json({ error: 'Invalid conversation history: Last message must be from user.'}, { status: 400 });
    }

    const { data: userSettings, error: fetchError } = await supabase
      .from('user_settings')
      .select('anthropic_api_key_encrypted, use_provided_keys, free_tokens_remaining, paid_tokens_remaining')
      .eq('user_id', userId)
      .single(); // Use single as settings should exist

    if (fetchError || !userSettings) {
      console.error(`Call Anthropic: DB error or no settings for user ${userId}:`, fetchError);
      return NextResponse.json({ error: 'Could not retrieve user settings.' }, { status: 500 });
    }
    
    const settings = userSettings as UserSettingsForAnthropic;
    let apiKeyToUse: string | null = null;
    let keyType: 'user' | 'provided';
    console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Fetched user settings. use_provided_keys: ${settings.use_provided_keys}`);

    if (settings.use_provided_keys) {
      apiKeyToUse = process.env.PROVIDED_ANTHROPIC_API_KEY || null;
      keyType = 'provided';
      if (!apiKeyToUse) {
        console.error(`[Anthropic API - Slot ${slotNumberForLogging}] Service API key (PROVIDED_ANTHROPIC_API_KEY) not configured.`);
        return NextResponse.json({ error: 'Service API key not configured by admin.' }, { status: 503 });
      }
      const freeTokens = settings.free_tokens_remaining ?? 0;
      const paidTokens = settings.paid_tokens_remaining ?? 0;
      if (freeTokens + paidTokens <= 0) {
          console.warn(`[Anthropic API - Slot ${slotNumberForLogging}] User ${userId} has insufficient provided tokens.`);
          return NextResponse.json({ error: 'Insufficient tokens to use this service.' }, { status: 402 });
      }
    } else {
      keyType = 'user';
      if (!settings.anthropic_api_key_encrypted) {
        console.error(`[Anthropic API - Slot ${slotNumberForLogging}] User API key not configured.`);
        return NextResponse.json({ error: 'Anthropic API Key not configured. Please add it in Settings.' }, { status: 400 });
      }
      apiKeyToUse = decryptData(settings.anthropic_api_key_encrypted, serverEncryptionKey);
      if (!apiKeyToUse) {
        console.error(`[Anthropic API - Slot ${slotNumberForLogging}] Could not decrypt user API key.`);
        return NextResponse.json({ error: 'Could not decrypt API Key. Check API Key in Settings.' }, { status: 400 });
      }
    }
    console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Determined API key type: ${keyType}. Key presence: ${!!apiKeyToUse}`);

    const messagesForApi: Anthropic.Messages.MessageParam[] = conversationHistory
      .filter(msg => msg.content?.trim())
      .map(msg => ({
        role: msg.role === 'model' ? 'assistant' : 'user',
        content: msg.content
      }));

    if (messagesForApi.length === 0 || messagesForApi[messagesForApi.length - 1].role !== 'user') {
      // This check might be redundant if validated above, but good for safety before API call
      console.error(`[Anthropic API - Slot ${slotNumberForLogging}] Invalid conversation history format for API after filtering.`);
      return NextResponse.json({ error: 'Invalid conversation history format for Anthropic API.' }, { status: 500 });
    }

    try {
      console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Initializing Anthropic client.`);
      const anthropic = new Anthropic({ apiKey: apiKeyToUse });
      const messageParams: Anthropic.Messages.MessageCreateParams = {
        model: model,
        max_tokens: 4096, 
        messages: messagesForApi,
      };

      if (useSearch) {
        console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Search enabled for model ${model} in slot ${slotNumber}. Adding tool to params.`);
        messageParams.tools = [{ type: 'web_search_20250305', name: 'web_search' } as any];
      }
      console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Final messageParams for ${actualStreamFlag ? 'stream' : 'create'}:`, JSON.stringify(messageParams, null, 2));

      if (actualStreamFlag) {
        // STREAMING LOGIC FOR ANTHROPIC
        console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Attempting to call anthropic.messages.stream.`);
        const stream = anthropic.messages.stream(messageParams);
        console.log(`[Anthropic API - Slot ${slotNumberForLogging}] anthropic.messages.stream call completed. Preparing ReadableStream.`);
        
        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
            async start(controller) {
                console.log(`[Anthropic API - Slot ${slotNumberForLogging}] ReadableStream started.`);
                try {
                    let accumulatedResponseText = "";
                    let inputTokens = 0;
                    let outputTokens = 0;
                    let eventCount = 0;

                    // Anthropic stream events: message_start, content_block_delta, message_delta, message_stop
                    for await (const event of stream) {
                        eventCount++;
                        console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Stream event ${eventCount} received. Type: ${event.type}`);
                        // console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Full Event ${eventCount}:`, JSON.stringify(event));

                        if (event.type === 'message_start') {
                            inputTokens = event.message.usage.input_tokens;
                            console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Event 'message_start': Input tokens: ${inputTokens}`);
                        }
                        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                            const token = event.delta.text;
                            accumulatedResponseText += token;
                            // console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Event 'content_block_delta': Text: "${token}"`);
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", token })}\n\n`));
                        }
                        if (event.type === 'message_delta' && event.delta.stop_reason && event.usage) {
                            outputTokens = event.usage.output_tokens;
                            console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Event 'message_delta': Output tokens: ${outputTokens}, Stop Reason: ${event.delta.stop_reason}`);
                        }
                        if (event.type === 'message_stop') {
                             // The primary place for output tokens is the message_delta event with a stop_reason.
                             // This event mainly signifies the end of the stream.
                            console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Event 'message_stop' received.`);
                        }
                    }
                    console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Finished iterating stream. Total events: ${eventCount}. Accumulated text length: ${accumulatedResponseText.length}`);
                    
                    // Final token calculation assurance, sometimes message_delta is the final reliable source
                    const tokensUsed = inputTokens + outputTokens;
                    console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Total tokens for stream: Input: ${inputTokens}, Output: ${outputTokens}, Combined: ${tokensUsed}`);

                    let tokensToDeduct = tokensUsed;

                    if (keyType === 'provided' && tokensUsed > 0) {
                        tokensToDeduct = tokensUsed * 4; // Apply 4x multiplier
                        const { error: rpcError } = await supabase.rpc('decrement_user_tokens', {
                            user_id_param: userId,
                            tokens_to_deduct: tokensToDeduct,
                        });
                        if (rpcError) console.error(`Call Anthropic (Stream): Failed to decrement tokens for user ${userId}:`, rpcError);
                        else console.log(`Call Anthropic (Stream): Decremented ${tokensToDeduct} (raw: ${tokensUsed}) tokens.`);
                    }
                    
                    console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Enqueuing final tokens and stream end events.`);
                    await recordTokenUsage(supabase, userId, 'Anthropic', model, inputTokens, outputTokens, interactionId, slotNumber, keyType);
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "tokens", inputTokens, outputTokens })}\n\n`));
                    controller.enqueue(encoder.encode(`event: end\ndata: ${JSON.stringify({ message: "Stream ended" })}\n\n`));
                } catch (e: any) {
                    console.error(`[Anthropic API - Slot ${slotNumberForLogging}] Error during stream processing in ReadableStream:`, e.message, e.stack, JSON.stringify(e));
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: e.message || 'Streaming failed within Anthropic route' })}\n\n`));
                    controller.enqueue(encoder.encode(`event: end\ndata: ${JSON.stringify({ message: "Stream ended due to error" })}\n\n`));
                } finally {
                    console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Closing controller in ReadableStream.`);
                    controller.close();
                }
            }
        });
        console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Returning new Response with ReadableStream.`);
        return new Response(readableStream, {
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
        });

      } else {
        // NON-STREAMING LOGIC FOR ANTHROPIC
        console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Attempting to call anthropic.messages.create (non-streaming).`);
        const message = await anthropic.messages.create(messageParams);
        console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Non-streaming call completed. Full response:`, JSON.stringify(message, null, 2));

        if (!message || !message.content || message.content.length === 0 || message.content[0].type !== 'text') {
            console.error(`[Anthropic API - Slot ${slotNumberForLogging}] Non-streaming response empty or unexpected format.`);
            throw new Error('Response was empty or in an unexpected format.');
        }
        if (message.stop_reason === 'max_tokens') {
            console.warn(`[Anthropic API - Slot ${slotNumberForLogging}] Non-streaming response truncated due to max_tokens.`);
            throw new Error('Response truncated due to max token limit.');
        }
        // Allow other stop_reasons like 'end_turn' if content is present
        else if (message.stop_reason && message.stop_reason !== 'end_turn' && message.stop_reason !== 'tool_use') {
             console.warn(`[Anthropic API - Slot ${slotNumberForLogging}] Non-streaming response stopped unexpectedly. Reason: ${message.stop_reason}`);
             throw new Error(`Response stopped unexpectedly. Reason: ${message.stop_reason}`);
        }

        const responseText = message.content[0].text;
        if (responseText.trim() === "") {
            if (!message.content.some(block => block.type === 'tool_use')) {
                console.warn(`[Anthropic API - Slot ${slotNumberForLogging}] Non-streaming response text was empty and no tool use detected.`);
                throw new Error('Response text was empty.');
            }
            console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Non-streaming response text empty, but tool use detected. Proceeding.`);
        }
        console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Non-streaming response text (trimmed): "${responseText.trim().substring(0,100)}..."`);

        const inputTokens = message.usage?.input_tokens ?? 0;
        const outputTokens = message.usage?.output_tokens ?? 0;
        const tokensUsed = inputTokens + outputTokens;
        console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Non-streaming tokens: Input: ${inputTokens}, Output: ${outputTokens}, Combined: ${tokensUsed}`);

        if (keyType === 'provided' && tokensUsed > 0) {
          const { data: rpcData, error: rpcError } = await supabase.rpc('decrement_user_tokens', {
            user_id_param: userId,
            tokens_to_deduct: tokensUsed,
          });

          if (rpcError) {
            console.error(`[Anthropic API - Slot ${slotNumberForLogging}] (Non-stream) Failed to decrement tokens for user ${userId}:`, rpcError);
            // Decide if this is a critical failure
          } else {
              // Optional: Check rpcData for new token balances if needed
              console.log(`[Anthropic API - Slot ${slotNumberForLogging}] (Non-stream) Decremented ${tokensUsed} (raw: ${tokensUsed}) tokens. Balances:`, rpcData);
          }
        }

        await recordTokenUsage(supabase, userId, 'Anthropic', model, inputTokens, outputTokens, interactionId, slotNumber, keyType);
        console.log(`[Anthropic API - Slot ${slotNumberForLogging}] Non-streaming - Successfully recorded token usage.`);

        return NextResponse.json({
          response: responseText.trim(),
          inputTokens,
          outputTokens
        }, { status: 200 });
      }

    } catch (apiError: any) {
      console.error(`[Anthropic API - Slot ${slotNumberForLogging}] API Error (Model: ${modelForLogging}, User: ${userId}, Slot: ${slotNumberForLogging}):`, apiError.message, apiError.status, JSON.stringify(apiError));
      let errorMessage = 'Failed to get response from Anthropic.';
      let errorStatus = 500;
      if (apiError instanceof Anthropic.APIError) {
        errorMessage = apiError.message || errorMessage;
        errorStatus = apiError.status || errorStatus;
         if (apiError.status === 401) errorMessage = `Invalid Anthropic API Key (${keyType} key).`;
         else if (apiError.status === 403 && keyType === 'provided') errorMessage = `App's Anthropic API key lacks permissions or has billing issues.`;
         else if (apiError.status === 403 && keyType === 'user') errorMessage = `Your Anthropic API key lacks permissions or has billing issues.`;
         else if (apiError.status === 429) errorMessage = `Anthropic rate limit exceeded or quota reached.`;
      }
      return NextResponse.json({ error: errorMessage }, { status: errorStatus });
    }

  } catch (error: any) {
    console.error(`[Anthropic API - Slot ${slotNumberForLogging} - Unexpected] Error:`, error.message, error.stack, JSON.stringify(error));
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
