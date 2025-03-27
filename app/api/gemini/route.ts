// app/api/gemini/route.ts
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const MODEL_NAME = "gemini-2.0-flash"; // Or choose another appropriate model
const API_KEY = process.env.GEMINI_API_KEY; // Get API key from environment variables

export async function POST(request: Request) {
  if (!API_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  try {
    const reqBody = await request.json();
    const { prompt } = reqBody;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    // Basic safety settings - adjust as needed
    const generationConfig = {
      temperature: 0.9,
      topK: 1,
      topP: 1,
      maxOutputTokens: 2048,
    };

    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE, },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE, },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE, },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE, },
    ];

    const parts = [{ text: prompt }];

    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
      generationConfig,
      safetySettings,
    });

    // Check for blocked responses due to safety settings
    if (!result.response) {
       console.error('Gemini response blocked:', result); // Log the full result for debugging
       return NextResponse.json({ error: `Response blocked by safety settings.`}, { status: 400 });
    }

    const responseText = result.response.text();
    return NextResponse.json({ response: responseText });

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    // Provide a more generic error message to the client
    if (error instanceof Error) {
       return NextResponse.json({ error: 'Failed to fetch response from AI', details: error.message }, { status: 500 });
    }
     return NextResponse.json({ error: 'An unknown error occurred while fetching response from AI' }, { status: 500 });
  }
}