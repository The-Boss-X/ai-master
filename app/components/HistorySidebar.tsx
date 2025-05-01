 // components/HistorySidebar.tsx
 import React, { useState, useEffect } from 'react';
 // Ensure this path points to your type definition file
 import type { InteractionHistoryItem } from '../types/InteractionHistoryItem';
 import Link from 'next/link'; // For login prompt

 // Props interface including the new handler
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
    handleNewChat: () => void; // Add prop for the new chat handler
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
    handleNewChat, // Destructure the new prop
 }) => {
    // State for the edit title modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<InteractionHistoryItem | null>(null);
    const [newTitle, setNewTitle] = useState('');
    const [isSaving, setIsSaving] = useState(false); // Loading state for saving title
    const [saveError, setSaveError] = useState<string | null>(null); // Error state for saving title

    // State for delete operation
    const [isDeleting, setIsDeleting] = useState<string | null>(null); // Store ID of item being deleted
    const [deleteError, setDeleteError] = useState<string | null>(null); // Error state for deleting item

    // --- Modal Handlers ---

    // Open the edit title modal
    const handleEditClick = (item: InteractionHistoryItem, e: React.MouseEvent) => {
        if (!isLoggedIn) return; // Prevent action if not logged in
        e.stopPropagation(); // Prevent the click from selecting the history item
        setEditingItem(item);
        // Pre-fill input with existing title, or fallback to the prompt
        setNewTitle(item.title || item.prompt || '');
        setSaveError(null); // Clear previous save errors
        setIsModalOpen(true);
    };

    // Close the edit title modal
    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingItem(null); // Clear the item being edited
        setNewTitle('');
        setIsSaving(false); // Reset saving state
        setSaveError(null);
    };

    // Handle saving the new title
    const handleSaveTitle = async () => {
        // Basic validation
        if (!editingItem || !newTitle.trim() || !isLoggedIn) {
            setSaveError("Title cannot be empty.");
            return;
        }
        // Avoid API call if title hasn't changed
        if (newTitle.trim() === (editingItem.title || editingItem.prompt)) {
            handleCloseModal(); // Just close if no change
            return;
        }

        setIsSaving(true);
        setSaveError(null);
        try {
            // Call the update function passed from the parent component
            const success = await onUpdateTitle(editingItem.id, newTitle.trim());
            if (success) {
                handleCloseModal(); // Close modal on successful save
            } else {
                // Parent might set a global error, but show local feedback too
                setSaveError("Failed to save title. Please try again.");
            }
        } catch (error) {
            console.error("Error saving title in sidebar:", error);
            setSaveError("An unexpected error occurred while saving.");
        } finally {
            setIsSaving(false); // Reset saving state regardless of outcome
        }
    };

    // --- Delete Handler ---
    const handleDeleteClick = async (id: string, e: React.MouseEvent) => {
        if (!isLoggedIn) return; // Prevent action if not logged in
        e.stopPropagation(); // Prevent the click from selecting the history item

        // Confirm before deleting
        if (window.confirm('Are you sure you want to delete this history item? This action cannot be undone.')) {
            setIsDeleting(id); // Set loading state for this specific item
            setDeleteError(null); // Clear previous delete errors
            try {
                // Call the delete function passed from the parent component
                const success = await onDeleteItem(id);
                if (!success) {
                    // Parent might set a global error, show local feedback
                    setDeleteError("Failed to delete item. Please try again.");
                    // Clear deleting state after a delay so user sees the error
                     setTimeout(() => {
                         if (isDeleting === id) setIsDeleting(null); // Only clear if it's still the one deleting
                     }, 3000);
                }
                // On success, the parent component will update the history list,
                // removing the item, so no need to manually clear isDeleting here.
                // If the deleted item was selected, the parent handles resetting the view.
            } catch (error) {
                console.error("Error deleting item in sidebar:", error);
                setDeleteError("An unexpected error occurred during deletion.");
                setIsDeleting(null); // Clear loading state on unexpected error
            }
            // No finally block needed here for setIsDeleting(null) because successful delete
            // relies on parent removing the item, which implicitly removes the loading state.
        }
    };

    // Effect to clear editing item state if modal is closed externally
    useEffect(() => {
        if (!isModalOpen) {
            setEditingItem(null);
        }
    }, [isModalOpen]);

    // --- Render Logic ---
    return (
        <>
            {/* Sidebar Container */}
            <aside className="w-64 md:w-72 bg-white dark:bg-gray-800 p-4 border-r border-gray-200 dark:border-gray-700 overflow-y-auto flex flex-col flex-shrink-0 h-full">

                {/* === NEW CHAT BUTTON === */}
                <div className="mb-4 flex-shrink-0"> {/* Added flex-shrink-0 */}
                    <button
                        onClick={handleNewChat} // Call the handler passed via props
                        disabled={!isLoggedIn} // Only enable if logged in
                        title={isLoggedIn ? "Start a new comparison" : "Log in to start a new chat"}
                        className={`w-full flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 focus:ring-indigo-500 transition-colors ${
                            isLoggedIn
                                ? 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600' // Enabled style
                                : 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed' // Disabled style
                        }`}
                    >
                        {/* Plus Icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        New Chat
                    </button>
                </div>
                {/* === END NEW CHAT BUTTON === */}


                {/* History Section Header */}
                {/* **FIXED**: Removed pt-4, added border-t for separation */}
                <h2 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200 flex-shrink-0 border-t dark:border-gray-700 pt-3">History</h2>

                {/* Loading State */}
                {historyLoading && <p className="text-gray-500 dark:text-gray-400 animate-pulse text-sm flex-shrink-0">Loading History...</p>}

                {/* Logged Out Prompt */}
                {!historyLoading && !isLoggedIn && (
                    <div className="text-center text-gray-500 dark:text-gray-400 text-sm p-4 bg-gray-50 dark:bg-gray-700 rounded-md flex-grow flex items-center justify-center">
                        <p>Please <Link href="/auth" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Sign In</Link> to view and manage history.</p>
                    </div>
                )}

                {/* Logged In View */}
                {/* Wrap content in a flex-col container to manage space */}
                {!historyLoading && isLoggedIn && (
                    <div className="flex flex-col flex-grow overflow-hidden"> {/* Added flex-grow and overflow-hidden */}
                        {/* Error Display Area */}
                        {(historyError || deleteError) && (
                        <div className="mb-2 h-4 flex-shrink-0"> {/* Reserve space for errors */}
                            {historyError && <p className="text-red-500 dark:text-red-400 text-xs truncate" title={historyError}>Error: {historyError}</p>}
                            {deleteError && <p className="text-red-500 dark:text-red-400 text-xs truncate" title={deleteError}>{deleteError}</p>}
                        </div>
                        )}

                        {/* History List or Empty State */}
                        {/* Added flex-grow and overflow-y-auto here */}
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
                                                    ? 'bg-blue-100 dark:bg-blue-900/50' // Highlight selected item
                                                    : 'hover:bg-gray-100 dark:hover:bg-gray-700' // Hover effect
                                            }`}
                                        >
                                            {/* Clickable Area for Selecting Item */}
                                            <button
                                                onClick={() => handleHistoryClick(item)}
                                                title={item.prompt} // Show full prompt on hover
                                                className={`flex-grow text-left p-2 text-sm truncate focus:outline-none focus:ring-1 focus:ring-blue-300 dark:focus:ring-blue-600 rounded-l-md ${
                                                    selectedHistoryId === item.id
                                                        ? 'text-blue-800 dark:text-blue-200 font-medium' // Style selected item text
                                                        : 'text-gray-700 dark:text-gray-300'
                                                } ${isDeleting === item.id ? 'opacity-50 cursor-default' : ''}`} // Dim if deleting
                                                disabled={isDeleting === item.id} // Disable button while deleting
                                            >
                                                {item.title || item.prompt} {/* Display title or fallback */}
                                            </button>

                                            {/* Action Buttons (Appear on hover/focus or if selected) */}
                                            <div
                                                className={`flex items-center space-x-1 pr-2 transition-opacity duration-150 flex-shrink-0 ${ // Added flex-shrink-0
                                                    isDeleting === item.id ? 'opacity-50' : '' // Dim actions if deleting
                                                } ${
                                                    selectedHistoryId === item.id
                                                        ? 'opacity-100' // Always show for selected
                                                        : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100' // Show on hover/focus
                                                }`}
                                            >
                                                {/* Edit Button */}
                                                <button
                                                    onClick={(e) => handleEditClick(item, e)}
                                                    title="Edit Title"
                                                    disabled={isDeleting === item.id}
                                                    className="p-1 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-300 dark:focus:ring-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {/* Edit Icon SVG */}
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /> </svg>
                                                </button>
                                                {/* Delete Button */}
                                                <button
                                                    onClick={(e) => handleDeleteClick(item.id, e)}
                                                    title="Delete History Item"
                                                    disabled={isDeleting === item.id}
                                                    className="p-1 rounded text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-700 dark:hover:text-red-300 focus:outline-none focus:ring-1 focus:ring-red-300 dark:focus:ring-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {/* Show spinner when deleting */}
                                                    {isDeleting === item.id ? (
                                                        <svg className="animate-spin h-4 w-4 text-red-500 dark:text-red-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg>
                                                    ) : (
                                                        // Delete Icon SVG
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}> <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /> </svg>
                                                    )}
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {/* Refresh Button - Keep at bottom */}
                        <button
                            onClick={fetchHistory}
                            disabled={historyLoading} // Disable if loading history
                            className={`mt-auto w-full p-2 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-500 text-gray-700 dark:text-gray-300 transition-colors flex-shrink-0 ${ // Added flex-shrink-0
                                historyLoading ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                        >
                            {historyLoading ? 'Refreshing...' : 'Refresh History'}
                        </button>
                    </div>
                )}
            </aside>

            {/* Edit Title Modal */}
            {isModalOpen && editingItem && (
                // Modal backdrop
                <div
                    className="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4"
                    onClick={handleCloseModal} // Close modal on backdrop click
                >
                    {/* Modal Content */}
                    <div
                        className="relative mx-auto p-6 border w-full max-w-md shadow-lg rounded-md bg-white dark:bg-gray-800"
                        onClick={e => e.stopPropagation()} // Prevent closing modal when clicking inside content
                    >
                        <div className="mt-3 text-center sm:text-left">
                            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100 mb-4">
                                Edit History Title
                            </h3>
                            {/* Input Field */}
                            <div className="mt-2">
                                <input
                                    type="text"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                    placeholder="Enter new title"
                                    aria-label="New history title"
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); }} // Save on Enter key
                                />
                                {/* Save Error Message */}
                                {saveError && <p className="text-red-500 dark:text-red-400 text-sm text-left mt-2">{saveError}</p>}
                            </div>
                            {/* Action Buttons */}
                            <div className="mt-5 sm:mt-6 flex flex-col sm:flex-row-reverse sm:space-x-reverse sm:space-x-3">
                                <button
                                    type="button"
                                    onClick={handleSaveTitle}
                                    disabled={isSaving || !newTitle.trim() || newTitle.trim() === (editingItem.title || editingItem.prompt)}
                                    className={`w-full sm:w-auto inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed sm:text-sm transition-colors`}
                                >
                                    {isSaving ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    disabled={isSaving} // Disable cancel while saving
                                    className="mt-3 w-full sm:mt-0 sm:w-auto inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-500 shadow-sm px-4 py-2 bg-white dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 sm:text-sm disabled:opacity-50 transition-colors"
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
