// page.tsx
'use client'; // Client components

import React, { useState, useRef } from 'react';

export default function Home() {
  const [inputText, setInputText] = useState('');
  const [processedText, setProcessedText] = useState('');
  const [showPanels, setShowPanels] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
  };

  const handleProcessText = () => {
    if (inputText.trim() !== '') {
      setProcessedText(inputText);
      setInputText('');
      setShowPanels(true);
      if(inputRef.current){
        inputRef.current.blur();
      }
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
          placeholder="Enter your text..."
          className="w-full p-2 border rounded-md focus:outline-none focus:ring focus:border-blue-300"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleProcessText();
            }
          }}
        />
        <button
          onClick={handleProcessText}
          className="w-full mt-2 p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
        >
          Process
        </button>
      </div>

      {showPanels && (
        <div className="w-full max-w-4xl">
          <div className="mb-4">
            <p className="text-lg font-semibold">Processed Text: {processedText}</p>
          </div>
          <div className="flex justify-between w-full">
            <div className="w-1/3 p-4 border rounded-md">
              <h2 className="text-xl font-semibold mb-2">AI Panel 1</h2>
              <p>Response from AI 1: (Simulated)</p>
              <p className="mt-2">
                {`AI 1 processed: "${processedText}"`}
              </p>
              {/* Simulate API call here (dummy data) */}
            </div>
            <div className="w-1/3 p-4 border rounded-md mx-2">
              <h2 className="text-xl font-semibold mb-2">AI Panel 2</h2>
              <p>Response from AI 2: (Simulated)</p>
              <p className="mt-2">
                {`AI 2 processed: "${processedText}"`}
              </p>
              {/* Simulate API call here (dummy data) */}
            </div>
            <div className="w-1/3 p-4 border rounded-md">
              <h2 className="text-xl font-semibold mb-2">AI Panel 3</h2>
              <p>Response from AI 3: (Simulated)</p>
              <p className="mt-2">
                {`AI 3 processed: "${processedText}"`}
              </p>
              {/* Simulate API call here (dummy data) */}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}