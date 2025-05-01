// app/layout.tsx
import React from 'react';
// CORRECT IMPORT: Import AuthProvider from the context directory
import { AuthProvider } from './context/AuthContext';
// Assuming AccountButton exists and path is correct - uncomment if you have this component
import AccountButton from './components/AccountButton'; // Make sure this path is correct
import './globals.css'; // Your global styles
import { Inter } from "next/font/google"; // Import font

const inter = Inter({ subsets: ["latin"] }); // Initialize font

// Define metadata (can be static or dynamic)
export const metadata = {
  title: 'AI Master',
  description: 'Responses from multiple AI models.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      {/* Apply font className */}
      {/*
        CHANGE 1: Use `h-screen` instead of `min-h-screen`.
                  This forces the body to be exactly the viewport height.
        CHANGE 2: Add `overflow-hidden`.
                  This prevents the body itself from showing scrollbars
                  if content technically tries to overflow it.
      */}
      <body className={`${inter.className} flex flex-col h-screen overflow-hidden bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100`}>
        {/* AuthProvider wraps everything to provide context */}
        <AuthProvider>
          {/* Header Section - No changes needed here.
              It occupies its space, and `flex-shrink-0` prevents it from shrinking.
              `sticky` ensures it stays visible on scroll within the bounds established by the body.
          */}
          <header className="bg-white dark:bg-gray-800 shadow-sm p-4 sticky top-0 z-10 flex-shrink-0 border-b dark:border-gray-700">
            <div className="w-full flex justify-between items-center">
              <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                AI Master
              </h1>
              <div>
                <AccountButton /> {/* Include the AccountButton component */}
              </div>
            </div>
          </header>
  
          {/* Main content area takes remaining height */}
          {/*
            CHANGE 3: Add `overflow-y-auto`.
                      This tells the div to take up the remaining space (due to flex-grow)
                      AND show a vertical scrollbar ONLY IF the content (`children`)
                      rendered inside it is taller than the available space.
          */}
          <div className="flex-grow overflow-y-auto">
            {children}
          </div>
  
          {/* Optional Footer - If uncommented, flex-shrink-0 is important here too */}
          {/*
          <footer className="bg-gray-200 dark:bg-gray-800 p-4 text-center text-sm text-gray-600 dark:text-gray-400 flex-shrink-0 border-t dark:border-gray-700">
            Footer content here
          </footer>
          */}
        </AuthProvider>
      </body>
    </html>
  );
}
