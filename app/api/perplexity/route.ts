/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/perplexity/route.ts
import { NextResponse } from 'next/server';
import OpenAI from 'openai'; // We can reuse the OpenAI SDK

// Initialize OpenAI client specifically for Perplexity
const perplexity = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY, // Ensure this is set in your .env.local
  baseURL: 'https://api.perplexity.ai', // Point to Perplexity's API endpoint
});

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

     if (!process.env.PERPLEXITY_API_KEY) {
        return NextResponse.json({ error: 'Perplexity API key not configured' }, { status: 500 });
    }

    // Make the API call to Perplexity
    // Use a Perplexity model, e.g., 'llama-3-sonar-small-32k-online' or 'pplx-7b-online'
    const completion = await perplexity.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3-sonar-small-32k-online', // Recommended model
      // max_tokens: 150, // Optional
      // temperature: 0.7, // Optional
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || '';

    return NextResponse.json({ response: responseText });

  } catch (error: any) {
    console.error('Error calling Perplexity API:', error);

    // Provide a more specific error message if available
    const errorMessage = error.response?.data?.error?.message || error.message || 'An internal server error occurred';
    const errorStatus = error.response?.status || 500;

    return NextResponse.json({ error: `Perplexity API Error: ${errorMessage}` }, { status: errorStatus });
  }
}