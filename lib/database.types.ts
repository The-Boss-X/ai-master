export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      interactions: {
        Row: {
          created_at: string
          id: string
          prompt: string
          slot_1_conversation: Json | null
          slot_1_input_tokens: number | null
          slot_1_model_used: string | null
          slot_1_output_tokens: number | null
          slot_2_conversation: Json | null
          slot_2_input_tokens: number | null
          slot_2_model_used: string | null
          slot_2_output_tokens: number | null
          slot_3_conversation: Json | null
          slot_3_input_tokens: number | null
          slot_3_model_used: string | null
          slot_3_output_tokens: number | null
          slot_4_conversation: Json | null
          slot_4_input_tokens: number | null
          slot_4_model_used: string | null
          slot_4_output_tokens: number | null
          slot_5_conversation: Json | null
          slot_5_input_tokens: number | null
          slot_5_model_used: string | null
          slot_5_output_tokens: number | null
          slot_6_conversation: Json | null
          slot_6_input_tokens: number | null
          slot_6_model_used: string | null
          slot_6_output_tokens: number | null
          summary: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          prompt: string
          slot_1_conversation?: Json | null
          slot_1_input_tokens?: number | null
          slot_1_model_used?: string | null
          slot_1_output_tokens?: number | null
          slot_2_conversation?: Json | null
          slot_2_input_tokens?: number | null
          slot_2_model_used?: string | null
          slot_2_output_tokens?: number | null
          slot_3_conversation?: Json | null
          slot_3_input_tokens?: number | null
          slot_3_model_used?: string | null
          slot_3_output_tokens?: number | null
          slot_4_conversation?: Json | null
          slot_4_input_tokens?: number | null
          slot_4_model_used?: string | null
          slot_4_output_tokens?: number | null
          slot_5_conversation?: Json | null
          slot_5_input_tokens?: number | null
          slot_5_model_used?: string | null
          slot_5_output_tokens?: number | null
          slot_6_conversation?: Json | null
          slot_6_input_tokens?: number | null
          slot_6_model_used?: string | null
          slot_6_output_tokens?: number | null
          summary?: string | null
          title?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          prompt?: string
          slot_1_conversation?: Json | null
          slot_1_input_tokens?: number | null
          slot_1_model_used?: string | null
          slot_1_output_tokens?: number | null
          slot_2_conversation?: Json | null
          slot_2_input_tokens?: number | null
          slot_2_model_used?: string | null
          slot_2_output_tokens?: number | null
          slot_3_conversation?: Json | null
          slot_3_input_tokens?: number | null
          slot_3_model_used?: string | null
          slot_3_output_tokens?: number | null
          slot_4_conversation?: Json | null
          slot_4_input_tokens?: number | null
          slot_4_model_used?: string | null
          slot_4_output_tokens?: number | null
          slot_5_conversation?: Json | null
          slot_5_input_tokens?: number | null
          slot_5_model_used?: string | null
          slot_5_output_tokens?: number | null
          slot_6_conversation?: Json | null
          slot_6_input_tokens?: number | null
          slot_6_model_used?: string | null
          slot_6_output_tokens?: number | null
          summary?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      token_usage_log: {
        Row: {
          created_at: string
          id: string
          input_tokens: number
          interaction_id: string | null
          key_type: string | null
          model_name: string
          output_tokens: number
          provider: string
          slot_number: number | null
          total_tokens_for_call: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_tokens?: number
          interaction_id?: string | null
          key_type?: string | null
          model_name: string
          output_tokens?: number
          provider: string
          slot_number?: number | null
          total_tokens_for_call?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          input_tokens?: number
          interaction_id?: string | null
          key_type?: string | null
          model_name?: string
          output_tokens?: number
          provider?: string
          slot_number?: number | null
          total_tokens_for_call?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_usage_log_interaction_id_fkey"
            columns: ["interaction_id"]
            isOneToOne: false
            referencedRelation: "interactions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          anthropic_api_key_encrypted: string | null
          free_tokens_last_reset_at: string | null
          free_tokens_remaining: number
          gemini_api_key_encrypted: string | null
          openai_api_key_encrypted: string | null
          paid_tokens_remaining: number
          slot_1_model: string | null
          slot_2_model: string | null
          slot_3_model: string | null
          slot_4_model: string | null
          slot_5_model: string | null
          slot_6_model: string | null
          summary_model: string | null
          total_tokens_used_overall: number
          updated_at: string
          use_provided_keys: boolean
          user_id: string
          enable_streaming: boolean | null
        }
        Insert: {
          anthropic_api_key_encrypted?: string | null
          free_tokens_last_reset_at?: string | null
          free_tokens_remaining?: number
          gemini_api_key_encrypted?: string | null
          openai_api_key_encrypted?: string | null
          paid_tokens_remaining?: number
          slot_1_model?: string | null
          slot_2_model?: string | null
          slot_3_model?: string | null
          slot_4_model?: string | null
          slot_5_model?: string | null
          slot_6_model?: string | null
          summary_model?: string | null
          total_tokens_used_overall?: number
          updated_at?: string
          use_provided_keys?: boolean
          user_id?: string
          enable_streaming?: boolean | null
        }
        Update: {
          anthropic_api_key_encrypted?: string | null
          free_tokens_last_reset_at?: string | null
          free_tokens_remaining?: number
          gemini_api_key_encrypted?: string | null
          openai_api_key_encrypted?: string | null
          paid_tokens_remaining?: number
          slot_1_model?: string | null
          slot_2_model?: string | null
          slot_3_model?: string | null
          slot_4_model?: string | null
          slot_5_model?: string | null
          slot_6_model?: string | null
          summary_model?: string | null
          total_tokens_used_overall?: number
          updated_at?: string
          use_provided_keys?: boolean
          user_id?: string
          enable_streaming?: boolean | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decrement_user_tokens: {
        Args: { user_id_param: string; tokens_to_deduct: number }
        Returns: Json
      }
      increment_user_own_key_tokens: {
        Args: { p_user_id: string; p_tokens_to_add: number }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
