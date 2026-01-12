import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cacheAccommodationTheme } from "@/constants/themes";

interface AccommodationData {
  id: string;
  short_url_alias: string | null;
  theme_preset: string | null;
}

export function useSubdomain() {
  const [accommodationId, setAccommodationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAccommodationFromSubdomain();
  }, []);

  // 輔助函數：快取主題設定
  const cacheTheme = (data: AccommodationData) => {
    if (data.theme_preset) {
      cacheAccommodationTheme(data.id, data.short_url_alias, data.theme_preset);
    }
  };

  const loadAccommodationFromSubdomain = async () => {
    try {
      const hostname = window.location.hostname;
      const parts = hostname.split('.');
      
      // 判斷是否為開發環境或 Lovable 預覽環境
      const isDevOrPreview = hostname === 'localhost' || 
                             hostname === '127.0.0.1' || 
                             hostname.includes('lovableproject.com') || 
                             hostname.includes('lovable.app');
      
      if (isDevOrPreview) {
        // 開發/預覽環境：使用 ?acc= 查詢參數或 localStorage
        const urlParams = new URLSearchParams(window.location.search);
        const accParam = urlParams.get('acc');
        const savedAcc = localStorage.getItem('dev_selected_accommodation');
        const accToUse = accParam || savedAcc;
        
        if (accToUse) {
          // 先嘗試用 short_url_alias 查詢
          const { data: aliasData } = await supabase
            .from('accommodation_info')
            .select('id, short_url_alias, theme_preset')
            .eq('short_url_alias', accToUse)
            .maybeSingle();
          
          if (aliasData) {
            cacheTheme(aliasData);
            setAccommodationId(aliasData.id);
            setIsLoading(false);
            return;
          }
          
          // 再嘗試用 ID 查詢
          const { data: idData } = await supabase
            .from('accommodation_info')
            .select('id, short_url_alias, theme_preset')
            .eq('id', accToUse)
            .maybeSingle();
          
          if (idData) {
            cacheTheme(idData);
            setAccommodationId(idData.id);
            setIsLoading(false);
            return;
          }
        }
        
        // 回退到第一個住宿
        await loadFirstAccommodation();
        return;
      }

      // ========== 生產環境：自訂網域識別 ==========
      
      // 1. 首先嘗試用完整網域查詢（支援 example.com 或 www.example.com）
      const domainToCheck = hostname.toLowerCase();
      
      // 移除 www. 前綴來進行比對
      const normalizedDomain = domainToCheck.startsWith('www.') 
        ? domainToCheck.substring(4) 
        : domainToCheck;
      
      // 查詢自訂網域（同時比對有無 www 的版本）
      const { data: domainData } = await supabase
        .from('accommodation_info')
        .select('id, short_url_alias, theme_preset')
        .or(`custom_domain.eq.${normalizedDomain},custom_domain.eq.www.${normalizedDomain}`)
        .maybeSingle();
      
      if (domainData) {
        cacheTheme(domainData);
        setAccommodationId(domainData.id);
        setIsLoading(false);
        return;
      }

      // 2. 嘗試用子網域查詢（例如 sensaninn.yourdomain.com）
      const subdomain = parts.length > 2 ? parts[0] : null;

      if (subdomain) {
        const { data: subdomainData } = await supabase
          .from('accommodation_info')
          .select('id, short_url_alias, theme_preset')
          .eq('short_url_alias', subdomain)
          .maybeSingle();

        if (subdomainData) {
          cacheTheme(subdomainData);
          setAccommodationId(subdomainData.id);
          setIsLoading(false);
          return;
        }
      }

      // 3. 都找不到時，回退到第一個住宿
      await loadFirstAccommodation();
      
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Error loading accommodation from subdomain:', err);
      }
      setError('載入旅館資訊失敗');
      setIsLoading(false);
    }
  };

  const loadFirstAccommodation = async () => {
    const { data, error: queryError } = await supabase
      .from('accommodation_info')
      .select('id, short_url_alias, theme_preset')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (queryError) {
      if (import.meta.env.DEV) {
        console.error('Error loading accommodation:', queryError);
      }
      setError('載入旅館資訊失敗');
      setIsLoading(false);
      return;
    }

    if (!data) {
      setError('找不到旅館資料');
      setIsLoading(false);
      return;
    }

    // 快取主題設定
    cacheTheme(data);

    setAccommodationId(data.id);
    setIsLoading(false);
  };

  return { accommodationId, isLoading, error };
}
