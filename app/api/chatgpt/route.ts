/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/chatgpt/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const maxDuration = 60;

// Initialize OpenAI client using environment variable
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Ensure this is set in your .env.local
});

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    // Make the API call to OpenAI
    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-4o-mini', // Or 'gpt-4' or any other model you prefer
      // max_tokens: 150, // Optional: Limit response length
      // temperature: 0.7, // Optional: Adjust creativity
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || '';

    return NextResponse.json({ response: responseText });

  } catch (error: any) {
    console.error('Error calling OpenAI API:', error);

    // Provide a more specific error message if available
    const errorMessage = error.response?.data?.error?.message || error.message || 'An internal server error occurred';
    const errorStatus = error.response?.status || 500;

    return NextResponse.json({ error: `ChatGPT API Error: ${errorMessage}` }, { status: errorStatus });
  }
}