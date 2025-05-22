// app/types/InteractionHistoryItem.ts

// Structure for a single message within a conversation
export interface ConversationMessage {
  role: 'user' | 'model';
  content: string;
}

// Defines the structure of a history item including slots 1-6, summary, and token counts
export interface InteractionHistoryItem {
  id: string; // Unique identifier for the interaction
  created_at: string; // Timestamp of creation (ISO string format from Supabase)
  prompt: string; // The *initial* user prompt for this interaction thread
  title?: string | null; // Optional title for the interaction
  user_id?: string; // The ID of the user who created this interaction (if selected)
  summary?: string | null; // The generated summary for the initial turn

  // --- Fields matching the 'interactions' table schema ---

  slot_1_model_used?: string | null;
  slot_1_conversation?: ConversationMessage[] | null;
  slot_1_input_tokens?: number | null;
  slot_1_output_tokens?: number | null;

  slot_2_model_used?: string | null;
  slot_2_conversation?: ConversationMessage[] | null;
  slot_2_input_tokens?: number | null;
  slot_2_output_tokens?: number | null;

  slot_3_model_used?: string | null;
  slot_3_conversation?: ConversationMessage[] | null;
  slot_3_input_tokens?: number | null;
  slot_3_output_tokens?: number | null;

  slot_4_model_used?: string | null;
  slot_4_conversation?: ConversationMessage[] | null;
  slot_4_input_tokens?: number | null;
  slot_4_output_tokens?: number | null;

  slot_5_model_used?: string | null;
  slot_5_conversation?: ConversationMessage[] | null;
  slot_5_input_tokens?: number | null;
  slot_5_output_tokens?: number | null;

  slot_6_model_used?: string | null;
  slot_6_conversation?: ConversationMessage[] | null;
  slot_6_input_tokens?: number | null;
  slot_6_output_tokens?: number | null;
}
