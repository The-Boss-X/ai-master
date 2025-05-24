/* eslint-disable @typescript-eslint/no-unused-vars */
// app/components/HistorySidebar.tsx
 // Ensure other imports and the rest of the component remain the same.
 // Only the handleDeleteClick function is modified here.

'use client';
import React, { useState, useRef, useEffect, memo } from 'react';
import type { InteractionHistoryItem } from '../types/InteractionHistoryItem';
import Link from 'next/link';

// --- Icons (Basic SVGs) ---
const ChevronDoubleLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
  </svg>
);
const ChevronDoubleRightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 4.5l7.5 7.5-7.5 7.5m-6-15l7.5 7.5-7.5 7.5" />
  </svg>
);
const CogIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.646.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.333.184-.582.496-.646.87l-.212 1.282c-.09.542-.56.94-1.11.94h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.646-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.759 6.759 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.184.582-.496.646-.87l.212-1.282zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const UserCircleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);
const PlusIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
);

interface HistorySidebarProps {
  history: InteractionHistoryItem[];
  historyLoading: boolean;
  historyError: string | null;
  selectedHistoryId: string | null;
  handleHistoryClick: (item: InteractionHistoryItem) => void;
  fetchHistory: () => void;
  onUpdateTitle: (id: string, newTitle: string) => Promise<boolean>;
  onDeleteItem: (id: string) => Promise<boolean>;
  isLoggedIn: boolean;
  handleNewChat: () => void;
  onOpenSettings: () => void; // Prop for opening settings modal
}

