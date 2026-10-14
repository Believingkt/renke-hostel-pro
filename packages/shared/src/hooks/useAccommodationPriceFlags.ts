import { useEffect, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";

export type PriceSyncMode = "package_original" | "template_backfill" | "no_sync";

export interface AccommodationPriceFlags {
  newPriceUiEnabled: boolean;
  newOrderDialogEnabled: boolean;
  priceSyncMode: PriceSyncMode;
  loaded: boolean;
  /** 讀取失敗（網路／API 錯誤）；呼叫端應視為不可儲存 */
  failed: boolean;
}

const DEFAULT_FLAGS: AccommodationPriceFlags = {
  newPriceUiEnabled: false,
  newOrderDialogEnabled: false,
  priceSyncMode: "no_sync",
  loaded: false,
  failed: false,
};

// 館別價格開關（accommodation_info_flags）；讀不到列或沒有權限時一律視為未啟用
export function useAccommodationPriceFlags(accommodationId: string | null | undefined): AccommodationPriceFlags {
  const [flags, setFlags] = useState<AccommodationPriceFlags>(DEFAULT_FLAGS);

  useEffect(() => {
    let cancelled = false;
    setFlags(DEFAULT_FLAGS);
    if (!accommodationId) {
      setFlags({ ...DEFAULT_FLAGS, loaded: true });
      return;
    }
    (supabase.from("accommodation_info_flags") as any)
      .select("new_price_ui_enabled, new_order_dialog_enabled, price_sync_mode")
      .eq("accommodation_id", accommodationId)
      .maybeSingle()
      .then(({ data, error }: { data: any; error: any }) => {
        if (cancelled) return;
        if (error) {
          setFlags({ ...DEFAULT_FLAGS, loaded: true, failed: true });
          return;
        }
        setFlags({
          newPriceUiEnabled: data?.new_price_ui_enabled === true,
          newOrderDialogEnabled: data?.new_order_dialog_enabled === true,
          priceSyncMode: (data?.price_sync_mode as PriceSyncMode) || "no_sync",
          loaded: true,
          failed: false,
        });
      }, () => {
        if (!cancelled) setFlags({ ...DEFAULT_FLAGS, loaded: true, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  return flags;
}
