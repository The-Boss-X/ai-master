'use client';
import React from 'react';

interface TokenUsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode; // To render TokenUsageDisplay
}

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const TokenUsageModal: React.FC<TokenUsageModalProps> = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[1000] p-4 transition-opacity duration-300 ease-in-out animate-fadeIn"
      onClick={onClose} // Click outside to close
    >
      <div 
        className="bg-slate-50 dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] transform transition-all duration-300 ease-in-out animate-slideUp overflow-hidden"
        onClick={(e) => e.stopPropagation()} // Prevent click inside from closing modal
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 md:p-5 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
            Token Usage History
          </h3>
          <button 
            type="button" 
            onClick={onClose}
            className="text-slate-400 bg-transparent hover:bg-slate-200 hover:text-slate-900 rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center dark:hover:bg-slate-600 dark:hover:text-white"
            aria-label="Close token usage modal"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Modal Body (The TokenUsageDisplay component) */}
        <div className="p-4 md:p-6 flex-grow overflow-y-auto custom-scrollbar">
          {children}
        </div>
        
        {/* Modal Footer */}
        <div className="flex items-center justify-end p-4 md:p-5 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 transition-colors"
          >
            Back to Settings
          </button>
        </div>
      </div>
      {/* Keyframes are already in SettingsModal.tsx, assuming they are global enough or redefine if scoped */}
      {/* If animations don't work, copy the <style jsx global> block from SettingsModal.tsx here */}
    </div>
  );
};

export default TokenUsageModal; 