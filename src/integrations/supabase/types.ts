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
      accommodation_ai_api_keys: {
        Row: {
          accommodation_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          rate_limit_per_min: number
          revoked_at: string | null
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          rate_limit_per_min?: number
          revoked_at?: string | null
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          rate_limit_per_min?: number
          revoked_at?: string | null
        }
        Relationships: []
      }
      accommodation_api_keys: {
        Row: {
          accommodation_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_api_keys_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      accommodation_commission_settings: {
        Row: {
          accommodation_id: string
          closer_rate: number | null
          created_at: string | null
          effective_from: string
          id: string
          video_rate: number | null
        }
        Insert: {
          accommodation_id: string
          closer_rate?: number | null
          created_at?: string | null
          effective_from: string
          id?: string
          video_rate?: number | null
        }
        Update: {
          accommodation_id?: string
          closer_rate?: number | null
          created_at?: string | null
          effective_from?: string
          id?: string
          video_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_commission_settings_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
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
          booking_type: string
          building_count: number
          check_in_notice: string | null
          country: string | null
          created_at: string
          custom_domain: string | null
          daily_capacity: number | null
          daily_room_capacity: number | null
          daily_villa_capacity: number | null
          description: string | null
          display_order: number | null
          email: string | null
          exclusive_room_breakdown: Json | null
          exclusive_total_rooms: number | null
          facebook_url: string | null
          footer_logo_url: string | null
          google_place_id: string | null
          google_reviews_cache: Json | null
          google_reviews_cached_at: string | null
          google_reviews_display_count: number
          google_reviews_selected_keys: Json
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
          owlting_aliases: string[]
          phone: string | null
          region_1: string | null
          region_2: string | null
          registration_number: string | null
          seo_description: string | null
          seo_title: string | null
          short_name: string | null
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
          villa_overview_labels: Json | null
          villa_trust_badges: Json | null
          website_url: string | null
          youtube_url: string | null
        }
        Insert: {
          address?: string | null
          booking_type?: string
          building_count?: number
          check_in_notice?: string | null
          country?: string | null
          created_at?: string
          custom_domain?: string | null
          daily_capacity?: number | null
          daily_room_capacity?: number | null
          daily_villa_capacity?: number | null
          description?: string | null
          display_order?: number | null
          email?: string | null
          exclusive_room_breakdown?: Json | null
          exclusive_total_rooms?: number | null
          facebook_url?: string | null
          footer_logo_url?: string | null
          google_place_id?: string | null
          google_reviews_cache?: Json | null
          google_reviews_cached_at?: string | null
          google_reviews_display_count?: number
          google_reviews_selected_keys?: Json
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
          owlting_aliases?: string[]
          phone?: string | null
          region_1?: string | null
          region_2?: string | null
          registration_number?: string | null
          seo_description?: string | null
          seo_title?: string | null
          short_name?: string | null
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
          villa_overview_labels?: Json | null
          villa_trust_badges?: Json | null
          website_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          address?: string | null
          booking_type?: string
          building_count?: number
          check_in_notice?: string | null
          country?: string | null
          created_at?: string
          custom_domain?: string | null
          daily_capacity?: number | null
          daily_room_capacity?: number | null
          daily_villa_capacity?: number | null
          description?: string | null
          display_order?: number | null
          email?: string | null
          exclusive_room_breakdown?: Json | null
          exclusive_total_rooms?: number | null
          facebook_url?: string | null
          footer_logo_url?: string | null
          google_place_id?: string | null
          google_reviews_cache?: Json | null
          google_reviews_cached_at?: string | null
          google_reviews_display_count?: number
          google_reviews_selected_keys?: Json
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
          owlting_aliases?: string[]
          phone?: string | null
          region_1?: string | null
          region_2?: string | null
          registration_number?: string | null
          seo_description?: string | null
          seo_title?: string | null
          short_name?: string | null
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
          villa_overview_labels?: Json | null
          villa_trust_badges?: Json | null
          website_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      accommodation_info_flags: {
        Row: {
          accommodation_id: string
          has_franchise: boolean | null
          has_starlink: boolean | null
          id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          accommodation_id: string
          has_franchise?: boolean | null
          has_starlink?: boolean | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          accommodation_id?: string
          has_franchise?: boolean | null
          has_starlink?: boolean | null
          id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_info_flags_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: true
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accommodation_info_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      accommodation_kol_settings: {
        Row: {
          accommodation_id: string
          booking_type: string | null
          id: string
          kol_enabled: boolean | null
          kpi_eligible_months: number | null
          original_booking_url: string | null
          short_url_prefix: string | null
          task_ig_collab: boolean | null
          task_post_story: boolean | null
          task_pre_stay: boolean | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          accommodation_id: string
          booking_type?: string | null
          id?: string
          kol_enabled?: boolean | null
          kpi_eligible_months?: number | null
          original_booking_url?: string | null
          short_url_prefix?: string | null
          task_ig_collab?: boolean | null
          task_post_story?: boolean | null
          task_pre_stay?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          accommodation_id?: string
          booking_type?: string | null
          id?: string
          kol_enabled?: boolean | null
          kpi_eligible_months?: number | null
          original_booking_url?: string | null
          short_url_prefix?: string | null
          task_ig_collab?: boolean | null
          task_post_story?: boolean | null
          task_pre_stay?: boolean | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_kol_settings_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: true
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accommodation_kol_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      accommodation_order_sources: {
        Row: {
          accommodation_id: string
          created_at: string
          display_order: number
          id: string
          name: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_order_sources_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      accommodation_owlting_config: {
        Row: {
          accommodation_id: string
          cm_api_endpoint_url: string
          created_at: string
          id: string
          last_successful_sync_at: string | null
          owlting_hotel_code: string
          sync_enabled: boolean
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          cm_api_endpoint_url?: string
          created_at?: string
          id?: string
          last_successful_sync_at?: string | null
          owlting_hotel_code: string
          sync_enabled?: boolean
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          cm_api_endpoint_url?: string
          created_at?: string
          id?: string
          last_successful_sync_at?: string | null
          owlting_hotel_code?: string
          sync_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_owlting_config_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: true
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      accommodation_owners: {
        Row: {
          accommodation_id: string
          created_at: string
          email: string
          id: string
          is_active: boolean
          line_user_id: string | null
          notes: string | null
          notify_priority: number
          owner_name: string
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          line_user_id?: string | null
          notes?: string | null
          notify_priority?: number
          owner_name: string
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          line_user_id?: string | null
          notes?: string | null
          notify_priority?: number
          owner_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_owners_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      accommodation_packages: {
        Row: {
          accommodation_id: string
          applicable_tiers: string[]
          child_age_note: string | null
          child_count_max: number | null
          created_at: string
          display_order: number
          enabled: boolean
          excluded_date_ranges: Json
          guest_count: number
          guest_count_label: string | null
          guest_count_max: number | null
          id: string
          includes: Json
          name: string
          numeric_code: number | null
          original_price: number | null
          primary_room_type_id: string | null
          room_allocation: string | null
          room_type_ids: string[] | null
          sale_price: number
          subtitle: string | null
          tags: string[]
          tier_prices: Json
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          applicable_tiers?: string[]
          child_age_note?: string | null
          child_count_max?: number | null
          created_at?: string
          display_order?: number
          enabled?: boolean
          excluded_date_ranges?: Json
          guest_count?: number
          guest_count_label?: string | null
          guest_count_max?: number | null
          id?: string
          includes?: Json
          name: string
          numeric_code?: number | null
          original_price?: number | null
          primary_room_type_id?: string | null
          room_allocation?: string | null
          room_type_ids?: string[] | null
          sale_price: number
          subtitle?: string | null
          tags?: string[]
          tier_prices?: Json
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          applicable_tiers?: string[]
          child_age_note?: string | null
          child_count_max?: number | null
          created_at?: string
          display_order?: number
          enabled?: boolean
          excluded_date_ranges?: Json
          guest_count?: number
          guest_count_label?: string | null
          guest_count_max?: number | null
          id?: string
          includes?: Json
          name?: string
          numeric_code?: number | null
          original_price?: number | null
          primary_room_type_id?: string | null
          room_allocation?: string | null
          room_type_ids?: string[] | null
          sale_price?: number
          subtitle?: string | null
          tags?: string[]
          tier_prices?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_packages_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accommodation_packages_primary_room_type_id_fkey"
            columns: ["primary_room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
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
      ad_video_creator_rules: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          keyword: string
          sort_order: number | null
          video_creator_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          keyword: string
          sort_order?: number | null
          video_creator_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          keyword?: string
          sort_order?: number | null
          video_creator_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_video_creator_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ad_video_creator_rules_video_creator_id_fkey"
            columns: ["video_creator_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      addon_sales: {
        Row: {
          accommodation_id: string
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          item_name: string
          notes: string | null
          quantity: number
          related_order_id: string | null
          sale_date: string
          total_amount: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_name: string
          notes?: string | null
          quantity?: number
          related_order_id?: string | null
          sale_date: string
          total_amount?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          item_name?: string
          notes?: string | null
          quantity?: number
          related_order_id?: string | null
          sale_date?: string
          total_amount?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "addon_sales_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addon_sales_related_order_id_fkey"
            columns: ["related_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
          sort_order: number
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
          sort_order?: number
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
          sort_order?: number
          unit_label?: string
          updated_at?: string | null
          weekday_min_quantity?: number | null
          weekend_min_quantity?: number | null
        }
        Relationships: []
      }
      ai_ab_tests: {
        Row: {
          accommodation_id: string | null
          created_at: string
          created_by: string | null
          ended_at: string | null
          id: string
          is_active: boolean
          notes: string | null
          started_at: string
          traffic_split: number
          version_a: number
          version_b: number
        }
        Insert: {
          accommodation_id?: string | null
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          started_at?: string
          traffic_split?: number
          version_a: number
          version_b: number
        }
        Update: {
          accommodation_id?: string | null
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          started_at?: string
          traffic_split?: number
          version_a?: number
          version_b?: number
        }
        Relationships: []
      }
      ai_conversation_logs: {
        Row: {
          accommodation_id: string | null
          admin_note: string | null
          created_at: string
          id: string
          messages: Json
          prompt_version: number | null
          session_id: string
          source: string | null
          user_rating:
            | Database["public"]["Enums"]["ai_conversation_rating"]
            | null
        }
        Insert: {
          accommodation_id?: string | null
          admin_note?: string | null
          created_at?: string
          id?: string
          messages?: Json
          prompt_version?: number | null
          session_id: string
          source?: string | null
          user_rating?:
            | Database["public"]["Enums"]["ai_conversation_rating"]
            | null
        }
        Update: {
          accommodation_id?: string | null
          admin_note?: string | null
          created_at?: string
          id?: string
          messages?: Json
          prompt_version?: number | null
          session_id?: string
          source?: string | null
          user_rating?:
            | Database["public"]["Enums"]["ai_conversation_rating"]
            | null
        }
        Relationships: []
      }
      ai_examples: {
        Row: {
          accommodation_id: string | null
          created_at: string
          explanation: string | null
          id: string
          ideal_response: string
          is_active: boolean
          scenario: string
          user_message: string
        }
        Insert: {
          accommodation_id?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          ideal_response: string
          is_active?: boolean
          scenario: string
          user_message: string
        }
        Update: {
          accommodation_id?: string | null
          created_at?: string
          explanation?: string | null
          id?: string
          ideal_response?: string
          is_active?: boolean
          scenario?: string
          user_message?: string
        }
        Relationships: []
      }
      ai_knowledge: {
        Row: {
          accommodation_id: string | null
          category: Database["public"]["Enums"]["ai_knowledge_category"]
          content: string
          created_at: string
          id: string
          is_active: boolean
          priority: number
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          accommodation_id?: string | null
          category?: Database["public"]["Enums"]["ai_knowledge_category"]
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          priority?: number
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          accommodation_id?: string | null
          category?: Database["public"]["Enums"]["ai_knowledge_category"]
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          priority?: number
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_prompts: {
        Row: {
          accommodation_id: string | null
          created_at: string
          created_by: string | null
          forbidden_topics: string | null
          id: string
          notes: string | null
          persona_avatar_url: string | null
          persona_name: string
          published_at: string | null
          status: Database["public"]["Enums"]["ai_prompt_status"]
          system_prompt: string
          tone_rules: string | null
          version: number
        }
        Insert: {
          accommodation_id?: string | null
          created_at?: string
          created_by?: string | null
          forbidden_topics?: string | null
          id?: string
          notes?: string | null
          persona_avatar_url?: string | null
          persona_name?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["ai_prompt_status"]
          system_prompt?: string
          tone_rules?: string | null
          version: number
        }
        Update: {
          accommodation_id?: string | null
          created_at?: string
          created_by?: string | null
          forbidden_topics?: string | null
          id?: string
          notes?: string | null
          persona_avatar_url?: string | null
          persona_name?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["ai_prompt_status"]
          system_prompt?: string
          tone_rules?: string | null
          version?: number
        }
        Relationships: []
      }
      alert_recipients: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          is_active: boolean
          notify_frontend_error: boolean
          notify_health_check: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          is_active?: boolean
          notify_frontend_error?: boolean
          notify_health_check?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          is_active?: boolean
          notify_frontend_error?: boolean
          notify_health_check?: boolean
        }
        Relationships: []
      }
      alert_throttle: {
        Row: {
          alert_key: string
          id: string
          last_sent_at: string
        }
        Insert: {
          alert_key: string
          id?: string
          last_sent_at?: string
        }
        Update: {
          alert_key?: string
          id?: string
          last_sent_at?: string
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
      bonus_multiplier_settings: {
        Row: {
          bonus_type: string
          created_at: string | null
          created_by: string | null
          end_date: string
          id: string
          is_active: boolean | null
          multiplier: number
          reason: string | null
          start_date: string
        }
        Insert: {
          bonus_type: string
          created_at?: string | null
          created_by?: string | null
          end_date: string
          id?: string
          is_active?: boolean | null
          multiplier?: number
          reason?: string | null
          start_date: string
        }
        Update: {
          bonus_type?: string
          created_at?: string | null
          created_by?: string | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          multiplier?: number
          reason?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_multiplier_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
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
      booking_methods: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      booking_settings: {
        Row: {
          accommodation_id: string | null
          bank_account_info: string | null
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
          bank_account_info?: string | null
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
          bank_account_info?: string | null
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
      closer_commission_adjustments: {
        Row: {
          adjustment_month: string
          adjustment_type: string
          closer_amount: number | null
          closer_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          order_id: string
          reason: string | null
          snapshot_id: string
          video_amount: number | null
          video_creator_id: string | null
        }
        Insert: {
          adjustment_month: string
          adjustment_type: string
          closer_amount?: number | null
          closer_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          order_id: string
          reason?: string | null
          snapshot_id: string
          video_amount?: number | null
          video_creator_id?: string | null
        }
        Update: {
          adjustment_month?: string
          adjustment_type?: string
          closer_amount?: number | null
          closer_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          order_id?: string
          reason?: string | null
          snapshot_id?: string
          video_amount?: number | null
          video_creator_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "closer_commission_adjustments_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "closer_commission_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "closer_commission_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closer_commission_adjustments_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "closer_commission_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closer_commission_adjustments_video_creator_id_fkey"
            columns: ["video_creator_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      closer_commission_snapshots: {
        Row: {
          accommodation_id: string
          closer_commission_amount: number | null
          closer_id: string | null
          closer_rate: number | null
          created_at: string | null
          final_price_snapshot: number
          id: string
          order_id: string
          snapshot_month: string
          video_commission_amount: number | null
          video_creator_id: string | null
          video_rate: number | null
        }
        Insert: {
          accommodation_id: string
          closer_commission_amount?: number | null
          closer_id?: string | null
          closer_rate?: number | null
          created_at?: string | null
          final_price_snapshot: number
          id?: string
          order_id: string
          snapshot_month: string
          video_commission_amount?: number | null
          video_creator_id?: string | null
          video_rate?: number | null
        }
        Update: {
          accommodation_id?: string
          closer_commission_amount?: number | null
          closer_id?: string | null
          closer_rate?: number | null
          created_at?: string | null
          final_price_snapshot?: number
          id?: string
          order_id?: string
          snapshot_month?: string
          video_commission_amount?: number | null
          video_creator_id?: string | null
          video_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "closer_commission_snapshots_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closer_commission_snapshots_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "closer_commission_snapshots_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closer_commission_snapshots_video_creator_id_fkey"
            columns: ["video_creator_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      commission_payout_rules: {
        Row: {
          commission_type: string
          created_at: string | null
          created_by: string | null
          cutoff_description: string | null
          cycle_type: string | null
          effective_from: string
          id: string
          payout_days: number[] | null
          rule_name: string | null
          settlement_offset_days: number | null
        }
        Insert: {
          commission_type: string
          created_at?: string | null
          created_by?: string | null
          cutoff_description?: string | null
          cycle_type?: string | null
          effective_from: string
          id?: string
          payout_days?: number[] | null
          rule_name?: string | null
          settlement_offset_days?: number | null
        }
        Update: {
          commission_type?: string
          created_at?: string | null
          created_by?: string | null
          cutoff_description?: string | null
          cycle_type?: string | null
          effective_from?: string
          id?: string
          payout_days?: number[] | null
          rule_name?: string | null
          settlement_offset_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_payout_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
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
      common_ad_ids: {
        Row: {
          ad_id: string
          created_at: string | null
          created_by: string | null
          id: string
          label: string
          sort_order: number | null
        }
        Insert: {
          ad_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          label: string
          sort_order?: number | null
        }
        Update: {
          ad_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          label?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "common_ad_ids_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
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
      deposit_card_tokens: {
        Row: {
          accommodation_id: string
          card_expiry: string | null
          card_key: string
          card_last_four: string | null
          card_token: string
          card_type: string | null
          created_at: string
          id: string
          is_active: boolean
          order_id: string
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          card_expiry?: string | null
          card_key: string
          card_last_four?: string | null
          card_token: string
          card_type?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          order_id: string
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          card_expiry?: string | null
          card_key?: string
          card_last_four?: string | null
          card_token?: string
          card_type?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          order_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposit_card_tokens_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_charges: {
        Row: {
          accommodation_id: string
          action: string
          amount: number
          card_token_id: string | null
          created_at: string
          error_message: string | null
          id: string
          order_id: string
          performed_by: string | null
          rec_trade_id: string | null
          status: string
          trigger_source: string
        }
        Insert: {
          accommodation_id: string
          action: string
          amount: number
          card_token_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          order_id: string
          performed_by?: string | null
          rec_trade_id?: string | null
          status: string
          trigger_source: string
        }
        Update: {
          accommodation_id?: string
          action?: string
          amount?: number
          card_token_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          order_id?: string
          performed_by?: string | null
          rec_trade_id?: string | null
          status?: string
          trigger_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposit_charges_card_token_id_fkey"
            columns: ["card_token_id"]
            isOneToOne: false
            referencedRelation: "deposit_card_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_charges_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_code_secrets: {
        Row: {
          api_key_hash: string | null
          api_key_prefix: string | null
          created_at: string
          discount_code_id: string
          id: string
          updated_at: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          api_key_hash?: string | null
          api_key_prefix?: string | null
          created_at?: string
          discount_code_id: string
          id?: string
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_key_hash?: string | null
          api_key_prefix?: string | null
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
      error_logs: {
        Row: {
          accommodation_id: string | null
          category: string
          context: Json | null
          created_at: string
          error_code: string | null
          error_message: string
          function_name: string | null
          id: string
          idempotency_key: string | null
          source: string
          step: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          accommodation_id?: string | null
          category: string
          context?: Json | null
          created_at?: string
          error_code?: string | null
          error_message: string
          function_name?: string | null
          id?: string
          idempotency_key?: string | null
          source: string
          step?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          accommodation_id?: string | null
          category?: string
          context?: Json | null
          created_at?: string
          error_code?: string | null
          error_message?: string
          function_name?: string | null
          id?: string
          idempotency_key?: string | null
          source?: string
          step?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_accommodation_id_fkey"
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
      external_order_import_settings: {
        Row: {
          accommodation_id: string | null
          created_at: string | null
          created_by: string | null
          field_mapping: Json | null
          id: string
          last_import_at: string | null
          platform_name: string
          updated_at: string | null
        }
        Insert: {
          accommodation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          field_mapping?: Json | null
          id?: string
          last_import_at?: string | null
          platform_name: string
          updated_at?: string | null
        }
        Update: {
          accommodation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          field_mapping?: Json | null
          id?: string
          last_import_at?: string | null
          platform_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_order_import_settings_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_order_import_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
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
      franchise_commission_settings: {
        Row: {
          base_rate: number | null
          co_sales1_rate: number | null
          co_sales2_rate: number | null
          company_rate: number | null
          created_at: string | null
          created_by: string | null
          effective_from: string
          id: string
          leader_supplement_rate: number | null
          payout_day: string | null
          project_name: string
          sales_rate: number | null
          tier1_rate: number | null
          tier2_rate: number | null
          type: string
        }
        Insert: {
          base_rate?: number | null
          co_sales1_rate?: number | null
          co_sales2_rate?: number | null
          company_rate?: number | null
          created_at?: string | null
          created_by?: string | null
          effective_from?: string
          id?: string
          leader_supplement_rate?: number | null
          payout_day?: string | null
          project_name?: string
          sales_rate?: number | null
          tier1_rate?: number | null
          tier2_rate?: number | null
          type: string
        }
        Update: {
          base_rate?: number | null
          co_sales1_rate?: number | null
          co_sales2_rate?: number | null
          company_rate?: number | null
          created_at?: string | null
          created_by?: string | null
          effective_from?: string
          id?: string
          leader_supplement_rate?: number | null
          payout_day?: string | null
          project_name?: string
          sales_rate?: number | null
          tier1_rate?: number | null
          tier2_rate?: number | null
          type?: string
        }
        Relationships: []
      }
      franchise_external_orders: {
        Row: {
          card_status: string | null
          co_sales_bonus: number | null
          co_sales_bonus2: number | null
          co_sales_name: string | null
          co_sales_name2: string | null
          contract_progress: string | null
          created_at: string | null
          created_by: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          invoice_address: string | null
          invoice_carrier: boolean | null
          invoice_number: string | null
          invoice_progress: string | null
          member_number: string | null
          notes: string | null
          payment_at: string | null
          plan_price: number
          project_name: string
          sales_bonus: number | null
          sales_email: string | null
          sales_name: string | null
          sales_phone: string | null
          signed_at: string | null
          tax_id: string | null
          total_amount: number | null
          unit_count: number | null
          updated_at: string | null
          voucher_address: string | null
          voucher_batch: string | null
          voucher_count: number | null
          voucher_handler: string | null
          voucher_note: string | null
          voucher_serial_end: number | null
          voucher_serial_start: number | null
          voucher_start_date: string | null
          voucher_status: string | null
        }
        Insert: {
          card_status?: string | null
          co_sales_bonus?: number | null
          co_sales_bonus2?: number | null
          co_sales_name?: string | null
          co_sales_name2?: string | null
          contract_progress?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          invoice_address?: string | null
          invoice_carrier?: boolean | null
          invoice_number?: string | null
          invoice_progress?: string | null
          member_number?: string | null
          notes?: string | null
          payment_at?: string | null
          plan_price?: number
          project_name?: string
          sales_bonus?: number | null
          sales_email?: string | null
          sales_name?: string | null
          sales_phone?: string | null
          signed_at?: string | null
          tax_id?: string | null
          total_amount?: number | null
          unit_count?: number | null
          updated_at?: string | null
          voucher_address?: string | null
          voucher_batch?: string | null
          voucher_count?: number | null
          voucher_handler?: string | null
          voucher_note?: string | null
          voucher_serial_end?: number | null
          voucher_serial_start?: number | null
          voucher_start_date?: string | null
          voucher_status?: string | null
        }
        Update: {
          card_status?: string | null
          co_sales_bonus?: number | null
          co_sales_bonus2?: number | null
          co_sales_name?: string | null
          co_sales_name2?: string | null
          contract_progress?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          invoice_address?: string | null
          invoice_carrier?: boolean | null
          invoice_number?: string | null
          invoice_progress?: string | null
          member_number?: string | null
          notes?: string | null
          payment_at?: string | null
          plan_price?: number
          project_name?: string
          sales_bonus?: number | null
          sales_email?: string | null
          sales_name?: string | null
          sales_phone?: string | null
          signed_at?: string | null
          tax_id?: string | null
          total_amount?: number | null
          unit_count?: number | null
          updated_at?: string | null
          voucher_address?: string | null
          voucher_batch?: string | null
          voucher_count?: number | null
          voucher_handler?: string | null
          voucher_note?: string | null
          voucher_serial_end?: number | null
          voucher_serial_start?: number | null
          voucher_start_date?: string | null
          voucher_status?: string | null
        }
        Relationships: []
      }
      franchise_monthly_distributions: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          month: number
          payment_date: string | null
          project_name: string
          unit_price: number
          updated_at: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          month: number
          payment_date?: string | null
          project_name: string
          unit_price: number
          updated_at?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          month?: number
          payment_date?: string | null
          project_name?: string
          unit_price?: number
          updated_at?: string | null
          year?: number
        }
        Relationships: []
      }
      franchise_orders: {
        Row: {
          accommodation_type: string | null
          card_status: string | null
          commission_amount: number | null
          commission_rate: number | null
          company_amount: number | null
          company_rate: number | null
          contract_uploaded: boolean | null
          created_at: string | null
          created_by: string | null
          customer_name: string
          customer_phone: string | null
          id: string
          import_source: string | null
          invoice_number: string | null
          leader_amount: number | null
          leader_rate: number | null
          member_number: string | null
          multiplier_applied: number | null
          multiplier_reason: string | null
          notes: string | null
          payment_at: string | null
          payment_confirmed: boolean | null
          payout_date: string | null
          payout_status: string | null
          plan_name: string | null
          plan_price: number
          quantity: number | null
          settled_at: string | null
          sold_at: string | null
          sold_by: string | null
          sold_by_name: string | null
          team_leader: string | null
          updated_at: string | null
          voucher_address: string | null
          voucher_batch: string | null
          voucher_count: number | null
          voucher_handler: string | null
          voucher_note: string | null
          voucher_serial_end: number | null
          voucher_serial_start: number | null
          voucher_start_date: string | null
          voucher_status: string | null
        }
        Insert: {
          accommodation_type?: string | null
          card_status?: string | null
          commission_amount?: number | null
          commission_rate?: number | null
          company_amount?: number | null
          company_rate?: number | null
          contract_uploaded?: boolean | null
          created_at?: string | null
          created_by?: string | null
          customer_name: string
          customer_phone?: string | null
          id?: string
          import_source?: string | null
          invoice_number?: string | null
          leader_amount?: number | null
          leader_rate?: number | null
          member_number?: string | null
          multiplier_applied?: number | null
          multiplier_reason?: string | null
          notes?: string | null
          payment_at?: string | null
          payment_confirmed?: boolean | null
          payout_date?: string | null
          payout_status?: string | null
          plan_name?: string | null
          plan_price: number
          quantity?: number | null
          settled_at?: string | null
          sold_at?: string | null
          sold_by?: string | null
          sold_by_name?: string | null
          team_leader?: string | null
          updated_at?: string | null
          voucher_address?: string | null
          voucher_batch?: string | null
          voucher_count?: number | null
          voucher_handler?: string | null
          voucher_note?: string | null
          voucher_serial_end?: number | null
          voucher_serial_start?: number | null
          voucher_start_date?: string | null
          voucher_status?: string | null
        }
        Update: {
          accommodation_type?: string | null
          card_status?: string | null
          commission_amount?: number | null
          commission_rate?: number | null
          company_amount?: number | null
          company_rate?: number | null
          contract_uploaded?: boolean | null
          created_at?: string | null
          created_by?: string | null
          customer_name?: string
          customer_phone?: string | null
          id?: string
          import_source?: string | null
          invoice_number?: string | null
          leader_amount?: number | null
          leader_rate?: number | null
          member_number?: string | null
          multiplier_applied?: number | null
          multiplier_reason?: string | null
          notes?: string | null
          payment_at?: string | null
          payment_confirmed?: boolean | null
          payout_date?: string | null
          payout_status?: string | null
          plan_name?: string | null
          plan_price?: number
          quantity?: number | null
          settled_at?: string | null
          sold_at?: string | null
          sold_by?: string | null
          sold_by_name?: string | null
          team_leader?: string | null
          updated_at?: string | null
          voucher_address?: string | null
          voucher_batch?: string | null
          voucher_count?: number | null
          voucher_handler?: string | null
          voucher_note?: string | null
          voucher_serial_end?: number | null
          voucher_serial_start?: number | null
          voucher_start_date?: string | null
          voucher_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "franchise_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "franchise_orders_sold_by_fkey"
            columns: ["sold_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "franchise_orders_team_leader_fkey"
            columns: ["team_leader"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      franchise_plan_settings: {
        Row: {
          accommodation_type: string | null
          created_at: string | null
          created_by: string | null
          effective_from: string
          id: string
          plan_name: string
          price: number
        }
        Insert: {
          accommodation_type?: string | null
          created_at?: string | null
          created_by?: string | null
          effective_from: string
          id?: string
          plan_name: string
          price: number
        }
        Update: {
          accommodation_type?: string | null
          created_at?: string | null
          created_by?: string | null
          effective_from?: string
          id?: string
          plan_name?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "franchise_plan_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      franchise_projects: {
        Row: {
          accommodation_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          accommodation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          accommodation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "franchise_projects_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_team_settings: {
        Row: {
          direct_leader_id: string | null
          id: string
          member_id: string
          sub_leader_id: string | null
          system_title: string | null
          title: string | null
          top_leader_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          direct_leader_id?: string | null
          id?: string
          member_id: string
          sub_leader_id?: string | null
          system_title?: string | null
          title?: string | null
          top_leader_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          direct_leader_id?: string | null
          id?: string
          member_id?: string
          sub_leader_id?: string | null
          system_title?: string | null
          title?: string | null
          top_leader_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "franchise_team_settings_direct_leader_id_fkey"
            columns: ["direct_leader_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "franchise_team_settings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "franchise_team_settings_sub_leader_id_fkey"
            columns: ["sub_leader_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "franchise_team_settings_top_leader_id_fkey"
            columns: ["top_leader_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "franchise_team_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      frontend_error_reports: {
        Row: {
          alert_sent: boolean
          context: Json | null
          created_at: string
          error_message: string
          error_type: string
          id: string
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          alert_sent?: boolean
          context?: Json | null
          created_at?: string
          error_message: string
          error_type: string
          id?: string
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          alert_sent?: boolean
          context?: Json | null
          created_at?: string
          error_message?: string
          error_type?: string
          id?: string
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      kol_blocked_dates: {
        Row: {
          accommodation_id: string
          blocked_date: string
          created_at: string | null
          created_by: string | null
          id: string
          reason: string | null
        }
        Insert: {
          accommodation_id: string
          blocked_date: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          reason?: string | null
        }
        Update: {
          accommodation_id?: string
          blocked_date?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kol_blocked_dates_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kol_blocked_dates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      kol_commission_settings: {
        Row: {
          accommodation_id: string
          created_at: string
          effective_from: string
          id: string
          kol_id: string | null
          rate: number
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          effective_from: string
          id?: string
          kol_id?: string | null
          rate?: number
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          effective_from?: string
          id?: string
          kol_id?: string | null
          rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "kol_commission_settings_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kol_commission_settings_kol_id_fkey"
            columns: ["kol_id"]
            isOneToOne: false
            referencedRelation: "kol_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      kol_profiles: {
        Row: {
          accommodation_id: string | null
          booking_status: string | null
          check_in_date: string | null
          check_out_date: string | null
          cid_code: string | null
          cid_configured: boolean
          cid_notified: boolean | null
          companion_cid: string | null
          contract_file_url: string | null
          contract_progress: string | null
          corrected_at: string | null
          corrected_by: string | null
          created_at: string | null
          created_by: string | null
          day_of_week: string | null
          error_note: string | null
          id: string
          ig_handle: string | null
          ig_url: string | null
          inventory_count: number | null
          inventory_status: string | null
          invited_at: string | null
          is_error: boolean | null
          kol_direct_ticket_link: string | null
          kol_tags: string[] | null
          kpi_eligible: boolean | null
          kpi_month: string | null
          kpi_qualified: boolean | null
          lihi_url: string | null
          name: string | null
          notes: string | null
          order_id: string | null
          order_number: string | null
          public_token: string | null
          publish_date: string | null
          publish_url: string | null
          rarity: string | null
          scout_id: string | null
          scout_name: string | null
          short_url: string | null
          task_ig_collab: boolean | null
          task_post_story: boolean | null
          task_pre_stay: boolean | null
          token_expires_at: string | null
          updated_at: string | null
          venue_name: string | null
        }
        Insert: {
          accommodation_id?: string | null
          booking_status?: string | null
          check_in_date?: string | null
          check_out_date?: string | null
          cid_code?: string | null
          cid_configured?: boolean
          cid_notified?: boolean | null
          companion_cid?: string | null
          contract_file_url?: string | null
          contract_progress?: string | null
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string | null
          created_by?: string | null
          day_of_week?: string | null
          error_note?: string | null
          id?: string
          ig_handle?: string | null
          ig_url?: string | null
          inventory_count?: number | null
          inventory_status?: string | null
          invited_at?: string | null
          is_error?: boolean | null
          kol_direct_ticket_link?: string | null
          kol_tags?: string[] | null
          kpi_eligible?: boolean | null
          kpi_month?: string | null
          kpi_qualified?: boolean | null
          lihi_url?: string | null
          name?: string | null
          notes?: string | null
          order_id?: string | null
          order_number?: string | null
          public_token?: string | null
          publish_date?: string | null
          publish_url?: string | null
          rarity?: string | null
          scout_id?: string | null
          scout_name?: string | null
          short_url?: string | null
          task_ig_collab?: boolean | null
          task_post_story?: boolean | null
          task_pre_stay?: boolean | null
          token_expires_at?: string | null
          updated_at?: string | null
          venue_name?: string | null
        }
        Update: {
          accommodation_id?: string | null
          booking_status?: string | null
          check_in_date?: string | null
          check_out_date?: string | null
          cid_code?: string | null
          cid_configured?: boolean
          cid_notified?: boolean | null
          companion_cid?: string | null
          contract_file_url?: string | null
          contract_progress?: string | null
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string | null
          created_by?: string | null
          day_of_week?: string | null
          error_note?: string | null
          id?: string
          ig_handle?: string | null
          ig_url?: string | null
          inventory_count?: number | null
          inventory_status?: string | null
          invited_at?: string | null
          is_error?: boolean | null
          kol_direct_ticket_link?: string | null
          kol_tags?: string[] | null
          kpi_eligible?: boolean | null
          kpi_month?: string | null
          kpi_qualified?: boolean | null
          lihi_url?: string | null
          name?: string | null
          notes?: string | null
          order_id?: string | null
          order_number?: string | null
          public_token?: string | null
          publish_date?: string | null
          publish_url?: string | null
          rarity?: string | null
          scout_id?: string | null
          scout_name?: string | null
          short_url?: string | null
          task_ig_collab?: boolean | null
          task_post_story?: boolean | null
          task_pre_stay?: boolean | null
          token_expires_at?: string | null
          updated_at?: string | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kol_profiles_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kol_profiles_corrected_by_fkey"
            columns: ["corrected_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "kol_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "kol_profiles_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kol_profiles_scout_id_fkey"
            columns: ["scout_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      kol_prospects: {
        Row: {
          collab_type: string | null
          contacted_at: string | null
          converted_to_kol_id: string | null
          created_at: string | null
          fee_quote: number | null
          id: string
          ig_handle: string | null
          ig_url: string | null
          name: string | null
          notes: string | null
          scout_id: string | null
          screenshot_url: string | null
          status: string | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          collab_type?: string | null
          contacted_at?: string | null
          converted_to_kol_id?: string | null
          created_at?: string | null
          fee_quote?: number | null
          id?: string
          ig_handle?: string | null
          ig_url?: string | null
          name?: string | null
          notes?: string | null
          scout_id?: string | null
          screenshot_url?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          collab_type?: string | null
          contacted_at?: string | null
          converted_to_kol_id?: string | null
          created_at?: string | null
          fee_quote?: number | null
          id?: string
          ig_handle?: string | null
          ig_url?: string | null
          name?: string | null
          notes?: string | null
          scout_id?: string | null
          screenshot_url?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kol_prospects_scout_id_fkey"
            columns: ["scout_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      kol_rarity_settings: {
        Row: {
          bonus_amount: number
          created_at: string
          created_by: string | null
          effective_from: string
          fan_range_desc: string | null
          id: string
          rarity: string
        }
        Insert: {
          bonus_amount?: number
          created_at?: string
          created_by?: string | null
          effective_from: string
          fan_range_desc?: string | null
          id?: string
          rarity: string
        }
        Update: {
          bonus_amount?: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          fan_range_desc?: string | null
          id?: string
          rarity?: string
        }
        Relationships: []
      }
      kol_tags: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      kol_venue_link_rules: {
        Row: {
          cid_rule: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          rule_code: string
          venue_name: string
          website_type: string | null
        }
        Insert: {
          cid_rule?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          rule_code: string
          venue_name: string
          website_type?: string | null
        }
        Update: {
          cid_rule?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          rule_code?: string
          venue_name?: string
          website_type?: string | null
        }
        Relationships: []
      }
      kol_venue_settings: {
        Row: {
          allowed_weekdays: number[]
          calc_type: string
          collab_end: string | null
          collab_start: string | null
          contact_email: string | null
          created_at: string | null
          daily_limit: number
          group_name: string
          has_external_platform: boolean
          id: string
          is_active: boolean | null
          is_starlink: boolean | null
          link_rule: string | null
          monthly_limit: number | null
          order_number_rule: string | null
          personal_target: number | null
          special_end: string | null
          special_limit: number | null
          special_start: string | null
          special_weekdays: number[] | null
          updated_at: string | null
          venue_name: string
        }
        Insert: {
          allowed_weekdays?: number[]
          calc_type: string
          collab_end?: string | null
          collab_start?: string | null
          contact_email?: string | null
          created_at?: string | null
          daily_limit?: number
          group_name: string
          has_external_platform?: boolean
          id?: string
          is_active?: boolean | null
          is_starlink?: boolean | null
          link_rule?: string | null
          monthly_limit?: number | null
          order_number_rule?: string | null
          personal_target?: number | null
          special_end?: string | null
          special_limit?: number | null
          special_start?: string | null
          special_weekdays?: number[] | null
          updated_at?: string | null
          venue_name: string
        }
        Update: {
          allowed_weekdays?: number[]
          calc_type?: string
          collab_end?: string | null
          collab_start?: string | null
          contact_email?: string | null
          created_at?: string | null
          daily_limit?: number
          group_name?: string
          has_external_platform?: boolean
          id?: string
          is_active?: boolean | null
          is_starlink?: boolean | null
          link_rule?: string | null
          monthly_limit?: number | null
          order_number_rule?: string | null
          personal_target?: number | null
          special_end?: string | null
          special_limit?: number | null
          special_start?: string | null
          special_weekdays?: number[] | null
          updated_at?: string | null
          venue_name?: string
        }
        Relationships: []
      }
      kol_venues: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      line_binding_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          team_member_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          team_member_id: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          team_member_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "line_binding_tokens_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      line_event_types: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          label: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
        }
        Relationships: []
      }
      line_oa_channels: {
        Row: {
          channel_access_token: string
          channel_name: string
          channel_secret: string
          created_at: string
          id: string
          is_active: boolean
          line_oa_id: string | null
          updated_at: string
        }
        Insert: {
          channel_access_token?: string
          channel_name: string
          channel_secret?: string
          created_at?: string
          id?: string
          is_active?: boolean
          line_oa_id?: string | null
          updated_at?: string
        }
        Update: {
          channel_access_token?: string
          channel_name?: string
          channel_secret?: string
          created_at?: string
          id?: string
          is_active?: boolean
          line_oa_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      line_push_targets: {
        Row: {
          accommodation_ids: string[]
          channel_id: string | null
          created_at: string
          custom_venue_names: string[]
          display_name: string | null
          event_types: string[]
          id: string
          is_active: boolean
          roles: string[]
          target_id: string
          target_type: string
          team_member_id: string | null
          updated_at: string
        }
        Insert: {
          accommodation_ids?: string[]
          channel_id?: string | null
          created_at?: string
          custom_venue_names?: string[]
          display_name?: string | null
          event_types?: string[]
          id?: string
          is_active?: boolean
          roles?: string[]
          target_id: string
          target_type: string
          team_member_id?: string | null
          updated_at?: string
        }
        Update: {
          accommodation_ids?: string[]
          channel_id?: string | null
          created_at?: string
          custom_venue_names?: string[]
          display_name?: string | null
          event_types?: string[]
          id?: string
          is_active?: boolean
          roles?: string[]
          target_id?: string
          target_type?: string
          team_member_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_push_targets_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "line_oa_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_push_targets_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
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
      member_coupon_distributions: {
        Row: {
          coupon_id: string
          created_at: string
          distributed_by: string | null
          distribution_note: string | null
          id: string
          is_used: boolean
          member_id: string
          used_at: string | null
        }
        Insert: {
          coupon_id: string
          created_at?: string
          distributed_by?: string | null
          distribution_note?: string | null
          id?: string
          is_used?: boolean
          member_id: string
          used_at?: string | null
        }
        Update: {
          coupon_id?: string
          created_at?: string
          distributed_by?: string | null
          distribution_note?: string | null
          id?: string
          is_used?: boolean
          member_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_coupon_distributions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "platform_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_coupon_distributions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "platform_members"
            referencedColumns: ["id"]
          },
        ]
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
      meta_ad_weekly: {
        Row: {
          campaign_id: string
          campaign_name: string | null
          date_range: string
          id: string
          impressions: number | null
          msg_started: number | null
          reach: number | null
          spend: number | null
          start_date: string | null
          status: string | null
          stop_date: string | null
          synced_at: string | null
        }
        Insert: {
          campaign_id: string
          campaign_name?: string | null
          date_range: string
          id?: string
          impressions?: number | null
          msg_started?: number | null
          reach?: number | null
          spend?: number | null
          start_date?: string | null
          status?: string | null
          stop_date?: string | null
          synced_at?: string | null
        }
        Update: {
          campaign_id?: string
          campaign_name?: string | null
          date_range?: string
          id?: string
          impressions?: number | null
          msg_started?: number | null
          reach?: number | null
          spend?: number | null
          start_date?: string | null
          status?: string | null
          stop_date?: string | null
          synced_at?: string | null
        }
        Relationships: []
      }
      meta_ads: {
        Row: {
          ad_id: string
          ad_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          created_time: string | null
          id: string
          start_date: string | null
          status: string | null
          stop_date: string | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          ad_id: string
          ad_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          created_time?: string | null
          id?: string
          start_date?: string | null
          status?: string | null
          stop_date?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          ad_id?: string
          ad_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          created_time?: string | null
          id?: string
          start_date?: string | null
          status?: string | null
          stop_date?: string | null
          synced_at?: string | null
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
      order_commissions: {
        Row: {
          amount: number
          base_amount: number
          calculated_at: string | null
          id: string
          locked_at: string | null
          member_id: string
          multiplier_applied: number | null
          multiplier_reason: string | null
          order_id: string
          order_meta_id: string | null
          payout_date: string | null
          payout_rule_id: string | null
          payout_status: string | null
          rate_effective_from: string | null
          rate_snapshot: number | null
          role: string
        }
        Insert: {
          amount: number
          base_amount: number
          calculated_at?: string | null
          id?: string
          locked_at?: string | null
          member_id: string
          multiplier_applied?: number | null
          multiplier_reason?: string | null
          order_id: string
          order_meta_id?: string | null
          payout_date?: string | null
          payout_rule_id?: string | null
          payout_status?: string | null
          rate_effective_from?: string | null
          rate_snapshot?: number | null
          role: string
        }
        Update: {
          amount?: number
          base_amount?: number
          calculated_at?: string | null
          id?: string
          locked_at?: string | null
          member_id?: string
          multiplier_applied?: number | null
          multiplier_reason?: string | null
          order_id?: string
          order_meta_id?: string | null
          payout_date?: string | null
          payout_rule_id?: string | null
          payout_status?: string | null
          rate_effective_from?: string | null
          rate_snapshot?: number | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_commissions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "order_commissions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_commissions_order_meta_id_fkey"
            columns: ["order_meta_id"]
            isOneToOne: false
            referencedRelation: "order_meta"
            referencedColumns: ["id"]
          },
        ]
      }
      order_meta: {
        Row: {
          accommodation_id: string | null
          ad_id: string | null
          addon_amount: number | null
          addon_note: string | null
          booking_method: string | null
          closer_assisted: boolean | null
          closer_commission_rate: number | null
          closer_id: string | null
          deposit_confirm_date: string | null
          exclusion_note: string | null
          filled_at: string | null
          filled_by: string | null
          franchise_project: string | null
          id: string
          import_source: string | null
          influencer_cid: string | null
          inquiry_date: string | null
          is_excluded: boolean | null
          kol_commission_only: boolean | null
          member_number: string | null
          nickname: string | null
          order_id: string
          scout_commission_rate: number | null
          scout_id: string | null
          traffic_source: string | null
          updated_at: string | null
          video_creator_id: string | null
          voucher_count: number | null
          voucher_used: boolean | null
        }
        Insert: {
          accommodation_id?: string | null
          ad_id?: string | null
          addon_amount?: number | null
          addon_note?: string | null
          booking_method?: string | null
          closer_assisted?: boolean | null
          closer_commission_rate?: number | null
          closer_id?: string | null
          deposit_confirm_date?: string | null
          exclusion_note?: string | null
          filled_at?: string | null
          filled_by?: string | null
          franchise_project?: string | null
          id?: string
          import_source?: string | null
          influencer_cid?: string | null
          inquiry_date?: string | null
          is_excluded?: boolean | null
          kol_commission_only?: boolean | null
          member_number?: string | null
          nickname?: string | null
          order_id: string
          scout_commission_rate?: number | null
          scout_id?: string | null
          traffic_source?: string | null
          updated_at?: string | null
          video_creator_id?: string | null
          voucher_count?: number | null
          voucher_used?: boolean | null
        }
        Update: {
          accommodation_id?: string | null
          ad_id?: string | null
          addon_amount?: number | null
          addon_note?: string | null
          booking_method?: string | null
          closer_assisted?: boolean | null
          closer_commission_rate?: number | null
          closer_id?: string | null
          deposit_confirm_date?: string | null
          exclusion_note?: string | null
          filled_at?: string | null
          filled_by?: string | null
          franchise_project?: string | null
          id?: string
          import_source?: string | null
          influencer_cid?: string | null
          inquiry_date?: string | null
          is_excluded?: boolean | null
          kol_commission_only?: boolean | null
          member_number?: string | null
          nickname?: string | null
          order_id?: string
          scout_commission_rate?: number | null
          scout_id?: string | null
          traffic_source?: string | null
          updated_at?: string | null
          video_creator_id?: string | null
          voucher_count?: number | null
          voucher_used?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "order_meta_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_meta_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "order_meta_filled_by_fkey"
            columns: ["filled_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "order_meta_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_meta_scout_id_fkey"
            columns: ["scout_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "order_meta_video_creator_id_fkey"
            columns: ["video_creator_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
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
          room_unit_id: string | null
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
          room_unit_id?: string | null
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
          room_unit_id?: string | null
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
            foreignKeyName: "order_rooms_room_unit_id_fkey"
            columns: ["room_unit_id"]
            isOneToOne: false
            referencedRelation: "room_units"
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
          atm_bank_transaction_id: string | null
          atm_expire_at: string | null
          atm_rec_trade_id: string | null
          atm_vacc_bank_code: string | null
          atm_vacc_no: string | null
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
          deposit_charged_amount: number
          deposit_charged_at: string | null
          deposit_method: string | null
          deposit_payment_method: string | null
          deposit_refunded_amount: number
          deposit_refunded_at: string | null
          deposit_required_amount: number
          deposit_status: string
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
          idempotency_key: string | null
          internal_email_sent: boolean
          internal_email_sent_at: string | null
          meal_plan: string | null
          meal_plan_details: Json | null
          meal_plan_total: number | null
          member_id: string | null
          notes: string | null
          order_date: string | null
          order_number: string
          order_source: string
          order_status: string
          ota_channel: string | null
          owlting_reservation_id: string | null
          owlting_sync_state: Json | null
          owlting_unique_id: string | null
          owner_direct: boolean
          paid_amount: number | null
          payment_link_created_at: string | null
          payment_method: string | null
          payment_status: string
          pet_count: number | null
          pet_plan_price: number | null
          requires_owner_review: boolean
          room_assigned: boolean | null
          room_type_id: string | null
          total_price: number
          updated_at: string | null
        }
        Insert: {
          accommodation_id: string
          atm_bank_transaction_id?: string | null
          atm_expire_at?: string | null
          atm_rec_trade_id?: string | null
          atm_vacc_bank_code?: string | null
          atm_vacc_no?: string | null
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
          deposit_charged_amount?: number
          deposit_charged_at?: string | null
          deposit_method?: string | null
          deposit_payment_method?: string | null
          deposit_refunded_amount?: number
          deposit_refunded_at?: string | null
          deposit_required_amount?: number
          deposit_status?: string
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
          idempotency_key?: string | null
          internal_email_sent?: boolean
          internal_email_sent_at?: string | null
          meal_plan?: string | null
          meal_plan_details?: Json | null
          meal_plan_total?: number | null
          member_id?: string | null
          notes?: string | null
          order_date?: string | null
          order_number: string
          order_source?: string
          order_status?: string
          ota_channel?: string | null
          owlting_reservation_id?: string | null
          owlting_sync_state?: Json | null
          owlting_unique_id?: string | null
          owner_direct?: boolean
          paid_amount?: number | null
          payment_link_created_at?: string | null
          payment_method?: string | null
          payment_status?: string
          pet_count?: number | null
          pet_plan_price?: number | null
          requires_owner_review?: boolean
          room_assigned?: boolean | null
          room_type_id?: string | null
          total_price: number
          updated_at?: string | null
        }
        Update: {
          accommodation_id?: string
          atm_bank_transaction_id?: string | null
          atm_expire_at?: string | null
          atm_rec_trade_id?: string | null
          atm_vacc_bank_code?: string | null
          atm_vacc_no?: string | null
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
          deposit_charged_amount?: number
          deposit_charged_at?: string | null
          deposit_method?: string | null
          deposit_payment_method?: string | null
          deposit_refunded_amount?: number
          deposit_refunded_at?: string | null
          deposit_required_amount?: number
          deposit_status?: string
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
          idempotency_key?: string | null
          internal_email_sent?: boolean
          internal_email_sent_at?: string | null
          meal_plan?: string | null
          meal_plan_details?: Json | null
          meal_plan_total?: number | null
          member_id?: string | null
          notes?: string | null
          order_date?: string | null
          order_number?: string
          order_source?: string
          order_status?: string
          ota_channel?: string | null
          owlting_reservation_id?: string | null
          owlting_sync_state?: Json | null
          owlting_unique_id?: string | null
          owner_direct?: boolean
          paid_amount?: number | null
          payment_link_created_at?: string | null
          payment_method?: string | null
          payment_status?: string
          pet_count?: number | null
          pet_plan_price?: number | null
          requires_owner_review?: boolean
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
      ota_channel_dismissed_defaults: {
        Row: {
          accommodation_id: string
          channel_code: string
          created_at: string
          id: string
        }
        Insert: {
          accommodation_id: string
          channel_code: string
          created_at?: string
          id?: string
        }
        Update: {
          accommodation_id?: string
          channel_code?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      ota_channels: {
        Row: {
          accommodation_id: string
          channel_code: string
          channel_name: string
          created_at: string
          display_order: number
          hotel_id: string | null
          id: string
          is_enabled: boolean
          last_synced_at: string | null
          logo_url: string | null
          notes: string | null
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          channel_code: string
          channel_name: string
          created_at?: string
          display_order?: number
          hotel_id?: string | null
          id?: string
          is_enabled?: boolean
          last_synced_at?: string | null
          logo_url?: string | null
          notes?: string | null
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          channel_code?: string
          channel_name?: string
          created_at?: string
          display_order?: number
          hotel_id?: string | null
          id?: string
          is_enabled?: boolean
          last_synced_at?: string | null
          logo_url?: string | null
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      owlting_ari_endpoints: {
        Row: {
          accommodation_id: string
          created_at: string
          endpoint_url: string
          environment: string
          id: string
          is_active: boolean
          last_pushed_at: string | null
          remote_password: string | null
          remote_username: string | null
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          endpoint_url: string
          environment?: string
          id?: string
          is_active?: boolean
          last_pushed_at?: string | null
          remote_password?: string | null
          remote_username?: string | null
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          endpoint_url?: string
          environment?: string
          id?: string
          is_active?: boolean
          last_pushed_at?: string | null
          remote_password?: string | null
          remote_username?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      owlting_cm_logs: {
        Row: {
          accommodation_id: string | null
          api_method: string
          created_at: string
          direction: string
          echo_token: string | null
          error_message: string | null
          hotel_code: string | null
          id: string
          request_payload: string | null
          response_payload: string | null
          status: string
        }
        Insert: {
          accommodation_id?: string | null
          api_method: string
          created_at?: string
          direction: string
          echo_token?: string | null
          error_message?: string | null
          hotel_code?: string | null
          id?: string
          request_payload?: string | null
          response_payload?: string | null
          status?: string
        }
        Update: {
          accommodation_id?: string | null
          api_method?: string
          created_at?: string
          direction?: string
          echo_token?: string | null
          error_message?: string | null
          hotel_code?: string | null
          id?: string
          request_payload?: string | null
          response_payload?: string | null
          status?: string
        }
        Relationships: []
      }
      owlting_credentials: {
        Row: {
          accommodation_id: string
          created_at: string
          hotel_code: string
          id: string
          is_active: boolean
          password_hash: string
          updated_at: string
          username: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          hotel_code: string
          id?: string
          is_active?: boolean
          password_hash: string
          updated_at?: string
          username: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          hotel_code?: string
          id?: string
          is_active?: boolean
          password_hash?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      owlting_email_orders_raw: {
        Row: {
          accommodation_id: string | null
          accommodation_name: string | null
          attachments: Json | null
          charsets: Json | null
          created_at: string
          dkim: string | null
          envelope: Json | null
          from_domain: string | null
          from_email: string | null
          html_body: string | null
          id: string
          message_type: string | null
          notes: string | null
          obe_number: string | null
          processed_at: string | null
          raw_payload: Json
          received_at: string
          sender_ip: string | null
          spam_report: string | null
          spam_score: number | null
          spf: string | null
          status: string
          subject: string | null
          text_body: string | null
          to_email: string | null
        }
        Insert: {
          accommodation_id?: string | null
          accommodation_name?: string | null
          attachments?: Json | null
          charsets?: Json | null
          created_at?: string
          dkim?: string | null
          envelope?: Json | null
          from_domain?: string | null
          from_email?: string | null
          html_body?: string | null
          id?: string
          message_type?: string | null
          notes?: string | null
          obe_number?: string | null
          processed_at?: string | null
          raw_payload: Json
          received_at?: string
          sender_ip?: string | null
          spam_report?: string | null
          spam_score?: number | null
          spf?: string | null
          status?: string
          subject?: string | null
          text_body?: string | null
          to_email?: string | null
        }
        Update: {
          accommodation_id?: string | null
          accommodation_name?: string | null
          attachments?: Json | null
          charsets?: Json | null
          created_at?: string
          dkim?: string | null
          envelope?: Json | null
          from_domain?: string | null
          from_email?: string | null
          html_body?: string | null
          id?: string
          message_type?: string | null
          notes?: string | null
          obe_number?: string | null
          processed_at?: string | null
          raw_payload?: Json
          received_at?: string
          sender_ip?: string | null
          spam_report?: string | null
          spam_score?: number | null
          spf?: string | null
          status?: string
          subject?: string | null
          text_body?: string | null
          to_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owlting_email_orders_raw_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      owlting_email_parse_failures: {
        Row: {
          created_at: string
          failure_reason: string
          failure_stage: string | null
          from_email: string | null
          id: string
          notes: string | null
          raw_email_id: string | null
          raw_payload: Json | null
          received_at: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          subject: string | null
        }
        Insert: {
          created_at?: string
          failure_reason: string
          failure_stage?: string | null
          from_email?: string | null
          id?: string
          notes?: string | null
          raw_email_id?: string | null
          raw_payload?: Json | null
          received_at?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          subject?: string | null
        }
        Update: {
          created_at?: string
          failure_reason?: string
          failure_stage?: string | null
          from_email?: string | null
          id?: string
          notes?: string | null
          raw_email_id?: string | null
          raw_payload?: Json | null
          received_at?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owlting_email_parse_failures_raw_email_id_fkey"
            columns: ["raw_email_id"]
            isOneToOne: false
            referencedRelation: "owlting_email_orders_raw"
            referencedColumns: ["id"]
          },
        ]
      }
      owlting_email_parsed_staging: {
        Row: {
          accommodation_id: string | null
          accommodation_name: string | null
          addons: Json | null
          adult_count: number | null
          channel_source: string | null
          check_in_date: string | null
          check_out_date: string | null
          child_count: number | null
          confidence: string
          created_at: string
          currency: string | null
          extracted_fields: Json
          guest_count: number | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          last_reminder_at: string | null
          last_send_at: string | null
          last_send_attempts: number
          last_send_message: string | null
          last_send_status: string | null
          message_type: string | null
          nights: number | null
          notified_at: string | null
          obe_number: string | null
          owner_filled_at: string | null
          parse_warnings: Json | null
          parser_version: string
          payment_status: string | null
          pii_due_at: string | null
          pii_masked: boolean
          pii_status: string
          project_name: string | null
          promoted_order_id: string | null
          raw_email_id: string
          remaining_amount: number | null
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          room_quantity: number | null
          room_type_name: string | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          accommodation_id?: string | null
          accommodation_name?: string | null
          addons?: Json | null
          adult_count?: number | null
          channel_source?: string | null
          check_in_date?: string | null
          check_out_date?: string | null
          child_count?: number | null
          confidence?: string
          created_at?: string
          currency?: string | null
          extracted_fields?: Json
          guest_count?: number | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          last_reminder_at?: string | null
          last_send_at?: string | null
          last_send_attempts?: number
          last_send_message?: string | null
          last_send_status?: string | null
          message_type?: string | null
          nights?: number | null
          notified_at?: string | null
          obe_number?: string | null
          owner_filled_at?: string | null
          parse_warnings?: Json | null
          parser_version?: string
          payment_status?: string | null
          pii_due_at?: string | null
          pii_masked?: boolean
          pii_status?: string
          project_name?: string | null
          promoted_order_id?: string | null
          raw_email_id: string
          remaining_amount?: number | null
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_quantity?: number | null
          room_type_name?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          accommodation_id?: string | null
          accommodation_name?: string | null
          addons?: Json | null
          adult_count?: number | null
          channel_source?: string | null
          check_in_date?: string | null
          check_out_date?: string | null
          child_count?: number | null
          confidence?: string
          created_at?: string
          currency?: string | null
          extracted_fields?: Json
          guest_count?: number | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          last_reminder_at?: string | null
          last_send_at?: string | null
          last_send_attempts?: number
          last_send_message?: string | null
          last_send_status?: string | null
          message_type?: string | null
          nights?: number | null
          notified_at?: string | null
          obe_number?: string | null
          owner_filled_at?: string | null
          parse_warnings?: Json | null
          parser_version?: string
          payment_status?: string | null
          pii_due_at?: string | null
          pii_masked?: boolean
          pii_status?: string
          project_name?: string | null
          promoted_order_id?: string | null
          raw_email_id?: string
          remaining_amount?: number | null
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_quantity?: number | null
          room_type_name?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owlting_email_parsed_staging_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owlting_email_parsed_staging_promoted_order_id_fkey"
            columns: ["promoted_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owlting_email_parsed_staging_raw_email_id_fkey"
            columns: ["raw_email_id"]
            isOneToOne: false
            referencedRelation: "owlting_email_orders_raw"
            referencedColumns: ["id"]
          },
        ]
      }
      owlting_email_property_alias: {
        Row: {
          accommodation_id: string | null
          created_at: string
          id: string
          notes: string | null
          owlting_property_name: string
          updated_at: string
        }
        Insert: {
          accommodation_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          owlting_property_name: string
          updated_at?: string
        }
        Update: {
          accommodation_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          owlting_property_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owlting_email_property_alias_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
        ]
      }
      owlting_email_room_alias: {
        Row: {
          accommodation_id: string
          created_at: string
          id: string
          notes: string | null
          owlting_room_name: string
          room_type_id: string | null
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          id?: string
          notes?: string | null
          owlting_room_name: string
          room_type_id?: string | null
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          owlting_room_name?: string
          room_type_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owlting_email_room_alias_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owlting_email_room_alias_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      owlting_fillup_tokens: {
        Row: {
          accommodation_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          fail_count: number
          id: string
          ip_attempts: Json
          last_attempt_ip: string | null
          locked_until: string | null
          staging_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          accommodation_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          fail_count?: number
          id?: string
          ip_attempts?: Json
          last_attempt_ip?: string | null
          locked_until?: string | null
          staging_id: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          accommodation_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          fail_count?: number
          id?: string
          ip_attempts?: Json
          last_attempt_ip?: string | null
          locked_until?: string | null
          staging_id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owlting_fillup_tokens_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owlting_fillup_tokens_staging_id_fkey"
            columns: ["staging_id"]
            isOneToOne: false
            referencedRelation: "owlting_email_parsed_staging"
            referencedColumns: ["id"]
          },
        ]
      }
      owlting_message_logs: {
        Row: {
          accommodation_id: string | null
          created_at: string
          direction: string
          error_message: string | null
          http_status: number | null
          id: string
          message_type: string | null
          request_body: string | null
          response_body: string | null
        }
        Insert: {
          accommodation_id?: string | null
          created_at?: string
          direction: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          message_type?: string | null
          request_body?: string | null
          response_body?: string | null
        }
        Update: {
          accommodation_id?: string | null
          created_at?: string
          direction?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          message_type?: string | null
          request_body?: string | null
          response_body?: string | null
        }
        Relationships: []
      }
      owlting_order_push_log: {
        Row: {
          accommodation_id: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          http_status: number | null
          id: string
          owlnest_md5: string | null
          queue_id: string | null
          request_xml: string | null
          res_status: string | null
          response_xml: string | null
          success: boolean | null
        }
        Insert: {
          accommodation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          owlnest_md5?: string | null
          queue_id?: string | null
          request_xml?: string | null
          res_status?: string | null
          response_xml?: string | null
          success?: boolean | null
        }
        Update: {
          accommodation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          owlnest_md5?: string | null
          queue_id?: string | null
          request_xml?: string | null
          res_status?: string | null
          response_xml?: string | null
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "owlting_order_push_log_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owlting_order_push_log_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "owlting_order_push_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      owlting_order_push_queue: {
        Row: {
          accommodation_id: string
          attempt_count: number
          created_at: string
          echo_token: string
          id: string
          last_error: string | null
          next_retry_at: string | null
          order_id: string | null
          res_status: Database["public"]["Enums"]["owlting_res_status"]
          sent_at: string | null
          status: Database["public"]["Enums"]["owlting_push_status"]
        }
        Insert: {
          accommodation_id: string
          attempt_count?: number
          created_at?: string
          echo_token: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          order_id?: string | null
          res_status: Database["public"]["Enums"]["owlting_res_status"]
          sent_at?: string | null
          status?: Database["public"]["Enums"]["owlting_push_status"]
        }
        Update: {
          accommodation_id?: string
          attempt_count?: number
          created_at?: string
          echo_token?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          order_id?: string | null
          res_status?: Database["public"]["Enums"]["owlting_res_status"]
          sent_at?: string | null
          status?: Database["public"]["Enums"]["owlting_push_status"]
        }
        Relationships: [
          {
            foreignKeyName: "owlting_order_push_queue_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owlting_order_push_queue_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      owlting_service_accounts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          password_hash: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          password_hash: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          password_hash?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
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
      paid_order_discount_unlock_permissions: {
        Row: {
          accommodation_id: string
          created_at: string
          granted_by: string | null
          id: string
          user_id: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          granted_by?: string | null
          id?: string
          user_id: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
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
      performance_notification_settings: {
        Row: {
          accommodation_id: string
          email_template: string | null
          enabled: boolean | null
          franchise_booking_target: number | null
          franchise_sales_target: number | null
          franchise_sales_year_target: number | null
          general_booking_target: number | null
          id: string
          notify_time: string | null
          show_franchise_booking: boolean | null
          show_franchise_sales: boolean | null
          show_general_booking: boolean | null
          show_starlink: boolean | null
          starlink_target: number | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          accommodation_id: string
          email_template?: string | null
          enabled?: boolean | null
          franchise_booking_target?: number | null
          franchise_sales_target?: number | null
          franchise_sales_year_target?: number | null
          general_booking_target?: number | null
          id?: string
          notify_time?: string | null
          show_franchise_booking?: boolean | null
          show_franchise_sales?: boolean | null
          show_general_booking?: boolean | null
          show_starlink?: boolean | null
          starlink_target?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          accommodation_id?: string
          email_template?: string | null
          enabled?: boolean | null
          franchise_booking_target?: number | null
          franchise_sales_target?: number | null
          franchise_sales_year_target?: number | null
          general_booking_target?: number | null
          id?: string
          notify_time?: string | null
          show_franchise_booking?: boolean | null
          show_franchise_sales?: boolean | null
          show_general_booking?: boolean | null
          show_starlink?: boolean | null
          starlink_target?: number | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_notification_settings_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: true
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_notification_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      permission_templates: {
        Row: {
          accommodation_id: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_system: boolean
          name: string
          permissions: Json
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_system?: boolean
          name: string
          permissions?: Json
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_system?: boolean
          name?: string
          permissions?: Json
          updated_at?: string
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
          api_key_hash: string
          api_key_prefix: string | null
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
          api_key_hash: string
          api_key_prefix?: string | null
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
          api_key_hash?: string
          api_key_prefix?: string | null
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
      pricing_template_availability: {
        Row: {
          date: string
          is_closed: boolean
          template_id: string
          updated_at: string
        }
        Insert: {
          date: string
          is_closed?: boolean
          template_id: string
          updated_at?: string
        }
        Update: {
          date?: string
          is_closed?: boolean
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_template_availability_template_id_fkey"
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
          excluded_dates: Json
          extra_dates: Json
          id: string
          is_default: boolean | null
          meal_plans: Json | null
          numeric_code: number | null
          peak_enabled: boolean
          peak_price: number | null
          price: number | null
          project_description: string | null
          project_name: string | null
          room_overrides: Json
          room_type_id: string | null
          room_type_ids: string[]
          season_segments: Json
          template_name: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
          weekday_enabled: boolean
          weekday_price: number | null
          weekend_enabled: boolean
          weekend_price: number | null
        }
        Insert: {
          accommodation_id: string
          available_rooms?: number
          created_at?: string
          description?: string | null
          display_order?: number | null
          excluded_dates?: Json
          extra_dates?: Json
          id?: string
          is_default?: boolean | null
          meal_plans?: Json | null
          numeric_code?: number | null
          peak_enabled?: boolean
          peak_price?: number | null
          price?: number | null
          project_description?: string | null
          project_name?: string | null
          room_overrides?: Json
          room_type_id?: string | null
          room_type_ids?: string[]
          season_segments?: Json
          template_name: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          weekday_enabled?: boolean
          weekday_price?: number | null
          weekend_enabled?: boolean
          weekend_price?: number | null
        }
        Update: {
          accommodation_id?: string
          available_rooms?: number
          created_at?: string
          description?: string | null
          display_order?: number | null
          excluded_dates?: Json
          extra_dates?: Json
          id?: string
          is_default?: boolean | null
          meal_plans?: Json | null
          numeric_code?: number | null
          peak_enabled?: boolean
          peak_price?: number | null
          price?: number | null
          project_description?: string | null
          project_name?: string | null
          room_overrides?: Json
          room_type_id?: string | null
          room_type_ids?: string[]
          season_segments?: Json
          template_name?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          weekday_enabled?: boolean
          weekday_price?: number | null
          weekend_enabled?: boolean
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
          is_custom: boolean
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          holiday_date: string
          holiday_name: string
          holiday_type?: string
          id?: string
          is_custom?: boolean
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          holiday_date?: string
          holiday_name?: string
          holiday_type?: string
          id?: string
          is_custom?: boolean
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
          pricing_template_id: string | null
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
          pricing_template_id?: string | null
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
          pricing_template_id?: string | null
          room_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_inventory_pricing_pricing_template_id_fkey"
            columns: ["pricing_template_id"]
            isOneToOne: false
            referencedRelation: "pricing_templates"
            referencedColumns: ["id"]
          },
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
          numeric_code: number | null
          owlting_sync_active: boolean
          package_contents: Json | null
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
          numeric_code?: number | null
          owlting_sync_active?: boolean
          package_contents?: Json | null
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
          numeric_code?: number | null
          owlting_sync_active?: boolean
          package_contents?: Json | null
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
      room_units: {
        Row: {
          accommodation_id: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          nickname: string | null
          notes: string | null
          room_type_id: string
          unit_number: string
          updated_at: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          nickname?: string | null
          notes?: string | null
          room_type_id: string
          unit_number: string
          updated_at?: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          nickname?: string | null
          notes?: string | null
          room_type_id?: string
          unit_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_units_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_units_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_discount_codes: {
        Row: {
          accommodation_id: string | null
          closer_id: string | null
          closer_rate: number | null
          commission_type: string
          created_at: string | null
          discount_code: string
          id: string
          is_active: boolean | null
          scout_id: string | null
          scout_rate: number | null
          updated_at: string | null
        }
        Insert: {
          accommodation_id?: string | null
          closer_id?: string | null
          closer_rate?: number | null
          commission_type?: string
          created_at?: string | null
          discount_code: string
          id?: string
          is_active?: boolean | null
          scout_id?: string | null
          scout_rate?: number | null
          updated_at?: string | null
        }
        Update: {
          accommodation_id?: string | null
          closer_id?: string | null
          closer_rate?: number | null
          commission_type?: string
          created_at?: string | null
          discount_code?: string
          id?: string
          is_active?: boolean | null
          scout_id?: string | null
          scout_rate?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scout_discount_codes_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scout_discount_codes_closer_id_fkey"
            columns: ["closer_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scout_discount_codes_scout_id_fkey"
            columns: ["scout_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scout_fulltime_targets: {
        Row: {
          created_at: string
          fulltime_min: number
          id: string
          month: number
          target_count: number
          venue_name: string
          year: number
        }
        Insert: {
          created_at?: string
          fulltime_min?: number
          id?: string
          month: number
          target_count?: number
          venue_name: string
          year: number
        }
        Update: {
          created_at?: string
          fulltime_min?: number
          id?: string
          month?: number
          target_count?: number
          venue_name?: string
          year?: number
        }
        Relationships: []
      }
      scout_monthly_payouts: {
        Row: {
          base_salary: number | null
          base_salary_rule: Json | null
          bonus_breakdown: Json
          calculated_at: string | null
          data_source: string | null
          id: string
          import_note: string | null
          individual_achieved: boolean | null
          individual_target_snapshot: Json | null
          kol_commission: number | null
          kol_commission_rate: number | null
          locked_at: string | null
          month: number
          multiplier_applied: number | null
          multiplier_reason: string | null
          payout_date: string | null
          payout_status: string | null
          period: number
          scout_id: string
          team_achieved: boolean | null
          team_bonus: number | null
          team_bonus_rule: Json | null
          team_target_snapshot: Json | null
          total_payout: number | null
          year: number
        }
        Insert: {
          base_salary?: number | null
          base_salary_rule?: Json | null
          bonus_breakdown?: Json
          calculated_at?: string | null
          data_source?: string | null
          id?: string
          import_note?: string | null
          individual_achieved?: boolean | null
          individual_target_snapshot?: Json | null
          kol_commission?: number | null
          kol_commission_rate?: number | null
          locked_at?: string | null
          month: number
          multiplier_applied?: number | null
          multiplier_reason?: string | null
          payout_date?: string | null
          payout_status?: string | null
          period?: number
          scout_id: string
          team_achieved?: boolean | null
          team_bonus?: number | null
          team_bonus_rule?: Json | null
          team_target_snapshot?: Json | null
          total_payout?: number | null
          year: number
        }
        Update: {
          base_salary?: number | null
          base_salary_rule?: Json | null
          bonus_breakdown?: Json
          calculated_at?: string | null
          data_source?: string | null
          id?: string
          import_note?: string | null
          individual_achieved?: boolean | null
          individual_target_snapshot?: Json | null
          kol_commission?: number | null
          kol_commission_rate?: number | null
          locked_at?: string | null
          month?: number
          multiplier_applied?: number | null
          multiplier_reason?: string | null
          payout_date?: string | null
          payout_status?: string | null
          period?: number
          scout_id?: string
          team_achieved?: boolean | null
          team_bonus?: number | null
          team_bonus_rule?: Json | null
          team_target_snapshot?: Json | null
          total_payout?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "scout_monthly_payouts_scout_id_fkey"
            columns: ["scout_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      scout_monthly_targets: {
        Row: {
          accommodation_id: string
          created_at: string | null
          created_by: string | null
          id: string
          month: number
          scout_id: string
          target_count: number
          updated_at: string | null
          year: number
        }
        Insert: {
          accommodation_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          month: number
          scout_id: string
          target_count?: number
          updated_at?: string | null
          year: number
        }
        Update: {
          accommodation_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          month?: number
          scout_id?: string
          target_count?: number
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "scout_monthly_targets_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scout_monthly_targets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "scout_monthly_targets_scout_id_fkey"
            columns: ["scout_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      scout_salary_settings: {
        Row: {
          base_salary: number
          created_at: string | null
          created_by: string | null
          effective_from: string
          id: string
          team_bonus: number
          team_threshold_pct: number
        }
        Insert: {
          base_salary?: number
          created_at?: string | null
          created_by?: string | null
          effective_from: string
          id?: string
          team_bonus?: number
          team_threshold_pct?: number
        }
        Update: {
          base_salary?: number
          created_at?: string | null
          created_by?: string | null
          effective_from?: string
          id?: string
          team_bonus?: number
          team_threshold_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "scout_salary_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      scout_team_targets: {
        Row: {
          accommodation_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_starlink: boolean | null
          month: number
          personal_min: number | null
          target_count: number
          updated_at: string | null
          venue_name: string | null
          year: number
        }
        Insert: {
          accommodation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_starlink?: boolean | null
          month: number
          personal_min?: number | null
          target_count?: number
          updated_at?: string | null
          venue_name?: string | null
          year: number
        }
        Update: {
          accommodation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_starlink?: boolean | null
          month?: number
          personal_min?: number | null
          target_count?: number
          updated_at?: string | null
          venue_name?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "scout_team_targets_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "accommodation_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scout_team_targets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      scout_tier_settings: {
        Row: {
          commission_rate: number
          created_at: string | null
          created_by: string | null
          effective_from: string
          id: string
          max_count: number | null
          min_count: number
          sort_order: number | null
          tier_name: string
        }
        Insert: {
          commission_rate: number
          created_at?: string | null
          created_by?: string | null
          effective_from: string
          id?: string
          max_count?: number | null
          min_count: number
          sort_order?: number | null
          tier_name: string
        }
        Update: {
          commission_rate?: number
          created_at?: string | null
          created_by?: string | null
          effective_from?: string
          id?: string
          max_count?: number | null
          min_count?: number
          sort_order?: number | null
          tier_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "scout_tier_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
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
          addon_fee_percentage: number
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
          addon_fee_percentage?: number
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
          addon_fee_percentage?: number
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
      staff_module_permissions: {
        Row: {
          accommodation_id: string
          created_at: string
          id: string
          module_key: string
          permission_level: Database["public"]["Enums"]["module_permission_level"]
          updated_at: string
          user_id: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          id?: string
          module_key: string
          permission_level?: Database["public"]["Enums"]["module_permission_level"]
          updated_at?: string
          user_id: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          id?: string
          module_key?: string
          permission_level?: Database["public"]["Enums"]["module_permission_level"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      starlink_monthly_payouts: {
        Row: {
          calculated_at: string | null
          created_at: string
          id: string
          month: number
          order_snapshot: Json | null
          payout_status: string
          period: number
          scout_id: string
          total_commission: number
          total_orders: number
          total_sales: number
          updated_at: string
          year: number
        }
        Insert: {
          calculated_at?: string | null
          created_at?: string
          id?: string
          month: number
          order_snapshot?: Json | null
          payout_status?: string
          period?: number
          scout_id: string
          total_commission?: number
          total_orders?: number
          total_sales?: number
          updated_at?: string
          year: number
        }
        Update: {
          calculated_at?: string | null
          created_at?: string
          id?: string
          month?: number
          order_snapshot?: Json | null
          payout_status?: string
          period?: number
          scout_id?: string
          total_commission?: number
          total_orders?: number
          total_sales?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "starlink_monthly_payouts_scout_id_fkey"
            columns: ["scout_id"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      starlink_orders: {
        Row: {
          business_type: string | null
          client_name: string
          client_tax_id: string | null
          commission_amount: number | null
          commission_rate: number | null
          contract_uploaded: boolean | null
          created_at: string | null
          created_by: string | null
          id: string
          import_source: string | null
          invoice_number: string | null
          level_at_sale: string | null
          multiplier_applied: number | null
          multiplier_reason: string | null
          notes: string | null
          payment_confirmed: boolean | null
          payment_last5: string | null
          payout_date: string | null
          payout_status: string | null
          plan_name: string | null
          plan_price: number
          settlement_date: string | null
          sold_at: string | null
          sold_by: string
          updated_at: string | null
        }
        Insert: {
          business_type?: string | null
          client_name: string
          client_tax_id?: string | null
          commission_amount?: number | null
          commission_rate?: number | null
          contract_uploaded?: boolean | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          import_source?: string | null
          invoice_number?: string | null
          level_at_sale?: string | null
          multiplier_applied?: number | null
          multiplier_reason?: string | null
          notes?: string | null
          payment_confirmed?: boolean | null
          payment_last5?: string | null
          payout_date?: string | null
          payout_status?: string | null
          plan_name?: string | null
          plan_price: number
          settlement_date?: string | null
          sold_at?: string | null
          sold_by: string
          updated_at?: string | null
        }
        Update: {
          business_type?: string | null
          client_name?: string
          client_tax_id?: string | null
          commission_amount?: number | null
          commission_rate?: number | null
          contract_uploaded?: boolean | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          import_source?: string | null
          invoice_number?: string | null
          level_at_sale?: string | null
          multiplier_applied?: number | null
          multiplier_reason?: string | null
          notes?: string | null
          payment_confirmed?: boolean | null
          payment_last5?: string | null
          payout_date?: string | null
          payout_status?: string | null
          plan_name?: string | null
          plan_price?: number
          settlement_date?: string | null
          sold_at?: string | null
          sold_by?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "starlink_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "starlink_orders_sold_by_fkey"
            columns: ["sold_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      starlink_plan_settings: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          plan_name: string
          price: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          plan_name: string
          price: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          plan_name?: string
          price?: number
        }
        Relationships: []
      }
      starlink_tier_settings: {
        Row: {
          created_at: string | null
          created_by: string | null
          effective_from: string
          id: string
          level: string
          max_count: number | null
          min_count: number
          per_order_rate: number | null
          signup_bonus_rate: number | null
          sort_order: number | null
          tier_name: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          effective_from: string
          id?: string
          level: string
          max_count?: number | null
          min_count: number
          per_order_rate?: number | null
          signup_bonus_rate?: number | null
          sort_order?: number | null
          tier_name: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          effective_from?: string
          id?: string
          level?: string
          max_count?: number | null
          min_count?: number
          per_order_rate?: number | null
          signup_bonus_rate?: number | null
          sort_order?: number | null
          tier_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "starlink_tier_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_member_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      system_health_logs: {
        Row: {
          alert_sent: boolean
          checked_at: string
          error_message: string | null
          id: string
          is_healthy: boolean
          response_time_ms: number | null
          status_code: number | null
          target_label: string | null
          target_url: string
        }
        Insert: {
          alert_sent?: boolean
          checked_at?: string
          error_message?: string | null
          id?: string
          is_healthy: boolean
          response_time_ms?: number | null
          status_code?: number | null
          target_label?: string | null
          target_url: string
        }
        Update: {
          alert_sent?: boolean
          checked_at?: string
          error_message?: string | null
          id?: string
          is_healthy?: boolean
          response_time_ms?: number | null
          status_code?: number | null
          target_label?: string | null
          target_url?: string
        }
        Relationships: []
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
      taiwan_holidays: {
        Row: {
          holiday_date: string
          id: string
          name: string | null
          synced_at: string | null
          year: number
        }
        Insert: {
          holiday_date: string
          id?: string
          name?: string | null
          synced_at?: string | null
          year: number
        }
        Update: {
          holiday_date?: string
          id?: string
          name?: string | null
          synced_at?: string | null
          year?: number
        }
        Relationships: []
      }
      team_member_profiles: {
        Row: {
          commission_rate: number | null
          created_at: string | null
          display_name: string
          employment_type: string
          fulltime_start_yearmonth: string | null
          id: string
          is_active: boolean | null
          is_scout_team_member: boolean
          line_user_id: string | null
          managed_venue: string[] | null
          scout_tier: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          commission_rate?: number | null
          created_at?: string | null
          display_name: string
          employment_type?: string
          fulltime_start_yearmonth?: string | null
          id?: string
          is_active?: boolean | null
          is_scout_team_member?: boolean
          line_user_id?: string | null
          managed_venue?: string[] | null
          scout_tier?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          commission_rate?: number | null
          created_at?: string | null
          display_name?: string
          employment_type?: string
          fulltime_start_yearmonth?: string | null
          id?: string
          is_active?: boolean | null
          is_scout_team_member?: boolean
          line_user_id?: string | null
          managed_venue?: string[] | null
          scout_tier?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      team_pending_invites: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      traffic_sources: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          accommodation_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accommodation_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accommodation_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          template_id?: string | null
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
          {
            foreignKeyName: "user_roles_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "permission_templates"
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
          discount_type: string | null
          discount_value: number | null
          display_order: number | null
          id: string | null
          is_active: boolean | null
          min_order_amount: number | null
          name: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          accommodation_id?: string | null
          applicable_date_from?: string | null
          applicable_date_to?: string | null
          applicable_room_types?: Json | null
          code?: string | null
          discount_type?: string | null
          discount_value?: number | null
          display_order?: number | null
          id?: string | null
          is_active?: boolean | null
          min_order_amount?: number | null
          name?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          accommodation_id?: string | null
          applicable_date_from?: string | null
          applicable_date_to?: string | null
          applicable_room_types?: Json | null
          code?: string | null
          discount_type?: string | null
          discount_value?: number | null
          display_order?: number | null
          id?: string | null
          is_active?: boolean | null
          min_order_amount?: number | null
          name?: string | null
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
      bulk_upsert_room_inventory_pricing: {
        Args: { p_rows: Json }
        Returns: undefined
      }
      can_unlock_paid_order_discount: {
        Args: { _accommodation_id: string; _user_id: string }
        Returns: boolean
      }
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
      check_kol_inventory: {
        Args: { p_check_in_date: string; p_venue_name: string }
        Returns: string
      }
      check_rls_enabled: {
        Args: never
        Returns: {
          rls_enabled: boolean
          table_name: string
        }[]
      }
      cleanup_old_error_logs: { Args: never; Returns: undefined }
      cleanup_old_monitoring_logs: { Args: never; Returns: undefined }
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
      get_staff_module_permission: {
        Args: {
          _accommodation_id: string
          _module_key: string
          _user_id: string
        }
        Returns: Database["public"]["Enums"]["module_permission_level"]
      }
      get_team_role_members: {
        Args: { p_role: Database["public"]["Enums"]["app_role"] }
        Returns: {
          display_name: string
          user_id: string
        }[]
      }
      get_user_accommodations: {
        Args: { _user_id: string }
        Returns: {
          accommodation_id: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      import_ryoan_order_bypass: {
        Args: { p_meta: Json; p_order: Json; p_rooms: Json }
        Returns: {
          out_order_id: string
          out_was_update: boolean
        }[]
      }
      is_admin: { Args: { user_id_param: string }; Returns: boolean }
      is_admin_or_super: { Args: never; Returns: boolean }
      is_super_admin: { Args: { user_uuid: string }; Returns: boolean }
      is_team_admin: { Args: { _user_id: string }; Returns: boolean }
      is_team_inviter: { Args: { _user_id: string }; Returns: boolean }
      is_user_admin: { Args: { _user_id: string }; Returns: boolean }
      normalize_owlting_name: { Args: { p_name: string }; Returns: string }
      resolve_pricing_template_by_numeric_code: {
        Args: { p_accommodation_id: string; p_code: number }
        Returns: {
          id: string
          room_type_id: string
          template_name: string
        }[]
      }
      resolve_room_type_by_numeric_code: {
        Args: { p_accommodation_id: string; p_code: number }
        Returns: {
          base_price: number
          id: string
          name: string
        }[]
      }
      staff_can_edit_module: {
        Args: { _accommodation_id: string; _module_key: string }
        Returns: boolean
      }
      staff_can_edit_module_for_room_type: {
        Args: { _module_key: string; _room_type_id: string }
        Returns: boolean
      }
      staff_can_view_module: {
        Args: { _accommodation_id: string; _module_key: string }
        Returns: boolean
      }
      upsert_owlting_credentials: {
        Args: {
          p_accommodation_id: string
          p_hotel_code: string
          p_password: string
          p_username: string
        }
        Returns: string
      }
      user_has_access_to_accommodation: {
        Args: { _accommodation_id: string; _user_id: string }
        Returns: boolean
      }
      user_has_any_team_role: { Args: { _user_id: string }; Returns: boolean }
      user_has_role: {
        Args: {
          _accommodation_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      user_has_storage_access: { Args: { file_path: string }; Returns: boolean }
      user_has_team_role: {
        Args: {
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
      verify_accommodation_ai_api_key: {
        Args: { p_key_hash: string }
        Returns: {
          accommodation_id: string
          key_id: string
          rate_limit_per_min: number
        }[]
      }
      verify_accommodation_api_key: {
        Args: { p_key_hash: string }
        Returns: {
          accommodation_id: string
          key_id: string
        }[]
      }
      verify_owlting_service_account: {
        Args: { p_password: string; p_username: string }
        Returns: boolean
      }
    }
    Enums: {
      ai_conversation_rating: "good" | "bad"
      ai_knowledge_category:
        | "room"
        | "facility"
        | "policy"
        | "location"
        | "faq"
        | "other"
      ai_prompt_status: "draft" | "published" | "archived"
      app_role:
        | "super_admin"
        | "hotel_admin"
        | "staff"
        | "admin"
        | "closer"
        | "scout"
        | "scout_manager"
        | "video"
        | "franchise"
        | "starlink"
        | "owner"
        | "kol"
        | "finance"
        | "franchise_manager"
        | "venue_manager"
        | "franchise_internal"
        | "franchise_external"
      coupon_scope: "platform" | "accommodation"
      coupon_type: "percentage" | "fixed"
      member_point_type:
        | "earn_order"
        | "earn_event"
        | "redeem"
        | "expire"
        | "admin_adjust"
      module_permission_level: "hidden" | "readonly" | "editable"
      owlting_push_status: "pending" | "sending" | "sent" | "failed" | "skipped"
      owlting_res_status: "Commit" | "Modify" | "Cancel"
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
      ai_conversation_rating: ["good", "bad"],
      ai_knowledge_category: [
        "room",
        "facility",
        "policy",
        "location",
        "faq",
        "other",
      ],
      ai_prompt_status: ["draft", "published", "archived"],
      app_role: [
        "super_admin",
        "hotel_admin",
        "staff",
        "admin",
        "closer",
        "scout",
        "scout_manager",
        "video",
        "franchise",
        "starlink",
        "owner",
        "kol",
        "finance",
        "franchise_manager",
        "venue_manager",
        "franchise_internal",
        "franchise_external",
      ],
      coupon_scope: ["platform", "accommodation"],
      coupon_type: ["percentage", "fixed"],
      member_point_type: [
        "earn_order",
        "earn_event",
        "redeem",
        "expire",
        "admin_adjust",
      ],
      module_permission_level: ["hidden", "readonly", "editable"],
      owlting_push_status: ["pending", "sending", "sent", "failed", "skipped"],
      owlting_res_status: ["Commit", "Modify", "Cancel"],
    },
  },
} as const
