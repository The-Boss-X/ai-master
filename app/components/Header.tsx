/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const { user, isLoading } = useAuth();

  return (
    <header className="bg-slate-800 text-white p-4 shadow-md fixed top-0 left-0 right-0 z-50 h-[var(--header-height)]">
      <div className="w-full px-4 sm:px-6 lg:px-8 flex justify-between items-center h-full">
        <Link href="/" className="text-2xl font-bold text-sky-400 hover:text-sky-300 transition-colors">
          xavion.ai
        </Link>
        <nav className="flex items-center space-x-4">
          {/* User-specific links or AccountButton could go here if needed later */}
        </nav>
      </div>
    </header>
  );
} 