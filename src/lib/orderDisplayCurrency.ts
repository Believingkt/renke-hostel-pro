import { supabase } from "@/integrations/supabase/client";

/**
 * 每筆訂單獨立的「顯示主幣別」邏輯
 * - 系統實際金額永遠為 TWD（DB 內 final_price 等欄位不變）
 * - 此函式僅寫入 order_meta.display_currency，控制列表/詳情顯示樣式
 * - 例：JPY → 列表大字顯示 ¥；TWD → 大字顯示 NT$
 */
export async function setOrderDisplayCurrency(orderId: string, currencyCode: string | null) {
  if (!orderId) return;
  try {
    // 先 update；若沒列 → 取 accommodation_id 後 insert
    const { error: updErr, count } = await supabase
      .from("order_meta")
      .update({ display_currency: currencyCode }, { count: "exact" })
      .eq("order_id", orderId);
    if (updErr) {
      console.warn("[displayCurrency] update failed", updErr);
      return;
    }
    if (count && count > 0) return;
    // 沒既有 meta row → 取 order 的 accommodation_id 再 insert
    const { data: ord } = await supabase
      .from("orders")
      .select("accommodation_id")
      .eq("id", orderId)
      .maybeSingle();
    if (!ord?.accommodation_id) return;
    await supabase.from("order_meta").insert({
      order_id: orderId,
      accommodation_id: ord.accommodation_id,
      display_currency: currencyCode,
    } as any);
  } catch (e) {
    console.warn("[displayCurrency] failed", e);
  }
}

/** 將 DualCurrencyInput 的 mode 轉成存進 DB 的幣別代碼字串 */
export function modeToCurrencyCode(mode: "TWD" | "SEC", secondaryCode?: string | null): string {
  if (mode === "SEC" && secondaryCode) return secondaryCode.toUpperCase();
  return "TWD";
}
