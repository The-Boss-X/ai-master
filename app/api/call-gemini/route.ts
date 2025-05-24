/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Content, FinishReason } from '@google/generative-ai';
import crypto from 'crypto';
import { recordTokenUsage } from '../../../lib/tokenUtils';
import { Database } from '@/lib/database.types';

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
  stream?: boolean;
}

interface UserSettingsForGemini {
  gemini_api_key_encrypted: string | null;
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
      throw new Error('Invalid encrypted data format.');
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
  return handleRequest(request, false);
}

export async function GET(request: NextRequest) {
  return handleRequest(request, true);
}

async function handleRequest(request: NextRequest, isStreamingAttempt: boolean) {
  let slotNumberInitial: CallGeminiRequest['slotNumber'] | string = "N/A";
  let model: string | undefined = undefined;
  let userId: string | undefined = undefined;

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
    console.error('Call Gemini Error: API_KEY_ENCRYPTION_KEY missing or invalid.');
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    userId = session.user.id;

    let payload: CallGeminiRequest;
    let actualStreamFlag = false;

    if (isStreamingAttempt) {
        const url = new URL(request.url);
        const queryParams = Object.fromEntries(url.searchParams.entries());
        payload = {
            prompt: queryParams.prompt || "",
            model: queryParams.model || "",
            slotNumber: parseInt(queryParams.slotNumber, 10) as CallGeminiRequest['slotNumber'] || 1,
            conversationHistory: queryParams.conversationHistory ? JSON.parse(queryParams.conversationHistory) : [],
            interactionId: queryParams.interactionId === 'null' || queryParams.interactionId === undefined ? null : queryParams.interactionId,
            stream: true,
        };
        actualStreamFlag = true;
         if (!payload.prompt || !payload.model || !payload.slotNumber) {
          return NextResponse.json({ error: 'Missing required fields for streaming (prompt, model, slotNumber).' }, { status: 400 });
        }
    } else {
        try {
            payload = await request.json();
            actualStreamFlag = payload.stream || false;
        } catch {
            return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
        }
    }
    
    const { prompt, conversationHistory, interactionId } = payload;
    model = payload.model;
    slotNumberInitial = payload.slotNumber;

    if (!prompt || !model || !slotNumberInitial) {
      console.error(`[Gemini API - Slot ${slotNumberInitial}] Missing critical payload fields: prompt, model, or slotNumberInitial.`);
      return NextResponse.json({ error: 'Missing required fields in payload (prompt, model, or slotNumberInitial).' }, { status: 400 });
    }
    
    const currentModel = model;
    const currentSlotNumber = slotNumberInitial as CallGeminiRequest['slotNumber'];

    const { data: userSettings, error: fetchError } = await supabase
      .from('user_settings')
      .select('gemini_api_key_encrypted, use_provided_keys, free_tokens_remaining, paid_tokens_remaining')
      .eq('user_id', userId)
      .single();

    if (fetchError || !userSettings) {
      console.error(`Call Gemini: DB error or no settings for user ${userId}:`, fetchError);
      return NextResponse.json({ error: 'Could not retrieve user settings.' }, { status: 500 });
    }
    
    const settings = userSettings as UserSettingsForGemini;
    let apiKeyToUse: string | null = null;
    let keyType: 'user' | 'provided';

    if (settings.use_provided_keys) {
      apiKeyToUse = process.env.PROVIDED_GEMINI_API_KEY || null;
      keyType = 'provided';
      if (!apiKeyToUse) {
        console.error('Call Gemini: PROVIDED_GEMINI_API_KEY is not set on the server.');
        return NextResponse.json({ error: 'Service API key not configured by admin.' }, { status: 503 });
      }
      const freeTokens = settings.free_tokens_remaining ?? 0;
      const paidTokens = settings.paid_tokens_remaining ?? 0;
      if (freeTokens + paidTokens <= 0) {
          return NextResponse.json({ error: 'Insufficient tokens to use this service.' }, { status: 402 });
      }
    } else {
      keyType = 'user';
      if (!settings.gemini_api_key_encrypted) {
        return NextResponse.json({ error: 'Gemini API Key not configured. Please add it in Settings.' }, { status: 400 });
      }
      apiKeyToUse = decryptData(settings.gemini_api_key_encrypted, serverEncryptionKey);
      if (!apiKeyToUse) {
        return NextResponse.json({ error: 'Could not decrypt API Key. Check API Key in Settings.' }, { status: 400 });
      }
    }

    const historyForStartChat: Content[] = (conversationHistory || [])
      .filter(msg => msg.content?.trim())
      .map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));
      
    const currentPromptContent: Content = { role: 'user', parts: [{ text: prompt }] };
    const fullConversationForStream: Content[] = [...historyForStartChat, currentPromptContent];

    try {
      console.log(`[Gemini API - Slot ${currentSlotNumber}] Initializing GoogleGenerativeAI with key type: ${keyType}`);
      const genAI = new GoogleGenerativeAI(apiKeyToUse);
      const generativeModel = genAI.getGenerativeModel({ model: currentModel });
      const generationConfig: any = {};

      const requestOptionsForLog = {
        contents: actualStreamFlag ? fullConversationForStream : historyForStartChat, // historyForStartChat for non-stream, full for stream
        ...(Object.keys(generationConfig).length > 0 && { generationConfig }),
        ...( !actualStreamFlag && { prompt: prompt }) // Add prompt for non-streaming startChat.sendMessage
      };
      console.log(`[Gemini API - Slot ${currentSlotNumber}] Request options for ${actualStreamFlag ? 'generateContentStream' : 'startChat/sendMessage'}:`, JSON.stringify(requestOptionsForLog, null, 2));

      if (actualStreamFlag) {
        console.log(`[Gemini API - Slot ${currentSlotNumber}] Attempting to call generateContentStream.`);
        const streamResult = await generativeModel.generateContentStream(
          { contents: fullConversationForStream,
            ...(Object.keys(generationConfig).length > 0 && { generationConfig }) 
          }
        );
        console.log(`[Gemini API - Slot ${currentSlotNumber}] generateContentStream call completed. Preparing ReadableStream.`);
        
        const encoder = new TextEncoder();
        const readableStream = new ReadableStream({
          async start(controller) {
            console.log(`[Gemini API - Slot ${currentSlotNumber}] ReadableStream started. Beginning to iterate streamResult.stream.`);
            try {
              let accumulatedResponseText = "";
              let inputTokens = 0;
              let outputTokens = 0;
              let chunkCount = 0;

              for await (const chunk of streamResult.stream) {
                chunkCount++;
                const chunkText = chunk.text();
                console.log(`[Gemini API - Slot ${currentSlotNumber}] Stream chunk ${chunkCount} received. Text length: ${chunkText?.length || 0}. Has usageMetadata: ${!!chunk.usageMetadata}`);
                if (chunkText) {
                  accumulatedResponseText += chunkText;
                  // Use candidatesTokenCount if available, otherwise estimate. It might be 0 for delta chunks.
                  const chunkOutputTokens = chunk.usageMetadata?.candidatesTokenCount || 0;
                  outputTokens += chunkOutputTokens; 
                  // console.log(`[Gemini API - Slot ${currentSlotNumber}] Chunk ${chunkCount} output tokens: ${chunkOutputTokens}, Total output tokens so far: ${outputTokens}`);
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", token: chunkText })}\n\n`));
                }
                if (chunk.usageMetadata?.promptTokenCount && !inputTokens) {
                    inputTokens = chunk.usageMetadata.promptTokenCount;
                    console.log(`[Gemini API - Slot ${currentSlotNumber}] Prompt tokens from chunk ${chunkCount}: ${inputTokens}`);
                }
              }
              
              console.log(`[Gemini API - Slot ${currentSlotNumber}] Finished iterating over stream chunks. Total chunks: ${chunkCount}. Accumulated text length: ${accumulatedResponseText.length}`);

              let finalInputTokens = inputTokens;
              let finalOutputTokens = outputTokens;

              try {
                console.log(`[Gemini API - Slot ${currentSlotNumber}] Attempting to await streamResult.response for final metadata.`);
                const finalResponse = await streamResult.response;
                console.log(`[Gemini API - Slot ${currentSlotNumber}] Successfully awaited streamResult.response.`);
                if (finalResponse) {
                    console.log(`[Gemini API - Slot ${currentSlotNumber}] finalResponse content:`, JSON.stringify(finalResponse, null, 2));
                    const finalUsageMetadata = finalResponse.usageMetadata;
                    if (finalUsageMetadata) {
                        finalInputTokens = finalUsageMetadata.promptTokenCount ?? inputTokens;
                        finalOutputTokens = finalUsageMetadata.candidatesTokenCount ?? outputTokens;
                        console.log(`[Gemini API - Slot ${currentSlotNumber}] Final tokens from metadata: In: ${finalInputTokens}, Out: ${finalOutputTokens}. Finish Reason: ${finalResponse.candidates?.[0]?.finishReason}`);
                    } else {
                        console.warn(`[Gemini API - Slot ${currentSlotNumber}] No final usageMetadata found in streamResult.response. Using accumulated estimates. Finish Reason from finalResponse (if any): ${finalResponse.candidates?.[0]?.finishReason}`);
                    }
                } else {
                     console.warn(`[Gemini API - Slot ${currentSlotNumber}] streamResult.response was null or undefined.`);
                }
              } catch (responseError: any) {
                console.error(`[Gemini API - Slot ${currentSlotNumber}] Error awaiting or processing streamResult.response:`, responseError.message, responseError.stack);
                // Keep using accumulated tokens if this fails
              }
              
              const tokensUsed = finalInputTokens + finalOutputTokens;
              console.log(`[Gemini API - Slot ${currentSlotNumber}] Total tokens for this stream: Input: ${finalInputTokens}, Output: ${finalOutputTokens}, Combined: ${tokensUsed}`);

              let tokensToDeduct = tokensUsed;
              if (keyType === 'provided' && tokensUsed > 0) {
                tokensToDeduct = tokensUsed * 4;
                const { data: rpcData, error: rpcError } = await supabase.rpc('decrement_user_tokens', {
                  user_id_param: userId!,
                  tokens_to_deduct: tokensToDeduct,
                });
                if (rpcError) console.error(`Call Gemini (Stream): Failed to decrement tokens for user ${userId}:`, rpcError);
                else console.log(`Call Gemini (Stream): Decremented ${tokensToDeduct} (raw: ${tokensUsed}) tokens. Balances:`, rpcData);
              } else if (keyType === 'user' && tokensUsed > 0) {
                 // If user key, recordTokenUsage will handle incrementing their total_tokens_used_overall
                 // No direct RPC call to increment_user_own_key_tokens needed here as it's in recordTokenUsage
              }
              
              // Call recordTokenUsage with 9 arguments
              await recordTokenUsage(supabase, userId!, 'Gemini', currentModel, finalInputTokens, finalOutputTokens, interactionId, currentSlotNumber, keyType);

              console.log(`[Gemini API - Slot ${currentSlotNumber}] Enqueuing final tokens event.`);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "tokens", inputTokens: finalInputTokens, outputTokens: finalOutputTokens })}\n\n`));
              console.log(`[Gemini API - Slot ${currentSlotNumber}] Enqueuing stream end event.`);
              controller.enqueue(encoder.encode(`event: end\ndata: ${JSON.stringify({ message: "Stream ended" })}\n\n`));
            } catch (e: any) {
              console.error(`[Gemini API - Slot ${currentSlotNumber}] Error during stream processing in ReadableStream:`, e.message, e.stack);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: e.message || 'Streaming failed within Gemini route' })}\n\n`));
              console.log(`[Gemini API - Slot ${currentSlotNumber}] Enqueuing stream end event after error.`);
              controller.enqueue(encoder.encode(`event: end\ndata: ${JSON.stringify({ message: "Stream ended due to error" })}\n\n`));
            } finally {
              console.log(`[Gemini API - Slot ${currentSlotNumber}] Closing controller in ReadableStream.`);
              controller.close();
            }
          }
        });
        
        console.log(`[Gemini API - Slot ${currentSlotNumber}] Returning new Response with ReadableStream.`);
        return new Response(readableStream, {
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
        });

      } else {
        console.log(`[Gemini API - Slot ${currentSlotNumber}] Full conversation history for non-streaming chat:`, JSON.stringify(historyForStartChat, null, 2));
        const chat = generativeModel.startChat({ history: historyForStartChat });
        console.log(`[Gemini API - Slot ${currentSlotNumber}] Attempting to call chat.sendMessage. Prompt: "${prompt}".`);
        
        const messageOptions: any = {};
        if (Object.keys(generationConfig).length > 0) {
            messageOptions.generationConfig = generationConfig;
        }

        const result = Object.keys(messageOptions).length > 0 
            ? await chat.sendMessage(prompt, messageOptions)
            : await chat.sendMessage(prompt);

        const response = result.response;
        console.log(`[Gemini API - Slot ${currentSlotNumber}] Non-streaming sendMessage call completed. Full response:`, JSON.stringify(response, null, 2));

        const promptFeedback = response.promptFeedback;
        const finishReason = response.candidates?.[0]?.finishReason;
        console.log(`[Gemini API - Slot ${currentSlotNumber}] Non-streaming - PromptFeedback: ${JSON.stringify(promptFeedback)}, FinishReason: ${finishReason}`);

        if (promptFeedback?.blockReason || finishReason === FinishReason.SAFETY || finishReason === FinishReason.OTHER) {
          const reason = promptFeedback?.blockReason || finishReason || 'Unknown Safety/Block Reason';
          return NextResponse.json({ error: `Gemini response blocked due to ${reason}.` }, { status: 400 });
        }

        const responseText = response.text();
        if (responseText === undefined || responseText === null || responseText.trim() === "") {
          const reason = finishReason || 'Unknown';
          console.error(`[Gemini API - Slot ${currentSlotNumber}] Non-streaming returned empty response. Finish Reason: ${reason}`);
          return NextResponse.json({ error: `Gemini returned an empty response (Finish Reason: ${reason}).` }, { status: 500 });
        }
        console.log(`[Gemini API - Slot ${currentSlotNumber}] Non-streaming response text (trimmed): "${responseText.trim().substring(0, 100)}..."`);

        const inputTokens = result.response.usageMetadata?.promptTokenCount ?? 0;
        const outputTokens = result.response.usageMetadata?.candidatesTokenCount ?? 0;
        const tokensUsed = inputTokens + outputTokens;
        console.log(`[Gemini API - Slot ${currentSlotNumber}] Non-streaming tokens: Input: ${inputTokens}, Output: ${outputTokens}, Combined: ${tokensUsed}`);

        if (keyType === 'provided' && tokensUsed > 0) {
           const { data: rpcData, error: rpcError } = await supabase.rpc('decrement_user_tokens', {
            user_id_param: userId!,
            tokens_to_deduct: tokensUsed,
          });
          if (rpcError) console.error(`Call Gemini: Failed to decrement tokens for user ${userId}:`, rpcError);
          else console.log(`Call Gemini: Decremented ${tokensUsed} tokens. New balances:`, rpcData);
        } else if (keyType === 'user' && tokensUsed > 0) {
            // If user key, recordTokenUsage will handle incrementing their total_tokens_used_overall
            // No direct RPC call to increment_user_own_key_tokens needed here as it's in recordTokenUsage
        }

        // Call recordTokenUsage with 9 arguments
        await recordTokenUsage(supabase, userId!, 'Gemini', currentModel, inputTokens, outputTokens, interactionId, currentSlotNumber, keyType);
        console.log(`[Gemini API - Slot ${currentSlotNumber}] Non-streaming - Successfully recorded token usage.`);

        return NextResponse.json({
          response: responseText.trim(),
          inputTokens,
          outputTokens
        }, { status: 200 });
      }

    } catch (apiError: any) {
      console.error(`[Gemini API - Slot ${slotNumberInitial} - API Error (Model: ${model}, User: ${userId}, Slot: ${slotNumberInitial}):`, apiError.message, apiError.stack, apiError);
      let errorMessage = 'Failed to get response from Google AI.';
      let errorStatus = 500;
      if (apiError.status && typeof apiError.status === 'number') errorStatus = apiError.status;
      if (apiError.message) errorMessage = apiError.message;
      if (apiError.message?.includes("API key not valid")) {
        errorMessage = `Invalid Google AI API Key (${keyType} key). Please check your key.`;
        errorStatus = 401;
      } else if (apiError.message?.includes("billing account")) {
         errorMessage = `Your Google Cloud project for this API key (${keyType} key) may have billing issues or the API is not enabled.`;
         errorStatus = 403;
      }
      return NextResponse.json({ error: errorMessage }, { status: errorStatus });
    }

  } catch (error: any) {
    // Ensure slotNumberInitial is available for logging, or use a placeholder
    const logSlotNumber = typeof slotNumberInitial !== 'undefined' ? slotNumberInitial : "N/A";
    console.error(`[Gemini API - Slot ${logSlotNumber} - Unexpected] Error:`, error.message, error.stack, error);
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
