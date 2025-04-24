// app/types/InteractionHistoryItem.ts

// Defines the structure of a history item based on the FINAL database schema
// Used in frontend components like app/page.tsx and potentially HistorySidebar.tsx
export interface InteractionHistoryItem {
  id: string; // Unique identifier for the interaction
  created_at: string; // Timestamp of creation (ISO string format from Supabase)
  prompt: string; // The user's input prompt
  title?: string | null; // Optional title for the interaction
  user_id?: string; // The ID of the user who created this interaction (if selected)

  // --- Fields matching the modified 'interactions' table schema ---

  // Slot 1 Details
  slot_1_model?: string | null;    // **ADDED:** Model identifier string (e.g., "ChatGPT: gpt-4o") used in slot 1
  slot_1_response?: string | null; // The response text from the model in slot 1
  slot_1_error?: string | null;    // Any error message encountered for slot 1

  // Slot 2 Details
  slot_2_model?: string | null;    // **ADDED:** Model identifier string used in slot 2
  slot_2_response?: string | null; // The response text from the model in slot 2
  slot_2_error?: string | null;    // Any error message encountered for slot 2

  // Slot 3 Details
  slot_3_model?: string | null;    // **ADDED:** Model identifier string used in slot 3
  slot_3_response?: string | null; // The response text from the model in slot 3
  slot_3_error?: string | null;    // Any error message encountered for slot 3
}
