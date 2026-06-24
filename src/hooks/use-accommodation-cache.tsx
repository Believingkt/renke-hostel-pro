/**
 * 住宿資料快取 Hook
 * 使用記憶體快取避免重複請求，設定 5 分鐘過期時間
 */

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cacheAccommodationTheme } from "@/constants/themes";
import { expandFacilitiesForAccommodations } from "@/lib/facility-merge";

// 快取過期時間（5 分鐘）
const CACHE_TTL = 5 * 60 * 1000;

// Default section order for homepage
export const DEFAULT_SECTIONS_ORDER = ["about", "rooms", "facilities", "gallery", "location", "booking_info", "reviews", "faq", "custom_images"];

export interface AccommodationInfo {
  id: string;
  name: string;
  description: string;
  address: string;
  check_in_notice: string;
  phone?: string;
  email?: string;
  line_id?: string;
  facebook_url?: string;
  instagram_url?: string;
  threads_url?: string;
  youtube_url?: string;
  tiktok_url?: string;
  og_title?: string;
  og_description?: string;
  og_image_url?: string;
  hero_main_title?: string;
  hero_subtitle?: string;
  hero_description?: string;
  hero_overlay_opacity?: number;
  hero_autoplay_delay?: number;
  theme_preset?: string;
  short_url_alias?: string;
  show_reviews_section?: boolean;
  show_facilities_section?: boolean;
  show_gallery_section?: boolean;
  show_faq_section?: boolean;
  show_location_section?: boolean;
  show_booking_info_section?: boolean;
  show_about_section?: boolean;
  show_rooms_section?: boolean;
  show_custom_images_section?: boolean;
  homepage_sections_order?: string[];
  homepage_section_titles?: Record<string, { title?: string; subtitle?: string }>;
  child_age_rules?: unknown | null;
}

export interface SecondaryData {
  roomTypes: any[];
  bookingSettings: any;
  facilities: any[];
  locationInfo: any;
  customBookingSections: any[];
  customImageSections: any[];
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface PrimaryCache {
  info: AccommodationInfo;
  heroPhotos: any[];
  galleryPhotos: any[];
}

// 記憶體快取
const primaryCache = new Map<string, CacheEntry<PrimaryCache>>();
const secondaryCache = new Map<string, CacheEntry<SecondaryData>>();

// 檢查快取是否過期
const isCacheValid = <T,>(entry: CacheEntry<T> | undefined): entry is CacheEntry<T> => {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_TTL;
};

// 清除特定住宿的快取
export const invalidateAccommodationCache = (accommodationId: string) => {
  primaryCache.delete(accommodationId);
  secondaryCache.delete(accommodationId);
};

// 清除所有快取
export const clearAllAccommodationCache = () => {
  primaryCache.clear();
  secondaryCache.clear();
};

export const useAccommodationCache = (accommodationId: string | null) => {
  const [info, setInfo] = useState<AccommodationInfo | null>(null);
  const [heroPhotos, setHeroPhotos] = useState<any[]>([]);
  const [galleryPhotos, setGalleryPhotos] = useState<any[]>([]);
  const [secondaryData, setSecondaryData] = useState<SecondaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 載入首屏資料
  const loadPrimaryData = useCallback(async (accId: string) => {
    // 檢查快取
    const cached = primaryCache.get(accId);
    if (isCacheValid(cached)) {
      setInfo(cached.data.info);
      setHeroPhotos(cached.data.heroPhotos);
      setGalleryPhotos(cached.data.galleryPhotos);
      setIsLoading(false);
      return cached.data.info;
    }

    try {
      const [infoRes, photosRes] = await Promise.all([
        supabase
          .from("accommodation_info")
          .select("id, name, description, address, check_in_notice, phone, email, line_id, facebook_url, instagram_url, threads_url, youtube_url, tiktok_url, og_title, og_description, og_image_url, hero_main_title, hero_subtitle, hero_description, hero_overlay_opacity, hero_autoplay_delay, theme_preset, short_url_alias, show_reviews_section, show_facilities_section, show_gallery_section, show_faq_section, show_location_section, show_booking_info_section, show_about_section, show_rooms_section, show_custom_images_section, homepage_sections_order, homepage_section_titles, child_age_rules, region_1, region_2")
          .eq("id", accId)
          .maybeSingle(),
        supabase
          .from("accommodation_photos")
          .select("*")
          .eq("accommodation_id", accId)
          .order("display_order")
      ]);

      if (infoRes.error) throw infoRes.error;

      if (!infoRes.data) {
        setError("找不到住宿資料");
        setIsLoading(false);
        return null;
      }

      // 快取主題設定
      if (infoRes.data.theme_preset) {
        cacheAccommodationTheme(
          infoRes.data.id,
          infoRes.data.short_url_alias,
          infoRes.data.theme_preset
        );
      }

      const photos = photosRes.data || [];
      const heroPhotosData = photos.filter((p: any) => p.photo_type === 'hero');
      const galleryPhotosData = photos.filter((p: any) => p.photo_type !== 'hero');

      // Parse homepage_sections_order from JSONB to string array
      const parsedInfo: AccommodationInfo = {
        ...infoRes.data,
        homepage_sections_order: Array.isArray(infoRes.data.homepage_sections_order) 
          ? infoRes.data.homepage_sections_order as string[]
          : DEFAULT_SECTIONS_ORDER,
        homepage_section_titles: (infoRes.data.homepage_section_titles && typeof infoRes.data.homepage_section_titles === 'object' && !Array.isArray(infoRes.data.homepage_section_titles))
          ? infoRes.data.homepage_section_titles as Record<string, { title?: string; subtitle?: string }>
          : {},
      };

      // 儲存到快取
      primaryCache.set(accId, {
        data: {
          info: parsedInfo,
          heroPhotos: heroPhotosData,
          galleryPhotos: galleryPhotosData
        },
        timestamp: Date.now()
      });

      setInfo(parsedInfo);
      setHeroPhotos(heroPhotosData);
      setGalleryPhotos(galleryPhotosData);
      setIsLoading(false);
      return parsedInfo;
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Error fetching primary data:', err);
      }
      setError("載入資料時發生錯誤");
      setIsLoading(false);
      return null;
    }
  }, []);

