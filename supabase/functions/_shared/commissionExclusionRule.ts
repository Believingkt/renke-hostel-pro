/**
 * V3 團隊獎金基準：各館「增值服務是否列入抽成」規則解析（Edge mirror）。
 *
 * 規則來源與業主月結／住宿營收獎金池完全相同：
 *   owner_settlement_pricing_rules.commission_excluded_addon_ids / _types
 *   （append-only 版本制，取 effective_from <= order_date 月初 的最新版本）
 *
 * fallback 語意（與業主月結一致）：
 *   查不到規則、或兩個欄位皆空 → 不排除任何增值服務（＝全部列入抽成）。
 *
 * MIRROR of src/lib/commissionExclusionRule.ts —— contract 必須完全相同（有 parity 測試）。
 */

export interface CommissionExclusionRule {
  commission_excluded_addon_ids: string[] | null;
  commission_excluded_addon_types: string[] | null;
}

export interface MinimalClient {
  from: (table: string) => any;
}

const CHUNK = 500;

function toArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
}

/** 取日期的月初（YYYY-MM-01）；無效輸入回傳空字串 */
export function ruleMonthStartOf(value: string | Date | null | undefined): string {
  if (!value) return "";
  const s = value instanceof Date ? value.toISOString() : String(value);
  const m = s.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-01` : "";
}

/** 只加總「被設定為排除」的 custom addon 金額；未設定 → 0 */
export function excludedAddonTotal(
  customAddonDetails: unknown,
  rule: CommissionExclusionRule | null | undefined,
): number {
  if (!Array.isArray(customAddonDetails) || !rule) return 0;
  const idSet = new Set(toArr(rule.commission_excluded_addon_ids));
  const typeSet = new Set(toArr(rule.commission_excluded_addon_types));
  if (idSet.size === 0 && typeSet.size === 0) return 0;
  let sum = 0;
  for (const item of customAddonDetails) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const addonId = rec.addon_id ? String(rec.addon_id) : "";
    const matched = addonId ? idSet.has(addonId) : typeSet.has(String(rec.addon_type ?? ""));
    if (matched) sum += Number(rec.total ?? 0) || 0;
  }
  return sum;
}

export type CommissionExclusionResolver = (
  accommodationId: string | null | undefined,
  orderDate: string | Date | null | undefined,
) => CommissionExclusionRule | null;

/**
 * 批次建立解析器：一次撈完所有館別的規則版本，之後逐單查詢不再打資料庫。
 * 讀取失敗一律回傳「查無規則」，等同全部列入抽成（不會誤降低獎金基準）。
 */
export async function buildCommissionExclusionResolver(
  client: MinimalClient,
  accommodationIds: Array<string | null | undefined>,
): Promise<CommissionExclusionResolver> {
  const accIds = Array.from(new Set((accommodationIds ?? []).filter((v): v is string => !!v)));
  const byAcc = new Map<string, Array<{ effective_from: string; created_at: string; rule: CommissionExclusionRule }>>();

  for (let i = 0; i < accIds.length; i += CHUNK) {
    try {
      const { data } = await client
        .from("owner_settlement_pricing_rules")
        .select(
          "accommodation_id, effective_from, created_at, commission_excluded_addon_ids, commission_excluded_addon_types",
        )
        .in("accommodation_id", accIds.slice(i, i + CHUNK));
      for (const row of (data ?? []) as any[]) {
        const key = row?.accommodation_id;
        if (!key) continue;
        const list = byAcc.get(key) ?? [];
        list.push({
          effective_from: String(row.effective_from ?? ""),
          created_at: String(row.created_at ?? ""),
          rule: {
            commission_excluded_addon_ids: toArr(row.commission_excluded_addon_ids),
            commission_excluded_addon_types: toArr(row.commission_excluded_addon_types),
          },
        });
        byAcc.set(key, list);
      }
    } catch {
      /* 讀取失敗 → 該批視為查無規則 */
    }
  }

  for (const list of byAcc.values()) {
    list.sort((a, b) => {
      const ef = b.effective_from.localeCompare(a.effective_from);
      return ef !== 0 ? ef : b.created_at.localeCompare(a.created_at);
    });
  }

  return function resolve(accommodationId, orderDate) {
    const accId = accommodationId ?? "";
    const list = byAcc.get(accId);
    if (!list || list.length === 0) return null;
    const monthStart = ruleMonthStartOf(orderDate);
    if (!monthStart) return null;
    const hit = list.find((r) => r.effective_from !== "" && r.effective_from <= monthStart);
    return hit ? hit.rule : null;
  };
}
