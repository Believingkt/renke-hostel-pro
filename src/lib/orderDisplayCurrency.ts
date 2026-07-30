import { supabase } from "@/integrations/supabase/client";

/**
 * 每筆訂單獨立的「顯示主幣別」邏輯
 * - 系統實際金額永遠為 TWD（DB 內 final_price 等欄位不變）
 * - 此函式僅寫入 order_meta.display_currency，控制列表/詳情顯示樣式
 * - 例：JPY → 列表大字顯示 ¥；TWD → 大字顯示 NT$
 */
export async function setOrderDisplayCurrency(orderId: string, currencyCode: string | null) {
  if (!orderId) return;

  // 取得訂單所屬館別（同時給 order_meta insert 與匯率查詢使用）
  const { data: ord, error: ordErr } = await supabase
    .from("orders")
    .select("accommodation_id")
    .eq("id", orderId)
    .maybeSingle();
  if (ordErr) throw new Error(`讀取訂單失敗：${ordErr.message}`);

  // 1) order_meta.display_currency：先 update，沒列則 insert
  const { error: updErr, count } = await supabase
    .from("order_meta")
    .update({ display_currency: currencyCode }, { count: "exact" })
    .eq("order_id", orderId);
  if (updErr) throw new Error(`更新幣別標記失敗：${updErr.message}`);

  if (!count || count === 0) {
    if (!ord?.accommodation_id) throw new Error("找不到訂單所屬館別，無法寫入幣別標記");
    const { error: insErr } = await supabase.from("order_meta").insert({
      order_id: orderId,
      accommodation_id: ord.accommodation_id,
      display_currency: currencyCode,
    } as any);
    if (insErr) throw new Error(`建立幣別標記失敗：${insErr.message}`);
  }

  // 2) orders 快照：使用者主動選擇幣別時才寫入
  let rate: number | null = null;
  if (currencyCode && currencyCode.toUpperCase() !== "TWD" && ord?.accommodation_id) {
    const { data: acc } = await supabase
      .from("accommodation_info")
      .select("secondary_currency_rate")
      .eq("id", ord.accommodation_id)
      .maybeSingle();
    rate = (acc as any)?.secondary_currency_rate ?? null;
  }

  const { error: snapErr } = await supabase
    .from("orders")
    .update({
      currency_at_booking: currencyCode ? currencyCode.toUpperCase() : null,
      exchange_rate_snapshot: rate,
    } as any)
    .eq("id", orderId);
  if (snapErr) throw new Error(`寫入幣別快照失敗：${snapErr.message}`);
}


/** 將 DualCurrencyInput 的 mode 轉成存進 DB 的幣別代碼字串 */
export function modeToCurrencyCode(mode: "TWD" | "SEC", secondaryCode?: string | null): string {
  if (mode === "SEC" && secondaryCode) return secondaryCode.toUpperCase();
  return "TWD";
}
