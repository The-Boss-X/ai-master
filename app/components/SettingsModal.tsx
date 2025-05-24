'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import ModelProviderSettingsForm from './ModelProviderSettingsForm';
import TokenUsageDisplay from './TokenUsageDisplay';
import TokenUsageModal from './TokenUsageModal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('General');
  const [isTokenUsageModalOpen, setIsTokenUsageModalOpen] = useState(false);

  if (!isOpen) return null;

  const tabs = ['General', 'My Account', 'Model Providers'];

  const handleSettingsSaved = () => {
    // Potentially refresh some app state if needed after settings save
    // For now, just close the modal as an example
    // onClose(); 
    // We might want to keep the modal open and show a success message within the form itself.
    // The form already has its own success message, so direct close might be fine.
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[999] p-4 transition-opacity duration-300 ease-in-out animate-fadeIn">
      <div 
        className="bg-slate-50 dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh] transform transition-all duration-300 ease-in-out animate-slideUp"
        onClick={(e) => e.stopPropagation()} // Prevent click inside from closing modal
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 md:p-5 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
            Settings
          </h3>
          <button 
            type="button" 
            onClick={onClose}
            className="text-slate-400 bg-transparent hover:bg-slate-200 hover:text-slate-900 rounded-lg text-sm w-8 h-8 ms-auto inline-flex justify-center items-center dark:hover:bg-slate-600 dark:hover:text-white"
            aria-label="Close settings modal"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Modal Body (Tabs + Content) */}
        <div className="flex flex-col md:flex-row flex-grow overflow-hidden">
          {/* Tabs Navigation (Vertical on MD+, Horizontal on SM) */}
          <div className="flex md:flex-col flex-shrink-0 p-3 md:p-4 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700 space-x-2 md:space-x-0 md:space-y-2 overflow-x-auto md:overflow-y-auto custom-scrollbar-thin">
            {tabs.map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-2.5 rounded-md text-sm font-medium transition-colors w-full md:w-auto text-left whitespace-nowrap 
                            ${activeTab === tab 
                                ? 'bg-sky-100 text-sky-700 dark:bg-sky-700/30 dark:text-sky-300' 
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700/60'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab Content Area */}
          <div className="p-4 md:p-6 flex-grow overflow-y-auto custom-scrollbar">
            {activeTab === 'General' && (
              <div>
                <h4 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-3">General Settings</h4>
                <p className="text-slate-600 dark:text-slate-400">General application settings will go here. (e.g., default behaviors, notifications).</p>
                {/* Placeholder for general settings form */}
              </div>
            )}
            {activeTab === 'My Account' && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-1">Manage Subscription & Tokens</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                    Purchase more platform tokens or manage your subscription tier.
                  </p>
                  <Link href="/account-settings" onClick={onClose} className="inline-block px-4 py-2 text-sm font-medium bg-sky-600 text-white rounded-md hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 transition-colors">
                    Go to Billing Page
                  </Link>
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mt-6 mb-1">Token Usage History</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                    View a detailed breakdown of your token consumption.
                  </p>
                  <button
                    onClick={() => setIsTokenUsageModalOpen(true)}
                    className="inline-block px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 transition-colors"
                  >
                    View Token Usage Details
                  </button>
                </div>
              </div>
            )}
            {activeTab === 'Model Providers' && (
              <ModelProviderSettingsForm onSettingsSaved={handleSettingsSaved} />
            )}
          </div>
        </div>
        
        {/* Modal Footer (Optional) */}
        {/* <div className="flex items-center justify-end p-4 md:p-5 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-500 dark:hover:bg-slate-600 transition-colors">
            Close
          </button>
          <button className="ml-3 px-4 py-2 text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 transition-colors">
            Save Changes
          </button>
        </div> */}
      </div>
      {isTokenUsageModalOpen && (
        <TokenUsageModal 
          isOpen={isTokenUsageModalOpen} 
          onClose={() => setIsTokenUsageModalOpen(false)}
        >
          <TokenUsageDisplay />
        </TokenUsageModal>
      )}
       {/* Add keyframes for animations */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out forwards; }
        .animate-slideUp { animation: slideUp 0.3s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default SettingsModal; 