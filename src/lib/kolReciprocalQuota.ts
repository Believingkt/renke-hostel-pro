import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * KOL 互惠每月額度檢查
 * - 歸屬月份：以入住日 (check_in_date) 為準
 * - 範圍：每家民宿獨立
 * - 軟攔截：超額時呼叫 confirmFn 由 UI 決定是否強制
 */

export interface KolQuotaStatus {
  yearMonth: string;
  quota: number | null; // null = 未設定上限
  used: number; // 該月已存在的 KOL 互惠訂單數（已排除目前編輯中的訂單）
  willExceed: boolean; // 加上本次後是否超出
  willReach: boolean; // 加上本次後是否剛好達到上限
}

/**
 * 取得指定民宿/月份的 KOL 互惠額度與使用量
 */
export async function fetchKolQuotaStatus(params: {
  accommodationId: string;
  checkInDate: string; // yyyy-MM-dd
  excludeOrderId?: string | null;
}): Promise<KolQuotaStatus> {
  const { accommodationId, checkInDate, excludeOrderId } = params;
  const yearMonth = checkInDate.slice(0, 7); // yyyy-MM

  const [quotaRes, countRes] = await Promise.all([
    supabase
      .from("kol_reciprocal_monthly_quotas")
      .select("quota")
      .eq("accommodation_id", accommodationId)
      .eq("year_month", yearMonth)
      .maybeSingle(),
    supabase.rpc("count_kol_reciprocal_orders", {
      _accommodation_id: accommodationId,
      _year_month: yearMonth,
      _exclude_order_id: excludeOrderId ?? null,
    }),
  ]);

  const quota = quotaRes.data?.quota ?? null;
  const used = (countRes.data as number | null) ?? 0;
  const next = used + 1;

  return {
    yearMonth,
    quota,
    used,
    willExceed: quota != null && next > quota,
    willReach: quota != null && next === quota,
  };
}

/**
 * 整合性檢查：
 * - 若本次訂單來源非 'kol' → 直接 ok
 * - 若沒設額度 → ok
 * - 若未超 → ok（剛好達標時跳 toast 提示）
 * - 若超出 → admin 可呼叫 confirmFn 強制建立；非 admin 直接擋下
 *
 * @returns true 表示可繼續，false 表示中止
 */
export async function ensureKolQuotaPermit(opts: {
  accommodationId: string | null | undefined;
  orderSource: string | null | undefined;
  checkInDate: string | null | undefined;
  excludeOrderId?: string | null;
  isAdmin: boolean;
  confirmOverride: (status: KolQuotaStatus) => Promise<boolean>;
}): Promise<boolean> {
  const { accommodationId, orderSource, checkInDate, excludeOrderId, isAdmin, confirmOverride } = opts;

  if (orderSource !== "kol") return true;
  if (!accommodationId || !checkInDate) return true;

  let status: KolQuotaStatus;
  try {
    status = await fetchKolQuotaStatus({ accommodationId, checkInDate, excludeOrderId });
  } catch (e) {
    console.error("[KolQuota] 查詢失敗", e);
    return true; // 查詢失敗時放行，避免誤擋
  }

  if (status.quota == null) return true;

  if (!status.willExceed) {
    if (status.willReach) {
      toast({
        title: `本月 KOL 互惠即將達上限`,
        description: `${status.yearMonth} 已使用 ${status.used + 1}/${status.quota} 筆`,
      });
    }
    return true;
  }

  // 超出：允許所有人強制覆寫
  return await confirmOverride(status);
}
