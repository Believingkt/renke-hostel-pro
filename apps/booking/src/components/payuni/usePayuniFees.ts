import { useEffect, useState } from "react";
import { supabase } from "@lakeze/shared/integrations/supabase/client";

export const PAYUNI_PAYMENT_METHODS = ["credit_card_payuni", "atm_payuni"];
export interface PayuniFee { collected: number; refunded: number; fee: number | null }

export const isPayuniMethod = (...methods: Array<string | null | undefined>) =>
  methods.some((m) => !!m && PAYUNI_PAYMENT_METHODS.includes(m));

/** 實收 = 已收 − 已退 − 手續費；手續費未回填回 null（待對帳） */
export const payuniNet = (f: PayuniFee | undefined) => (f && f.fee != null ? f.collected - f.refunded - f.fee : null);

/** PAYUNi 訂單的實際手續費（payuni-reconcile 對帳回填；經 edge function 取得，只回自己館的訂單） */
export function usePayuniFees(orderIds: string[]) {
  const [fees, setFees] = useState<Record<string, PayuniFee>>({});
  const key = [...new Set(orderIds)].sort().join(",");
  useEffect(() => {
    if (!key) { setFees({}); return; }
    let alive = true;
    supabase.functions.invoke("payuni-reconcile", { body: { action: "fees", order_ids: key.split(",").slice(0, 500) } })
      .then(({ data }) => { if (alive) setFees(data?.ok ? data.fees : {}); });
    return () => { alive = false; };
  }, [key]);
  return fees;
}
