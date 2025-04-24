/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/gemini-pro/route.ts
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

export const maxDuration = 60;

const MODEL_NAME = "gemini-1.5-pro-latest"; // Use the Pro model

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
      temperature: 0.8, // Adjust as needed (can differ from Flash)
      topK: 1,
      topP: 1,
      maxOutputTokens: 4096, // Pro often supports larger outputs
    };

    // Basic safety settings - adjust as necessary
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

    // Check for safety blocks or empty response
    if (!result.response) {
       console.error('Gemini Pro blocked response.');
       return NextResponse.json({ error: `Request blocked by safety filters.` }, { status: 400 });
    }

    const responseText = result.response.text();
    return NextResponse.json({ response: responseText });

  } catch (error: any) {
    console.error('Error calling Gemini Pro API:', error);
    const errorMessage = error.message || 'An internal server error occurred calling the Gemini Pro API.';
    return NextResponse.json({ error: `Gemini Pro API Error: ${errorMessage}` }, { status: 500 });
  }
}