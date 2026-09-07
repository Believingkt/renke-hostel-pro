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

export interface OrderDiscountScope {
  templateId: string | null;
  roomTypeId: string | null;
  /** 多房型或多房價方案 → 無法安全判斷折扣碼適用範圍 */
  ambiguous: boolean;
  reason?: string;
}

/**
 * 取得折扣碼驗證所需的範圍（房型 + 房價方案）。
 * 多房型／多方案時明確回報 ambiguous，呼叫端必須改用手動折扣，不得猜第一筆。
 */
export async function getOrderDiscountScope(
  orderId: string,
  fallbackRoomTypeId?: string | null,
): Promise<OrderDiscountScope> {
  if (!orderId) {
    return { templateId: null, roomTypeId: fallbackRoomTypeId ?? null, ambiguous: false };
  }
  const { data, error } = await supabase
    .from("order_rooms")
    .select("template_id, room_type_id")
    .eq("order_id", orderId);
  if (error) {
    return { templateId: null, roomTypeId: fallbackRoomTypeId ?? null, ambiguous: false };
  }
  const rows = (data ?? []) as Array<{ template_id: string | null; room_type_id: string | null }>;
  const templates = Array.from(new Set(rows.map((r) => r.template_id).filter(Boolean))) as string[];
  const roomTypes = Array.from(new Set(rows.map((r) => r.room_type_id).filter(Boolean))) as string[];

  if (templates.length > 1) {
    return {
      templateId: null,
      roomTypeId: null,
      ambiguous: true,
      reason: "此訂單包含多個房價方案，無法自動判斷折扣碼適用範圍，請改填手動折扣金額。",
    };
  }
  if (roomTypes.length > 1) {
    return {
      templateId: templates[0] ?? null,
      roomTypeId: null,
      ambiguous: true,
      reason: "此訂單包含多個房型，無法自動判斷折扣碼適用範圍，請改填手動折扣金額。",
    };
  }
  return {
    templateId: templates[0] ?? null,
    roomTypeId: roomTypes[0] ?? fallbackRoomTypeId ?? null,
    ambiguous: false,
  };
}
