/**
 * 行程訂單收尾（複用既有訂單／庫存機制，不另做金流）：
 *  1. 扣減 trip_products.stock（DB function 內含防超賣檢查）
 *  2. 於 order_meta 標記 trip_id
 *  3. 將行程狀態設為 published
 * 住宿庫存維持既有扣庫存與 OTA 同步機制，本檔案不介入。
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface AddonLine {
  source?: string;
  product_id?: string;
  count?: number;
}

export function extractTripProductLines(customAddonDetails: unknown): AddonLine[] {
  if (!Array.isArray(customAddonDetails)) return [];
  return (customAddonDetails as AddonLine[]).filter(
    (l) => l && l.source === "trip_product" && !!l.product_id && Number(l.count) > 0,
  );
}

/** 成單前的防超賣檢查（不扣庫存） */
export async function checkTripProductStock(
  supabaseUrl: string,
  serviceKey: string,
  customAddonDetails: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const lines = extractTripProductLines(customAddonDetails);
  if (!lines.length) return { ok: true };
  const supabase = createClient(supabaseUrl, serviceKey);
  const ids = [...new Set(lines.map((l) => l.product_id!))];
  const { data } = await supabase
    .from("trip_products")
    .select("id, stock, is_active")
    .in("id", ids);
  const map = new Map((data ?? []).map((r: any) => [r.id, r]));
  for (const line of lines) {
    const row = map.get(line.product_id!);
    if (!row || row.is_active === false) {
      return { ok: false, message: "行程項目已下架，請重新選擇" };
    }
    if (row.stock !== null && Number(row.stock) < Number(line.count)) {
      return { ok: false, message: "行程項目名額不足，請調整數量" };
    }
  }
  return { ok: true };
}

export async function finalizeTripOrder(
  supabaseUrl: string,
  serviceKey: string,
  params: { orderId: string; tripId?: string | null; customAddonDetails: unknown },
): Promise<void> {
  const supabase = createClient(supabaseUrl, serviceKey);
  const lines = extractTripProductLines(params.customAddonDetails);

  if (lines.length) {
    const { data, error } = await supabase.rpc("consume_trip_product_stock", {
      p_items: lines.map((l) => ({ product_id: l.product_id, count: l.count })),
    });
    if (error) console.error("[tripOrder] consume stock failed:", error);
    else if ((data as any)?.ok === false) console.error("[tripOrder] stock rejected:", data);
  }

  if (!params.tripId) return;

  const { error: metaError } = await supabase
    .from("order_meta")
    .upsert({ order_id: params.orderId, trip_id: params.tripId }, { onConflict: "order_id" });
  if (metaError) console.error("[tripOrder] order_meta upsert failed:", metaError);

  const { error: tripError } = await supabase
    .from("trips")
    .update({ status: "published" })
    .eq("id", params.tripId);
  if (tripError) console.error("[tripOrder] trip publish failed:", tripError);
}
