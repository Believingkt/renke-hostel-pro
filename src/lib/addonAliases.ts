/**
 * 增值服務（加購項目）名稱對應工具
 *
 * 訂單的 custom_addon_details 會快照當下的名稱（addon_type）。
 * 若後台之後把加購項目改名（例如「加床服務」→「加床」），
 * 舊訂單在編輯時就會對不到現行設定，導致重複新增或無法修改。
 *
 * 對應優先序：
 * 1. addon_id（改名後仍不變，最可靠）
 * 2. 名稱完全相同
 * 3. 明確的舊名別名表
 * 4. 正規化名稱（去空白、去「服務／費用／費／方案」等後綴）
 */

export type AddonSettingLike = { id: string; addon_type: string };
export type AddonDetailLike = { addon_id?: string | null; addon_type?: string | null };

/** 明確的舊名 → 新名對應（全站共用，鍵值皆為正規化前的原始名稱） */
export const LEGACY_ADDON_NAME_ALIASES: Record<string, string> = {
  加床服務: "加床",
  加床費: "加床",
  寵物服務: "寵物",
  寵物費: "寵物",
  寵物方案: "寵物",
  早餐服務: "早餐",
  餐食方案: "餐食",
  烤肉服務: "烤肉",
  包棟服務: "包棟",
};

/** 正規化名稱：去除空白／全形空白，並去掉常見後綴 */
export function normalizeAddonName(name: string): string {
  const base = String(name || "")
    .replace(/[\s\u3000]/g, "")
    .trim();
  return base.replace(/(服務|費用|費|方案)$/u, "") || base;
}

/**
 * 依 addon_id → 名稱 → 別名 → 正規化名稱，解析出現行設定的 addon id。
 * 找不到時回傳 null。
 */
export function resolveAddonSetting<T extends AddonSettingLike>(
  detail: AddonDetailLike,
  settings: T[],
): T | null {
  if (!settings?.length) return null;

  if (detail?.addon_id) {
    const byId = settings.find((s) => s.id === detail.addon_id);
    if (byId) return byId;
  }

  const rawName = String(detail?.addon_type || "").trim();
  if (!rawName) return null;

  const byName = settings.find((s) => s.addon_type === rawName);
  if (byName) return byName;

  const aliased = LEGACY_ADDON_NAME_ALIASES[rawName];
  if (aliased) {
    const byAlias = settings.find((s) => s.addon_type === aliased);
    if (byAlias) return byAlias;
  }

  const target = normalizeAddonName(aliased || rawName);
  const byNormalized = settings.find((s) => normalizeAddonName(s.addon_type) === target);
  return byNormalized || null;
}

/** 便利函式：只取 id */
export function resolveAddonId(detail: AddonDetailLike, settings: AddonSettingLike[]): string | null {
  return resolveAddonSetting(detail, settings)?.id ?? null;
}
