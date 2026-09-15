import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useSubdomain } from "./use-subdomain";

/**
 * 訂閱 notifications 表的即時新增事件，彈出 toast。
 * 通知資料的寫入由資料庫 trigger（伺服器端）統一負責，
 * 前端不再寫入 notifications，避免多分頁/多裝置同時收到事件
 * 各自寫入造成重複。
 */
export const useOrderNotifications = (enabled: boolean = true) => {
  const { accommodationId } = useSubdomain();

  useEffect(() => {
    if (!accommodationId || !enabled) return;

    const channel = supabase
      .channel(`notifications-${accommodationId}-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `accommodation_id=eq.${accommodationId}`,
        },
        (payload) => {
          const n = payload.new as {
            title?: string;
            description?: string;
            accommodation_id?: string;
          };
          // 雙重保險：僅顯示當前民宿的通知，避免切換時殘留訂閱誤觸
          if (n.accommodation_id && n.accommodation_id !== accommodationId) {
            return;
          }
          toast({
            title: n.title ?? "通知",
            description: n.description ?? "",
            duration: 8000,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accommodationId, enabled]);
};
