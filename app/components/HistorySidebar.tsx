// components/HistorySidebar.tsx
import React, { useState, useEffect } from 'react';
import { InteractionHistoryItem } from '../api/get-history/route'; // Adjust path if needed
import Link from 'next/link'; // For login prompt

// Update props interface
interface HistorySidebarProps {
  history: InteractionHistoryItem[];
  historyLoading: boolean; // Now represents combined loading (auth + fetch)
  historyError: string | null;
  selectedHistoryId: string | null;
  handleHistoryClick: (item: InteractionHistoryItem) => void;
  fetchHistory: () => void;
  onUpdateTitle: (id: string, newTitle: string) => Promise<boolean>;
  onDeleteItem: (id: string) => Promise<boolean>;
  isLoggedIn: boolean; // Receive login status from parent
}

const HistorySidebar: React.FC<HistorySidebarProps> = ({
  history,
  historyLoading,
  historyError,
  selectedHistoryId,
  handleHistoryClick,
  fetchHistory,
  onUpdateTitle,
  onDeleteItem,
  isLoggedIn, // Use the prop
}) => {
  // State for the edit modal (remains mostly the same)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InteractionHistoryItem | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // --- Modal Handlers (only allow if logged in) ---
  const handleEditClick = (item: InteractionHistoryItem, e: React.MouseEvent) => {
      if (!isLoggedIn) return;
      e.stopPropagation();
      setEditingItem(item);
      setNewTitle(item.title || item.prompt || ''); // Use title, fallback to prompt
      setSaveError(null);
      setIsModalOpen(true);
  };

  const handleCloseModal = () => {
      setIsModalOpen(false);
      setEditingItem(null);
      setNewTitle('');
      setIsSaving(false);
      setSaveError(null);
  };

  const handleSaveTitle = async () => {
      if (!editingItem || !newTitle.trim() || !isLoggedIn) { // Check login
          setSaveError("Title cannot be empty.");
          return;
      }
      if (newTitle === (editingItem.title || editingItem.prompt)) {
          handleCloseModal(); return;
      }

      setIsSaving(true); setSaveError(null);
      try {
          const success = await onUpdateTitle(editingItem.id, newTitle.trim());
          if (success) {
              handleCloseModal();
          } else {
              setSaveError("Failed to save title. Please try again."); // Show local error as fallback
          }
      } catch (error) {
          console.error("Error saving title:", error);
          setSaveError("An unexpected error occurred.");
      } finally {
          setIsSaving(false);
      }
  };

  // --- Delete Handler (only allow if logged in) ---
  const handleDeleteClick = async (id: string, e: React.MouseEvent) => {
      if (!isLoggedIn) return; // Check login
      e.stopPropagation();
      if (window.confirm('Are you sure you want to delete this history item?')) {
          setIsDeleting(id); setDeleteError(null);
          try {
              const success = await onDeleteItem(id);
              if (!success) {
                  setDeleteError("Failed to delete item. Please try again.");
                  setTimeout(() => {
                      if (isDeleting === id) setIsDeleting(null);
                  }, 3000);
              }
              // No need to clear isDeleting on success, item disappears
          } catch (error) {
              console.error("Error deleting item:", error);
              setDeleteError("An unexpected error occurred during deletion.");
              setIsDeleting(null);
          }
      }
  };

  // Clear editing item when modal closes
  useEffect(() => {
      if (!isModalOpen) {
          setEditingItem(null);
      }
  }, [isModalOpen]);

  // --- Render Logic ---
  return (
    <>
      <aside className="w-72 bg-white p-4 border-r border-gray-200 overflow-y-auto flex flex-col">
        <h2 className="text-lg font-semibold mb-4 text-gray-700 flex-shrink-0">History</h2>

        {/* Display different content based on login status and loading */}
        {historyLoading && <p className="text-gray-500">Loading...</p>}

        {!historyLoading && !isLoggedIn && (
            <div className="text-center text-gray-500 text-sm p-4 bg-gray-50 rounded-md">
                <p>Please <Link href="/auth" className="text-blue-600 hover:underline font-medium">Sign In</Link> to view and manage your history.</p>
            </div>
        )}

        {!historyLoading && isLoggedIn && (
            <>
                {historyError && <p className="text-red-500 text-sm">Error: {historyError}</p>}
                {deleteError && <p className="text-red-500 text-sm mt-2">{deleteError}</p>}

                {history.length === 0 && !historyError && (
                    <p className="text-gray-400 text-sm">No history yet.</p>
                )}

                {history.length > 0 && (
                    <ul className="space-y-1 flex-grow mb-4 overflow-y-auto">
                        {history.map((item) => (
                            <li key={item.id} className={`rounded-md group flex items-center justify-between ${selectedHistoryId === item.id ? 'bg-blue-100' : 'hover:bg-gray-100'}`}>
                                <button
                                    onClick={() => handleHistoryClick(item)}
                                    title={item.prompt}
                                    className={`flex-grow text-left p-2 text-sm truncate focus:outline-none ${selectedHistoryId === item.id ? 'text-blue-700 font-medium' : 'text-gray-600'}`}
                                    disabled={isDeleting === item.id}
                                >
                                    {item.title || item.prompt} {/* Display title or fallback */}
                                </button>
                                {/* Action Buttons */}
                                <div className={`flex items-center space-x-1 pr-2 ${isDeleting === item.id ? 'opacity-50' : ''} ${selectedHistoryId === item.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'} transition-opacity duration-150`}>
                                    <button
                                        onClick={(e) => handleEditClick(item, e)}
                                        title="Edit Title"
                                        disabled={isDeleting === item.id}
                                        className="p-1 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {/* Edit Icon */}
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /> </svg>
                                    </button>
                                    <button
                                        onClick={(e) => handleDeleteClick(item.id, e)}
                                        title="Delete History Item"
                                        disabled={isDeleting === item.id}
                                        className="p-1 rounded text-red-500 hover:bg-red-100 hover:text-red-700 focus:outline-none focus:ring-1 focus:ring-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {/* Delete Icon / Spinner */}
                                        {isDeleting === item.id ? (
                                            <svg className="animate-spin h-4 w-4 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /> </svg>
                                        )}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                {/* Refresh Button - Only show if logged in */}
                <button
                    onClick={fetchHistory}
                    disabled={historyLoading} // Disable if loading auth or history
                    className={`mt-auto w-full p-2 text-sm rounded border border-gray-300 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                        historyLoading ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                >
                    {historyLoading ? 'Refreshing...' : 'Refresh History'}
                </button>
            </>
        )}
      </aside>

      {/* Edit Title Modal (Only renders if isModalOpen is true, already gated by isLoggedIn in handleEditClick) */}
      {isModalOpen && editingItem && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center" onClick={handleCloseModal}>
             <div className="relative mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white" onClick={e => e.stopPropagation()}>
               <div className="mt-3 text-center">
                 <h3 className="text-lg leading-6 font-medium text-gray-900">Edit History Title</h3>
                 <div className="mt-2 px-7 py-3">
                   <input
                     type="text"
                     value={newTitle}
                     onChange={(e) => setNewTitle(e.target.value)}
                     className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                     placeholder="Enter new title"
                     aria-label="New history title"
                   />
                    {saveError && <p className="text-red-500 text-sm mt-2">{saveError}</p>}
                 </div>
                 <div className="items-center px-4 py-3 space-x-2">
                   <button
                     onClick={handleSaveTitle}
                     disabled={isSaving || !newTitle.trim()}
                     className={`px-4 py-2 bg-blue-500 text-white text-base font-medium rounded-md w-auto shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed`}
                   >
                     {isSaving ? 'Saving...' : 'Save'}
                   </button>
                   <button
                     onClick={handleCloseModal}
                     disabled={isSaving}
                     className="px-4 py-2 bg-gray-200 text-gray-800 text-base font-medium rounded-md w-auto shadow-sm hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
                   >
                     Cancel
                   </button>
                 </div>
               </div>
             </div>
           </div>
      )}
    </>
  );
};

export default HistorySidebar;