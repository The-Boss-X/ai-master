/* eslint-disable @typescript-eslint/no-explicit-any */
// page.tsx
'use client'; // Client components

import React, { useState, useRef } from 'react';

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [processedText, setProcessedText] = useState(''); // Stores the input text that was processed
  const [geminiResponse, setGeminiResponse] = useState(''); // Stores the response from Gemini API
  const [isLoading, setIsLoading] = useState(false); // Loading state for API call
  const [error, setError] = useState<string | null>(null); // Error state for API call
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
    setIsLoading(true);
    setError(null);
    setGeminiResponse(''); // Clear previous response
    setProcessedText(inputText); // Store the text being processed
    setShowPanels(true); // Show panels immediately

    if (inputRef.current) {
        inputRef.current.blur(); // Blur input after submission
    }

    try {
      const response = await fetch('/api/gemini', { // Call your API route
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: inputText }), // Send the input text as prompt
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle errors from the API route (e.g., invalid key, Gemini error, safety block)
        console.error("API Error Response:", data);
        throw new Error(data.error || 'An unknown error occurred');
      }

      setGeminiResponse(data.response); // Set the successful response

    } catch (err: any) {
      console.error("Failed to fetch from API route:", err);
      setError(err.message || 'Failed to connect to the AI service.');
      setGeminiResponse(''); // Ensure response area is clear on error
    } finally {
      setIsLoading(false); // Stop loading indicator
      setInputText(''); // Clear the input field after processing starts
    }
  };

  return (
    <main className="flex flex-col items-center justify-start min-h-screen p-4">
      <div className="w-full max-w-2xl mb-4">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={handleInputChange}
          placeholder="Enter your prompt for the AI..."
          className="w-full p-2 border rounded-md focus:outline-none focus:ring focus:border-blue-300"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleProcessText();
            }
          }}
          disabled={isLoading} // Disable input while loading
        />
        <button
          onClick={handleProcessText}
          className={`w-full mt-2 p-2 text-white rounded-md ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'}`}
          disabled={isLoading} // Disable button while loading
        >
          {isLoading ? 'Processing...' : 'Process'}
        </button>
      </div>

      {showPanels && (
        <div className="w-full max-w-4xl mt-6">
          {/* Optional: Display the processed prompt clearly */}
          {/* <div className="mb-4">
             <p className="text-lg font-semibold">Your Prompt: {processedText}</p>
           </div> */}

          <div className="flex flex-col md:flex-row justify-between w-full gap-4"> {/* Use gap for spacing */}
            {/* AI Panel 1 - Gemini */}
            <div className="w-full md:w-1/3 p-4 border rounded-md bg-white shadow">
              <h2 className="text-xl font-semibold mb-2 text-blue-600">Gemini</h2>
              {isLoading && <p className="text-gray-500">Loading response...</p>}
              {error && <p className="text-red-600">Error: {error}</p>}
              {!isLoading && !error && geminiResponse && (
                <div>
                  <p className="text-sm text-gray-600 mb-2">Response:</p>
                  <p className="whitespace-pre-wrap">{geminiResponse}</p> {/* Use pre-wrap to preserve formatting */}
                </div>
              )}
               {!isLoading && !error && !geminiResponse && !processedText && (
                 <p className="text-gray-400">Enter a prompt above.</p> // Initial state
               )}
               {!isLoading && !error && !geminiResponse && processedText && !isLoading && (
                 <p className="text-gray-400">No response received.</p> // If empty response or error before setting state
               )}
            </div>

            {/* AI Panel 2 - Placeholder */}
            <div className="w-full md:w-1/3 p-4 border rounded-md bg-white shadow">
              <h2 className="text-xl font-semibold mb-2 text-green-600">AI Panel 2</h2>
              <p className="text-gray-500">Response from AI 2: (Simulated)</p>
              <p className="mt-2 text-sm">
                {`AI 2 processed: "${processedText}"`}
              </p>
              {/* Integrate API call for AI 2 here later */}
            </div>

            {/* AI Panel 3 - Placeholder */}
            <div className="w-full md:w-1/3 p-4 border rounded-md bg-white shadow">
              <h2 className="text-xl font-semibold mb-2 text-purple-600">AI Panel 3</h2>
              <p className="text-gray-500">Response from AI 3: (Simulated)</p>
              <p className="mt-2 text-sm">
                {`AI 3 processed: "${processedText}"`}
              </p>
              {/* Integrate API call for AI 3 here later */}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}