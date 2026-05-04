export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          can_access_settings: boolean
          created_at: string
          email: string
          id: string
          name: string
          password_hash: string
          surname: string
          updated_at: string
        }
        Insert: {
          can_access_settings?: boolean
          created_at?: string
          email: string
          id?: string
          name: string
          password_hash: string
          surname: string
          updated_at?: string
        }
        Update: {
          can_access_settings?: boolean
          created_at?: string
          email?: string
          id?: string
          name?: string
          password_hash?: string
          surname?: string
          updated_at?: string
        }
        Relationships: []
      }
      candidates: {
        Row: {
          created_at: string
          id: string
          id_number: string | null
          name: string
          score: number | null
          session_id: string
          status: string
          summary: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          id_number?: string | null
          name: string
          score?: number | null
          session_id: string
          status?: string
          summary?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          id_number?: string | null
          name?: string
          score?: number | null
          session_id?: string
          status?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "candidates_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          candidate_id: string | null
          candidate_name_extracted: string | null
          confidence_score: number | null
          created_at: string
          document_type: string | null
          file_name: string
          file_path: string
          file_size: number
          id: string
          issues: string[] | null
          overridden: boolean
          overridden_at: string | null
          processed_at: string | null
          session_id: string
          validation_details: Json | null
          validation_status: string
        }
        Insert: {
          candidate_id?: string | null
          candidate_name_extracted?: string | null
          confidence_score?: number | null
          created_at?: string
          document_type?: string | null
          file_name: string
          file_path: string
          file_size?: number
          id?: string
          issues?: string[] | null
          overridden?: boolean
          overridden_at?: string | null
          processed_at?: string | null
          session_id: string
          validation_details?: Json | null
          validation_status?: string
        }
        Update: {
          candidate_id?: string | null
          candidate_name_extracted?: string | null
          confidence_score?: number | null
          created_at?: string
          document_type?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          issues?: string[] | null
          overridden?: boolean
          overridden_at?: string | null
          processed_at?: string | null
          session_id?: string
          validation_details?: Json | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          id: string
          name: string
          processed_documents: number
          status: string
          total_documents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          processed_documents?: number
          status?: string
          total_documents?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          processed_documents?: number
          status?: string
          total_documents?: number
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          confidence_threshold: number
          created_at: string
          from_email: string | null
          id: string
          stamp_validity_months: number
          strict_mode: boolean
          updated_at: string
        }
        Insert: {
          confidence_threshold?: number
          created_at?: string
          from_email?: string | null
          id?: string
          stamp_validity_months?: number
          strict_mode?: boolean
          updated_at?: string
        }
        Update: {
          confidence_threshold?: number
          created_at?: string
          from_email?: string | null
          id?: string
          stamp_validity_months?: number
          strict_mode?: boolean
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_admin_user: {
        Args: {
          _can_access_settings?: boolean
          _email: string
          _name: string
          _password: string
          _surname: string
        }
        Returns: string
      }
      delete_admin_user: { Args: { _id: string }; Returns: undefined }
      get_app_settings: {
        Args: never
        Returns: {
          confidence_threshold: number
          from_email: string
          id: string
          stamp_validity_months: number
          strict_mode: boolean
        }[]
      }
      list_admin_users: {
        Args: never
        Returns: {
          can_access_settings: boolean
          created_at: string
          email: string
          id: string
          name: string
          surname: string
        }[]
      }
      update_admin_user: {
        Args: {
          _can_access_settings: boolean
          _id: string
          _name: string
          _password?: string
          _surname: string
        }
        Returns: undefined
      }
      update_app_settings: {
        Args: {
          _confidence_threshold: number
          _from_email?: string
          _stamp_validity_months: number
          _strict_mode: boolean
        }
        Returns: undefined
      }
      verify_admin_login: {
        Args: { _email: string; _password: string }
        Returns: {
          can_access_settings: boolean
          email: string
          id: string
          name: string
          surname: string
        }[]
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
