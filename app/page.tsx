/* eslint-disable @typescript-eslint/no-explicit-any */
// app/page.tsx
'use client'; // Client components

import React, { useState, useRef } from 'react';

// Interface for API responses for better type checking
interface ApiResponse {
  response?: string;
  error?: string;
}

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [processedText, setProcessedText] = useState(''); // Stores the input text that was processed

  // State for each AI
  const [geminiResponse, setGeminiResponse] = useState('');
  const [chatgptResponse, setChatgptResponse] = useState('');
  const [perplexityResponse, setPerplexityResponse] = useState('');

  const [geminiLoading, setGeminiLoading] = useState(false);
  const [chatgptLoading, setChatgptLoading] = useState(false);
  const [perplexityLoading, setPerplexityLoading] = useState(false);

  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [chatgptError, setChatgptError] = useState<string | null>(null);
  const [perplexityError, setPerplexityError] = useState<string | null>(null);

  const [showPanels, setShowPanels] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
  };

  const handleProcessText = async () => { // Make the function async
    if (inputText.trim() === '') {
      return; // Don't process empty input
    }

    // Reset states before new request
    setGeminiLoading(true);
    setChatgptLoading(true);
    setPerplexityLoading(true);

    setGeminiError(null);
    setChatgptError(null);
    setPerplexityError(null);

    setGeminiResponse('');
    setChatgptResponse('');
    setPerplexityResponse('');

    setProcessedText(inputText); // Store the text being processed
    setShowPanels(true); // Show panels immediately

    if (inputRef.current) {
        inputRef.current.blur(); // Blur input after submission
    }

    const currentInput = inputText; // Capture current input for API calls
    setInputText(''); // Clear the input field immediately

    try {
      // Use Promise.allSettled to wait for all requests, even if some fail
      const results = await Promise.allSettled([
        fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: currentInput }),
        }),
        fetch('/api/chatgpt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: currentInput }),
        }),
        fetch('/api/perplexity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: currentInput }),
        }),
      ]);

      // --- Process Gemini Response ---
      const geminiResult = results[0];
      if (geminiResult.status === 'fulfilled') {
        const response = geminiResult.value;
        const data: ApiResponse = await response.json();
        if (!response.ok) {
          console.error("Gemini API Error Response:", data);
          setGeminiError(data.error || `Request failed with status ${response.status}`);
        } else {
          setGeminiResponse(data.response || '');
        }
      } else {
        console.error("Failed to fetch from Gemini API route:", geminiResult.reason);
        setGeminiError(geminiResult.reason?.message || 'Failed to connect to the Gemini service.');
      }
      setGeminiLoading(false);

      // --- Process ChatGPT Response ---
      const chatgptResult = results[1];
      if (chatgptResult.status === 'fulfilled') {
        const response = chatgptResult.value;
        const data: ApiResponse = await response.json();
        if (!response.ok) {
           console.error("ChatGPT API Error Response:", data);
          setChatgptError(data.error || `Request failed with status ${response.status}`);
        } else {
          setChatgptResponse(data.response || '');
        }
      } else {
        console.error("Failed to fetch from ChatGPT API route:", chatgptResult.reason);
        setChatgptError(chatgptResult.reason?.message || 'Failed to connect to the ChatGPT service.');
      }
      setChatgptLoading(false);

      // --- Process Perplexity Response ---
      const perplexityResult = results[2];
      if (perplexityResult.status === 'fulfilled') {
        const response = perplexityResult.value;
        const data: ApiResponse = await response.json();
        if (!response.ok) {
          console.error("Perplexity API Error Response:", data);
          setPerplexityError(data.error || `Request failed with status ${response.status}`);
        } else {
          setPerplexityResponse(data.response || '');
        }
      } else {
        console.error("Failed to fetch from Perplexity API route:", perplexityResult.reason);
        setPerplexityError(perplexityResult.reason?.message || 'Failed to connect to the Perplexity service.');
      }
      setPerplexityLoading(false);

    } catch (err: any) {
      // This catch block might not be strictly necessary with Promise.allSettled
      // unless there's an issue setting up the promises themselves.
      console.error("An unexpected error occurred during fetch setup:", err);
      // Set a general error if needed, though individual errors are preferred
      setGeminiError(geminiError || 'An unexpected error occurred.');
      setChatgptError(chatgptError || 'An unexpected error occurred.');
      setPerplexityError(perplexityError || 'An unexpected error occurred.');
      setGeminiLoading(false);
      setChatgptLoading(false);
      setPerplexityLoading(false);
    }
  };

  // Determine overall loading state for disabling input/button
  const isLoading = geminiLoading || chatgptLoading || perplexityLoading;

  return (
    <main className="flex flex-col items-center justify-start min-h-screen p-4 bg-gray-50">
      <div className="w-full max-w-2xl mb-4 sticky top-4 z-10 bg-gray-50 pb-2">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={handleInputChange}
          placeholder="Enter your prompt for the AIs..."
          className="w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isLoading) {
              handleProcessText();
            }
          }}
          disabled={isLoading} // Disable input while any AI is loading
        />
        <button
          onClick={handleProcessText}
          className={`w-full mt-2 p-3 text-white rounded-md font-semibold transition-colors duration-200 ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'}`}
          disabled={isLoading} // Disable button while any AI is loading
        >
          {isLoading ? 'Processing...' : 'Send to All AIs'}
        </button>
      </div>

      {showPanels && (
        <div className="w-full max-w-6xl mt-6"> {/* Increased max-width */}
          {/* Optional: Display the processed prompt */}
           {/*<div className="mb-4 text-center">
               <p className="text-lg font-semibold text-gray-700">Your Prompt: <span className="font-normal">{processedText}</span></p>
           </div>*/}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4"> {/* Use grid for better alignment */}

            {/* AI Panel 1 - Gemini */}
            <div className="p-4 border rounded-lg bg-white shadow-md min-h-[150px]"> {/* Added min-height */}
              <h2 className="text-xl font-semibold mb-2 text-blue-600">Gemini</h2>
              {geminiLoading && <p className="text-gray-500 animate-pulse">Loading response...</p>}
              {geminiError && <p className="text-red-600">Error: {geminiError}</p>}
              {!geminiLoading && !geminiError && geminiResponse && (
                <div>
                  {/* <p className="text-sm text-gray-600 mb-1 font-medium">Response:</p> */}
                  <p className="whitespace-pre-wrap text-gray-800">{geminiResponse}</p>
                </div>
              )}
              {!geminiLoading && !geminiError && !geminiResponse && processedText && (
                 <p className="text-gray-400 italic">No response received.</p>
              )}
               {!geminiLoading && !geminiError && !geminiResponse && !processedText && (
                 <p className="text-gray-400 italic">Ready.</p> // Initial state
               )}
            </div>

            {/* AI Panel 2 - ChatGPT */}
            <div className="p-4 border rounded-lg bg-white shadow-md min-h-[150px]">
              <h2 className="text-xl font-semibold mb-2 text-green-600">ChatGPT</h2>
               {chatgptLoading && <p className="text-gray-500 animate-pulse">Loading response...</p>}
               {chatgptError && <p className="text-red-600">Error: {chatgptError}</p>}
               {!chatgptLoading && !chatgptError && chatgptResponse && (
                <div>
                  {/* <p className="text-sm text-gray-600 mb-1 font-medium">Response:</p> */}
                  <p className="whitespace-pre-wrap text-gray-800">{chatgptResponse}</p>
                </div>
              )}
               {!chatgptLoading && !chatgptError && !chatgptResponse && processedText && (
                 <p className="text-gray-400 italic">No response received.</p>
              )}
                {!chatgptLoading && !chatgptError && !chatgptResponse && !processedText && (
                  <p className="text-gray-400 italic">Ready.</p> // Initial state
                )}
            </div>

            {/* AI Panel 3 - Perplexity */}
            <div className="p-4 border rounded-lg bg-white shadow-md min-h-[150px]">
              <h2 className="text-xl font-semibold mb-2 text-purple-600">Perplexity</h2>
               {perplexityLoading && <p className="text-gray-500 animate-pulse">Loading response...</p>}
               {perplexityError && <p className="text-red-600">Error: {perplexityError}</p>}
               {!perplexityLoading && !perplexityError && perplexityResponse && (
                <div>
                  {/* <p className="text-sm text-gray-600 mb-1 font-medium">Response:</p> */}
                  <p className="whitespace-pre-wrap text-gray-800">{perplexityResponse}</p>
                </div>
              )}
               {!perplexityLoading && !perplexityError && !perplexityResponse && processedText && (
                 <p className="text-gray-400 italic">No response received.</p>
              )}
               {!perplexityLoading && !perplexityError && !perplexityResponse && !processedText && (
                 <p className="text-gray-400 italic">Ready.</p> // Initial state
               )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}