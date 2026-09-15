// Pure (no-DB) computation half of templatePriceResolver.ts.
// Kept in its own file so both the DB-backed frontend wrapper and Deno edge
// function tests can share exactly the same math.
//
// Behaviour must remain 1:1 with the original templatePriceResolver.ts logic
// (getMealPriceColumn / classifyDayTier / tier fallback + segments overrides
// + base-row meal-column fallback).

import {
  getRoomOverride,
  isTierSellable,
  hasSegments,
  getTierForDate,
} from "./pricingTemplateHelpers.ts";

export interface PricingTemplateLite {
  id: string;
  template_name?: string | null;
  project_name?: string | null;
  price?: number | null;
  weekday_price?: number | null;
  peak_price?: number | null;
  weekend_price?: number | null;
  room_overrides?: any;
  season_segments?: any;
}

export type DayTier = "weekday" | "peak" | "weekend";

/** 依範本名稱決定要從 base row 讀哪個餐型欄位。 */
export function getMealPriceColumn(
  template: PricingTemplateLite | null | undefined,
): "price" | "price_2_meals" | "price_3_meals" {
  if (!template) return "price";
  const name = template.template_name || template.project_name || "";
  if (name.includes("三食") || name.includes("3食")) return "price_3_meals";
  if (name.includes("二食") || name.includes("2食") || name.includes("兩食")) return "price_2_meals";
  return "price";
}

export function classifyDayTier(date: Date, publicHolidays: Set<string>): DayTier {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const key = `${yyyy}-${mm}-${dd}`;
  if (publicHolidays.has(key)) return "weekend";
  const day = date.getDay();
  if (day === 6) return "weekend";
  if (day === 5 || day === 0) return "peak";
  return "weekday";
}

export interface OverrideRowLite {
  date: string;
  price: number | null;
}
export interface BaseRowLite {
  date: string;
  price: number | null;
  price_2_meals?: number | null;
  price_3_meals?: number | null;
}

export interface ResolvePureOptions {
  roomTypeId: string;
  template: PricingTemplateLite | null | undefined;
  dates: string[];
  overrideRows?: OverrideRowLite[];
  baseRows?: BaseRowLite[];
  publicHolidays?: string[];
  isWeekendDate?: (d: Date) => boolean;
}

/**
 * 純函式版：與 resolveTemplatePricesForDates 完全相同語意，
 * 但把 DB 讀取換成呼叫端傳入的 overrideRows / baseRows。
 */
export function resolveTemplatePricesFromRows(
  opts: ResolvePureOptions,
): Record<string, number> {
  const { roomTypeId, template, dates, overrideRows, baseRows, publicHolidays, isWeekendDate } = opts;
  if (!dates.length) return {};

  const overrideMap = new Map<string, number>();
  for (const r of overrideRows ?? []) {
    if (r.price != null) overrideMap.set(r.date, r.price);
  }

  const result: Record<string, number> = {};
  for (const d of dates) {
    if (overrideMap.has(d)) result[d] = overrideMap.get(d)!;
  }
  const unresolved = dates.filter((d) => !overrideMap.has(d));

  const holidaySet = new Set(publicHolidays ?? []);
  const useThreeTier =
    !!publicHolidays || (template?.peak_price != null && template.peak_price > 0);

  const tierFor = (d: string): DayTier => {
    const dt = new Date(d + "T00:00:00");
    if (useThreeTier) return classifyDayTier(dt, holidaySet);
    if (isWeekendDate && isWeekendDate(dt)) return "weekend";
    return "weekday";
  };

  const override = template ? getRoomOverride(template as any, roomTypeId) : null;
  const overrideWeekday = override?.weekday_price ?? null;
  const overridePeak = override?.peak_price ?? null;
  const overrideWeekend = override?.weekend_price ?? null;

  const useSegments = template && hasSegments(template as any);

  const hasTemplateTierPrices =
    template &&
    (useSegments ||
      (template.weekday_price != null && template.weekday_price > 0) ||
      (template.peak_price != null && template.peak_price > 0) ||
      (template.weekend_price != null && template.weekend_price > 0) ||
      overrideWeekday != null || overridePeak != null || overrideWeekend != null);

  const stillUnresolved: string[] = [];

  if (hasTemplateTierPrices) {
    const weekdayPrice = overrideWeekday ?? template!.weekday_price ?? template!.price ?? 0;
    const weekendPrice = overrideWeekend ?? template!.weekend_price ?? template!.price ?? weekdayPrice;
    const peakPrice =
      overridePeak ??
      template!.peak_price ??
      (template!.weekday_price != null ? template!.weekday_price : weekendPrice);

    for (const d of unresolved) {
      const tier = tierFor(d);
      if (useSegments) {
        const info = getTierForDate(template as any, roomTypeId, d, tier);
        if (!info.enabled || info.price == null || info.price <= 0) {
          stillUnresolved.push(d);
          continue;
        }
        result[d] = info.price;
        continue;
      }
      if (template && !isTierSellable(template as any, roomTypeId, tier)) {
        stillUnresolved.push(d);
        continue;
      }
      result[d] = tier === "weekend" ? weekendPrice : tier === "peak" ? peakPrice : weekdayPrice;
    }
  } else if (template && template.price != null && template.price > 0) {
    for (const d of unresolved) result[d] = template.price;
  } else {
    stillUnresolved.push(...unresolved);
  }

  if (stillUnresolved.length > 0 && baseRows && baseRows.length > 0) {
    const priceColumn = getMealPriceColumn(template);
    const byDate = new Map(baseRows.map((r) => [r.date, r]));
    for (const d of stillUnresolved) {
      const r = byDate.get(d);
      if (!r) continue;
      const selected = (r as any)[priceColumn];
      const v = selected != null && selected > 0 ? selected : r.price;
      if (v != null) result[d] = v;
    }
  }

  return result;
}
