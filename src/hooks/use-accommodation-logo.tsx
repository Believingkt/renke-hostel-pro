import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";

type LogoVariant = "header" | "footer";

interface UseAccommodationLogoOptions {
  /** header: 白天模式 logo，footer: 深色背景 logo */
  variant?: LogoVariant;
  /** 外部傳入的 logo URL（如已取得），可略過內部 fetch */
  externalLogoUrl?: string | null;
  /** 外部傳入的 loading 狀態 */
  externalIsLoaded?: boolean;
  /** 是否同時取得住宿名稱 */
  fetchName?: boolean;
}

interface UseAccommodationLogoReturn {
  logoUrl: string | null;
  isLoaded: boolean;
  accommodationId: string | null;
  /** 住宿名稱（需設定 fetchName: true） */
  accommodationName: string;
}

/**
 * 統一的住宿 logo 載入 hook
 * 支援 header/footer 兩種 variant，自動訂閱 realtime 更新
 */
export function useAccommodationLogo({
  variant = "header",
  externalLogoUrl,
  externalIsLoaded,
  fetchName = false,
}: UseAccommodationLogoOptions = {}): UseAccommodationLogoReturn {
  const { currentAccommodationId } = useAccommodation();
  const [internalLogoUrl, setInternalLogoUrl] = useState<string | null>(null);
  const [internalIsLoaded, setInternalIsLoaded] = useState(false);
  const [accommodationName, setAccommodationName] = useState("");

  // 判斷是否使用外部狀態
  const useExternalState = externalLogoUrl !== undefined && externalIsLoaded !== undefined;
  const logoUrl = useExternalState ? externalLogoUrl : internalLogoUrl;
  const isLoaded = useExternalState ? externalIsLoaded : internalIsLoaded;

  const logoField = variant === "header" ? "header_logo_url" : "footer_logo_url";
  const channelName = variant === "header" ? "accommodation-header-logo" : "accommodation-footer-logo";

  useEffect(() => {
    // 若使用外部狀態，不需內部 fetch
    if (useExternalState) return;

    const fetchLogo = async () => {
      if (!currentAccommodationId) return;

      // 切換住宿時重置狀態
      setInternalIsLoaded(false);
      setInternalLogoUrl(null);
      if (fetchName) setAccommodationName("");

      try {
        // 動態建立 select 欄位
        const selectFields = fetchName ? `${logoField},name` : logoField;
        
        const { data, error } = await supabase
          .from("accommodation_info")
          .select(selectFields)
          .eq("id", currentAccommodationId)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          const record = data as unknown as Record<string, string | null>;
          setInternalLogoUrl(record[logoField] ?? null);
          if (fetchName && record.name) {
            setAccommodationName(record.name);
          }
        }
        setInternalIsLoaded(true);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error(`Error fetching ${variant} logo:`, error);
        }
        setInternalIsLoaded(true);
      }
    };

    fetchLogo();

    // 訂閱 realtime 更新
    const channel = supabase
      .channel(`${channelName}-${currentAccommodationId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "accommodation_info",
          filter: `id=eq.${currentAccommodationId}`,
        },
        (payload) => {
          const newData = payload.new as Record<string, string | null>;
          if (Object.prototype.hasOwnProperty.call(newData, logoField)) {
            setInternalLogoUrl(newData[logoField] ?? null);
            setInternalIsLoaded(true);
          }
          if (fetchName && Object.prototype.hasOwnProperty.call(newData, "name")) {
            setAccommodationName(newData.name ?? "");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentAccommodationId, useExternalState, logoField, channelName, variant, fetchName]);

  return {
    logoUrl,
    isLoaded,
    accommodationId: currentAccommodationId,
    accommodationName,
  };
}
