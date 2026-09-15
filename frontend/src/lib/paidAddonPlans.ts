/**
 * 已付款訂單「加購方案」編輯 — 純資料組裝，不做任何寫入。
 *
 * v5.5A.3 起：單價、計價倍數、小計與 legacy 合併一律由後端
 * public.update_paid_order_addons_v3 依 addon_settings 決定。
 * 本檔僅負責「畫面顯示」與「送出 addon_id + quantity」，
 * 顯示用的單價／倍數同樣取自 addon_settings（不硬編、不重寫公式）。
 */

import { addonStepDown, addonStepUp } from "@/lib/addonLabels";
import { resolveAddonSetting } from "@/lib/addonAliases";

/** v5.5A.3 後端已可安全處理方案數量調整 */
export const PAID_ADDON_PLAN_RPC_SUPPORTED = true;

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

/** 既有明細逐筆快照（僅供顯示與差異判定） */
export interface StoredLine {
  quantity: number | null;
  pricePerUnit: number | null;
  multiplier: number | null;
  subtotal: number | null;
}

export interface AddonPlanRow {
  key: string;
  addonId: string | null;
  name: string;
  unitLabel: string;
  /** 目前 addon_settings 單價 */
  pricePerUnit: number;
  pricingMode: string | null;
  /** 目前計價倍數：per_stay → 1、per_night → 住宿晚數；未知 → null */
  multiplier: number | null;
  minQuantity: number;
  maxQuantity: number | null;
  originalQty: number;
  /** 既有明細筆數（>1 表示送出後會被後端合併為一筆） */
  lines: number;
  storedLines: StoredLine[];
  /** 已停用但訂單原本就有的方案：仍顯示、仍計入，但不可調整 */
  legacyOnly: boolean;
}

export interface ParsedOrderAddons {
  quantities: Record<string, number>;
  /** 對應不到任何設定的明細 → 原樣保留（後端也會逐字保留） */
  preserved: AddonDetailRow[];
  rows: AddonPlanRow[];
}

const num = (v: unknown) => Number(v ?? 0) || 0;

const intOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n !== Math.trunc(n)) return null;
  return n;
};

/** 依 addon_settings 的 pricing_mode 決定倍數（與後端相同：僅 per_stay / per_night） */
export function currentMultiplier(pricingMode: string | null | undefined, nights: number): number | null {
  if (pricingMode === "per_stay") return 1;
  if (pricingMode === "per_night") return Math.max(1, Math.trunc(nights) || 1);
  return null;
}

/** 反推歷史倍數（與後端相同：total / (price × count) 需整除） */
function inferMultiplier(qty: number | null, price: number | null, total: number | null): number | null {
  if (!qty || !price || !total) return null;
  const base = price * qty;
  if (base <= 0 || total % base !== 0) return null;
  const m = total / base;
  return m >= 1 ? m : null;
}

/**
 * 以訂單既有 custom_addon_details + 館別 addon_settings 組出可編輯的方案列。
 * - 現行啟用方案：一律列出（數量可能為 0）
 * - 已停用但訂單存在的方案：以訂單快照顯示，標記 legacyOnly（不消失、不可調整）
 * - malformed / 對不到 → preserved，原樣保留
 */
