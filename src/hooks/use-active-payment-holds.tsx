import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ACTIVE_HOLD_STATUSES,
  expandPaymentHoldEvents,
  type PaymentHoldDraft,
  type PaymentHoldEvent,
} from "@/lib/paymentHoldEvents";

/**
 * 讀取指定民宿 / 日期區間內「仍有效」的團購信用卡付款保留（唯讀）。
 *
 * 只做 SELECT：不修改 draft、不釋放保留、不轉單、不碰庫存。
 * group_buy_payment_drafts 未加入 realtime publication（且本輪不做 migration），
 * 因此採 30 秒 polling + 到期時間觸發 refetch。
 */
export function useActivePaymentHolds(
  accommodationId: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
) {
  const [drafts, setDrafts] = useState<PaymentHoldDraft[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    if (!accommodationId || !startDate || !endDate) return;
    const seq = ++seqRef.current;
    const { data, error } = await supabase
      .from("group_buy_payment_drafts")
      .select("id, room_type_id, room_quantity, check_in_date, check_out_date, status, expires_at, converted_order_id, guest_name")
      .eq("accommodation_id", accommodationId)
      .is("converted_order_id", null)
      .in("status", ACTIVE_HOLD_STATUSES as unknown as string[])
      .gt("expires_at", new Date().toISOString())
      .gt("check_out_date", startDate)
      .lte("check_in_date", endDate);
    if (seq !== seqRef.current) return;
    if (error) {
      console.error("[payment-holds] load failed", error);
      return;
    }
    setDrafts((data ?? []) as PaymentHoldDraft[]);
    setNow(Date.now());
  }, [accommodationId, startDate, endDate]);

  useEffect(() => {
    void load();
  }, [load]);

  // 30 秒 polling：新 draft 出現 / release / expired / converted 都會在下一輪同步
  useEffect(() => {
    if (!accommodationId) return;
    const t = window.setInterval(() => void load(), 30_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [accommodationId, load]);

  // 任一 hold 到期 → 立即 refetch，確認 DB 端是否仍有效（前端倒數不是 SoT）
  useEffect(() => {
    if (drafts.length === 0) return;
    const soonest = Math.min(...drafts.map((d) => new Date(d.expires_at).getTime()));
    const delay = soonest - Date.now();
    const t = window.setTimeout(() => void load(), Math.max(1000, delay + 1000));
    return () => window.clearTimeout(t);
  }, [drafts, load]);

  const events: PaymentHoldEvent[] = useMemo(() => expandPaymentHoldEvents(drafts, now), [drafts, now]);

  return { holdEvents: events, refetchHolds: load };
}
