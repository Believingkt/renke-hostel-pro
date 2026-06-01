import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cacheAccommodationTheme } from "@/constants/themes";

interface AccommodationData {
  id: string;
  short_url_alias: string | null;
  theme_preset: string | null;
  custom_domain?: string | null;
}

export function useSubdomain() {
  const [accommodationId, setAccommodationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 輔助函數：快取主題設定
  const cacheTheme = (data: AccommodationData) => {
    if (data.theme_preset) {
      cacheAccommodationTheme(data.id, data.short_url_alias, data.theme_preset);
    }
  };

  const finishSuccess = (data: AccommodationData) => {
    cacheTheme(data);
    setError(null);
    setAccommodationId(data.id);
    setIsLoading(false);
  };

  useEffect(() => {
    // 防止特定網路/瀏覽器情況下請求長時間 pending 造成無限 loading
    const timeoutId = window.setTimeout(() => {
      setError((prev) => prev ?? "載入旅館資訊逾時，請重新整理");
      setIsLoading(false);
    }, 8000);

    void loadAccommodationFromSubdomain().finally(() => {
      window.clearTimeout(timeoutId);
    });

    return () => window.clearTimeout(timeoutId);
  }, []);

  const loadAccommodationFromSubdomain = async () => {
    try {
      const hostname = window.location.hostname.toLowerCase();
      const parts = hostname.split('.');
      
      // ========== HQ / Booking Portal 專屬網域檢測 ==========
      const isHQDomain = hostname === 'hq.lakeze.com' || hostname === 'www.hq.lakeze.com';
      const isBookingDomain = hostname === 'booking.lakeze.com' || hostname === 'www.booking.lakeze.com';
      if (isHQDomain || isBookingDomain) {
        if (isBookingDomain) {
          // 1. 路徑首段為 alias（/{alias} 或 /{alias}/admin）
          const pathSegments = window.location.pathname.split('/').filter(Boolean);
          const reservedFirst = new Set([
            'booking', 'book', 'member', 'order-search', 'order-payment',
            'payment', 'payment-result', 'linepay', 'public-payment',
            'ai-booking', 'auth', 'hq', 'hq-auth', 'headquarters', 'admin',
            'pay', 'profile', 'reset-password', 'change-password',
            'kol-api-docs', 'points-api-docs', 'og-preview', 'payment-test', '__cb',
            'owlting-fillup',
          ]);
          const pathAlias = pathSegments[0] && !reservedFirst.has(pathSegments[0])
            ? pathSegments[0] : null;

          if (pathAlias) {
            const { data: aliasData } = await supabase
              .from('accommodation_info')
              .select('id, short_url_alias, theme_preset')
              .eq('short_url_alias', pathAlias)
              .maybeSingle();
            if (aliasData) {
              finishSuccess(aliasData);
              return;
            }
          }

          // 2. 退回 ?acc= 查詢參數（跨民宿訂房流程使用）
          const urlParams = new URLSearchParams(window.location.search);
          const accParam = urlParams.get('acc');
          if (accParam) {
            const { data: aliasData } = await supabase
              .from('accommodation_info')
              .select('id, short_url_alias, theme_preset')
              .eq('short_url_alias', accParam)
              .maybeSingle();
            if (aliasData) {
              finishSuccess(aliasData);
              return;
            }
            const { data: idData } = await supabase
              .from('accommodation_info')
              .select('id, short_url_alias, theme_preset')
              .eq('id', accParam)
              .maybeSingle();
            if (idData) {
              finishSuccess(idData);
              return;
            }
          }
        }
        // 這些網域不需要載入住宿資料，直接結束
        setIsLoading(false);
        return;
      }
      
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
          const { data: aliasData, error: aliasError } = await supabase
            .from('accommodation_info')
            .select('id, short_url_alias, theme_preset')
            .eq('short_url_alias', accToUse)
            .maybeSingle();
          
          if (aliasError) {
            console.error('Error fetching by alias:', aliasError);
          }
          
          if (aliasData) {
            finishSuccess(aliasData);
            return;
          }
          
          // 再嘗試用 ID 查詢
          const { data: idData, error: idError } = await supabase
            .from('accommodation_info')
            .select('id, short_url_alias, theme_preset')
            .eq('id', accToUse)
            .maybeSingle();
          
          if (idError) {
            console.error('Error fetching by id:', idError);
          }
          
          if (idData) {
            finishSuccess(idData);
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
      
      // 同時查詢自訂網域和子網域，減少查詢次數
      const subdomain = parts.length > 2 ? parts[0] : null;
      
      // 合併查詢：自訂網域 OR 子網域
      let queryFilter = `custom_domain.eq.${normalizedDomain},custom_domain.eq.www.${normalizedDomain}`;
      if (subdomain) {
        queryFilter += `,short_url_alias.eq.${subdomain}`;
      }
      
      const { data: matchedData, error: queryError } = await supabase
        .from('accommodation_info')
        .select('id, short_url_alias, theme_preset, custom_domain')
        .or(queryFilter);
      
      if (queryError) {
        throw queryError;
      }
      
      if (matchedData && matchedData.length > 0) {
        // 優先匹配自訂網域，其次匹配子網域
        const domainMatch = matchedData.find(
          d => d.custom_domain === normalizedDomain || d.custom_domain === `www.${normalizedDomain}`
        );
        const subdomainMatch = subdomain 
          ? matchedData.find(d => d.short_url_alias === subdomain)
          : null;
        
        const finalMatch = domainMatch || subdomainMatch;
        
        if (finalMatch) {
          finishSuccess(finalMatch);
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

    finishSuccess(data);
  };

  return { accommodationId, isLoading, error };
}
