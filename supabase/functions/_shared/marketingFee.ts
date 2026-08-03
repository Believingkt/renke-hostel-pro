/**
 * 共用：行銷推廣費計算（與 src/lib/ownerSettlement.ts 的 resolveMarketingFee 邏輯完全一致）。
 *
 * 規則來源優先序：
 *  1. owner_settlement_pricing_rules（該館別 effective_from <= 報表月初的最新一筆）
 *  2. 無資料時 fallback system_settings.owner_settlement_config
 *     （per-accommodation key `owner_settlement_config:<id>` 優先於全域 key）
 *
 * 計算：
 *  - marketing_fee_threshold > 0：毛營收 >= 門檻用 high，否則用 low
 *  - marketing_fee_threshold = 0：舊制 low + (棟數 − 1) × 每多一棟加收
 */

export interface MinimalSupabaseClient {
  from: (table: string) => any;
}

export interface MarketingFeeRule {
  marketing_fee_low: number;
  marketing_fee_high: number;
  marketing_fee_threshold: number;
  marketing_fee_per_extra_property: number;
  fromTable: boolean;
  effective_from: string | null;
}

const GLOBAL_SETTING_KEY = "owner_settlement_config";
const perAccSettingKey = (accId: string) => `${GLOBAL_SETTING_KEY}:${accId}`;

/** 與前端 resolveMarketingFee 相同的純計算函式 */
export function resolveMarketingFee(
  rule: MarketingFeeRule,
  revenueBase: number,
  propertyCount: number,
): number {
  if (rule.marketing_fee_threshold > 0) {
    return revenueBase >= rule.marketing_fee_threshold
      ? rule.marketing_fee_high
      : rule.marketing_fee_low;
  }
  return (
    rule.marketing_fee_low +
    Math.max(0, propertyCount - 1) * rule.marketing_fee_per_extra_property
  );
}

function legacyRule(config: any): MarketingFeeRule {
  const base = Number(config?.marketing_fee_base) || 0;
  return {
    marketing_fee_low: base,
    marketing_fee_high: base,
    marketing_fee_threshold: 0,
    marketing_fee_per_extra_property: Number(config?.marketing_fee_per_extra_property) || 0,
    fromTable: false,
    effective_from: null,
  };
}

/**
 * 批次建立「館別 → 行銷費規則」解析器（一次撈完，避免逐館打 DB）。
 * monthStart 格式 YYYY-MM-01。
 */
export async function buildMarketingFeeResolver(
  client: MinimalSupabaseClient,
  accommodationIds: string[],
  monthStart: string,
): Promise<(accId: string) => MarketingFeeRule> {
  const accIds = Array.from(new Set((accommodationIds ?? []).filter(Boolean)));

  const rulesByAcc = new Map<string, any[]>();
  if (accIds.length > 0) {
    try {
      const { data } = await client
        .from("owner_settlement_pricing_rules")
        .select("*")
        .in("accommodation_id", accIds)
        .lte("effective_from", monthStart);
      for (const row of (data ?? []) as any[]) {
        const list = rulesByAcc.get(row.accommodation_id) ?? [];
        list.push(row);
        rulesByAcc.set(row.accommodation_id, list);
      }
      for (const list of rulesByAcc.values()) {
        list.sort((a, b) => {
          const ef = String(b.effective_from ?? "").localeCompare(String(a.effective_from ?? ""));
          if (ef !== 0) return ef;
          return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
        });
      }
    } catch {
      /* 讀取失敗 fallback legacy */
    }
  }

  const legacyByAcc = new Map<string, any>();
  let legacyGlobal: any = null;
  try {
    const keys = [GLOBAL_SETTING_KEY, ...accIds.map(perAccSettingKey)];
    const { data } = await client
      .from("system_settings")
      .select("setting_key, setting_value")
      .in("setting_key", keys);
    for (const row of (data ?? []) as any[]) {
      if (row.setting_key === GLOBAL_SETTING_KEY) legacyGlobal = row.setting_value;
      else if (String(row.setting_key ?? "").startsWith(`${GLOBAL_SETTING_KEY}:`)) {
        legacyByAcc.set(row.setting_key.slice(GLOBAL_SETTING_KEY.length + 1), row.setting_value);
      }
    }
  } catch {
    /* 同上 */
  }

  return function ruleFor(accId: string): MarketingFeeRule {
    const legacy = legacyRule(legacyByAcc.get(accId) ?? legacyGlobal ?? {});
    const row = rulesByAcc.get(accId)?.[0];
    if (!row) return legacy;
    return {
      marketing_fee_low: Number(row.marketing_fee_low) || 0,
      marketing_fee_high: Number(row.marketing_fee_high) || 0,
      marketing_fee_threshold: Number(row.marketing_fee_threshold) || 0,
      // 「每多一棟加收」僅存在於舊制 config，沿用 legacy 值
      marketing_fee_per_extra_property: legacy.marketing_fee_per_extra_property,
      fromTable: true,
      effective_from: row.effective_from ?? null,
    };
  };
}
