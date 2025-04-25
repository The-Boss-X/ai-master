// app/types/InteractionHistoryItem.ts

// Structure for a single message within a conversation
export interface ConversationMessage {
  role: 'user' | 'model';
  content: string;
}

// Defines the structure of a history item based on the FINAL database schema
// Used in frontend components like app/page.tsx and potentially HistorySidebar.tsx
export interface InteractionHistoryItem {
  id: string; // Unique identifier for the interaction
  created_at: string; // Timestamp of creation (ISO string format from Supabase)
  prompt: string; // The *initial* user prompt for this interaction thread
  title?: string | null; // Optional title for the interaction
  user_id?: string; // The ID of the user who created this interaction (if selected)

  // --- Fields matching the modified 'interactions' table schema ---

  slot_1_model_used?: string | null; // Model identifier string (e.g., "ChatGPT: gpt-4o") used in slot 1
  slot_1_conversation?: ConversationMessage[] | null; // **CHANGED:** Stores the array of messages for slot 1

  slot_2_model_used?: string | null; // Model identifier string used in slot 2
  slot_2_conversation?: ConversationMessage[] | null; // **CHANGED:** Stores the array of messages for slot 2

  slot_3_model_used?: string | null; // Model identifier string used in slot 3
  slot_3_conversation?: ConversationMessage[] | null; // **CHANGED:** Stores the array of messages for slot 3

  // Note: We are no longer storing individual responses/errors separately here.
  // Errors encountered during follow-ups would need to be handled in the frontend state
  // or logged differently if persistence is needed beyond the initial interaction log.
}