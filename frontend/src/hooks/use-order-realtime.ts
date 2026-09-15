import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RealtimeOrderRow = {
  id: string;
  payment_status?: string | null;
  order_status?: string | null;
  paid_amount?: number | null;
  [key: string]: unknown;
};

export const isOrderPaid = (o?: { payment_status?: string | null; paid_amount?: number | null } | null) =>
  !!o &&
  (o.payment_status === "paid" ||
    o.payment_status === "deposit_paid" ||
    o.payment_status === "partial" ||
    o.payment_status === "partial_paid" ||
    Number(o.paid_amount || 0) > 0);

/**
 * 訂閱指定訂單的即時更新（TapPay 付款回呼 → orders 更新 → 前台即時反映）。
 * 另備 polling 與分頁回前景時的補抓，避免 realtime 斷線時狀態卡住。
 */
export function useOrderRealtime(
  orderIds: string[],
  onUpdate: (row: RealtimeOrderRow) => void,
  options?: { pollMs?: number; enabled?: boolean },
) {
  const cbRef = useRef(onUpdate);
  cbRef.current = onUpdate;

  const key = orderIds.filter(Boolean).sort().join(",");
  const enabled = options?.enabled !== false && key.length > 0;
  const pollMs = options?.pollMs ?? 20000;

  useEffect(() => {
    if (!enabled) return;
    const ids = key.split(",");
    const idSet = new Set(ids);

    const channel = supabase
      .channel(`order-payment-${ids[0]}-${ids.length}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const row = payload.new as RealtimeOrderRow;
          if (row?.id && idSet.has(row.id)) cbRef.current(row);
        },
      )
      .subscribe();

    const refetch = async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, payment_status, order_status, paid_amount, final_price, atm_expire_at")
        .in("id", ids);
      (data || []).forEach((row) => cbRef.current(row as RealtimeOrderRow));
    };

    const pollId = window.setInterval(refetch, pollMs);
    const visHandler = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", visHandler);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", visHandler);
    };
  }, [key, enabled, pollMs]);
}
