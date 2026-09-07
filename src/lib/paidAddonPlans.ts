/**
 * 已付款訂單「加購方案」編輯 — 純資料組裝，沿用既有正式加購來源與計價規則。
 *
 * 計價來源：public.addon_settings（單價／單位／起訂量／上限）。
 * 計價規則：與 OrderPriceEditDialog / EditOrderDialog 完全相同——
 *   歷史訂單不重算加購晚數（nights = 1），total = price_per_unit × count × nights。
 * 本檔不重寫任何計價公式，也不做任何寫入。
 */

import { addonStepDown, addonStepUp } from "@/lib/addonLabels";
import { resolveAddonSetting } from "@/lib/addonAliases";

/** 歷史訂單不重算加購晚數，保留原金額（與既有編輯畫面一致） */
export const PAID_ADDON_NIGHTS = 1;

/**
 * v5.5A 的 update_paid_order_addons_v2 直接把 p_addons 寫入 custom_addon_details，
 * 並以其中的 total 欄位計算金額 → 後端不會重新查 addon_settings、會信任 client 金額。
 * 依授權要求，方案數量調整在 v5.5A.1（後端重算單價）安裝前一律 fail-closed。
 */
export const PAID_ADDON_PLAN_RPC_SUPPORTED = false;
export const PAID_ADDON_PLAN_BLOCKER =
  "目前後端 update_paid_order_addons_v2 會直接採用前端送出的加購金額（不會重新查方案單價），" +
  "因此「加購方案」數量調整暫時無法送出。需先安裝 v5.5A.1（由後端依 addon_settings 重算單價與小計）。" +
  "本次僅能修改「額外現場加購」。";

export interface AddonSettingRow {
  id: string;
  addon_type: string;
  description?: string | null;
  price_per_unit: number;
  unit_label: string;
  pricing_mode?: string | null;
  min_quantity?: number | null;
  max_quantity?: number | null;
  enabled?: boolean | null;
}

export interface AddonDetailRow {
  addon_id?: string;
  addon_type: string;
  count: number;
  price_per_unit: number;
  total: number;
  unit_label: string;
}

export interface AddonPlanRow {
  key: string;
  addonId: string | null;
  name: string;
  unitLabel: string;
  pricePerUnit: number;
  nights: number;
  minQuantity: number;
  maxQuantity: number | null;
  originalQty: number;
  /** 已停用但訂單原本就有的方案：仍顯示、仍計入，但不可調整 */
  legacyOnly: boolean;
}

export interface ParsedOrderAddons {
  /** 對應到現行（或歷史）方案的數量 */
  quantities: Record<string, number>;
  /** 對應不到任何設定的明細（寵物 / bbq / malformed）→ 原樣保留，不在此畫面編輯 */
  preserved: AddonDetailRow[];
  rows: AddonPlanRow[];
}

const num = (v: unknown) => Number(v ?? 0) || 0;

/**
 * 以訂單既有 custom_addon_details + 館別 addon_settings 組出可編輯的方案列。
 * - 現行啟用方案：一律列出（數量可能為 0）
 * - 已停用但訂單存在的方案：以訂單快照顯示，標記 legacyOnly（不消失、不可調整）
 * - malformed（缺 addon_type／count 非正數）：進 preserved，原樣保留
 */
