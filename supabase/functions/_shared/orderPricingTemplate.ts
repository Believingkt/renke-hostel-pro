// 訂單對應專案（pricing_template）決定規則（單一真理）：
//   (1) 同館且 default_package_id = 訂單 package_id 者；多筆時 ORDER BY display_order NULLS LAST, created_at 取第一筆
//   (2) 找不到時，沿用前台目前用於折扣碼驗證的專案（fallbackTemplateId）
//   (3) 都沒有 → null（折扣碼於 pricing_template 適用範圍模式視為不適用，不折扣、不擋單）
// 必須與已上線 DB trigger validate_order_before_insert() 的 v_disc_tpl 判斷一致。
// 此檔與 packages/shared/src/utils/orderPricingTemplate.ts 必須完全一致（同一組測試向量驗證）。

export interface OrderPricingTemplateCandidate {
  id: string;
  accommodation_id?: string | null;
  default_package_id?: string | null;
  display_order?: number | null;
  created_at?: string | null;
}

export interface ResolveOrderPricingTemplateInput {
  templates?: OrderPricingTemplateCandidate[] | null;
  accommodationId?: string | null;
  packageId?: string | null;
  fallbackTemplateId?: string | null;
}

/** display_order NULLS LAST, created_at（PostgreSQL ORDER BY 的等價排序） */
function orderKey(value: number | null | undefined): number {
  if (value === null || value === undefined) return Number.POSITIVE_INFINITY;
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

function createdKey(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

export function resolveOrderPricingTemplateId(input: ResolveOrderPricingTemplateInput): string | null {
  const list = Array.isArray(input.templates) ? input.templates : [];
  const packageId = input.packageId ?? null;
  const accommodationId = input.accommodationId ?? null;
  const fallback = input.fallbackTemplateId ?? null;

  if (packageId) {
    const matches = list.filter((t) => {
      if (!t || !t.id) return false;
      if ((t.default_package_id ?? null) !== packageId) return false;
      if (accommodationId && t.accommodation_id && t.accommodation_id !== accommodationId) return false;
      return true;
    });
    if (matches.length > 0) {
      const sorted = matches.slice().sort((a, b) => {
        const ao = orderKey(a.display_order);
        const bo = orderKey(b.display_order);
        if (ao !== bo) return ao < bo ? -1 : 1;
        const ac = createdKey(a.created_at);
        const bc = createdKey(b.created_at);
        if (ac !== bc) return ac < bc ? -1 : 1;
        return 0;
      });
      return sorted[0].id;
    }
  }

  return fallback;
}
