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
      availability_slots: {
        Row: {
          created_at: string
          end_time: string
          id: string
          is_bookable: boolean
          max_bookings: number
          notes: string | null
          slot_type: string
          start_time: string
          trainer_id: string
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          is_bookable?: boolean
          max_bookings?: number
          notes?: string | null
          slot_type?: string
          start_time: string
          trainer_id: string
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          is_bookable?: boolean
          max_bookings?: number
          notes?: string | null
          slot_type?: string
          start_time?: string
          trainer_id?: string
        }
        Relationships: []
      }
      body_metrics: {
        Row: {
          body_fat_pct: number | null
          chest_cm: number | null
          client_id: string
          created_at: string
          hip_cm: number | null
          id: string
          measured_at: string
          user_id: string
          waist_cm: number | null
          weight_kg: number | null
        }
        Insert: {
          body_fat_pct?: number | null
          chest_cm?: number | null
          client_id: string
          created_at?: string
          hip_cm?: number | null
          id?: string
          measured_at?: string
          user_id: string
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Update: {
          body_fat_pct?: number | null
          chest_cm?: number | null
          client_id?: string
          created_at?: string
          hip_cm?: number | null
          id?: string
          measured_at?: string
          user_id?: string
          waist_cm?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "body_metrics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_requests: {
        Row: {
          client_id: string
          client_message: string | null
          id: string
          requested_at: string
          responded_at: string | null
          slot_id: string
          status: string
          trainer_note: string | null
        }
        Insert: {
          client_id: string
          client_message?: string | null
          id?: string
          requested_at?: string
          responded_at?: string | null
          slot_id: string
          status?: string
          trainer_note?: string | null
        }
        Update: {
          client_id?: string
          client_message?: string | null
          id?: string
          requested_at?: string
          responded_at?: string | null
          slot_id?: string
          status?: string
          trainer_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_requests_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "availability_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          acquisition_source: string | null
          booking_code: string | null
          booking_code_active: boolean
          created_at: string
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          fitness_goal: string | null
          fitness_goal_text: string | null
          full_name: string
          general_notes: string | null
          health_notes: string | null
          id: string
          phone: string | null
          pinned_note: string | null
          profile_photo_url: string | null
          starting_date: string | null
          status: string
          updated_at: string
          user_id: string
          whatsapp_link: string | null
        }
        Insert: {
          acquisition_source?: string | null
          booking_code?: string | null
          booking_code_active?: boolean
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          fitness_goal?: string | null
          fitness_goal_text?: string | null
          full_name: string
          general_notes?: string | null
          health_notes?: string | null
          id?: string
          phone?: string | null
          pinned_note?: string | null
          profile_photo_url?: string | null
          starting_date?: string | null
          status?: string
          updated_at?: string
          user_id: string
          whatsapp_link?: string | null
        }
        Update: {
          acquisition_source?: string | null
          booking_code?: string | null
          booking_code_active?: boolean
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          fitness_goal?: string | null
          fitness_goal_text?: string | null
          full_name?: string
          general_notes?: string | null
          health_notes?: string | null
          id?: string
          phone?: string | null
          pinned_note?: string | null
          profile_photo_url?: string | null
          starting_date?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          whatsapp_link?: string | null
        }
        Relationships: []
      }
      fitness_benchmarks: {
        Row: {
          client_id: string
          created_at: string
          id: string
          label: string
          measured_at: string
          user_id: string
          value: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          label: string
          measured_at?: string
          user_id: string
          value: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          label?: string
          measured_at?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "fitness_benchmarks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      package_feature_completions: {
        Row: {
          completed_at: string
          feature_key: string
          id: string
          package_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          feature_key: string
          id?: string
          package_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          feature_key?: string
          id?: string
          package_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_feature_completions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          checkin_calls_included: number
          client_id: string
          created_at: string
          deal_adjusted_terms: string | null
          deal_discounted_price: number | null
          deal_reason: string | null
          duration_weeks: number | null
          end_date: string | null
          id: string
          is_deal: boolean
          package_name: string
          package_price: number
          payment_date: string | null
          payment_status: string
          sessions_included: number
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          checkin_calls_included?: number
          client_id: string
          created_at?: string
          deal_adjusted_terms?: string | null
          deal_discounted_price?: number | null
          deal_reason?: string | null
          duration_weeks?: number | null
          end_date?: string | null
          id?: string
          is_deal?: boolean
          package_name: string
          package_price?: number
          payment_date?: string | null
          payment_status?: string
          sessions_included?: number
          start_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          checkin_calls_included?: number
          client_id?: string
          created_at?: string
          deal_adjusted_terms?: string | null
          deal_discounted_price?: number | null
          deal_reason?: string | null
          duration_weeks?: number | null
          end_date?: string | null
          id?: string
          is_deal?: boolean
          package_name?: string
          package_price?: number
          payment_date?: string | null
          payment_status?: string
          sessions_included?: number
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_photos: {
        Row: {
          client_id: string
          created_at: string
          id: string
          note: string | null
          photo_url: string
          taken_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          note?: string | null
          photo_url: string
          taken_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          note?: string | null
          photo_url?: string
          taken_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_photos_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_logs: {
        Row: {
          client_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          client_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          client_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          client_id: string
          created_at: string
          duration_minutes: number
          id: string
          late_cancellation: boolean
          location: string | null
          notes: string | null
          package_id: string | null
          session_date: string
          session_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          duration_minutes?: number
          id?: string
          late_cancellation?: boolean
          location?: string | null
          notes?: string | null
          package_id?: string | null
          session_date: string
          session_type: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          late_cancellation?: boolean
          location?: string | null
          notes?: string | null
          package_id?: string | null
          session_date?: string
          session_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