export function parseOrderAddons(
  settings: AddonSettingRow[],
  customAddonDetails: unknown,
): ParsedOrderAddons {
  const quantities: Record<string, number> = {};
  const preserved: AddonDetailRow[] = [];
  const legacy: AddonPlanRow[] = [];
  const list = Array.isArray(customAddonDetails) ? (customAddonDetails as any[]) : [];

  for (const a of list) {
    if (!a || typeof a !== "object" || !a.addon_type || !(num(a.count) > 0)) {
      if (a && typeof a === "object") preserved.push(a as AddonDetailRow);
      continue;
    }
    const matched = resolveAddonSetting(a, settings as any);
    if (!matched) {
      // 寵物 / bbq / 已停用且無法對應 → 原樣保留
      preserved.push(a as AddonDetailRow);
      continue;
    }
    const key = matched.addon_type;
    quantities[key] = (quantities[key] || 0) + num(a.count);
    const stillActive = settings.some((s) => s.addon_type === key && s.enabled !== false);
    if (!stillActive && !legacy.some((l) => l.key === key)) {
      legacy.push({
        key,
        addonId: (a.addon_id as string) || matched.id || null,
        name: key,
        unitLabel: String(a.unit_label ?? "份"),
        pricePerUnit: num(a.price_per_unit),
        nights: PAID_ADDON_NIGHTS,
        minQuantity: 0,
        maxQuantity: null,
        originalQty: quantities[key],
        legacyOnly: true,
      });
    }
  }

  const active: AddonPlanRow[] = settings
    .filter((s) => s.enabled !== false)
    .map((s) => ({
      key: s.addon_type,
      addonId: s.id,
      name: s.addon_type,
      unitLabel: s.unit_label || "份",
      pricePerUnit: num(s.price_per_unit),
      nights: PAID_ADDON_NIGHTS,
      minQuantity: num(s.min_quantity),
      maxQuantity: num(s.max_quantity) > 0 ? num(s.max_quantity) : null,
      originalQty: quantities[s.addon_type] || 0,
      legacyOnly: false,
    }));

  return { quantities, preserved, rows: [...active, ...legacy] };
}

/** 單列小計（沿用既有公式，不重寫） */
export function planSubtotal(row: AddonPlanRow, qty: number): number {
  return row.pricePerUnit * Math.max(0, qty) * row.nights;
}

/** 全部方案合計（含 legacy 列） */
export function plansTotal(rows: AddonPlanRow[], quantities: Record<string, number>): number {
  return rows.reduce((sum, r) => sum + planSubtotal(r, quantities[r.key] || 0), 0);
}

/** −／＋ 的下一個數量（沿用 addonLabels 的既有規則） */
export function nextPlanQty(row: AddonPlanRow, current: number, delta: number): number {
  return delta > 0
    ? addonStepUp(current, row.minQuantity, row.maxQuantity ?? undefined)
    : addonStepDown(current, row.minQuantity);
}

/** 組回 custom_addon_details（可編輯方案 + 原樣保留項目），格式與既有畫面一致 */
export function buildAddonDetails(
  rows: AddonPlanRow[],
  quantities: Record<string, number>,
  preserved: AddonDetailRow[],
): AddonDetailRow[] {
  return [
    ...preserved,
    ...rows
      .filter((r) => (quantities[r.key] || 0) > 0)
      .map((r) => {
        const qty = quantities[r.key] || 0;
        return {
          addon_id: r.addonId ?? undefined,
          addon_type: r.key,
          count: qty,
          price_per_unit: r.pricePerUnit,
          total: planSubtotal(r, qty),
          unit_label: r.unitLabel,
        };
      }),
  ];
}

export interface PlanDiff {
  key: string;
  name: string;
  unitLabel: string;
  pricePerUnit: number;
  nights: number;
  beforeQty: number;
  afterQty: number;
  beforeSubtotal: number;
  afterSubtotal: number;
}

/** 逐項變更（增加／減少／清零皆列出） */
export function planDiffs(
  rows: AddonPlanRow[],
  quantities: Record<string, number>,
): PlanDiff[] {
  return rows
    .map((r) => {
      const after = quantities[r.key] || 0;
      return {
        key: r.key,
        name: r.name,
        unitLabel: r.unitLabel,
        pricePerUnit: r.pricePerUnit,
        nights: r.nights,
        beforeQty: r.originalQty,
        afterQty: after,
        beforeSubtotal: planSubtotal(r, r.originalQty),
        afterSubtotal: planSubtotal(r, after),
      };
    })
    .filter((d) => d.beforeQty !== d.afterQty);
}

/** 是否有任一方案數量被調整 */
export function hasPlanChanges(rows: AddonPlanRow[], quantities: Record<string, number>): boolean {
  return planDiffs(rows, quantities).length > 0;
}

/** 是否有方案被調降或清零（高風險） */
export function hasPlanReduction(rows: AddonPlanRow[], quantities: Record<string, number>): boolean {
  return planDiffs(rows, quantities).some((d) => d.afterQty < d.beforeQty);
}
