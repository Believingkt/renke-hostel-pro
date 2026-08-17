import { supabase } from "@/integrations/supabase/client";

/**
 * 取得訂單目前使用的「房價方案 (pricing_template)」ID。
 * 折扣碼在「房價方案模式」的館別需要用它來判斷適用範圍。
 */
export async function getOrderPricingTemplateId(orderId: string): Promise<string | null> {
  if (!orderId) return null;
  const { data, error } = await supabase
    .from("order_rooms")
    .select("template_id")
    .eq("order_id", orderId)
    .not("template_id", "is", null)
    .limit(1);
  if (error) return null;
  return (data?.[0] as any)?.template_id ?? null;
}
