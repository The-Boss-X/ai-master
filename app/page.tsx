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

  // --- State for each AI ---
  // Gemini Flash (Panel 1)
  const [geminiFlashResponse, setGeminiFlashResponse] = useState('');
  const [geminiFlashLoading, setGeminiFlashLoading] = useState(false);
  const [geminiFlashError, setGeminiFlashError] = useState<string | null>(null);

  // ChatGPT (Panel 2)
  const [chatgptResponse, setChatgptResponse] = useState('');
  const [chatgptLoading, setChatgptLoading] = useState(false);
  const [chatgptError, setChatgptError] = useState<string | null>(null);

  // Gemini 1.5 Pro (Panel 3)
  const [geminiProResponse, setGeminiProResponse] = useState('');
  const [geminiProLoading, setGeminiProLoading] = useState(false);
  const [geminiProError, setGeminiProError] = useState<string | null>(null);
  // --- End State ---

  const [showPanels, setShowPanels] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
  };

  // No longer async at the top level, as we don't await Promise.all
  const handleProcessText = () => {
    if (inputText.trim() === '') {
      return; // Don't process empty input
    }

    // Reset states before new request for all AIs
    setGeminiFlashLoading(true);
    setChatgptLoading(true);
    setGeminiProLoading(true);

    setGeminiFlashError(null);
    setChatgptError(null);
    setGeminiProError(null);

    setGeminiFlashResponse('');
    setChatgptResponse('');
    setGeminiProResponse('');

    setProcessedText(inputText); // Store the text being processed
    setShowPanels(true); // Show panels immediately

    if (inputRef.current) {
        inputRef.current.blur(); // Blur input after submission
    }

    const currentInput = inputText; // Capture current input for API calls
    setInputText(''); // Clear the input field immediately

    // --- Initiate API Calls Individually ---

    // 1. Gemini Flash Request
    fetch('/api/gemini-flash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: currentInput }),
    })
    .then(async (response) => {
        const data: ApiResponse = await response.json();
        if (!response.ok) {
            console.error("Gemini Flash API Error Response:", data);
            // Throw an error to be caught by the .catch block
            throw new Error(data.error || `Request failed with status ${response.status}`);
        }
        setGeminiFlashResponse(data.response || '');
    })
    .catch((error: any) => {
        console.error("Failed to fetch or process Gemini Flash API route:", error);
        setGeminiFlashError(error.message || 'Failed to connect to the Gemini Flash service.');
    })
    .finally(() => {
        setGeminiFlashLoading(false); // Stop loading indicator for this AI specifically
    });

    // 2. ChatGPT Request
    fetch('/api/chatgpt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: currentInput }),
    })
    .then(async (response) => {
        const data: ApiResponse = await response.json();
        if (!response.ok) {
            console.error("ChatGPT API Error Response:", data);
            throw new Error(data.error || `Request failed with status ${response.status}`);
        }
        setChatgptResponse(data.response || '');
    })
    .catch((error: any) => {
        console.error("Failed to fetch or process ChatGPT API route:", error);
        setChatgptError(error.message || 'Failed to connect to the ChatGPT service.');
    })
    .finally(() => {
        setChatgptLoading(false); // Stop loading indicator for this AI specifically
    });

    // 3. Gemini Pro Request
    fetch('/api/gemini-pro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: currentInput }),
    })
    .then(async (response) => {
        const data: ApiResponse = await response.json();
        if (!response.ok) {
            console.error("Gemini Pro API Error Response:", data);
            throw new Error(data.error || `Request failed with status ${response.status}`);
        }
        setGeminiProResponse(data.response || '');
    })
    .catch((error: any) => {
        console.error("Failed to fetch or process Gemini Pro API route:", error);
        setGeminiProError(error.message || 'Failed to connect to the Gemini Pro service.');
    })
    .finally(() => {
        setGeminiProLoading(false); // Stop loading indicator for this AI specifically
    });
  };

  // Determine overall loading state for disabling input/button - remains the same logic
  const isLoading = geminiFlashLoading || chatgptLoading || geminiProLoading;

  return (
    <main className="flex flex-col items-center justify-start min-h-screen p-4 bg-gray-50">
      {/* Input and Button Section */}
      <div className="w-full max-w-2xl mb-4 sticky top-4 z-10 bg-gray-50 pb-2">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={handleInputChange}
          placeholder="Enter your prompt for the AIs..."
          className="w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm"
          onKeyDown={(e) => {
            // Prevent Enter submission if already loading or input is empty
            if (e.key === 'Enter' && !isLoading && inputText.trim() !== '') {
              handleProcessText();
            }
          }}
          disabled={isLoading} // Disable input while any AI is loading
        />
        <button
          onClick={handleProcessText}
          className={`w-full mt-2 p-3 text-white rounded-md font-semibold transition-colors duration-200 ${isLoading || inputText.trim() === '' ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'}`}
          disabled={isLoading || inputText.trim() === ''} // Disable button while loading OR if input is empty
        >
          {/* Show different text based on loading state */}
          {geminiFlashLoading && chatgptLoading && geminiProLoading ? 'Processing all...' :
           isLoading ? 'Processing...' :
           'Send to All AIs'}
        </button>
      </div>

      {/* AI Response Panels Section */}
      {showPanels && (
        <div className="w-full max-w-6xl mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

            {/* AI Panel 1 - Gemini Flash */}
            <div className="p-4 border rounded-lg bg-white shadow-md min-h-[150px] flex flex-col"> {/* Flex column for structure */}
              <h2 className="text-xl font-semibold mb-2 text-blue-600 flex-shrink-0">Gemini Flash</h2>
              <div className="flex-grow overflow-y-auto"> {/* Allow content to scroll if needed */}
                {geminiFlashLoading && <p className="text-gray-500 animate-pulse">Loading response...</p>}
                {geminiFlashError && <p className="text-red-600">Error: {geminiFlashError}</p>}
                {!geminiFlashLoading && !geminiFlashError && geminiFlashResponse && (
                  <p className="whitespace-pre-wrap text-gray-800">{geminiFlashResponse}</p>
                )}
                {/* Show "No response" only after loading finishes and if there's no error/response */}
                {!geminiFlashLoading && !geminiFlashError && !geminiFlashResponse && processedText && (
                  <p className="text-gray-400 italic">No response received.</p>
                )}
                {/* Initial ready state before first processing */}
                {!geminiFlashLoading && !geminiFlashError && !geminiFlashResponse && !processedText && (
                  <p className="text-gray-400 italic">Ready.</p>
                )}
              </div>
            </div>

            {/* AI Panel 2 - ChatGPT */}
            <div className="p-4 border rounded-lg bg-white shadow-md min-h-[150px] flex flex-col">
              <h2 className="text-xl font-semibold mb-2 text-green-600 flex-shrink-0">ChatGPT</h2>
               <div className="flex-grow overflow-y-auto">
                 {chatgptLoading && <p className="text-gray-500 animate-pulse">Loading response...</p>}
                 {chatgptError && <p className="text-red-600">Error: {chatgptError}</p>}
                 {!chatgptLoading && !chatgptError && chatgptResponse && (
                  <p className="whitespace-pre-wrap text-gray-800">{chatgptResponse}</p>
                 )}
                 {!chatgptLoading && !chatgptError && !chatgptResponse && processedText && (
                   <p className="text-gray-400 italic">No response received.</p>
                 )}
                 {!chatgptLoading && !chatgptError && !chatgptResponse && !processedText && (
                    <p className="text-gray-400 italic">Ready.</p>
                 )}
               </div>
            </div>

            {/* AI Panel 3 - Gemini 1.5 Pro */}
            <div className="p-4 border rounded-lg bg-white shadow-md min-h-[150px] flex flex-col">
              <h2 className="text-xl font-semibold mb-2 text-purple-600 flex-shrink-0">Gemini 1.5 Pro</h2>
               <div className="flex-grow overflow-y-auto">
                 {geminiProLoading && <p className="text-gray-500 animate-pulse">Loading response...</p>}
                 {geminiProError && <p className="text-red-600">Error: {geminiProError}</p>}
                 {!geminiProLoading && !geminiProError && geminiProResponse && (
                  <p className="whitespace-pre-wrap text-gray-800">{geminiProResponse}</p>
                 )}
                 {!geminiProLoading && !geminiProError && !geminiProResponse && processedText && (
                   <p className="text-gray-400 italic">No response received.</p>
                 )}
                 {!geminiProLoading && !geminiProError && !geminiProResponse && !processedText && (
                   <p className="text-gray-400 italic">Ready.</p>
                 )}
               </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}