export function parseOrderAddons(
  settings: AddonSettingRow[],
  customAddonDetails: unknown,
  nights = 1,
): ParsedOrderAddons {
  const quantities: Record<string, number> = {};
  const preserved: AddonDetailRow[] = [];
  const legacy: AddonPlanRow[] = [];
  const storedByKey: Record<string, StoredLine[]> = {};
  const list = Array.isArray(customAddonDetails) ? (customAddonDetails as any[]) : [];

  for (const a of list) {
    if (!a || typeof a !== "object" || !a.addon_type || !(num(a.count) > 0)) {
      if (a && typeof a === "object") preserved.push(a as AddonDetailRow);
      continue;
    }
    const matched = resolveAddonSetting(a, settings as any);
    if (!matched) {
      preserved.push(a as AddonDetailRow);
      continue;
    }
    const key = matched.addon_type;
    quantities[key] = (quantities[key] || 0) + num(a.count);
    const qty = intOrNull(a.count);
    const price = intOrNull(a.price_per_unit);
    const total = intOrNull(a.total);
    const line: StoredLine = {
      quantity: qty,
      pricePerUnit: price,
      multiplier: inferMultiplier(qty, price, total),
      subtotal: total,
    };
    storedByKey[key] = [...(storedByKey[key] || []), line];

    const stillActive = settings.some((s) => s.addon_type === key && s.enabled !== false);
    if (!stillActive && !legacy.some((l) => l.key === key)) {
      legacy.push({
        key,
        addonId: (a.addon_id as string) || matched.id || null,
        name: key,
        unitLabel: String(a.unit_label ?? "份"),
        pricePerUnit: num(a.price_per_unit),
        pricingMode: null,
        multiplier: null,
        minQuantity: 0,
        maxQuantity: null,
        originalQty: 0,
        lines: 0,
        storedLines: [],
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
      pricingMode: s.pricing_mode ?? null,
      multiplier: currentMultiplier(s.pricing_mode, nights),
      minQuantity: num(s.min_quantity),
      maxQuantity: num(s.max_quantity) > 0 ? num(s.max_quantity) : null,
      originalQty: quantities[s.addon_type] || 0,
      lines: (storedByKey[s.addon_type] || []).length,
      storedLines: storedByKey[s.addon_type] || [],
      legacyOnly: false,
    }));

  const legacyFilled = legacy.map((l) => ({
    ...l,
    originalQty: quantities[l.key] || 0,
    lines: (storedByKey[l.key] || []).length,
    storedLines: storedByKey[l.key] || [],
  }));

  return { quantities, preserved, rows: [...active, ...legacyFilled] };
}

/** 顯示用小計：目前單價 × 數量 × 目前倍數（後端為最終依據） */
export function planSubtotal(row: AddonPlanRow, qty: number): number {
  return row.pricePerUnit * Math.max(0, qty) * (row.multiplier ?? 1);
}

/** 顯示用：既有明細小計合計（後端 before 值口徑） */
export function planStoredSubtotal(row: AddonPlanRow): number {
  return row.storedLines.reduce((s, l) => s + (l.subtotal ?? 0), 0);
}

export function plansTotal(rows: AddonPlanRow[], quantities: Record<string, number>): number {
  return rows.reduce(
    (sum, r) =>
      sum + (r.legacyOnly ? planStoredSubtotal(r) : planSubtotal(r, quantities[r.key] || 0)),
    0,
  );
}

/** −／＋ 的下一個數量（沿用 addonLabels 的既有規則） */
export function nextPlanQty(row: AddonPlanRow, current: number, delta: number): number {
  return delta > 0
    ? addonStepUp(current, row.minQuantity, row.maxQuantity ?? undefined)
    : addonStepDown(current, row.minQuantity);
}

export interface PlanDiff {
  key: string;
  addonId: string | null;
  name: string;
  unitLabel: string;
  beforeQty: number;
  afterQty: number;
  beforePricePerUnit: number | null;
  afterPricePerUnit: number;
  beforeMultiplier: number | null;
  afterMultiplier: number | null;
  beforeSubtotal: number;
  afterSubtotal: number;
  merged: boolean;
  priceChanged: boolean;
}

const uniq = (vals: (number | null)[]) => Array.from(new Set(vals));

/** 逐項變更（僅列出數量實際改變的方案；停用方案永遠不可調整） */
export function planDiffs(
  rows: AddonPlanRow[],
  quantities: Record<string, number>,
): PlanDiff[] {
  return rows
    .filter((r) => !r.legacyOnly)
    .map((r) => {
      const after = quantities[r.key] || 0;
      const prices = uniq(r.storedLines.map((l) => l.pricePerUnit));
      const mults = uniq(r.storedLines.map((l) => l.multiplier));
      const priceChanged =
        after > 0 &&
        r.storedLines.some(
          (l) => l.pricePerUnit !== r.pricePerUnit || l.multiplier !== r.multiplier,
        );
      return {
        key: r.key,
        addonId: r.addonId,
        name: r.name,
        unitLabel: r.unitLabel,
        beforeQty: r.originalQty,
        afterQty: after,
        beforePricePerUnit: prices.length === 1 ? prices[0] : null,
        afterPricePerUnit: r.pricePerUnit,
        beforeMultiplier: mults.length === 1 ? mults[0] : null,
        afterMultiplier: r.multiplier,
        beforeSubtotal: planStoredSubtotal(r),
        afterSubtotal: planSubtotal(r, after),
        merged: r.lines > 1,
        priceChanged,
      };
    })
    .filter((d) => d.beforeQty !== d.afterQty);
}

export function hasPlanChanges(rows: AddonPlanRow[], quantities: Record<string, number>): boolean {
  return planDiffs(rows, quantities).length > 0;
}

export function hasPlanReduction(rows: AddonPlanRow[], quantities: Record<string, number>): boolean {
  return planDiffs(rows, quantities).some((d) => d.afterQty < d.beforeQty);
}

/** 是否有舊明細會被合併為一筆 */
export function hasPlanMerge(rows: AddonPlanRow[], quantities: Record<string, number>): boolean {
  return planDiffs(rows, quantities).some((d) => d.merged);
}

/** 是否需要「改用目前單價／計價方式」的明確確認 */
export function needsPriceChangeAck(
  rows: AddonPlanRow[],
  quantities: Record<string, number>,
): boolean {
  return planDiffs(rows, quantities).some((d) => d.priceChanged);
}

/**
 * 送給後端的方案指令：只含 addon_id 與 quantity，且只包含「數量真的改變」的方案。
 * 不含單價、小計、倍數、pricing_mode 或任何金額欄位。
 */
export function buildAddonPlansPayload(
  rows: AddonPlanRow[],
  quantities: Record<string, number>,
): Array<{ addon_id: string; quantity: number }> {
  return planDiffs(rows, quantities)
    .filter((d) => !!d.addonId)
    .map((d) => ({ addon_id: d.addonId as string, quantity: d.afterQty }));
}

/** 顯示用預估加購方案總額（後端仍會重算） */
export function estimatedPlansTotal(
  rows: AddonPlanRow[],
  quantities: Record<string, number>,
): number {
  return plansTotal(rows, quantities);
}

/**
 * 顯示用：組出「預估」的加購明細陣列，只用於核對頁金額預估。
 * 實際寫入的明細一律由 update_paid_order_addons_v3 產生，本函式不會被送到後端。
 */
export function buildEstimatedAddonDetails(
  rows: AddonPlanRow[],
  quantities: Record<string, number>,
  preserved: AddonDetailRow[],
): AddonDetailRow[] {
  return [
    ...preserved,
    ...rows
      .map((r) => {
        const qty = r.legacyOnly ? r.originalQty : quantities[r.key] || 0;
        return {
          addon_id: r.addonId ?? undefined,
          addon_type: r.key,
          count: qty,
          price_per_unit: r.pricePerUnit,
          total: r.legacyOnly ? planStoredSubtotal(r) : planSubtotal(r, qty),
          unit_label: r.unitLabel,
        };
      })
      .filter((d) => d.count > 0),
  ];
}
