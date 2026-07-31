import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAtmDisplayInfo } from "@/lib/atmPayment";

export interface PendingAtmOrder {
  id: string;
  order_number: string;
  final_price: number | null;
  paid_amount: number | null;
  notes: string | null;
  atm_vacc_no: string | null;
  atm_vacc_bank_code: string | null;
  atm_expire_at: string | null;
  payment_status: string | null;
  /** 待繳金額 */
  amount: number;
  expireAt: Date | null;
}

/**
 * 取得目前登入會員「已開立 ATM 虛擬帳號但尚未繳費、且未逾期」的訂單。
 * 供會員中心與首頁的置頂倒數提醒共用。
 */
export function usePendingAtmOrders() {
  const [orders, setOrders] = useState<PendingAtmOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) {
            setOrders([]);
            setLoading(false);
          }
          return;
        }
        const { data: member } = await supabase
          .from("platform_members")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!member) {
          if (!cancelled) {
            setOrders([]);
            setLoading(false);
          }
          return;
        }

        const { data } = await supabase
          .from("orders")
          .select(
            "id, order_number, final_price, paid_amount, notes, atm_vacc_no, atm_vacc_bank_code, atm_expire_at, payment_status, order_status"
          )
          .eq("member_id", member.id)
          .eq("payment_status", "pending_payment" as any)
          .neq("order_status", "cancelled" as any)
          .not("atm_vacc_no", "is", null)
          .order("atm_expire_at", { ascending: true })
          .limit(20);

        const now = Date.now();
        const rows = (data || [])
          .map((o: any) => {
            const info = getAtmDisplayInfo(o, now);
            return {
              ...o,
              amount: info.amount,
              expireAt: info.expireAt,
              expired: info.expired,
            };
          })
          .filter((o: any) => o.expireAt && !o.expired) as PendingAtmOrder[];

        if (!cancelled) {
          setOrders(rows);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setOrders([]);
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { orders, loading };
}

/** 倒數字串：X 天 X 小時 X 分 X 秒（不足一天時省略天） */
export function formatCountdown(target: Date, now: number): string {
  const diff = Math.max(0, target.getTime() - now);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return days > 0
    ? `${days} 天 ${pad(hours)}:${pad(mins)}:${pad(secs)}`
    : `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}
