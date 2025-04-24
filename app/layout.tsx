// app/layout.tsx
import React from 'react';
import { AuthProvider } from './components/AuthProvider'; // Adjust path if necessary
import AccountButton from './components/AccountButton'; // Adjust path if necessary
import './globals.css'; // Your global styles

export const metadata = {
  title: 'AI Comparison App',
  description: 'Compare responses from multiple AI models.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex flex-col min-h-screen"> {/* Ensure body takes full height */}
        {/* AuthProvider wraps everything to provide context */}
        <AuthProvider>
          {/* Example Header */}
          <header className="bg-white shadow-sm p-4 sticky top-0 z-10 flex-shrink-0">
            <div className="container mx-auto flex justify-between items-center">
              {/* Left side content - App Title/Logo */}
              <h1 className="text-xl font-semibold text-gray-800">AI Comparator</h1>

              {/* Right side content - Account Button */}
              <div>
                <AccountButton />
              </div>
            </div>
          </header>

          {/* Main content area takes remaining height */}
          <div className="flex-grow">
             {children}
          </div>

           {/* Optional Footer */}
           {/* <footer className="bg-gray-200 p-4 text-center text-sm text-gray-600 flex-shrink-0">
             Footer content here
           </footer> */}
        </AuthProvider>
      </body>
    </html>
  );
}