import { templateMatchesRoomType } from "./templateRoomMatch.ts";

/**
 * 後台訂單頁「專案」欄位以 template_name 呈現，但 order_rooms.template_id 才是
 * 折扣碼適用範圍判斷（discountScope / update_paid_order_discount_v2）唯一的依據。
 * 這支純函式負責把「名稱 + 房型」解析回唯一的 pricing_template id。
 *
 * 規則（保守，寧可留 null 也不亂猜）：
 *  1. 沒有選方案（名稱空）→ null
 *  2. 目前已帶著的 template_id 仍與名稱、房型相符 → 原封不動保留（避免同名多筆時漂移）
 *  3. 否則以「房型可用 + 名稱完全相同」篩選：剛好 1 筆 → 用它；0 筆或多筆 → null
 */
export interface TemplateLite {
  id: string;
  template_name: string | null;
  room_type_id?: string | null;
  room_type_ids?: string[] | null;
}

export function resolveTemplateId(
  templates: TemplateLite[] | null | undefined,
  roomTypeId: string | null | undefined,
  templateName: string | null | undefined,
  currentTemplateId?: string | null,
): string | null {
  const name = (templateName || "").trim();
  if (!name) return null;
  const list = Array.isArray(templates) ? templates : [];

  if (currentTemplateId) {
    const cur = list.find((t) => t.id === currentTemplateId);
    if (cur && (cur.template_name || "").trim() === name && templateMatchesRoomType(cur as any, roomTypeId)) {
      return cur.id;
    }
  }

  const matches = list.filter(
    (t) => (t.template_name || "").trim() === name && templateMatchesRoomType(t as any, roomTypeId),
  );
  if (matches.length === 1) return matches[0].id;
  return null;
}
