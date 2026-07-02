import { supabase } from "@/integrations/supabase/client";
import {
  resolveTemplatePricesFromRows,
  getMealPriceColumn,
  classifyDayTier,
  type PricingTemplateLite,
  type DayTier,
} from "./templatePriceResolverPure";

export type { PricingTemplateLite, DayTier };
export { getMealPriceColumn, classifyDayTier };

interface ResolveOptions {
  roomTypeId: string;
  template: PricingTemplateLite | null | undefined;
  dates: string[];
  publicHolidays?: string[];
  isWeekendDate?: (d: Date) => boolean;
}

/**
 * DB-backed 版：與過去介面保持不變。
 * 內部把「解析」邏輯委派給純函式 resolveTemplatePricesFromRows。
 */
export async function resolveTemplatePricesForDates(
  opts: ResolveOptions,
): Promise<Record<string, number>> {
  const { roomTypeId, template, dates, publicHolidays, isWeekendDate } = opts;
  if (!dates.length) return {};

  // 1) 專案覆寫 rows
  let overrideRows: { date: string; price: number | null }[] = [];
  if (template?.id) {
    const { data } = await supabase
      .from("room_inventory_pricing")
      .select("date, price")
      .eq("room_type_id", roomTypeId)
      .eq("pricing_template_id", template.id)
      .in("date", dates);
    overrideRows = (data ?? []).map((r) => ({ date: r.date, price: r.price }));
  }

  // 2) base row rows（fallback）
  const { data: baseData } = await supabase
    .from("room_inventory_pricing")
    .select("date, price, price_2_meals, price_3_meals")
    .eq("room_type_id", roomTypeId)
    .is("pricing_template_id", null)
    .in("date", dates);
  const baseRows = (baseData ?? []).map((r: any) => ({
    date: r.date,
    price: r.price,
    price_2_meals: r.price_2_meals,
    price_3_meals: r.price_3_meals,
  }));

  return resolveTemplatePricesFromRows({
    roomTypeId,
    template,
    dates,
    overrideRows,
    baseRows,
    publicHolidays,
    isWeekendDate,
  });
}
