/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/gemini-flash/route.ts
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const MODEL_NAME = "gemini-1.5-flash-latest"; // Use the Flash model

export async function POST(req: Request) {
  const { prompt } = await req.json();

  if (!prompt) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const generationConfig = {
      temperature: 0.9, // Adjust as needed
      topK: 1,
      topP: 1,
      maxOutputTokens: 2048, // Adjust as needed
    };

    // Basic safety settings - adjust as necessary for your use case
    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
        safetySettings,
      });

    // Check for safety blocks or empty response before accessing text
     if (!result.response) {
        console.error('Gemini Flash blocked response. Reason:');
        return NextResponse.json({ error: `Request blocked by safety filters.` }, { status: 400 });
     }

    const responseText = result.response.text();
    return NextResponse.json({ response: responseText });

  } catch (error: any) {
    console.error('Error calling Gemini Flash API:', error);
     // Handle potential API errors more gracefully
     const errorMessage = error.message || 'An internal server error occurred calling the Gemini Flash API.';
     // Check for specific Gemini API error structures if available, otherwise use generic message.
     // Example: if (error.code === 'API_KEY_INVALID') ...
    return NextResponse.json({ error: `Gemini Flash API Error: ${errorMessage}` }, { status: 500 });
  }
}