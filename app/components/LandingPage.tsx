'use client';

import React from 'react';
import Link from 'next/link';

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white flex flex-col items-center justify-center p-4 pt-16 md:pt-24">
      <header className="text-center mb-12 md:mb-16 animate-fadeIn">
        <h1 className="text-5xl md:text-7xl font-bold mb-4">
          Welcome to <span className="text-sky-400">xavion.ai</span>
        </h1>
        <p className="text-lg md:text-xl text-slate-300 max-w-2xl mx-auto">
          Unlock the power of multiple leading AI models in one seamless interface. Compare, contrast, and create with unparalleled flexibility.
        </p>
      </header>

      <main className="w-full max-w-4xl space-y-12 md:space-y-16">
        <section className="p-6 md:p-8 bg-slate-800/50 rounded-xl shadow-2xl animate-slideUp animation-delay-200 backdrop-blur-md">
          <h2 className="text-3xl font-semibold mb-4 text-sky-300">What is xavion.ai?</h2>
          <p className="text-slate-300 leading-relaxed">
            xavion.ai is your central hub for interacting with a diverse range of cutting-edge artificial intelligence models. 
            Instead of juggling multiple platforms, you get a unified dashboard to send prompts, receive responses, and manage your AI-driven workflows.
            Whether you are a developer, writer, researcher, or just curious about AI, xavion.ai provides the tools to explore and innovate.
          </p>
        </section>

        <section className="p-6 md:p-8 bg-slate-800/50 rounded-xl shadow-2xl animate-slideUp animation-delay-400 backdrop-blur-md">
          <h2 className="text-3xl font-semibold mb-4 text-sky-300">How It Works</h2>
          <div className="space-y-4 text-slate-300 leading-relaxed">
            <p>
              <strong className="text-sky-400">1. Sign Up & Configure:</strong> Create your account and head to the settings page. Here, you can assign your preferred AI models (like those from OpenAI, Anthropic, Google, etc.) to different interaction slots. You can even use your own API keys if you have them, or utilize the built-in token system.
            </p>
            <p>
              <strong className="text-sky-400">2. Prompt & Compare:</strong> Use the main interface to send your prompts. xavion.ai can dispatch your query to multiple configured models simultaneously, allowing you to see different perspectives and strengths in action.
            </p>
            <p>
              <strong className="text-sky-400">3. Manage & Purchase Tokens:</strong> For models accessed via our platform, you start with a set of free tokens. Need more power? Easily purchase additional token packs through our secure Stripe integration in your account settings.
            </p>
            <p>
              <strong className="text-sky-400">4. Review & Continue:</strong> All your interactions are saved in a conversation history. Review past dialogues, continue conversations, and see how different models responded over time.
            </p>
          </div>
        </section>

        <section className="p-6 md:p-8 bg-slate-800/50 rounded-xl shadow-2xl animate-slideUp animation-delay-600 backdrop-blur-md">
          <h2 className="text-3xl font-semibold mb-4 text-sky-300">Key Features</h2>
          <ul className="list-disc list-inside space-y-3 text-slate-300 pl-4">
            <li>Access multiple AI models through a single interface.</li>
            <li>Side-by-side comparison of model responses (Coming Soon!).</li>
            <li>Flexible model slot configuration.</li>
            <li>Integrated token system with easy top-ups via Stripe.</li>
            <li>Option to use your own provider API keys.</li>
            <li>Persistent conversation history.</li>
            <li>Secure and private interactions.</li>
          </ul>
        </section>

        <div className="text-center animate-fadeIn animation-delay-800 pt-8">
          <Link href="/auth"
            className="px-8 py-4 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-lg shadow-lg transition-transform transform hover:scale-105 text-lg focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-slate-900"
          >
            Get Started Now
          </Link>
        </div>
      </main>

      <footer className="text-center mt-16 md:mt-24 pb-8 animate-fadeIn animation-delay-1000">
        <p className="text-slate-400">&copy; {new Date().getFullYear()} xavion.ai - All Rights Reserved.</p>
      </footer>

      {/* Basic CSS for animations - can be moved to globals.css */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 1s ease-out forwards; }
        .animate-slideUp { animation: slideUp 0.8s ease-out forwards; }
        .animation-delay-200 { animation-delay: 0.2s; }
        .animation-delay-400 { animation-delay: 0.4s; }
        .animation-delay-600 { animation-delay: 0.6s; }
        .animation-delay-800 { animation-delay: 0.8s; }
        .animation-delay-1000 { animation-delay: 1s; }
      `}</style>
    </div>
  );
};

export default LandingPage; 