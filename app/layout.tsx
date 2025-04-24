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
      <body className={`${inter.className} flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100`}>
        {/* AuthProvider wraps everything to provide context */}
        <AuthProvider>
          {/* Header Section */}
          <header className="bg-white dark:bg-gray-800 shadow-sm p-4 sticky top-0 z-10 flex-shrink-0 border-b dark:border-gray-700">
            <div className="container mx-auto flex justify-between items-center px-4"> {/* Added padding */}
              {/* App Title */}
              <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                AI Master
              </h1>
              {/* Account Button */}
              <div>
                <AccountButton /> {/* Include the AccountButton component */}
              </div>
            </div>
          </header>

          {/* Main content area takes remaining height */}
          {/* The children will include the page content (e.g., app/page.tsx) */}
          <div className="flex-grow">
            {children}
          </div>

          {/* Optional Footer */}
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
