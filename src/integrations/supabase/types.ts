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
      about_features: {
        Row: {
          accommodation_id: string
          created_at: string
          description: string
          display_order: number
          icon_name: string
          icon_type: string
          icon_url: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          description: string
          display_order?: number
          icon_name: string
          icon_type?: string
          icon_url?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          description?: string
          display_order?: number
          icon_name?: string
          icon_type?: string
          icon_url?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "about_features_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      about_section: {
        Row: {
          accommodation_id: string
          created_at: string
          id: string
          section_description: string | null
          section_title: string
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          id?: string
          section_description?: string | null
          section_title?: string
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          id?: string
          section_description?: string | null
          section_title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "about_section_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: true
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
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
          footer_logo_url: string | null
          header_logo_url: string | null
          id: string
          instagram_url: string | null
          latitude: number | null
          line_id: string | null
          longitude: number | null
          name: string
          og_description: string | null
          og_image_url: string | null
          og_title: string | null
          phone: string | null
          region_1: string | null
          region_2: string | null
          registration_number: string | null
          short_url_alias: string | null
          star_rating: string | null
          threads_url: string | null
          tiktok_url: string | null
          total_rooms: number | null
          type: string | null
          updated_at: string
          website_url: string | null
          youtube_url: string | null
        }
        Insert: {
          address?: string | null
          check_in_notice?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          facebook_url?: string | null
          footer_logo_url?: string | null
          header_logo_url?: string | null
          id?: string
          instagram_url?: string | null
          latitude?: number | null
          line_id?: string | null
          longitude?: number | null
          name: string
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          phone?: string | null
          region_1?: string | null
          region_2?: string | null
          registration_number?: string | null
          short_url_alias?: string | null
          star_rating?: string | null
          threads_url?: string | null
          tiktok_url?: string | null
          total_rooms?: number | null
          type?: string | null
          updated_at?: string
          website_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          address?: string | null
          check_in_notice?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          facebook_url?: string | null
          footer_logo_url?: string | null
          header_logo_url?: string | null
          id?: string
          instagram_url?: string | null
          latitude?: number | null
          line_id?: string | null
          longitude?: number | null
          name?: string
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          phone?: string | null
          region_1?: string | null
          region_2?: string | null
          registration_number?: string | null
          short_url_alias?: string | null
          star_rating?: string | null
          threads_url?: string | null
          tiktok_url?: string | null
          total_rooms?: number | null
          type?: string | null
          updated_at?: string
          website_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      accommodation_photos: {
        Row: {
          accommodation_id: string | null
          created_at: string
          cta_link: string | null
          cta_text: string | null
          display_order: number | null
          id: string
          photo_type: string | null
          photo_url: string
          subtitle: string | null
          title: string | null
        }
        Insert: {
          accommodation_id?: string | null
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          display_order?: number | null
          id?: string
          photo_type?: string | null
          photo_url: string
          subtitle?: string | null
          title?: string | null
        }
        Update: {
          accommodation_id?: string | null
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          display_order?: number | null
          id?: string
          photo_type?: string | null
          photo_url?: string
          subtitle?: string | null
          title?: string | null
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
      addon_settings: {
        Row: {
          accommodation_id: string
          addon_type: string
          created_at: string | null
          description: string | null
          detailed_description: string | null
          enabled: boolean | null
          id: string
          max_quantity: number
          min_quantity: number | null
          price_per_unit: number
          unit_label: string
          updated_at: string | null
          weekday_min_quantity: number | null
          weekend_min_quantity: number | null
        }
        Insert: {
          accommodation_id: string
          addon_type: string
          created_at?: string | null
          description?: string | null
          detailed_description?: string | null
          enabled?: boolean | null
          id?: string
          max_quantity: number
          min_quantity?: number | null
          price_per_unit: number
          unit_label: string
          updated_at?: string | null
          weekday_min_quantity?: number | null
          weekend_min_quantity?: number | null
        }
        Update: {
          accommodation_id?: string
          addon_type?: string
          created_at?: string | null
          description?: string | null
          detailed_description?: string | null
          enabled?: boolean | null
          id?: string
          max_quantity?: number
          min_quantity?: number | null
          price_per_unit?: number
          unit_label?: string
          updated_at?: string | null
          weekday_min_quantity?: number | null
          weekend_min_quantity?: number | null
        }
        Relationships: []
      }
      backup_logs: {
        Row: {
          accommodation_id: string
          backup_mode: string
          backup_type: string
          base_backup_id: string | null
          compression_ratio: number | null
          created_at: string | null
          created_by: string | null
          customers_count: number | null
          error_message: string | null
          file_path: string
          file_size: number | null
          id: string
          incremental_since: string | null
          is_compressed: boolean | null
          orders_count: number | null
          status: string
          uncompressed_size: number | null
          updated_at: string | null
        }
        Insert: {
          accommodation_id: string
          backup_mode?: string
          backup_type: string
          base_backup_id?: string | null
          compression_ratio?: number | null
          created_at?: string | null
          created_by?: string | null
          customers_count?: number | null
          error_message?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          incremental_since?: string | null
          is_compressed?: boolean | null
          orders_count?: number | null
          status?: string
          uncompressed_size?: number | null
          updated_at?: string | null
        }
        Update: {
          accommodation_id?: string
          backup_mode?: string
          backup_type?: string
          base_backup_id?: string | null
          compression_ratio?: number | null
          created_at?: string | null
          created_by?: string | null
          customers_count?: number | null
          error_message?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          incremental_since?: string | null
          is_compressed?: boolean | null
          orders_count?: number | null
          status?: string
          uncompressed_size?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backup_logs_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backup_logs_base_backup_id_fkey"
            columns: ["base_backup_id"]
            isOneToOne: false
            referencedRelation: "backup_logs"
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
      discount_codes: {
        Row: {
          accommodation_id: string
          applicable_date_from: string | null
          applicable_date_to: string | null
          applicable_room_types: Json | null
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          display_order: number | null
          id: string
          is_active: boolean
          min_order_amount: number | null
          name: string
          updated_at: string
          usage_limit: number
          used_count: number
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          accommodation_id: string
          applicable_date_from?: string | null
          applicable_date_to?: string | null
          applicable_room_types?: Json | null
          code: string
          created_at?: string
          discount_type: string
          discount_value: number
          display_order?: number | null
          id?: string
          is_active?: boolean
          min_order_amount?: number | null
          name: string
          updated_at?: string
          usage_limit: number
          used_count?: number
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          accommodation_id?: string
          applicable_date_from?: string | null
          applicable_date_to?: string | null
          applicable_room_types?: Json | null
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          display_order?: number | null
          id?: string
          is_active?: boolean
          min_order_amount?: number | null
          name?: string
          updated_at?: string
          usage_limit?: number
          used_count?: number
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discount_codes_accommodation_id_fkey"
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
      notifications: {
        Row: {
          accommodation_id: string
          created_at: string
          description: string
          id: string
          is_read: boolean
          order_id: string | null
          title: string
          type: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          description: string
          id?: string
          is_read?: boolean
          order_id?: string | null
          title: string
          type: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          description?: string
          id?: string
          is_read?: boolean
          order_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_accommodation"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_order"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accommodation_id: string
          cancelled_at: string | null
          check_in_date: string
          check_out_date: string
          checked_in_at: string | null
          checked_out_at: string | null
          confirmed_at: string | null
          created_at: string | null
          customer_id: string | null
          deposit_amount: number | null
          discount_amount: number | null
          discount_code: string | null
          final_price: number
          guest_address: string | null
          guest_count: number
          guest_email: string | null
          guest_name: string
          guest_phone: string
          id: string
          meal_plan: string | null
          meal_plan_details: Json | null
          meal_plan_total: number | null
          notes: string | null
          order_date: string | null
          order_number: string
          order_status: string
          paid_amount: number | null
          payment_method: string | null
          payment_status: string
          pet_count: number | null
          pet_plan_price: number | null
          room_assigned: boolean | null
          room_type_id: string | null
          total_price: number
          updated_at: string | null
        }
        Insert: {
          accommodation_id: string
          cancelled_at?: string | null
          check_in_date: string
          check_out_date: string
          checked_in_at?: string | null
          checked_out_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          deposit_amount?: number | null
          discount_amount?: number | null
          discount_code?: string | null
          final_price: number
          guest_address?: string | null
          guest_count?: number
          guest_email?: string | null
          guest_name: string
          guest_phone: string
          id?: string
          meal_plan?: string | null
          meal_plan_details?: Json | null
          meal_plan_total?: number | null
          notes?: string | null
          order_date?: string | null
          order_number: string
          order_status?: string
          paid_amount?: number | null
          payment_method?: string | null
          payment_status?: string
          pet_count?: number | null
          pet_plan_price?: number | null
          room_assigned?: boolean | null
          room_type_id?: string | null
          total_price: number
          updated_at?: string | null
        }
        Update: {
          accommodation_id?: string
          cancelled_at?: string | null
          check_in_date?: string
          check_out_date?: string
          checked_in_at?: string | null
          checked_out_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          deposit_amount?: number | null
          discount_amount?: number | null
          discount_code?: string | null
          final_price?: number
          guest_address?: string | null
          guest_count?: number
          guest_email?: string | null
          guest_name?: string
          guest_phone?: string
          id?: string
          meal_plan?: string | null
          meal_plan_details?: Json | null
          meal_plan_total?: number | null
          notes?: string | null
          order_date?: string | null
          order_number?: string
          order_status?: string
          paid_amount?: number | null
          payment_method?: string | null
          payment_status?: string
          pet_count?: number | null
          pet_plan_price?: number | null
          room_assigned?: boolean | null
          room_type_id?: string | null
          total_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
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
      public_holidays: {
        Row: {
          accommodation_id: string
          created_at: string
          holiday_date: string
          holiday_name: string
          id: string
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          holiday_date: string
          holiday_name: string
          id?: string
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          holiday_date?: string
          holiday_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_holidays_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
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
      generate_order_number: { Args: never; Returns: string }
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
      validate_discount_code:
        | {
            Args: { p_accommodation_id: string; p_code: string }
            Returns: {
              discount_type: string
              discount_value: number
              is_valid: boolean
              message: string
            }[]
          }
        | {
            Args: {
              p_accommodation_id: string
              p_check_in_date?: string
              p_code: string
              p_order_amount?: number
              p_room_type_id?: string
            }
            Returns: {
              discount_type: string
              discount_value: number
              is_valid: boolean
              message: string
            }[]
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
