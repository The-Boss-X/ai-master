// app/layout.tsx
import React from 'react';
// CORRECT IMPORT: Import AuthProvider from the context directory
import { AuthProvider } from './context/AuthContext';
// Assuming AccountButton exists and path is correct - uncomment if you have this component
// import AccountButton from './components/AccountButton'; // Removed
import './globals.css'; // Your global styles
import { Inter } from "next/font/google"; // Import font
import Header from './components/Header'; // Import the new Header component
// import ThemeApplicator from './components/ThemeApplicator'; // Remove ThemeApplicator import

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
    <html lang="en" className="dark">
      <body className={`${inter.className} flex flex-col h-screen overflow-hidden bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100`}>
        {/* AuthProvider wraps everything to provide context */}
        <AuthProvider>
          {/* <ThemeApplicator /> // Remove ThemeApplicator component */}
          <Header /> {/* Use the new Header component */}
  
          {/* Main content area takes remaining height */}
          {/*
            CHANGE 3: Add `overflow-y-auto`.
                      This tells the div to take up the remaining space (due to flex-grow)
                      AND show a vertical scrollbar ONLY IF the content (`children`)
                      rendered inside it is taller than the available space.
          */}
          <div className="flex-grow overflow-y-auto pt-[var(--header-height)]">
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
