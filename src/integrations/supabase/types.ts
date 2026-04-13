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
          custom_domain: string | null
          description: string | null
          display_order: number | null
          email: string | null
          facebook_url: string | null
          footer_logo_url: string | null
          header_logo_url: string | null
          hero_autoplay_delay: number | null
          hero_description: string | null
          hero_main_title: string | null
          hero_overlay_opacity: number | null
          hero_subtitle: string | null
          homepage_section_titles: Json | null
          homepage_sections_order: Json | null
          id: string
          instagram_url: string | null
          is_active: boolean
          latitude: number | null
          line_id: string | null
          longitude: number | null
          meta_keywords: string | null
          name: string
          og_description: string | null
          og_image_url: string | null
          og_title: string | null
          phone: string | null
          region_1: string | null
          region_2: string | null
          registration_number: string | null
          seo_description: string | null
          seo_title: string | null
          short_url_alias: string | null
          show_about_section: boolean
          show_booking_info_section: boolean
          show_custom_images_section: boolean
          show_facilities_section: boolean
          show_faq_section: boolean
          show_gallery_section: boolean
          show_location_section: boolean
          show_reviews_section: boolean
          show_rooms_section: boolean
          star_rating: string | null
          theme_preset: string | null
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
          custom_domain?: string | null
          description?: string | null
          display_order?: number | null
          email?: string | null
          facebook_url?: string | null
          footer_logo_url?: string | null
          header_logo_url?: string | null
          hero_autoplay_delay?: number | null
          hero_description?: string | null
          hero_main_title?: string | null
          hero_overlay_opacity?: number | null
          hero_subtitle?: string | null
          homepage_section_titles?: Json | null
          homepage_sections_order?: Json | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          latitude?: number | null
          line_id?: string | null
          longitude?: number | null
          meta_keywords?: string | null
          name: string
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          phone?: string | null
          region_1?: string | null
          region_2?: string | null
          registration_number?: string | null
          seo_description?: string | null
          seo_title?: string | null
          short_url_alias?: string | null
          show_about_section?: boolean
          show_booking_info_section?: boolean
          show_custom_images_section?: boolean
          show_facilities_section?: boolean
          show_faq_section?: boolean
          show_gallery_section?: boolean
          show_location_section?: boolean
          show_reviews_section?: boolean
          show_rooms_section?: boolean
          star_rating?: string | null
          theme_preset?: string | null
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
          custom_domain?: string | null
          description?: string | null
          display_order?: number | null
          email?: string | null
          facebook_url?: string | null
          footer_logo_url?: string | null
          header_logo_url?: string | null
          hero_autoplay_delay?: number | null
          hero_description?: string | null
          hero_main_title?: string | null
          hero_overlay_opacity?: number | null
          hero_subtitle?: string | null
          homepage_section_titles?: Json | null
          homepage_sections_order?: Json | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean
          latitude?: number | null
          line_id?: string | null
          longitude?: number | null
          meta_keywords?: string | null
          name?: string
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          phone?: string | null
          region_1?: string | null
          region_2?: string | null
          registration_number?: string | null
          seo_description?: string | null
          seo_title?: string | null
          short_url_alias?: string | null
          show_about_section?: boolean
          show_booking_info_section?: boolean
          show_custom_images_section?: boolean
          show_facilities_section?: boolean
          show_faq_section?: boolean
          show_gallery_section?: boolean
          show_location_section?: boolean
          show_reviews_section?: boolean
          show_rooms_section?: boolean
          star_rating?: string | null
          theme_preset?: string | null
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
          autoplay_delay: number | null
          created_at: string
          cta_link: string | null
          cta_text: string | null
          display_order: number | null
          id: string
          overlay_opacity: number | null
          photo_type: string | null
          photo_url: string
          secondary_subtitle: string | null
          secondary_subtitle_size: string | null
          subtitle: string | null
          subtitle_size: string | null
          text_color: string | null
          text_position_x: string | null
          text_position_y: string | null
          text_size: string | null
          title: string | null
          title_size: string | null
        }
        Insert: {
          accommodation_id?: string | null
          autoplay_delay?: number | null
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          display_order?: number | null
          id?: string
          overlay_opacity?: number | null
          photo_type?: string | null
          photo_url: string
          secondary_subtitle?: string | null
          secondary_subtitle_size?: string | null
          subtitle?: string | null
          subtitle_size?: string | null
          text_color?: string | null
          text_position_x?: string | null
          text_position_y?: string | null
          text_size?: string | null
          title?: string | null
          title_size?: string | null
        }
        Update: {
          accommodation_id?: string | null
          autoplay_delay?: number | null
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          display_order?: number | null
          id?: string
          overlay_opacity?: number | null
          photo_type?: string | null
          photo_url?: string
          secondary_subtitle?: string | null
          secondary_subtitle_size?: string | null
          subtitle?: string | null
          subtitle_size?: string | null
          text_color?: string | null
          text_position_x?: string | null
          text_position_y?: string | null
          text_size?: string | null
          title?: string | null
          title_size?: string | null
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
      audit_logs: {
        Row: {
          accommodation_id: string | null
          action_category: string
          action_type: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string
        }
        Insert: {
          accommodation_id?: string | null
          action_category: string
          action_type: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id: string
        }
        Update: {
          accommodation_id?: string | null
          action_category?: string
          action_type?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
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
      booking_info_sections: {
        Row: {
          accommodation_id: string
          created_at: string
          display_order: number
          id: string
          is_enabled: boolean
          section_content: string | null
          section_subtitle: string | null
          section_title: string
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          display_order?: number
          id?: string
          is_enabled?: boolean
          section_content?: string | null
          section_subtitle?: string | null
          section_title: string
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_enabled?: boolean
          section_content?: string | null
          section_subtitle?: string | null
          section_title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_info_sections_accommodation_id_fkey"
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
          cancellation_section_subtitle: string | null
          cancellation_section_title: string | null
          check_in_section_subtitle: string | null
          check_in_section_title: string | null
          check_in_time: string | null
          check_out_time: string | null
          created_at: string
          deposit_percentage: number | null
          id: string
          important_section_subtitle: string | null
          important_section_title: string | null
          other_notes: string | null
          other_section_subtitle: string | null
          other_section_title: string | null
          payment_methods: Json | null
          payment_section_subtitle: string | null
          payment_section_title: string | null
          pet_policy: string | null
          pet_section_subtitle: string | null
          pet_section_title: string | null
          updated_at: string
          use_deposit: boolean | null
        }
        Insert: {
          accommodation_id?: string | null
          cancellation_policy?: string | null
          cancellation_section_subtitle?: string | null
          cancellation_section_title?: string | null
          check_in_section_subtitle?: string | null
          check_in_section_title?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          deposit_percentage?: number | null
          id?: string
          important_section_subtitle?: string | null
          important_section_title?: string | null
          other_notes?: string | null
          other_section_subtitle?: string | null
          other_section_title?: string | null
          payment_methods?: Json | null
          payment_section_subtitle?: string | null
          payment_section_title?: string | null
          pet_policy?: string | null
          pet_section_subtitle?: string | null
          pet_section_title?: string | null
          updated_at?: string
          use_deposit?: boolean | null
        }
        Update: {
          accommodation_id?: string | null
          cancellation_policy?: string | null
          cancellation_section_subtitle?: string | null
          cancellation_section_title?: string | null
          check_in_section_subtitle?: string | null
          check_in_section_title?: string | null
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          deposit_percentage?: number | null
          id?: string
          important_section_subtitle?: string | null
          important_section_title?: string | null
          other_notes?: string | null
          other_section_subtitle?: string | null
          other_section_title?: string | null
          payment_methods?: Json | null
          payment_section_subtitle?: string | null
          payment_section_title?: string | null
          pet_policy?: string | null
          pet_section_subtitle?: string | null
          pet_section_title?: string | null
          updated_at?: string
          use_deposit?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_settings_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: true
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_records: {
        Row: {
          accommodation_id: string
          commission_amount: number
          commission_rate: number
          created_at: string
          discount_amount: number
          discount_code_id: string
          id: string
          order_id: string
          order_total: number
          payment_date: string | null
          payment_method: string | null
          payment_note: string | null
          settlement_date: string | null
          settlement_status: string
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          commission_amount: number
          commission_rate: number
          created_at?: string
          discount_amount: number
          discount_code_id: string
          id?: string
          order_id: string
          order_total: number
          payment_date?: string | null
          payment_method?: string | null
          payment_note?: string | null
          settlement_date?: string | null
          settlement_status?: string
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          discount_amount?: number
          discount_code_id?: string
          id?: string
          order_id?: string
          order_total?: number
          payment_date?: string | null
          payment_method?: string | null
          payment_note?: string | null
          settlement_date?: string | null
          settlement_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_records_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_records_discount_code_id_fkey"
            columns: ["discount_code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_records_discount_code_id_fkey"
            columns: ["discount_code_id"]
            isOneToOne: false
            referencedRelation: "discount_codes_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_usages: {
        Row: {
          coupon_id: string
          id: string
          member_id: string
          order_id: string
          used_at: string
        }
        Insert: {
          coupon_id: string
          id?: string
          member_id: string
          order_id: string
          used_at?: string
        }
        Update: {
          coupon_id?: string
          id?: string
          member_id?: string
          order_id?: string
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_usages_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "platform_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usages_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "platform_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_sections: {
        Row: {
          accommodation_id: string
          created_at: string
          display_order: number
          id: string
          image_url: string
          is_enabled: boolean
          link_text: string | null
          link_url: string | null
          mobile_image_url: string | null
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          is_enabled?: boolean
          link_text?: string | null
          link_url?: string | null
          mobile_image_url?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          is_enabled?: boolean
          link_text?: string | null
          link_url?: string | null
          mobile_image_url?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_sections_accommodation_id_fkey"
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
          gender: string | null
          id: string
          member_id: string | null
          name: string
          nationality: string | null
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
          gender?: string | null
          id?: string
          member_id?: string | null
          name: string
          nationality?: string | null
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
          gender?: string | null
          id?: string
          member_id?: string | null
          name?: string
          nationality?: string | null
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
          {
            foreignKeyName: "customers_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "platform_members"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_code_secrets: {
        Row: {
          api_key: string | null
          created_at: string
          discount_code_id: string
          id: string
          updated_at: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          discount_code_id: string
          id?: string
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_key?: string | null
          created_at?: string
          discount_code_id?: string
          id?: string
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discount_code_secrets_discount_code_id_fkey"
            columns: ["discount_code_id"]
            isOneToOne: true
            referencedRelation: "discount_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_code_secrets_discount_code_id_fkey"
            columns: ["discount_code_id"]
            isOneToOne: true
            referencedRelation: "discount_codes_safe"
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
          commission_rate: number | null
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
          commission_rate?: number | null
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
          commission_rate?: number | null
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
      external_hotel_mappings: {
        Row: {
          accommodation_id: string
          api_environment: string
          cid_code: string
          created_at: string
          hotel_code: string | null
          id: string
          is_enabled: boolean
          notes: string | null
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          api_environment?: string
          cid_code: string
          created_at?: string
          hotel_code?: string | null
          id?: string
          is_enabled?: boolean
          notes?: string | null
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          api_environment?: string
          cid_code?: string
          created_at?: string
          hotel_code?: string | null
          id?: string
          is_enabled?: boolean
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_hotel_mappings_accommodation_id_fkey"
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
      member_point_transactions: {
        Row: {
          accommodation_id: string | null
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          member_id: string
          order_id: string | null
          type: Database["public"]["Enums"]["member_point_type"]
        }
        Insert: {
          accommodation_id?: string | null
          amount: number
          balance_after: number
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          member_id: string
          order_id?: string | null
          type: Database["public"]["Enums"]["member_point_type"]
        }
        Update: {
          accommodation_id?: string | null
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          member_id?: string
          order_id?: string | null
          type?: Database["public"]["Enums"]["member_point_type"]
        }
        Relationships: [
          {
            foreignKeyName: "member_point_transactions_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_point_transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "platform_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_point_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      member_points: {
        Row: {
          balance: number
          id: string
          lifetime_earned: number
          lifetime_used: number
          member_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          id?: string
          lifetime_earned?: number
          lifetime_used?: number
          member_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          id?: string
          lifetime_earned?: number
          lifetime_used?: number
          member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_points_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "platform_members"
            referencedColumns: ["id"]
          },
        ]
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
      order_rooms: {
        Row: {
          created_at: string
          id: string
          order_id: string
          quantity: number
          room_price: number
          room_type_id: string
          template_id: string | null
          template_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          quantity?: number
          room_price?: number
          room_type_id: string
          template_id?: string | null
          template_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          quantity?: number
          room_price?: number
          room_type_id?: string
          template_id?: string | null
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_rooms_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_rooms_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_rooms_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "pricing_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accommodation_id: string
          balance_payment_method: string | null
          cancelled_at: string | null
          check_in_date: string
          check_out_date: string
          checked_in_at: string | null
          checked_out_at: string | null
          confirmed_at: string | null
          created_at: string | null
          custom_addon_details: Json | null
          customer_id: string | null
          deposit_amount: number | null
          deposit_payment_method: string | null
          discount_amount: number | null
          discount_code: string | null
          final_price: number
          guest_address: string | null
          guest_count: number
          guest_email: string | null
          guest_gender: string | null
          guest_name: string
          guest_nationality: string | null
          guest_phone: string
          id: string
          meal_plan: string | null
          meal_plan_details: Json | null
          meal_plan_total: number | null
          member_id: string | null
          notes: string | null
          order_date: string | null
          order_number: string
          order_source: string
          order_status: string
          paid_amount: number | null
          payment_link_created_at: string | null
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
          balance_payment_method?: string | null
          cancelled_at?: string | null
          check_in_date: string
          check_out_date: string
          checked_in_at?: string | null
          checked_out_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          custom_addon_details?: Json | null
          customer_id?: string | null
          deposit_amount?: number | null
          deposit_payment_method?: string | null
          discount_amount?: number | null
          discount_code?: string | null
          final_price: number
          guest_address?: string | null
          guest_count?: number
          guest_email?: string | null
          guest_gender?: string | null
          guest_name: string
          guest_nationality?: string | null
          guest_phone: string
          id?: string
          meal_plan?: string | null
          meal_plan_details?: Json | null
          meal_plan_total?: number | null
          member_id?: string | null
          notes?: string | null
          order_date?: string | null
          order_number: string
          order_source?: string
          order_status?: string
          paid_amount?: number | null
          payment_link_created_at?: string | null
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
          balance_payment_method?: string | null
          cancelled_at?: string | null
          check_in_date?: string
          check_out_date?: string
          checked_in_at?: string | null
          checked_out_at?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          custom_addon_details?: Json | null
          customer_id?: string | null
          deposit_amount?: number | null
          deposit_payment_method?: string | null
          discount_amount?: number | null
          discount_code?: string | null
          final_price?: number
          guest_address?: string | null
          guest_count?: number
          guest_email?: string | null
          guest_gender?: string | null
          guest_name?: string
          guest_nationality?: string | null
          guest_phone?: string
          id?: string
          meal_plan?: string | null
          meal_plan_details?: Json | null
          meal_plan_total?: number | null
          member_id?: string | null
          notes?: string | null
          order_date?: string | null
          order_number?: string
          order_source?: string
          order_status?: string
          paid_amount?: number | null
          payment_link_created_at?: string | null
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
            foreignKeyName: "orders_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "platform_members"
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
      page_analytics: {
        Row: {
          accommodation_id: string
          created_at: string
          device_type: string | null
          id: string
          page_path: string
          page_url: string
          referrer: string | null
          referrer_domain: string | null
          session_id: string
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          device_type?: string | null
          id?: string
          page_path: string
          page_url: string
          referrer?: string | null
          referrer_domain?: string | null
          session_id: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          device_type?: string | null
          id?: string
          page_path?: string
          page_url?: string
          referrer?: string | null
          referrer_domain?: string | null
          session_id?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "page_analytics_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_coupons: {
        Row: {
          accommodation_id: string | null
          code: string
          coupon_type: Database["public"]["Enums"]["coupon_type"]
          coupon_value: number
          created_at: string
          id: string
          is_active: boolean
          min_order_amount: number
          per_member_limit: number
          scope: Database["public"]["Enums"]["coupon_scope"]
          updated_at: string
          usage_limit: number
          used_count: number
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          accommodation_id?: string | null
          code: string
          coupon_type?: Database["public"]["Enums"]["coupon_type"]
          coupon_value?: number
          created_at?: string
          id?: string
          is_active?: boolean
          min_order_amount?: number
          per_member_limit?: number
          scope?: Database["public"]["Enums"]["coupon_scope"]
          updated_at?: string
          usage_limit?: number
          used_count?: number
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          accommodation_id?: string | null
          code?: string
          coupon_type?: Database["public"]["Enums"]["coupon_type"]
          coupon_value?: number
          created_at?: string
          id?: string
          is_active?: boolean
          min_order_amount?: number
          per_member_limit?: number
          scope?: Database["public"]["Enums"]["coupon_scope"]
          updated_at?: string
          usage_limit?: number
          used_count?: number
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_coupons_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_members: {
        Row: {
          address: string | null
          avatar_url: string | null
          created_at: string
          email: string | null
          gender: string | null
          id: string
          name: string
          nationality: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          gender?: string | null
          id?: string
          name?: string
          nationality?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          gender?: string | null
          id?: string
          name?: string
          nationality?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      point_rules: {
        Row: {
          accommodation_id: string | null
          created_at: string
          earn_rate: number
          id: string
          is_active: boolean
          min_order_amount: number
          points_per_dollar: number
          updated_at: string
        }
        Insert: {
          accommodation_id?: string | null
          created_at?: string
          earn_rate?: number
          id?: string
          is_active?: boolean
          min_order_amount?: number
          points_per_dollar?: number
          updated_at?: string
        }
        Update: {
          accommodation_id?: string | null
          created_at?: string
          earn_rate?: number
          id?: string
          is_active?: boolean
          min_order_amount?: number
          points_per_dollar?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_rules_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      point_transactions: {
        Row: {
          created_at: string
          currency_amount: number
          external_transaction_id: string | null
          external_user_id: string
          id: string
          metadata: Json | null
          order_id: string | null
          partner_id: string
          points_amount: number
          status: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency_amount: number
          external_transaction_id?: string | null
          external_user_id: string
          id?: string
          metadata?: Json | null
          order_id?: string | null
          partner_id: string
          points_amount: number
          status?: string
          transaction_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency_amount?: number
          external_transaction_id?: string | null
          external_user_id?: string
          id?: string
          metadata?: Json | null
          order_id?: string | null
          partner_id?: string
          points_amount?: number
          status?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "point_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "point_transactions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "points_platform_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      points_platform_partners: {
        Row: {
          api_key: string
          contact_email: string | null
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          platform_code: string
          platform_name: string
          point_to_currency_rate: number
          updated_at: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          api_key?: string
          contact_email?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          platform_code: string
          platform_name: string
          point_to_currency_rate?: number
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_key?: string
          contact_email?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          platform_code?: string
          platform_name?: string
          point_to_currency_rate?: number
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          accommodation_id: string
          available_rooms: number
          created_at: string
          day_type: string
          id: string
          is_active: boolean
          price: number | null
          price_2_meals: number | null
          price_3_meals: number | null
          priority: number
          room_type_id: string
          rule_name: string
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          available_rooms: number
          created_at?: string
          day_type: string
          id?: string
          is_active?: boolean
          price?: number | null
          price_2_meals?: number | null
          price_3_meals?: number | null
          priority?: number
          room_type_id: string
          rule_name: string
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          available_rooms?: number
          created_at?: string
          day_type?: string
          id?: string
          is_active?: boolean
          price?: number | null
          price_2_meals?: number | null
          price_3_meals?: number | null
          priority?: number
          room_type_id?: string
          rule_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_rules_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_template_applications: {
        Row: {
          accommodation_id: string
          affected_dates_count: number
          applied_at: string
          applied_by: string | null
          available_rooms: number
          created_at: string
          date_from: string
          date_to: string
          holiday_affected_count: number | null
          id: string
          price_type: string
          room_type_ids: Json
          selected_days: Json
          template_id: string
          work_on_weekend_count: number | null
        }
        Insert: {
          accommodation_id: string
          affected_dates_count: number
          applied_at?: string
          applied_by?: string | null
          available_rooms: number
          created_at?: string
          date_from: string
          date_to: string
          holiday_affected_count?: number | null
          id?: string
          price_type: string
          room_type_ids?: Json
          selected_days?: Json
          template_id: string
          work_on_weekend_count?: number | null
        }
        Update: {
          accommodation_id?: string
          affected_dates_count?: number
          applied_at?: string
          applied_by?: string | null
          available_rooms?: number
          created_at?: string
          date_from?: string
          date_to?: string
          holiday_affected_count?: number | null
          id?: string
          price_type?: string
          room_type_ids?: Json
          selected_days?: Json
          template_id?: string
          work_on_weekend_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_template_applications_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_template_applications_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "pricing_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_templates: {
        Row: {
          accommodation_id: string
          available_rooms: number
          created_at: string
          description: string | null
          display_order: number | null
          id: string
          is_default: boolean | null
          meal_plans: Json | null
          price: number | null
          project_description: string | null
          project_name: string | null
          room_type_id: string | null
          template_name: string
          updated_at: string
          weekday_price: number | null
          weekend_price: number | null
        }
        Insert: {
          accommodation_id: string
          available_rooms?: number
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_default?: boolean | null
          meal_plans?: Json | null
          price?: number | null
          project_description?: string | null
          project_name?: string | null
          room_type_id?: string | null
          template_name: string
          updated_at?: string
          weekday_price?: number | null
          weekend_price?: number | null
        }
        Update: {
          accommodation_id?: string
          available_rooms?: number
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_default?: boolean | null
          meal_plans?: Json | null
          price?: number | null
          project_description?: string | null
          project_name?: string | null
          room_type_id?: string | null
          template_name?: string
          updated_at?: string
          weekday_price?: number | null
          weekend_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_templates_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_templates_room_type_id_fkey"
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
          display_order: number | null
          email: string | null
          force_password_change: boolean
          id: string
          last_sign_in_at: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          email?: string | null
          force_password_change?: boolean
          id: string
          last_sign_in_at?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
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
          holiday_type: string
          id: string
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          holiday_date: string
          holiday_name: string
          holiday_type?: string
          id?: string
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          holiday_date?: string
          holiday_name?: string
          holiday_type?: string
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
      reviews: {
        Row: {
          accommodation_id: string
          comment: string
          created_at: string
          display_order: number | null
          id: string
          is_published: boolean | null
          rating: number
          review_date: string
          reviewer_name: string
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          comment: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_published?: boolean | null
          rating: number
          review_date: string
          reviewer_name: string
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          comment?: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_published?: boolean | null
          rating?: number
          review_date?: string
          reviewer_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_accommodation_id_fkey"
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
      room_inventory_pricing: {
        Row: {
          available_rooms: number
          created_at: string
          date: string
          id: string
          is_available: boolean | null
          max_nights: number | null
          min_nights: number | null
          notes: string | null
          price: number
          price_2_meals: number | null
          price_3_meals: number | null
          room_type_id: string
          updated_at: string
        }
        Insert: {
          available_rooms?: number
          created_at?: string
          date: string
          id?: string
          is_available?: boolean | null
          max_nights?: number | null
          min_nights?: number | null
          notes?: string | null
          price: number
          price_2_meals?: number | null
          price_3_meals?: number | null
          room_type_id: string
          updated_at?: string
        }
        Update: {
          available_rooms?: number
          created_at?: string
          date?: string
          id?: string
          is_available?: boolean | null
          max_nights?: number | null
          min_nights?: number | null
          notes?: string | null
          price?: number
          price_2_meals?: number | null
          price_3_meals?: number | null
          room_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_inventory_pricing_room_type_id_fkey"
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
          bound_exclusive_ids: string[] | null
          capacity: number
          created_at: string
          description: string | null
          display_order: number | null
          double_room_count: number | null
          id: string
          is_bound_to_exclusive: boolean
          is_exclusive_package: boolean
          name: string
          name_en: string | null
          quad_room_count: number | null
          room_count: number | null
          size_sqm: number | null
          triple_room_count: number | null
          updated_at: string
        }
        Insert: {
          accommodation_id?: string | null
          base_price: number
          bound_exclusive_ids?: string[] | null
          capacity: number
          created_at?: string
          description?: string | null
          display_order?: number | null
          double_room_count?: number | null
          id?: string
          is_bound_to_exclusive?: boolean
          is_exclusive_package?: boolean
          name: string
          name_en?: string | null
          quad_room_count?: number | null
          room_count?: number | null
          size_sqm?: number | null
          triple_room_count?: number | null
          updated_at?: string
        }
        Update: {
          accommodation_id?: string | null
          base_price?: number
          bound_exclusive_ids?: string[] | null
          capacity?: number
          created_at?: string
          description?: string | null
          display_order?: number | null
          double_room_count?: number | null
          id?: string
          is_bound_to_exclusive?: boolean
          is_exclusive_package?: boolean
          name?: string
          name_en?: string | null
          quad_room_count?: number | null
          room_count?: number | null
          size_sqm?: number | null
          triple_room_count?: number | null
          updated_at?: string
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
      split_records: {
        Row: {
          accommodation_amount: number
          accommodation_id: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          hq_amount: number
          id: string
          order_amount: number
          order_id: string
          paid_at: string | null
          payment_method: string | null
          payment_reference: string | null
          requested_at: string | null
          requested_by: string | null
          settled_by: string | null
          settlement_date: string | null
          settlement_note: string | null
          settlement_status: string
          split_rule_id: string | null
          updated_at: string
        }
        Insert: {
          accommodation_amount: number
          accommodation_id: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          hq_amount: number
          id?: string
          order_amount: number
          order_id: string
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          requested_at?: string | null
          requested_by?: string | null
          settled_by?: string | null
          settlement_date?: string | null
          settlement_note?: string | null
          settlement_status?: string
          split_rule_id?: string | null
          updated_at?: string
        }
        Update: {
          accommodation_amount?: number
          accommodation_id?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          hq_amount?: number
          id?: string
          order_amount?: number
          order_id?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          requested_at?: string | null
          requested_by?: string | null
          settled_by?: string | null
          settlement_date?: string | null
          settlement_note?: string | null
          settlement_status?: string
          split_rule_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_records_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_records_split_rule_id_fkey"
            columns: ["split_rule_id"]
            isOneToOne: false
            referencedRelation: "split_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      split_rules: {
        Row: {
          accommodation_id: string
          created_at: string
          description: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          transaction_fee_percentage: number
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          transaction_fee_percentage?: number
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          transaction_fee_percentage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_rules_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
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
      discount_codes_safe: {
        Row: {
          accommodation_id: string | null
          applicable_date_from: string | null
          applicable_date_to: string | null
          applicable_room_types: Json | null
          code: string | null
          commission_rate: number | null
          created_at: string | null
          discount_type: string | null
          discount_value: number | null
          display_order: number | null
          id: string | null
          is_active: boolean | null
          min_order_amount: number | null
          name: string | null
          updated_at: string | null
          usage_limit: number | null
          used_count: number | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          accommodation_id?: string | null
          applicable_date_from?: string | null
          applicable_date_to?: string | null
          applicable_room_types?: Json | null
          code?: string | null
          commission_rate?: number | null
          created_at?: string | null
          discount_type?: string | null
          discount_value?: number | null
          display_order?: number | null
          id?: string | null
          is_active?: boolean | null
          min_order_amount?: number | null
          name?: string | null
          updated_at?: string | null
          usage_limit?: number | null
          used_count?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          accommodation_id?: string | null
          applicable_date_from?: string | null
          applicable_date_to?: string | null
          applicable_room_types?: Json | null
          code?: string | null
          commission_rate?: number | null
          created_at?: string | null
          discount_type?: string | null
          discount_value?: number | null
          display_order?: number | null
          id?: string | null
          is_active?: boolean | null
          min_order_amount?: number | null
          name?: string | null
          updated_at?: string | null
          usage_limit?: number | null
          used_count?: number | null
          valid_from?: string | null
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
      profiles_safe: {
        Row: {
          created_at: string | null
          email: string | null
          force_password_change: boolean | null
          id: string | null
          last_sign_in_at: string | null
          name: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: never
          force_password_change?: boolean | null
          id?: string | null
          last_sign_in_at?: string | null
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: never
          force_password_change?: boolean | null
          id?: string | null
          last_sign_in_at?: string | null
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_view_user_roles: {
        Args: { _accommodation_id: string }
        Returns: boolean
      }
      check_exclusive_room_booking: {
        Args: { p_accommodation_id: string; p_date: string }
        Returns: {
          booked_room_type_id: string
          booked_room_type_name: string
          has_booking: boolean
        }[]
      }
      check_rls_enabled: {
        Args: never
        Returns: {
          rls_enabled: boolean
          table_name: string
        }[]
      }
      generate_order_number: { Args: never; Returns: string }
      get_adjusted_room_inventory: {
        Args: {
          p_accommodation_id: string
          p_date: string
          p_room_type_id: string
        }
        Returns: {
          available_rooms: number
          blocked_by_room_name: string
          is_blocked: boolean
        }[]
      }
      get_adjusted_room_inventory_batch: {
        Args: {
          p_accommodation_id: string
          p_dates: string[]
          p_room_type_id: string
        }
        Returns: {
          available_rooms: number
          blocked_by_room_name: string
          date_value: string
          is_blocked: boolean
        }[]
      }
      get_analytics_summary: {
        Args: {
          p_accommodation_id: string
          p_end_date?: string
          p_start_date?: string
        }
        Returns: {
          daily_views: Json
          top_pages: Json
          top_referrers: Json
          total_pageviews: number
          traffic_sources: Json
          unique_visitors: number
        }[]
      }
      get_discount_code_secrets: {
        Args: { p_discount_code_id: string }
        Returns: {
          api_key: string
          webhook_secret: string
          webhook_url: string
        }[]
      }
      get_public_discount_code_info:
        | {
            Args: { p_accommodation_id: string; p_code: string }
            Returns: {
              applicable_date_from: string
              applicable_date_to: string
              applicable_room_types: Json
              code: string
              discount_type: string
              discount_value: number
              min_order_amount: number
            }[]
          }
        | {
            Args: { p_accommodation_id: string; p_code: string }
            Returns: {
              applicable_date_from: string
              applicable_date_to: string
              applicable_room_types: Json
              code: string
              discount_type: string
              discount_value: number
              min_order_amount: number
            }[]
          }
      get_user_accommodations: {
        Args: { _user_id: string }
        Returns: {
          accommodation_id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      is_admin: { Args: { user_id_param: string }; Returns: boolean }
      is_super_admin: { Args: { user_uuid: string }; Returns: boolean }
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
      user_has_storage_access: { Args: { file_path: string }; Returns: boolean }
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
              applicable_room_names: string[]
              discount_type: string
              discount_value: number
              is_valid: boolean
              message: string
            }[]
          }
      validate_platform_coupon: {
        Args: {
          p_accommodation_id?: string
          p_code: string
          p_member_id: string
          p_order_amount: number
        }
        Returns: {
          coupon_id: string
          coupon_type: string
          coupon_value: number
          is_valid: boolean
          message: string
        }[]
      }
    }
    Enums: {
      app_role: "super_admin" | "hotel_admin" | "staff"
      coupon_scope: "platform" | "accommodation"
      coupon_type: "percentage" | "fixed"
      member_point_type:
        | "earn_order"
        | "earn_event"
        | "redeem"
        | "expire"
        | "admin_adjust"
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
      coupon_scope: ["platform", "accommodation"],
      coupon_type: ["percentage", "fixed"],
      member_point_type: [
        "earn_order",
        "earn_event",
        "redeem",
        "expire",
        "admin_adjust",
      ],
    },
  },
} as const
