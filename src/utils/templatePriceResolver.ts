import { supabase } from "@/integrations/supabase/client";

/**
 * 共用的「專案價」解析器：
 * 規則：
 *  1) 若該 (room_type_id, date, pricing_template_id=templateId) 在 room_inventory_pricing
 *     有覆寫紀錄，使用該覆寫 price（最高優先）。
 *  2) 否則，若 template 有 weekday_price / weekend_price，依平假日使用對應價格。
 *  3) 否則，若 template.price 有值，使用 template.price。
 *  4) 最後 fallback 到 base row（pricing_template_id IS NULL）對應的價格欄位
 *     （依 template 名稱判斷 price / price_2_meals / price_3_meals）。
 */

export interface PricingTemplateLite {
  id: string;
  template_name?: string | null;
  project_name?: string | null;
  price?: number | null;
  weekday_price?: number | null;
  peak_price?: number | null;
  weekend_price?: number | null;
}

export type DayTier = "weekday" | "peak" | "weekend";

interface ResolveOptions {
  roomTypeId: string;
  template: PricingTemplateLite | null | undefined;
  dates: string[]; // YYYY-MM-DD
  /** 國定假日 YYYY-MM-DD 列表（可選）。若提供，將套用三段式（平日/旺日/假日）規則。 */
  publicHolidays?: string[];
  /** 向後兼容：兩段式 isWeekend 判斷。若同時提供 publicHolidays，以 publicHolidays 為主。 */
  isWeekendDate?: (d: Date) => boolean;
}

/**
 * 三段式日別分類：
 *  - weekday (平日): 週一至週四
 *  - peak    (旺日): 週五、週日
 *  - weekend (假日): 週六、國定假日
 */
export function classifyDayTier(date: Date, publicHolidays: Set<string>): DayTier {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const key = `${yyyy}-${mm}-${dd}`;
  if (publicHolidays.has(key)) return "weekend";
  const day = date.getDay(); // 0=Sun ... 6=Sat
  if (day === 6) return "weekend";
  if (day === 5 || day === 0) return "peak";
  return "weekday";
}

function getMealPriceColumn(template: PricingTemplateLite | null | undefined): "price" | "price_2_meals" | "price_3_meals" {
  if (!template) return "price";
  const name = template.template_name || template.project_name || "";
  if (name.includes("三食") || name.includes("3食")) return "price_3_meals";
  if (name.includes("二食") || name.includes("2食") || name.includes("兩食")) return "price_2_meals";
  return "price";
}

/**
 * 回傳 dateStr -> price (per room per night) 的 map。找不到價格的日期不會放入 map。
 */
export async function resolveTemplatePricesForDates(
  opts: ResolveOptions,
): Promise<Record<string, number>> {
  const { roomTypeId, template, dates, isWeekendDate } = opts;
  if (!dates.length) return {};

  // 1) 取得專案覆寫
  const overrideMap = new Map<string, number>();
  if (template?.id) {
    const { data: overrideRows } = await supabase
      .from("room_inventory_pricing")
      .select("date, price")
      .eq("room_type_id", roomTypeId)
      .eq("pricing_template_id", template.id)
      .in("date", dates);
    if (overrideRows) {
      for (const r of overrideRows) {
        if (r.price != null) overrideMap.set(r.date, r.price);
      }
    }
  }

  // 2) 找出尚未解決的日期
  const unresolved = dates.filter((d) => !overrideMap.has(d));

  // 3) 預設使用 template weekday/weekend/price 補齊
  const result: Record<string, number> = {};
  for (const d of dates) {
    if (overrideMap.has(d)) {
      result[d] = overrideMap.get(d)!;
    }
  }

  const hasTemplateWeekdayWeekend =
    template &&
    ((template.weekday_price != null && template.weekday_price > 0) ||
      (template.weekend_price != null && template.weekend_price > 0));

  const stillUnresolved: string[] = [];

  if (hasTemplateWeekdayWeekend) {
    const weekdayPrice = template!.weekday_price ?? template!.price ?? 0;
    const weekendPrice = template!.weekend_price ?? template!.price ?? weekdayPrice;
    for (const d of unresolved) {
      const dt = new Date(d + "T00:00:00");
      result[d] = isWeekendDate(dt) ? weekendPrice : weekdayPrice;
    }
  } else if (template && template.price != null && template.price > 0) {
    for (const d of unresolved) {
      result[d] = template.price;
    }
  } else {
    stillUnresolved.push(...unresolved);
  }

  // 4) 最終 fallback：查 base row
  if (stillUnresolved.length > 0) {
    const priceColumn = getMealPriceColumn(template);
    const { data: baseRows } = await supabase
      .from("room_inventory_pricing")
      .select("date, price, price_2_meals, price_3_meals")
      .eq("room_type_id", roomTypeId)
      .is("pricing_template_id", null)
      .in("date", stillUnresolved);

    if (baseRows) {
      for (const r of baseRows) {
        const selected = (r as any)[priceColumn];
        const v = selected != null && selected > 0 ? selected : r.price;
        if (v != null) result[r.date] = v;
      }
    }
  }

  return result;
}