const HistorySidebar: React.FC<HistorySidebarProps> = memo(({
  history, historyLoading, historyError, selectedHistoryId,
  handleHistoryClick, fetchHistory, onUpdateTitle, onDeleteItem,
  isLoggedIn, handleNewChat, onOpenSettings,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingId]);

  const handleEdit = (item: InteractionHistoryItem) => {
    setEditingId(item.id);
    setEditText(item.title || '');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editText.trim()) return;
    const success = await onUpdateTitle(editingId, editText.trim());
    if (success) {
      setEditingId(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  const handleDelete = async (id: string) => {
    await onDeleteItem(id);
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  if (!isLoggedIn) {
    return (
      <aside className={`flex-shrink-0 bg-slate-100 dark:bg-slate-800 p-4 border-r border-slate-200 dark:border-slate-700 transition-all duration-300 ease-in-out ${isCollapsed ? 'w-16' : 'w-64'} h-full flex flex-col`}>
        <div className="flex items-center justify-between mb-4">
          {!isCollapsed && <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-200">History</h2>}
          <button
            onClick={toggleCollapse}
            className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <ChevronDoubleRightIcon /> : <ChevronDoubleLeftIcon />}
          </button>
        </div>
        {!isCollapsed && <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">Please log in to see chat history.</p>}
      </aside>
    );
  }

  return (
    <aside className={`flex-shrink-0 bg-slate-100 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-72 md:w-80'} h-full flex flex-col`}>
      {/* Header with Title and Collapse Button */}
      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} p-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0`}>
        {!isCollapsed && (
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-200 truncate">
            Chat History
          </h2>
        )}
        <button
          onClick={toggleCollapse}
          className={`p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors`}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <ChevronDoubleRightIcon /> : <ChevronDoubleLeftIcon />}
        </button>
      </div>

      {isCollapsed ? (
        <div className="flex flex-col items-center justify-center h-full space-y-4 py-4">
          <button
            onClick={handleNewChat}
            className={`flex items-center justify-center p-3 rounded-full transition-colors duration-150 
                        bg-sky-500 text-white hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-500 
                        focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-1 focus:ring-offset-slate-100 dark:focus:ring-offset-slate-800`}
            title="New Chat"
          >
            <PlusIcon />
          </button>
          <button
            onClick={onOpenSettings}
            className={`flex items-center justify-center p-3 rounded-full transition-colors duration-150 
                       text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 
                       focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 focus:ring-offset-slate-100 dark:focus:ring-offset-slate-800`}
            title="Settings"
          >
            <CogIcon />
          </button>
          <Link
            href="/account-settings"
            className={`flex items-center justify-center p-3 rounded-full transition-colors duration-150 
                       text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 
                       focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 focus:ring-offset-slate-100 dark:focus:ring-offset-slate-800`}
            title="Account"
          >
            <UserCircleIcon />
          </Link>
        </div>
      ) : (
        <>
          {/* New Chat Button (Expanded) */}
          <div className="p-3 flex-shrink-0">
            <button
              onClick={handleNewChat}
              className={`w-full flex items-center font-medium px-3 py-2.5 text-sm rounded-md transition-colors duration-150 
                          bg-sky-500 text-white hover:bg-sky-600 dark:bg-sky-600 dark:hover:bg-sky-500 
                          focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-1 focus:ring-offset-slate-100 dark:focus:ring-offset-slate-800`}
            >
              <PlusIcon />
              <span className="ml-1">New Chat</span>
            </button>
          </div>

          {/* History List (Expanded) */}
          <div className="flex-grow overflow-y-auto custom-scrollbar-thin p-3 space-y-1.5">
            {historyLoading && (
              <div className="flex items-center justify-center p-4">
                <svg className="animate-spin h-5 w-5 text-slate-500 dark:text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">Loading...</span>
              </div>
            )}
            {historyError && (
              <div className={`p-2 text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded`}>
                {historyError}
              </div>
            )}
            {!historyLoading && !historyError && history.length === 0 && (
              <div className={`text-center text-sm text-slate-500 dark:text-slate-400 py-6 px-3`}>
                {'No chat history yet.'}
              </div>
            )}
            {!historyLoading && !historyError && history.map((item) => (
              <div
                key={item.id}
                className={`group relative rounded-md transition-colors duration-150 
                            ${selectedHistoryId === item.id 
                                ? 'bg-sky-100 dark:bg-sky-700/50' 
                                : 'hover:bg-slate-200 dark:hover:bg-slate-700/70'}`}
              >
                {editingId === item.id ? (
                  <div className={`p-2.5`}>
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                      className={`w-full p-1.5 border border-sky-400 rounded-md text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500`}
                    />
                    <div className="flex mt-1.5 space-x-1.5">
                      <button onClick={handleSaveEdit} className="px-2 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded">Save</button>
                      <button onClick={handleCancelEdit} className="px-2 py-1 text-xs bg-slate-400 hover:bg-slate-500 text-white rounded">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => handleHistoryClick(item)}
                    className={`w-full text-left p-2.5 text-sm truncate flex items-center 
                                ${selectedHistoryId === item.id 
                                    ? 'text-sky-700 dark:text-sky-300' 
                                    : 'text-slate-700 dark:text-slate-300'}`}
                    title={item.title || 'Untitled Chat'}
                  >
                    {item.title || 'Untitled Chat'}
                  </button>
                )}
                {editingId !== item.id && (
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
                    <button
                      onClick={() => handleEdit(item)}
                      className="p-1 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded hover:bg-slate-300 dark:hover:bg-slate-600"
                      title="Edit title"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" /></svg>
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-700/50"
                      title="Delete chat"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12.56 0c1.153 0 2.243.096 3.222.261m3.222.261L11 5.79M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12.56 0c1.153 0 2.243.096 3.222.261m3.222.261L11 5.79" /></svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer actions (Expanded - Settings, Account) */}
          <div className="flex-shrink-0 p-3 mt-auto border-t border-slate-200 dark:border-slate-700 space-y-2">
            <button
              onClick={onOpenSettings}
              className={`w-full flex items-center p-2.5 rounded-md text-sm font-medium transition-colors duration-150 
                         text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 
                         focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 focus:ring-offset-slate-100 dark:focus:ring-offset-slate-800`}
            >
              <CogIcon />
              <span className="ml-2.5">Settings</span>
            </button>
            <Link
              href="/account-settings"
              className={`w-full flex items-center p-2.5 rounded-md text-sm font-medium transition-colors duration-150 
                         text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 
                         focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 focus:ring-offset-slate-100 dark:focus:ring-offset-slate-800`}
            >
              <UserCircleIcon />
              <span className="ml-2.5">Account</span>
            </Link>
          </div>
        </>
      )}
    </aside>
  );
});

HistorySidebar.displayName = 'HistorySidebar';
export default HistorySidebar;
 