  // 載入次要資料
  const loadSecondaryData = useCallback(async (accId: string) => {
    // 檢查快取
    const cached = secondaryCache.get(accId);
    if (isCacheValid(cached)) {
      setSecondaryData(cached.data);
      return;
    }

    try {
      const [roomTypesRes, bookingSettingsRes, facilitiesRes, locationInfoRes, customSectionsRes, customImageSectionsRes] = await Promise.all([
        supabase
          .from("room_types")
          .select(`*, room_photos (photo_url, display_order)`)
          .eq("accommodation_id", accId)
          .order("display_order"),
        supabase
          .from("booking_settings")
          .select("*")
          .eq("accommodation_id", accId)
          .maybeSingle(),
        supabase
          .from("accommodation_facilities")
          .select("*")
          .or(`accommodation_id.is.null,accommodation_id.eq.${accId}`),
        supabase
          .from("location_info")
          .select("*")
          .eq("accommodation_id", accId)
          .maybeSingle(),
        supabase
          .from("booking_info_sections")
          .select("*")
          .eq("accommodation_id", accId)
          .eq("is_enabled", true)
          .order("display_order"),
        supabase
          .from("custom_sections")
          .select("*")
          .eq("accommodation_id", accId)
          .eq("is_enabled", true)
          .order("display_order")
      ]);

      // 整理照片順序
      const roomTypesWithPhotos = (roomTypesRes.data || []).map((room: any) => ({
        ...room,
        room_photos: (room.room_photos || []).sort((a: any, b: any) => a.display_order - b.display_order)
      }));

      const data: SecondaryData = {
        roomTypes: roomTypesWithPhotos,
        bookingSettings: bookingSettingsRes.data,
        facilities: expandFacilitiesForAccommodations(facilitiesRes.data || [], [accId]),
        locationInfo: locationInfoRes.data,
        customBookingSections: customSectionsRes.data || [],
        customImageSections: customImageSectionsRes.data || []
      };

      // 儲存到快取
      secondaryCache.set(accId, {
        data,
        timestamp: Date.now()
      });

      setSecondaryData(data);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Error fetching secondary data:', err);
      }
    }
  }, []);

  // 並行載入首屏和次要資料
  useEffect(() => {
    if (!accommodationId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    // 同時發起首屏與次要資料請求，不需等首屏完成
    loadPrimaryData(accommodationId);
    loadSecondaryData(accommodationId);
  }, [accommodationId, loadPrimaryData, loadSecondaryData]);

  // 手動重新載入（強制繞過快取）
  const refetch = useCallback(() => {
    if (!accommodationId) return;
    invalidateAccommodationCache(accommodationId);
    setIsLoading(true);
    setError(null);
    loadPrimaryData(accommodationId);
  }, [accommodationId, loadPrimaryData]);

  return {
    info,
    heroPhotos,
    galleryPhotos,
    secondaryData,
    isLoading,
    error,
    refetch
  };
};
