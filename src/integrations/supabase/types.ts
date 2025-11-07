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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      accommodation_facilities: {
        Row: {
          accommodation_id: string | null
          category: string
          created_at: string
          facility_name: string
          id: string
          is_available: boolean | null
          pricing_type: string | null
        }
        Insert: {
          accommodation_id?: string | null
          category: string
          created_at?: string
          facility_name: string
          id?: string
          is_available?: boolean | null
          pricing_type?: string | null
        }
        Update: {
          accommodation_id?: string | null
          category?: string
          created_at?: string
          facility_name?: string
          id?: string
          is_available?: boolean | null
          pricing_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_facilities_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      accommodation_info: {
        Row: {
          address: string | null
          check_in_notice: string | null
          country: string | null
          created_at: string
          description: string | null
          email: string | null
          facebook_url: string | null
          id: string
          instagram_url: string | null
          latitude: number | null
          line_id: string | null
          longitude: number | null
          name: string
          phone: string | null
          region_1: string | null
          region_2: string | null
          registration_number: string | null
          short_url_alias: string | null
          star_rating: string | null
          total_rooms: number | null
          type: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address?: string | null
          check_in_notice?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          latitude?: number | null
          line_id?: string | null
          longitude?: number | null
          name: string
          phone?: string | null
          region_1?: string | null
          region_2?: string | null
          registration_number?: string | null
          short_url_alias?: string | null
          star_rating?: string | null
          total_rooms?: number | null
          type?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address?: string | null
          check_in_notice?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          latitude?: number | null
          line_id?: string | null
          longitude?: number | null
          name?: string
          phone?: string | null
          region_1?: string | null
          region_2?: string | null
          registration_number?: string | null
          short_url_alias?: string | null
          star_rating?: string | null
          total_rooms?: number | null
          type?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      accommodation_photos: {
        Row: {
          accommodation_id: string | null
          created_at: string
          display_order: number | null
          id: string
          photo_url: string
        }
        Insert: {
          accommodation_id?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          photo_url: string
        }
        Update: {
          accommodation_id?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          photo_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_photos_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_settings: {
        Row: {
          accommodation_id: string | null
          cancellation_policy: string | null
          check_in_time: string | null
          check_out_time: string | null
          created_at: string
          deposit_percentage: number | null
          id: string
          other_notes: string | null
          payment_methods: Json | null
          pet_policy: string | null
          updated_at: string
          use_deposit: boolean | null
        }
        Insert: {
          accommodation_id?: string | null
          cancellation_policy?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          deposit_percentage?: number | null
          id?: string
          other_notes?: string | null
          payment_methods?: Json | null
          pet_policy?: string | null
          updated_at?: string
          use_deposit?: boolean | null
        }
        Update: {
          accommodation_id?: string | null
          cancellation_policy?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          deposit_percentage?: number | null
          id?: string
          other_notes?: string | null
          payment_methods?: Json | null
          pet_policy?: string | null
          updated_at?: string
          use_deposit?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_settings_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          accommodation_id: string
          created_at: string
          email: string | null
          first_order_date: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          visit_count: number
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          email?: string | null
          first_order_date?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          visit_count?: number
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          email?: string | null
          first_order_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "customers_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          accommodation_id: string | null
          answer: string
          created_at: string
          display_order: number | null
          id: string
          is_published: boolean | null
          question: string
          updated_at: string
        }
        Insert: {
          accommodation_id?: string | null
          answer: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_published?: boolean | null
          question: string
          updated_at?: string
        }
        Update: {
          accommodation_id?: string | null
          answer?: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_published?: boolean | null
          question?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faqs_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      location_info: {
        Row: {
          accommodation_id: string | null
          airport_pickup_info: string | null
          created_at: string
          driving_info: string | null
          id: string
          location_description: string | null
          nearby_attractions: Json | null
          public_transport_info: string | null
          updated_at: string
        }
        Insert: {
          accommodation_id?: string | null
          airport_pickup_info?: string | null
          created_at?: string
          driving_info?: string | null
          id?: string
          location_description?: string | null
          nearby_attractions?: Json | null
          public_transport_info?: string | null
          updated_at?: string
        }
        Update: {
          accommodation_id?: string | null
          airport_pickup_info?: string | null
          created_at?: string
          driving_info?: string | null
          id?: string
          location_description?: string | null
          nearby_attractions?: Json | null
          public_transport_info?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          force_password_change: boolean
          id: string
          last_sign_in_at: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          force_password_change?: boolean
          id: string
          last_sign_in_at?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          force_password_change?: boolean
          id?: string
          last_sign_in_at?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      room_amenities: {
        Row: {
          amenity_icon: string | null
          amenity_name: string
          category: string | null
          created_at: string
          id: string
          room_type_id: string | null
        }
        Insert: {
          amenity_icon?: string | null
          amenity_name: string
          category?: string | null
          created_at?: string
          id?: string
          room_type_id?: string | null
        }
        Update: {
          amenity_icon?: string | null
          amenity_name?: string
          category?: string | null
          created_at?: string
          id?: string
          room_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_amenities_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      room_photos: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          photo_url: string
          room_type_id: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          photo_url: string
          room_type_id?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          photo_url?: string
          room_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_photos_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      room_types: {
        Row: {
          accommodation_id: string | null
          base_price: number
          capacity: number
          created_at: string
          description: string | null
          display_order: number | null
          double_room_count: number | null
          id: string
          name: string
          name_en: string | null
          quad_room_count: number | null
          room_count: number | null
          size_sqm: number | null
          triple_room_count: number | null
          updated_at: string
          weekday_2_meals_price: number | null
          weekday_3_meals_price: number | null
          weekday_price: number | null
          weekend_2_meals_price: number | null
          weekend_3_meals_price: number | null
          weekend_price: number | null
        }
        Insert: {
          accommodation_id?: string | null
          base_price: number
          capacity: number
          created_at?: string
          description?: string | null
          display_order?: number | null
          double_room_count?: number | null
          id?: string
          name: string
          name_en?: string | null
          quad_room_count?: number | null
          room_count?: number | null
          size_sqm?: number | null
          triple_room_count?: number | null
          updated_at?: string
          weekday_2_meals_price?: number | null
          weekday_3_meals_price?: number | null
          weekday_price?: number | null
          weekend_2_meals_price?: number | null
          weekend_3_meals_price?: number | null
          weekend_price?: number | null
        }
        Update: {
          accommodation_id?: string | null
          base_price?: number
          capacity?: number
          created_at?: string
          description?: string | null
          display_order?: number | null
          double_room_count?: number | null
          id?: string
          name?: string
          name_en?: string | null
          quad_room_count?: number | null
          room_count?: number | null
          size_sqm?: number | null
          triple_room_count?: number | null
          updated_at?: string
          weekday_2_meals_price?: number | null
          weekday_3_meals_price?: number | null
          weekday_price?: number | null
          weekend_2_meals_price?: number | null
          weekend_3_meals_price?: number | null
          weekend_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "room_types_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          accommodation_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_user_roles: {
        Args: { _accommodation_id: string }
        Returns: boolean
      }
      get_user_accommodations: {
        Args: { _user_id: string }
        Returns: {
          accommodation_id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      is_admin: { Args: { user_id_param: string }; Returns: boolean }
      is_user_admin: { Args: { _user_id: string }; Returns: boolean }
      user_has_access_to_accommodation: {
        Args: { _accommodation_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_role: {
        Args: {
          _accommodation_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "hotel_admin" | "staff"
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
    Enums: {
      app_role: ["super_admin", "hotel_admin", "staff"],
    },
  },
} as const
