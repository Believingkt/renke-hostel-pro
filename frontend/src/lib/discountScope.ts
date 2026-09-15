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
      reason:
        "此訂單包含多個房價方案，無法自動判斷折扣碼適用範圍。改填手動折扣金額會清空折扣碼並刪除此訂單的分潤／業績歸屬記錄。",
    };
  }
  if (roomTypes.length > 1) {
    return {
      templateId: templates[0] ?? null,
      roomTypeId: null,
      ambiguous: true,
      reason:
        "此訂單包含多個房型，無法自動判斷折扣碼適用範圍。改填手動折扣金額會清空折扣碼並刪除此訂單的分潤／業績歸屬記錄。",
    };
  }
  return {
    templateId: templates[0] ?? null,
    roomTypeId: roomTypes[0] ?? fallbackRoomTypeId ?? null,
    ambiguous: false,
  };
}

export type CoverageResult = "full" | "partial" | "none" | "unknown";

/**
 * 多房型／多方案訂單：檢查訂單所有房價方案是否都在折扣碼的適用清單內。
 * 僅讀取，不寫入、不重算金額。
 * - 僅 pricing_template 模式做判斷；room_type 模式回 "unknown"（維持現況）。
 * - 訂單 template_id 全為 NULL → "unknown"（資料不足，不等於「不適用」）。
 */
export async function getOrderCodeCoverage(params: {
  orderId: string;
  accommodationId: string;
  code: string;
}): Promise<{
  coverage: CoverageResult;
  scopeMode: "room_type" | "pricing_template";
  orderTemplateIds: string[];
  applicableIds: string[];
  representativeTemplateId: string | null;
}> {
  const code = (params.code || "").trim().toUpperCase();
  const [{ data: acc }, { data: rows }, { data: dc }] = await Promise.all([
    supabase
      .from("accommodation_info")
      .select("discount_scope_mode")
      .eq("id", params.accommodationId)
      .maybeSingle(),
    supabase.from("order_rooms").select("template_id").eq("order_id", params.orderId),
    supabase
      .from("discount_codes")
      .select("applicable_pricing_template_ids")
      .eq("accommodation_id", params.accommodationId)
      .ilike("code", code)
      .maybeSingle(),
  ]);

  const scopeMode = ((acc as any)?.discount_scope_mode ?? "pricing_template") as
    | "room_type"
    | "pricing_template";
  const orderTemplateIds = Array.from(
    new Set(((rows ?? []) as any[]).map((r) => r.template_id).filter(Boolean) as string[]),
  );
  const applicableIds = (((dc as any)?.applicable_pricing_template_ids ?? []) as string[]) || [];

  const base = {
    scopeMode,
    orderTemplateIds,
    applicableIds,
    representativeTemplateId: null as string | null,
  };
  if (scopeMode !== "pricing_template") return { ...base, coverage: "unknown" };
  if (orderTemplateIds.length === 0) return { ...base, coverage: "unknown" };
  if (!dc) return { ...base, coverage: "none" };

  const hit = orderTemplateIds.filter((id) => applicableIds.includes(id));
  if (hit.length === orderTemplateIds.length) {
    return { ...base, coverage: "full", representativeTemplateId: orderTemplateIds[0] };
  }
  if (hit.length === 0) return { ...base, coverage: "none" };
  return { ...base, coverage: "partial" };
}
