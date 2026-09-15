/**
 * 共用：業主月結「免抽成（exempt）」判斷邏輯。
 *
 * 設計原則：
 * - 純 TypeScript，零外部 import（不依賴 npm 套件），可被任何 Edge Function 引用。
 * - 依賴注入 supabase client（只需要 .from().select() 介面），比照 src/lib/ownerSettlement.ts
 *   的 resolvePricingRule 設計模式。
 * - 批次取用：一次撈出所有涉及館別的 owner_settlement_pricing_rules 全部版本
 *   （此表 append-only 且資料量小）＋ system_settings legacy fallback，
 *   在記憶體建立 map，之後逐筆訂單判斷不再打資料庫。
 *
 * 月份基準：團隊佣金路徑統一使用「order_date 的月初」，
 * 不強求與業主月結（入住月份基準）一致。
 *
 * exempt 判斷：owner_direct === true，或 order_source 屬於該館別當時生效版本的
 * exempt_order_sources 清單，兩者符合其一即視為 exempt。
 */

export interface MinimalSupabaseClient {
  from: (table: string) => any;
}

export interface ExemptOrderInput {
  accommodation_id?: string | null;
  order_date?: string | null;
  owner_direct?: boolean | null;
  order_source?: string | null;
}

interface PricingRuleRow {
  accommodation_id: string;
  effective_from: string | null;
  created_at: string | null;
  exempt_order_sources: unknown;
}

const GLOBAL_SETTING_KEY = "owner_settlement_config";
const perAccSettingKey = (accId: string) => `${GLOBAL_SETTING_KEY}:${accId}`;

/** 取某個日期字串／Date 的月初（YYYY-MM-01）；無效輸入回傳空字串 */
export function monthStartOf(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}-01`;
  }
  const s = String(value);
  // 支援 "YYYY-MM-DD" 與 ISO timestamptz（此處只取字串前 7 碼即可）
  const m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-01`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return monthStartOf(d);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter((v) => v.length > 0);
}

/**
 * 建立 exempt 判斷器。
 *
 * @param client   任何具 .from(table).select(...) 介面的 supabase client（建議 service role）
 * @param accommodationIds 這批訂單涉及的所有館別 id
 * @returns (order) => boolean，true 代表該訂單免抽成（不列入分潤／獎金）
 */
export async function buildExemptResolver(
  client: MinimalSupabaseClient,
  accommodationIds: string[],
): Promise<(order: ExemptOrderInput) => boolean> {
  const accIds = Array.from(
    new Set((accommodationIds ?? []).filter((id): id is string => !!id)),
  );

  // 依 accommodation_id 分組的規則（已排序：effective_from desc, created_at desc）
  const rulesByAcc = new Map<string, PricingRuleRow[]>();
  // legacy fallback：per-accommodation 與全域
  const legacyByAcc = new Map<string, string[]>();
  let legacyGlobal: string[] = [];

  if (accIds.length > 0) {
    try {
      const { data } = await client
        .from("owner_settlement_pricing_rules")
        .select("accommodation_id, effective_from, created_at, exempt_order_sources")
        .in("accommodation_id", accIds);
      for (const row of (data ?? []) as PricingRuleRow[]) {
        const key = row.accommodation_id;
        if (!key) continue;
        const list = rulesByAcc.get(key) ?? [];
        list.push(row);
        rulesByAcc.set(key, list);
      }
      for (const list of rulesByAcc.values()) {
        list.sort((a, b) => {
          const ef = String(b.effective_from ?? "").localeCompare(String(a.effective_from ?? ""));
          if (ef !== 0) return ef;
          return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
        });
      }
    } catch {
      /* 讀取失敗一律 fallback legacy，避免整批計算中斷 */
    }
  }

  try {
    const keys = [GLOBAL_SETTING_KEY, ...accIds.map(perAccSettingKey)];
    const { data } = await client
      .from("system_settings")
      .select("setting_key, setting_value")
      .in("setting_key", keys);
    for (const row of (data ?? []) as Array<{ setting_key: string; setting_value: any }>) {
      const sources = toStringArray(row?.setting_value?.exempt_order_sources);
      if (row.setting_key === GLOBAL_SETTING_KEY) {
        legacyGlobal = sources;
      } else if (row.setting_key?.startsWith(`${GLOBAL_SETTING_KEY}:`)) {
        legacyByAcc.set(row.setting_key.slice(GLOBAL_SETTING_KEY.length + 1), sources);
      }
    }
  } catch {
    /* 同上：讀不到就當作沒有 legacy 設定 */
  }

  /** 找出該館別在指定月初當下生效版本的 exempt_order_sources */
  function exemptSourcesFor(accId: string, monthStart: string): string[] {
    const rules = rulesByAcc.get(accId);
    if (rules && rules.length > 0 && monthStart) {
      const hit = rules.find((r) => String(r.effective_from ?? "") <= monthStart);
      if (hit) {
        const sources = toStringArray(hit.exempt_order_sources);
        // 規則存在但欄位為 null 時，沿用 legacy 設定（與 pricingRuleFromRow 行為一致）
        if (Array.isArray(hit.exempt_order_sources)) return sources;
      }
    }
    return legacyByAcc.get(accId) ?? legacyGlobal;
  }

  return function isExempt(order: ExemptOrderInput): boolean {
    if (order?.owner_direct === true) return true;
    const accId = order?.accommodation_id ?? "";
    const source = order?.order_source ?? "";
    if (!accId || !source) return false;
    const monthStart = monthStartOf(order?.order_date ?? null);
    const sources = exemptSourcesFor(accId, monthStart);
    if (sources.length === 0) return false;
    return sources.includes(source);
  };
}
