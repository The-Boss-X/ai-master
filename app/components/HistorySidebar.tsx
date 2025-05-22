// app/components/HistorySidebar.tsx
 // Ensure other imports and the rest of the component remain the same.
 // Only the handleDeleteClick function is modified here.

 import React, { useState, useEffect } from 'react';
 import type { InteractionHistoryItem } from '../types/InteractionHistoryItem';
 import Link from 'next/link';

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
    isLoggedIn,
    handleNewChat,
 }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<InteractionHistoryItem | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const handleEditClick = (item: InteractionHistoryItem, e: React.MouseEvent) => {
        if (!isLoggedIn) return;
        e.stopPropagation();
        setEditingItem(item);
        setNewTitle(item.title || item.prompt || '');
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
        if (!editingItem || !newTitle.trim() || !isLoggedIn) {
            setSaveError("Title cannot be empty.");
            return;
        }
        if (newTitle.trim() === (editingItem.title || editingItem.prompt)) {
            handleCloseModal();
            return;
        }
        setIsSaving(true);
        setSaveError(null);
        try {
            const success = await onUpdateTitle(editingItem.id, newTitle.trim());
            if (success) {
                handleCloseModal();
            } else {
                setSaveError("Failed to save title. Please try again.");
            }
        } catch (error) {
            console.error("Error saving title in sidebar:", error);
            setSaveError("An unexpected error occurred while saving.");
        } finally {
            setIsSaving(false);
        }
    };

    // MODIFIED handleDeleteClick function
    const handleDeleteClick = async (id: string, e: React.MouseEvent) => {
        // Prevent re-entry if already deleting this specific item
        if (!isLoggedIn || isDeleting === id) {
            if (isDeleting === id) {
                console.log(`Delete operation for ${id} already in progress. Ignoring duplicate call.`);
            }
            return;
        }
        
        e.stopPropagation(); // Prevent the click from selecting the history item

        // Standard browser confirm
        if (window.confirm('Are you sure you want to delete this history item? This action cannot be undone.')) {
            setIsDeleting(id); // Set loading state for this specific item
            setDeleteError(null); // Clear previous delete errors
            try {
                const success = await onDeleteItem(id); // Call the delete function passed from parent
                if (!success) {
                    setDeleteError("Failed to delete item. Please try again.");
                    // Clear deleting state after a delay so user sees the error, only if it's still this item
                     setTimeout(() => {
                         if (isDeleting === id) setIsDeleting(null);
                     }, 3000);
                }
                // If successful, the parent component (app/page.tsx) will remove the item from the `history`
                // list, which will cause this list item in HistorySidebar to unmount.
                // So, `isDeleting` for this `id` will naturally clear as the component instance is gone.
            } catch (error) {
                console.error("Error deleting item in sidebar:", error);
                setDeleteError("An unexpected error occurred during deletion.");
                setIsDeleting(null); // Clear deleting state on unexpected error to allow retry
            }
        } else {
            // User clicked "Cancel" on the confirm dialog
            console.log(`Deletion cancelled by user for ID: ${id}`);
        }
    };

    useEffect(() => {
        if (!isModalOpen) {
            setEditingItem(null);
        }
    }, [isModalOpen]);

    // The rest of the component's JSX remains the same...
    // ... (ensure you copy this modified handleDeleteClick into your existing component structure) ...
    return (
        <>
            <aside className="w-64 md:w-72 bg-white dark:bg-gray-800 p-4 border-r border-gray-200 dark:border-gray-700 overflow-y-auto flex flex-col flex-shrink-0 h-full">
                <div className="mb-4 flex-shrink-0">
                    <button
                        onClick={handleNewChat}
                        disabled={!isLoggedIn}
                        title={isLoggedIn ? "Start a new comparison" : "Log in to start a new chat"}
                        className={`w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-indigo-500 transition-colors ${
                            isLoggedIn
                                ? 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600'
                                : 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed'
                        }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        New Chat
                    </button>
                </div>
                <h2 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200 flex-shrink-0 border-t dark:border-gray-700 pt-3">History</h2>
                {historyLoading && <p className="text-gray-500 dark:text-gray-400 animate-pulse text-sm flex-shrink-0">Loading History...</p>}
                {!historyLoading && !isLoggedIn && (
                    <div className="text-center text-gray-500 dark:text-gray-400 text-sm p-4 bg-gray-50 dark:bg-gray-700 rounded-md flex-grow flex items-center justify-center">
                        <p>Please <Link href="/auth" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Sign In</Link> to view and manage history.</p>
                    </div>
                )}
                {!historyLoading && isLoggedIn && (
                    <div className="flex flex-col flex-grow overflow-hidden">
                        {(historyError || deleteError) && (
                        <div className="mb-2 h-4 flex-shrink-0">
                            {historyError && <p className="text-red-500 dark:text-red-400 text-xs truncate" title={historyError}>Error: {historyError}</p>}
                            {deleteError && <p className="text-red-500 dark:text-red-400 text-xs truncate" title={deleteError}>{deleteError}</p>}
                        </div>
                        )}
                        <div className="flex-grow overflow-y-auto mb-4 custom-scrollbar">
                            {history.length === 0 && !historyError && (
                                <p className="text-gray-400 dark:text-gray-500 text-sm text-center mt-4">No history yet.</p>
                            )}
                            {history.length > 0 && (
                                <ul className="space-y-1">
                                    {history.map((item) => (
                                        <li
                                            key={item.id}
                                            className={`rounded-md group flex items-center justify-between transition-colors duration-150 ${
                                                selectedHistoryId === item.id
                                                    ? 'bg-blue-100 dark:bg-blue-900/50'
                                                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            <button
                                                onClick={() => handleHistoryClick(item)}
                                                title={item.prompt}
                                                className={`flex-grow text-left p-2 text-sm truncate focus:outline-none focus:ring-1 focus:ring-blue-300 dark:focus:ring-blue-600 rounded-l-md ${
                                                    selectedHistoryId === item.id
                                                        ? 'text-blue-800 dark:text-blue-200 font-medium'
                                                        : 'text-gray-700 dark:text-gray-300'
                                                } ${isDeleting === item.id ? 'opacity-50 cursor-default' : ''}`}
                                                disabled={isDeleting === item.id}
                                            >
                                                {item.title || item.prompt}
                                            </button>
                                            <div
                                                className={`flex items-center space-x-1 pr-2 transition-opacity duration-150 flex-shrink-0 ${
                                                    isDeleting === item.id ? 'opacity-50' : ''
                                                } ${
                                                    selectedHistoryId === item.id
                                                        ? 'opacity-100'
                                                        : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
                                                }`}
                                            >
                                                <button
                                                    onClick={(e) => handleEditClick(item, e)}
                                                    title="Edit Title"
                                                    disabled={isDeleting === item.id}
                                                    className="p-1 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-300 dark:focus:ring-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /> </svg>
                                                </button>
                                                <button
                                                    onClick={(e) => handleDeleteClick(item.id, e)}
                                                    title="Delete History Item"
                                                    disabled={isDeleting === item.id}
                                                    className="p-1 rounded text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-700 dark:hover:text-red-300 focus:outline-none focus:ring-1 focus:ring-red-300 dark:focus:ring-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isDeleting === item.id ? (
                                                        <svg className="animate-spin h-4 w-4 text-red-500 dark:text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg>
                                                    ) : (
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /> </svg>
                                                    )}
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <button
                            onClick={fetchHistory}
                            disabled={historyLoading}
                            className={`mt-auto w-full p-2 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 text-gray-700 dark:text-gray-300 transition-colors flex-shrink-0 ${
                                historyLoading ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                        >
                            {historyLoading ? 'Refreshing...' : 'Refresh History'}
                        </button>
                    </div>
                )}
            </aside>

            {isModalOpen && editingItem && (
                <div
                    className="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4"
                    onClick={handleCloseModal}
                >
                    <div
                        className="relative mx-auto p-6 border w-full max-w-md shadow-lg rounded-md bg-white dark:bg-gray-800"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="mt-3 text-center sm:text-left">
                            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100 mb-4">
                                Edit History Title
                            </h3>
                            <div className="mt-2">
                                <input
                                    type="text"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                    placeholder="Enter new title"
                                    aria-label="New history title"
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); }}
                                />
                                {saveError && <p className="text-red-500 dark:text-red-400 text-sm text-left mt-2">{saveError}</p>}
                            </div>
                            <div className="mt-5 sm:mt-6 flex flex-col sm:flex-row-reverse sm:space-x-reverse sm:space-x-3">
                                <button
                                    type="button"
                                    onClick={handleSaveTitle}
                                    disabled={isSaving || !newTitle.trim() || newTitle.trim() === (editingItem.title || editingItem.prompt)}
                                    className={`w-full sm:w-auto inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-indigo-500 sm:text-sm transition-colors ${
                                        isSaving || !newTitle.trim() || newTitle.trim() === (editingItem.title || editingItem.prompt)
                                            ? 'bg-indigo-300 dark:bg-indigo-800 cursor-not-allowed'
                                            : 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600'
                                    }`}
                                >
                                    {isSaving ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="mt-3 sm:mt-0center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-indigo-500 sm:text-sm transition-colors"
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
 