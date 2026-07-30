import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MonthPicker } from "@/components/ui/month-picker";
import { Banknote, TrendingUp, Percent, Megaphone, Wallet, CalendarClock, ArrowRight, Info, Globe, CreditCard, Headphones, Sparkles, Megaphone as MegaphoneIcon, ShieldCheck, Calendar as CalendarIcon, Bot, ChevronDown, ChevronRight, ExternalLink, ShoppingBag, Settings, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, startOfMonth, endOfMonth, addDays, differenceInDays, parseISO, addMonths } from "date-fns";
import { zhTW } from "date-fns/locale";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import { getOrderStatusLabel, getOrderSourceConfig, getHotelnabeOtaCode, getOrderOtaCode } from "@/utils/orderHelpers";
import {
  computeOwnerSettlementRows,
  computeGuestCountRows,
  computeGuestCountTotals,
  getRevenueBreakdownType,
  resolvePricingRule,
  resolveMarketingFee,
  getStandardThresholdBase,
  getGuestCountThresholdBase,
  pricingRuleFromLegacyConfig,
  PREMIUM_SHARE_PER_GUEST,
  type RevenueBreakdownType,
  type AccommodationCurrencyFallback,
  type OwnerPricingRule,
} from "@/lib/ownerSettlement";

import { getCurrencySymbol } from "@/lib/currency";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const MEAL_PLAN_LABEL: Record<string, string> = {
  no_meal: "不含餐",
  breakfast: "含早餐",
  "2_meals": "一泊二食",
  "3_meals": "三餐（早午晚）",
  custom: "客製餐型",
};

interface Order {
  id: string;
  order_number: string;
  guest_name: string;
  check_in_date: string;
  check_out_date: string;
  total_price: number;
  discount_amount: number;
  final_price: number;
  meal_plan_total: number | null;
  meal_plan: string | null;
  meal_plan_details: any;
  order_status: string;
  order_source: string;
  owner_direct: boolean;
  room_type_id: string | null;
  guest_count: number | null;
  custom_addon_details: unknown;
  exchange_rate_snapshot: number | null;
  currency_at_booking: string | null;
}

interface SettlementConfig {
  commission_rate: number;
  marketing_fee_base: number;
  marketing_fee_per_extra_property: number;
  exempt_order_sources: string[];
  revenue_breakdown_type: RevenueBreakdownType;
}

interface RoomTypePricing {
  id: string;
  base_price: number;
  price_2_meals: number | null;
  price_3_meals: number | null;
}

interface OrderRow {
  order: Order;
  nightsInMonth: number;
  totalNights: number;
  monthRatio: number;
  monthFinal: number;
  monthFood: number;
  monthDiscount: number;
  monthCommissionable: number;
  commission: number;
  exempt: boolean;
  currency: string;
  exchangeRate: number;
  isForeign: boolean;
  monthFinalOriginal: number;
}


interface AddonSaleRow {
  id: string;
  sale_date: string;
  item_name: string;
  category: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  notes: string | null;
  related_order_id: string | null;
  related_order_number?: string | null;
}

const fmt = (n: number) => Math.round(n).toLocaleString("zh-TW");


export default function OwnerSettlement() {
  const { currentAccommodationId } = useAccommodation();
  const [monthStr, setMonthStr] = useState<string>(format(new Date(), "yyyy-MM"));
  const month = useMemo(() => startOfMonth(parseISO(monthStr + "-01")), [monthStr]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomTypePricing[]>([]);
  const [addonTotal, setAddonTotal] = useState(0);
  const [addonCount, setAddonCount] = useState(0);
  const [addonFeePct, setAddonFeePct] = useState(0);
  const [addonItems, setAddonItems] = useState<AddonSaleRow[]>([]);

  const [config, setConfig] = useState<SettlementConfig>({
    commission_rate: 15,
    marketing_fee_base: 53000,
    marketing_fee_per_extra_property: 3000,
    exempt_order_sources: [],
    revenue_breakdown_type: "standard",
  });
  const [propertyCount, setPropertyCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mealTemplateMap, setMealTemplateMap] = useState<Record<string, string>>({});
  // 館別幣別現值（訂單快照為 null 時的 fallback）
  const [accCurrency, setAccCurrency] = useState<AccommodationCurrencyFallback | null>(null);
  // 匯率快照編輯
  const [rateEdit, setRateEdit] = useState<{ orderId: string; value: string } | null>(null);
  const [rateConfirmOrderId, setRateConfirmOrderId] = useState<string | null>(null);
  const [savingRate, setSavingRate] = useState(false);



  useEffect(() => {
    if (!currentAccommodationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);

      const monthStart = format(startOfMonth(month), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(month), "yyyy-MM-dd");

      const [ordersRes, roomTypesRes, configRes, accRes, templatesRes, addonRes, splitRuleRes] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, order_number, guest_name, check_in_date, check_out_date, total_price, discount_amount, final_price, meal_plan_total, meal_plan, meal_plan_details, order_status, order_source, owner_direct, room_type_id, guest_count, custom_addon_details, exchange_rate_snapshot, currency_at_booking"
          )
          .eq("accommodation_id", currentAccommodationId)
          .neq("order_status", "cancelled")
          .lt("check_in_date", format(addDays(endOfMonth(month), 1), "yyyy-MM-dd"))
          .gt("check_out_date", monthStart),
        supabase
          .from("room_types")
          .select("id, price, price_2_meals, price_3_meals")
          .eq("accommodation_id", currentAccommodationId),
        supabase
          .from("system_settings")
          .select("setting_key, setting_value")
          .in("setting_key", [`owner_settlement_config:${currentAccommodationId}`, "owner_settlement_config"]),
        supabase.from("accommodation_info").select("building_count, secondary_currency, secondary_currency_rate").eq("id", currentAccommodationId).maybeSingle(),
        supabase
          .from("pricing_templates")
          .select("id, template_name, project_name")
          .eq("accommodation_id", currentAccommodationId),
        supabase
          .from("addon_sales")
          .select("id, sale_date, item_name, category, quantity, unit_price, total_amount, notes, related_order_id")
          .eq("accommodation_id", currentAccommodationId)
          .gte("sale_date", monthStart)
          .lte("sale_date", monthEnd)
          .order("sale_date", { ascending: true }),

        supabase
          .from("split_rules")
          .select("addon_fee_percentage")
          .eq("accommodation_id", currentAccommodationId)
          .eq("is_active", true)
          .lte("effective_from", monthEnd)
          .or(`effective_to.is.null,effective_to.gte.${monthStart}`)
          .order("effective_from", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);


      if (cancelled) return;

      setOrders((ordersRes.data || []) as Order[]);
      setRoomTypes(
        (roomTypesRes.data || []).map((r: any) => ({
          id: r.id,
          base_price: r.price ?? 0,
          price_2_meals: r.price_2_meals,
          price_3_meals: r.price_3_meals,
        }))
      );
      const cfgRows = (configRes.data ?? []) as Array<{ setting_key: string; setting_value: any }>;
      const perAccCfg = cfgRows.find((r) => r.setting_key === `owner_settlement_config:${currentAccommodationId}`);
      const globalCfg = cfgRows.find((r) => r.setting_key === "owner_settlement_config");
      const rawCfg = (perAccCfg ?? globalCfg)?.setting_value as any;
      if (rawCfg) {
        setConfig({
          commission_rate: rawCfg.commission_rate ?? 15,
          marketing_fee_base: rawCfg.marketing_fee_base ?? 53000,
          marketing_fee_per_extra_property: rawCfg.marketing_fee_per_extra_property ?? 3000,
          exempt_order_sources: Array.isArray(rawCfg.exempt_order_sources) ? rawCfg.exempt_order_sources : [],
          revenue_breakdown_type: getRevenueBreakdownType(rawCfg),
        });
      }
      setPropertyCount((accRes.data as any)?.building_count ?? 1);
      setAccCurrency({
        secondary_currency: (accRes.data as any)?.secondary_currency ?? null,
        secondary_currency_rate: (accRes.data as any)?.secondary_currency_rate ?? null,
      });
      const tmap: Record<string, string> = {};
      (templatesRes.data || []).forEach((t: any) => {
        tmap[t.id] = t.template_name || t.project_name || t.id;
      });
      setMealTemplateMap(tmap);
      const addonRows = (addonRes.data || []) as AddonSaleRow[];
      setAddonTotal(addonRows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0));
      setAddonCount(addonRows.length);
      setAddonFeePct(Number((splitRuleRes.data as any)?.addon_fee_percentage) || 0);

      // 解析關聯訂單編號
      const relatedIds = Array.from(new Set(addonRows.map((r) => r.related_order_id).filter(Boolean) as string[]));
      let numberMap: Record<string, string> = {};
      if (relatedIds.length) {
        const { data: relOrders } = await supabase
          .from("orders")
          .select("id, order_number")
          .in("id", relatedIds);
        for (const o of (relOrders || []) as any[]) numberMap[o.id] = o.order_number;
      }
      if (cancelled) return;
      setAddonItems(
        addonRows.map((r) => ({
          ...r,
          related_order_number: r.related_order_id ? numberMap[r.related_order_id] ?? null : null,
        }))
      );
      setLoading(false);


    })();
    return () => {
      cancelled = true;
    };
  }, [currentAccommodationId, month]);

  const rows: OrderRow[] = useMemo(() => {
    const computed = computeOwnerSettlementRows(orders, config, month, accCurrency);
    return computed
      .map((r) => ({
        order: r.order as Order,
        nightsInMonth: r.nightsInMonth,
        totalNights: r.totalNights,
        monthRatio: r.monthRatio,
        monthFinal: r.monthFinal,
        monthFood: 0,
        monthDiscount: r.monthDiscount,
        monthCommissionable: r.monthCommissionable,
        commission: r.commission,
        exempt: r.exempt,
        currency: r.currency,
        exchangeRate: r.exchangeRate,
        isForeign: r.isForeign,
        monthFinalOriginal: r.monthFinalOriginal,
      }))
      .sort((a, b) => a.order.check_in_date.localeCompare(b.order.check_in_date));
  }, [orders, month, config.commission_rate, config.exempt_order_sources, accCurrency]);


  const totals = useMemo(() => {
    const totalRevenue = rows.reduce((s, r) => s + r.monthFinal, 0);
    const totalFood = rows.reduce((s, r) => s + r.monthFood, 0);
    const totalCommissionable = rows.reduce((s, r) => s + r.monthCommissionable, 0);
    const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
    const marketingFee =
      config.marketing_fee_base +
      Math.max(0, propertyCount - 1) * config.marketing_fee_per_extra_property;
    // 原價：基本服務 + 每棟星鏈包專案 98,800
    const marketingFeeOriginal = config.marketing_fee_base + 98800 * Math.max(1, propertyCount);
    // 購物商品收入不列入平台抽成，全額歸業主
    const addonCommission = 0;
    const addonNet = addonTotal;
    const ownerNet = totalRevenue - totalCommission - marketingFee + addonNet;
    return { totalRevenue, totalFood, totalCommissionable, totalCommission, marketingFee, marketingFeeOriginal, ownerNet, addonTotal, addonCommission, addonNet };
  }, [rows, config, propertyCount, addonTotal]);


  const isGuestCount = config.revenue_breakdown_type === "guestcount";

  const gcRows = useMemo(
    () => (isGuestCount ? computeGuestCountRows(orders as any[], config as any, month, accCurrency) : []),
    [isGuestCount, orders, config, month, accCurrency]
  );

  const gcTotals = useMemo(() => computeGuestCountTotals(gcRows as any), [gcRows]);
  const gcCrossMonthOrders = useMemo(
    () => gcRows.filter((r: any) => r.isCrossMonth).map((r: any) => r.order.order_number as string),
    [gcRows]
  );

  const gcRowByOrderId = useMemo(() => {
    const m: Record<string, any> = {};
    for (const r of gcRows as any[]) m[r.order.id] = r;
    return m;
  }, [gcRows]);

  /**
   * 訂單明細表格的統一資料源：
   * - guestcount 型：直接迭代 gcRows（篩選 = check_in_date 落在本月）
   * - standard 型：維持原本的 rows（依本月夜數攤分）
   */
  const tableRows = useMemo(() => {
    if (isGuestCount) {
      return (gcRows as any[])
        .map((g) => ({
          id: g.order.id as string,
          order: g.order as Order,
          gc: g,
          std: null as OrderRow | null,
          revenue: g.finalPrice as number,
          revenueOriginal: g.finalPriceOriginal as number,
          // 訂單金額 = final_price 換算台幣後總額（非台幣訂單為 ÷ 匯率快照後金額）
          orderAmount: g.finalPrice as number,
          commission: (g.commission + g.premiumShare) as number,
          exempt: g.exempt as boolean,
          currency: g.currency as string,
          exchangeRate: g.exchangeRate as number,
          isForeign: g.isForeign as boolean,
        }))
        .sort((a, b) => a.order.check_in_date.localeCompare(b.order.check_in_date));
    }
    return rows.map((r) => ({
      id: r.order.id,
      order: r.order,
      gc: null as any,
      std: r as OrderRow | null,
      revenue: r.monthFinal,
      revenueOriginal: r.monthFinalOriginal,
      orderAmount: r.monthCommissionable,
      commission: r.commission,
      exempt: r.exempt,
      currency: r.currency,
      exchangeRate: r.exchangeRate,
      isForeign: r.isForeign,
    }));
  }, [isGuestCount, gcRows, rows]);

  /** 頁面總計：guestcount 型改吃 gcTotals */
  const summary = useMemo(() => {
    if (isGuestCount) {
      return {
        totalRevenue: gcTotals.totalRevenue,
        platformTotal: gcTotals.totalPlatformFee,
        totalCommission: gcTotals.totalCommission,
        marketingFee: 0,
        ownerNet: gcTotals.ownerNet,
        orderCount: gcRows.length,
        totalNights: null as number | null,
      };
    }
    return {
      totalRevenue: totals.totalRevenue,
      platformTotal: totals.totalCommission + totals.marketingFee,
      totalCommission: totals.totalCommission,
      marketingFee: totals.marketingFee,
      ownerNet: totals.ownerNet,
      orderCount: rows.length,
      totalNights: rows.reduce((s, r) => s + r.nightsInMonth, 0) as number | null,
    };
  }, [isGuestCount, gcTotals, gcRows, totals, rows]);


  /** 彙總範圍內的外幣資訊：全部同一外幣時才顯示換算式 */
  const foreignSummary = useMemo(() => {
    const source: Array<{ isForeign: boolean; currency: string; exchangeRate: number; original: number }> =
      isGuestCount
        ? (gcRows as any[]).map((r) => ({
            isForeign: r.isForeign,
            currency: r.currency,
            exchangeRate: r.exchangeRate,
            original: r.finalPriceOriginal,
          }))
        : rows.map((r) => ({
            isForeign: r.isForeign,
            currency: r.currency,
            exchangeRate: r.exchangeRate,
            original: r.monthFinalOriginal,
          }));
    const foreign = source.filter((s) => s.isForeign);
    if (!foreign.length) return null;
    const codes = new Set(foreign.map((f) => f.currency));
    const rates = new Set(foreign.map((f) => f.exchangeRate));
    if (codes.size !== 1 || rates.size !== 1) return null;
    return {
      currency: foreign[0].currency,
      rate: foreign[0].exchangeRate,
      original: foreign.reduce((s, f) => s + f.original, 0),
      allForeign: foreign.length === source.length,
    };
  }, [isGuestCount, gcRows, rows]);

  /** 加購項目（guestcount）外幣加總 */
  const gcAddonForeignOriginal = useMemo(
    () => (gcRows as any[]).filter((r) => r.isForeign).reduce((s, r) => s + (r.addonTotalOriginal || 0), 0),
    [gcRows]
  );

  const handleSaveRate = async () => {
    if (!rateEdit) return;
    const num = Number(rateEdit.value);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("匯率必須為大於 0 的數字");
      return;
    }
    setSavingRate(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ exchange_rate_snapshot: num } as any)
        .eq("id", rateEdit.orderId);
      if (error) throw error;
      setOrders((prev) =>
        prev.map((o) => (o.id === rateEdit.orderId ? { ...o, exchange_rate_snapshot: num } : o))
      );
      toast.success("匯率快照已更新");
      setRateConfirmOrderId(null);
      setRateEdit(null);
    } catch (err: any) {
      toast.error("更新失敗", { description: err.message });
    } finally {
      setSavingRate(false);
    }
  };


  const monthLabel = format(month, "yyyy 年 M 月", { locale: zhTW });
  const monthShort = format(month, "M 月", { locale: zhTW });
  const paymentDueDate = format(addMonths(month, 1), "yyyy/MM/10");

  const exportPdf = () => {
    const esc = (s: any) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
    const orderRowsHtml = tableRows
      .map(
        (r) => `<tr>
          <td>${esc(r.order.order_number)}</td>
          <td>${esc(r.order.guest_name)}</td>
          <td>${esc(r.order.check_in_date)} → ${esc(r.order.check_out_date)}</td>
          ${isGuestCount ? "" : `<td class="r">${r.std!.nightsInMonth}/${r.std!.totalNights}</td>`}
          <td class="r">${isGuestCount && r.isForeign ? `${getCurrencySymbol(r.currency)}${fmt(r.revenueOriginal)}` : fmt(r.revenue)}</td>
          ${isGuestCount ? `<td class="r">${fmt(r.orderAmount)}</td>` : ""}
          <td class="r">${r.exempt ? "不抽成" : "-" + fmt(r.commission)}</td>
        </tr>`
      )
      .join("");


    const addonRowsHtml = addonItems
      .map(
        (a) => `<tr>
          <td>${esc(a.sale_date)}</td>
          <td>${esc(a.category || "—")}</td>
          <td>${esc(a.item_name)}</td>
          <td class="r">${a.quantity}</td>
          <td class="r">${fmt(Number(a.unit_price) || 0)}</td>
          <td class="r">${fmt(Number(a.total_amount) || 0)}</td>
          <td>${esc(a.related_order_number || "—")}</td>
          <td>${esc(a.notes || "")}</td>
        </tr>`
      )
      .join("");

    const html = `<html><head><meta charset="utf-8"><title>業主收益報告 ${esc(monthLabel)}</title>
      <style>
        body{font-family:"Noto Sans TC",sans-serif;padding:24px;color:#222;}
        h1{font-size:20px;margin:0 0 4px;} h2{font-size:15px;margin:24px 0 8px;}
        .muted{color:#666;font-size:12px;}
        table{border-collapse:collapse;width:100%;font-size:12px;margin-top:6px;}
        th,td{border:1px solid #ccc;padding:5px 7px;vertical-align:top;}
        th{background:#f4f4f4;text-align:left;}
        .r{text-align:right;font-variant-numeric:tabular-nums;}
        .sum td{font-weight:600;background:#fafafa;}
        .final{font-size:16px;font-weight:700;}
      </style></head><body>
      <h1>業主收益報告　${esc(monthLabel)}</h1>
      <div class="muted">產出時間：${format(new Date(), "yyyy-MM-dd HH:mm")}　撥款期限：${paymentDueDate}</div>

      <h2>收益拆解</h2>
      <table>
        ${isGuestCount ? `
        <tr><td>入住營收</td><td class="r">NT$ ${fmt(gcTotals.totalRevenue)}</td></tr>
        <tr><td>加購項目（全額歸業主）</td><td class="r">NT$ ${fmt(gcTotals.totalAddonTotal)}</td></tr>
        <tr><td>抽成基礎</td><td class="r">NT$ ${fmt(gcTotals.totalCommissionBase)}</td></tr>
        <tr><td>人客多抽成 ${config.commission_rate}%</td><td class="r">−NT$ ${fmt(gcTotals.totalCommission)}</td></tr>
        <tr><td>溢價分潤</td><td class="r">−NT$ ${fmt(gcTotals.totalPremiumShare)}</td></tr>
        <tr class="sum"><td>平台費用合計</td><td class="r">−NT$ ${fmt(gcTotals.totalPlatformFee)}</td></tr>
        <tr class="sum"><td class="final">業主淨收益</td><td class="r final">NT$ ${fmt(gcTotals.ownerNet)}</td></tr>
        ` : `
        <tr><td>入住營收</td><td class="r">NT$ ${fmt(totals.totalRevenue)}</td></tr>
        <tr><td>平台服務費 ${config.commission_rate}%</td><td class="r">−NT$ ${fmt(totals.totalCommission)}</td></tr>
        <tr><td>行銷推廣費（${propertyCount} 棟）</td><td class="r">−NT$ ${fmt(totals.marketingFee)}</td></tr>
        <tr class="sum"><td>平台費用合計</td><td class="r">−NT$ ${fmt(totals.totalCommission + totals.marketingFee)}</td></tr>
        <tr><td>購物商品收入（非訂房收入，不列入平台抽成，全額歸業主）</td><td class="r">NT$ ${fmt(totals.addonTotal)}</td></tr>
        <tr class="sum"><td class="final">業主淨收益</td><td class="r final">NT$ ${fmt(totals.ownerNet)}</td></tr>
        `}
      </table>

      <h2>${isGuestCount ? "訂單明細（依入住月份全額計算）" : "訂單明細（依入住日攤分至本月）"}</h2>
      <table>
        <thead><tr><th>訂單編號</th><th>訂購人</th><th>入住 / 退房</th>${isGuestCount ? "" : `<th class="r">本月夜數</th>`}<th class="r">${isGuestCount ? "每月營收" : "本月營收"}</th>${isGuestCount ? `<th class="r">訂單金額</th>` : ""}<th class="r">抽成</th></tr></thead>
        <tbody>${orderRowsHtml || `<tr><td colspan="6">本月無入住訂單</td></tr>`}</tbody>
      </table>


      <h2>購物商品（非訂房收入）明細　共 ${addonItems.length} 筆　合計 NT$ ${fmt(totals.addonTotal)}</h2>
      <table>
        <thead><tr><th>日期</th><th>分類</th><th>品項</th><th class="r">數量</th><th class="r">單價</th><th class="r">小計</th><th>關聯訂單</th><th>備註</th></tr></thead>
        <tbody>${addonRowsHtml || `<tr><td colspan="8">本月無購物商品紀錄</td></tr>`}
        ${addonItems.length ? `<tr class="sum"><td colspan="5">合計</td><td class="r">NT$ ${fmt(totals.addonTotal)}</td><td colspan="2"></td></tr>` : ""}
        </tbody>
      </table>
      <p class="muted">購物商品收入不列入平台抽成，全額計入業主淨收益。</p>
      <script>window.onload=()=>window.print();<\/script>
      </body></html>`;

    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  return (
    <TooltipProvider delayDuration={150}>
    <div className="container mx-auto py-6 space-y-6">
      <AdminPageHeader
        title="業主收益報告"
        description={`${monthLabel} 房務營運摘要與業主撥款明細`}
        icon={Banknote}
        action={
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <MonthPicker value={monthStr} onChange={(v) => v && v !== "all" && setMonthStr(v)} />
            <Button variant="outline" size="sm" onClick={exportPdf} disabled={loading}>
              <Printer className="w-4 h-4 mr-1" />
              下載 PDF
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/owner-settlement/settings">
                <Settings className="w-4 h-4 mr-1" />
                設定
              </Link>
            </Button>
          </div>
        }
      />


      {/* Hero：業主實收 */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                {monthLabel} 業主淨收益
              </div>
              <div className="text-4xl md:text-5xl font-bold text-primary tabular-nums leading-tight">
                NT$ {fmt(summary.ownerNet)}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 md:gap-6 md:text-right text-xs">
              <div>
                <div className="text-muted-foreground">本月入住營收</div>
                <div className="text-base font-semibold tabular-nums mt-0.5">
                  NT$ {fmt(summary.totalRevenue)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">訂單數</div>
                <div className="text-base font-semibold tabular-nums mt-0.5">
                  {summary.orderCount}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">{isGuestCount ? "平台費用合計" : "本月總夜數"}</div>
                <div className="text-base font-semibold tabular-nums mt-0.5">
                  {isGuestCount ? `NT$ ${fmt(summary.platformTotal)}` : summary.totalNights}
                </div>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* 收益歸屬一覽：業主 vs 平台 */}
      {summary.totalRevenue > 0 && (() => {
        const platformTotal = summary.platformTotal;
        const ownerPct = Math.max(0, Math.min(100, (summary.ownerNet / summary.totalRevenue) * 100));
        const platformPct = Math.max(0, Math.min(100, (platformTotal / summary.totalRevenue) * 100));
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">本月收益歸屬</CardTitle>
              <CardDescription>本月入住營收 NT$ {fmt(summary.totalRevenue)} 的分配比例</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                <div className="bg-primary" style={{ width: `${ownerPct}%` }} title={`業主淨收益 ${ownerPct.toFixed(1)}%`} />
                <div className="bg-muted-foreground/40" style={{ width: `${platformPct}%` }} title={`平台費用 ${platformPct.toFixed(1)}%`} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Banknote className="h-3.5 w-3.5 text-primary" />
                    業主淨收益
                  </div>
                  <div className="mt-1 text-2xl font-bold text-primary tabular-nums">
                    NT$ {fmt(summary.ownerNet)}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    占入住營收 {ownerPct.toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Wallet className="h-3.5 w-3.5" />
                    應付平台總費用
                  </div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">
                    NT$ {fmt(platformTotal)}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {isGuestCount ? (
                      <>
                        <span>人客多抽成 {config.commission_rate}%：NT$ {fmt(gcTotals.totalCommission)}</span>
                        <span>溢價分潤：NT$ {fmt(gcTotals.totalPremiumShare)}</span>
                      </>
                    ) : (
                      <>
                        <span>服務費 {config.commission_rate}%：NT$ {fmt(totals.totalCommission)}</span>
                        <span>行銷推廣費：NT$ {fmt(totals.marketingFee)}</span>
                      </>
                    )}
                  </div>

                  <div className="mt-2 pt-2 border-t flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="min-w-0 break-words">請於 <span className="font-semibold text-foreground">{paymentDueDate}</span> 前完成匯款（每月 10 號）</span>

                  </div>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground leading-relaxed">
                平台費用已內含金流、客服、系統維運、OTA 上架、SEO、廣告投放、星鏈計劃等服務，無其他隱藏成本。
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {isGuestCount ? (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">本月收益拆解</CardTitle>
              {gcTotals.crossMonthCount > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900">
                      <Info className="h-3 w-3" />
                      本月包含 {gcTotals.crossMonthCount} 筆跨月訂單
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <div className="text-xs">溢價分潤與加購項目已全額計入入住月份。</div>
                    <div className="mt-1 text-xs font-mono break-all">
                      {gcCrossMonthOrders.join("、")}
                    </div>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <CardDescription>依入住月份全額計算（不跨月分攤），加購項目全額歸業主</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <BreakdownRow
              icon={TrendingUp}
              label="入住營收"
              sublabel={`本月入住 ${gcRows.length} 筆訂單實付總額`}
              value={gcTotals.totalRevenue}
              tone="income"
            />
            <BreakdownRow
              icon={Sparkles}
              label="加購項目"
              sublabel="加購項目中的金額（包含清潔費、接機車資等），全額歸業主"
              value={gcTotals.totalAddonTotal}
              prefixNote={
                foreignSummary && gcAddonForeignOriginal > 0
                  ? `${getCurrencySymbol(foreignSummary.currency)}${fmt(gcAddonForeignOriginal)} ÷ ${foreignSummary.rate} =`
                  : undefined
              }
              tone="income"
            />

            <div className="h-px bg-border my-2" />
            <BreakdownRow
              icon={Percent}
              label="抽成基礎"
              sublabel="入住營收 − 加購項目（不含免抽成訂單）"
              value={gcTotals.totalCommissionBase}
              tone="subtotal"
            />
            <BreakdownRow
              icon={Percent}
              label={`人客多抽成 ${config.commission_rate}%`}
              sublabel="抽成基礎 × 服務費率"
              value={-gcTotals.totalCommission}
              tone="fee"
            />
            <BreakdownRow
              icon={MegaphoneIcon}
              label="溢價分潤"
              sublabel="入住人數 × 300 ÷ 2"
              value={-gcTotals.totalPremiumShare}
              tone="fee"
            />
            <BreakdownRow
              icon={Wallet}
              label="平台費用合計"
              sublabel="人客多抽成 + 溢價分潤"
              value={-gcTotals.totalPlatformFee}
              tone="subtotal"
            />
            <div className="h-px bg-border my-2" />
            <BreakdownRow
              icon={Banknote}
              label="業主淨收益"
              sublabel="入住營收 − 平台費用合計（加購項目不列入扣項）"
              value={gcTotals.ownerNet}
              tone="final"
            />
          </CardContent>
        </Card>
      ) : (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">本月收益拆解</CardTitle>
          <CardDescription>從入住營收到業主實際撥款的完整流程</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {/* 收入區 */}
          <BreakdownRow
            icon={TrendingUp}
            label="入住營收"
            sublabel="本月所有訂單依夜數攤分"
            value={totals.totalRevenue}
            prefixNote={
              foreignSummary
                ? `${getCurrencySymbol(foreignSummary.currency)}${fmt(foreignSummary.original)} ÷ ${foreignSummary.rate} =`
                : undefined
            }
            tone="income"
          />



          <div className="h-px bg-border my-2" />


          {/* 服務費用區 */}
          <div className="text-xs text-muted-foreground font-medium px-3 pt-2 pb-1">
            平台服務費用
          </div>
          <BreakdownRow
            icon={Percent}
            label={`平台服務費 ${config.commission_rate}%`}
            sublabel="含金流處理、客服、系統維運、訂單管理、網紅抽成"
            value={-totals.totalCommission}
            tone="fee"
          />
          <BreakdownRow
            icon={Megaphone}
            label={`行銷推廣費（${propertyCount} 棟）`}
            sublabel={
              <>
                基本 {fmt(config.marketing_fee_base)} + {Math.max(0, propertyCount - 1)} × {fmt(config.marketing_fee_per_extra_property)}　含 OTA 上架、SEO、廣告投放、
                <a
                  href="https://star.lakeze.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2 hover:opacity-80"
                >
                  星鏈計劃
                </a>
                （包專案 98,800）
              </>
            }
            value={-totals.marketingFee}
            originalValue={-totals.marketingFeeOriginal}
            tone="fee"
          />

          <BreakdownRow
            icon={Wallet}
            label="平台費用合計"
            sublabel="服務費 + 行銷推廣費"
            value={-(totals.totalCommission + totals.marketingFee)}
            tone="subtotal"
          />

          <div className="h-px bg-border my-2" />

          {totals.addonTotal > 0 && (
            <BreakdownRow
              icon={ShoppingBag}
              label="商品收入"
              sublabel={`本月 ${addonCount} 筆非訂房收入（商品/餐飲/體驗等），不列入平台抽成，全額歸業主`}
              value={totals.addonTotal}
              tone="income"
            />
          )}


          {/* 實收 */}
          <BreakdownRow
            icon={Banknote}
            label="業主淨收益"
            sublabel={`占入住營收 ${totals.totalRevenue > 0 ? Math.round((totals.ownerNet / totals.totalRevenue) * 100) : 0}%`}
            value={totals.ownerNet}
            tone="final"
          />
        </CardContent>
      </Card>
      )}

      {/* 訂單明細 */}
      <Card>
        <CardHeader>
          <CardTitle>
            {monthLabel}訂單明細{isGuestCount ? "（依入住月份全額計算）" : "（依入住日逐日攤分至本月）"}
          </CardTitle>
          <CardDescription>
            {isGuestCount
              ? `入住日落在 ${monthLabel} 的訂單；跨月訂單全額計入入住月份，不做夜數分攤。已取消訂單不列入。`
              : `含 ${monthLabel} 入住的訂單；跨月訂單僅計入本月住宿夜數的比例。已取消訂單不列入。`}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <TableSkeleton rows={6} columns={8} />
          ) : tableRows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{monthLabel} 無入住訂單</p>
          ) : (
            <Table className="fixed-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>訂單編號</TableHead>
                  <TableHead>訂購人</TableHead>
                  <TableHead>入住 / 退房</TableHead>
                  {!isGuestCount && <TableHead className="text-right">本月夜數</TableHead>}
                  <TableHead className="text-right tabular-nums">{isGuestCount ? "每月營收" : "本月營收"}</TableHead>
                  <TableHead className="text-right tabular-nums">{isGuestCount ? "訂單金額" : "訂單金額"}</TableHead>
                  <TableHead className="text-right tabular-nums">抽成</TableHead>
                  <TableHead>備註</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tableRows.map((r) => {
                  const isOpen = expandedId === r.order.id;
                  return (
                    <React.Fragment key={r.order.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpandedId(isOpen ? null : r.order.id)}
                      >
                        <TableCell className="text-muted-foreground">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.order.order_number}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.order.guest_name}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {r.order.check_in_date} → {r.order.check_out_date}
                        </TableCell>
                        {!isGuestCount && (
                          <TableCell className="text-right tabular-nums">
                            {r.std!.nightsInMonth} / {r.std!.totalNights}
                          </TableCell>
                        )}
                        <TableCell className="text-right tabular-nums">
                          {isGuestCount ? (
                            r.isForeign
                              ? `${getCurrencySymbol(r.currency)}${fmt(r.revenueOriginal)}`
                              : fmt(r.revenue)
                          ) : (
                            <>
                              {r.isForeign && (
                                <span className="mr-1 text-[11px] text-muted-foreground">
                                  {getCurrencySymbol(r.currency)}{fmt(r.revenueOriginal)} ÷ {r.exchangeRate} =
                                </span>
                              )}
                              {fmt(r.revenue)}
                            </>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt(r.orderAmount)}
                        </TableCell>

                        <TableCell className="text-right tabular-nums">
                          {r.exempt ? (
                            <Badge variant="secondary">
                              {r.order.owner_direct
                                ? "業主自帶"
                                : `不抽成・${getOrderSourceConfig(r.order.order_source).label}`}
                            </Badge>
                          ) : (
                            <span className="text-destructive">-{fmt(r.commission)}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.exempt && (
                            <Badge variant="outline" className="text-xs">不抽成</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                      {isOpen && (() => {
                        const cur = r.isForeign ? getCurrencySymbol(r.currency) : "NT$ ";
                        const gc = r.gc;
                        const useGc = isGuestCount && !!gc;
                        const std = r.std;
                        return (
                        <TableRow key={`${r.order.id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={isGuestCount ? 8 : 9} className="p-0">
                            <div className="px-6 py-4 space-y-3">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <DetailItem label="訂單總額" value={`${cur}${fmt(Number(r.order.total_price || 0))}`} />
                                <DetailItem label="折扣" value={`-${cur}${fmt(Number(r.order.discount_amount || 0))}`} />
                                <DetailItem label="實付金額" value={`${cur}${fmt(Number(r.order.final_price || 0))}`} />
                                <DetailItem label="訂單狀態" value={getOrderStatusLabel(r.order.order_status)} />
                                <DetailItem label="訂單來源" value={getOrderSourceConfig(r.order.order_source, getOrderOtaCode(r.order as any)).label} />
                                <DetailItem label="餐型" value={r.order.meal_plan ? (MEAL_PLAN_LABEL[r.order.meal_plan] || mealTemplateMap[r.order.meal_plan] || r.order.meal_plan) : "—"} />
                                {useGc ? (
                                  <DetailItem
                                    label="入住 / 退房"
                                    value={`${r.order.check_in_date} → ${r.order.check_out_date}${gc.isCrossMonth ? "（跨月，全額計入入住月）" : ""}`}
                                  />
                                ) : (
                                  <DetailItem label="本月攤分比例" value={`${((std?.monthRatio ?? 0) * 100).toFixed(1)}%`} />
                                )}
                                <DetailItem label="入住人數" value={r.order.guest_count != null ? `${r.order.guest_count} 人` : "—"} />
                              </div>


                              {r.isForeign && (
                                <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-xs">
                                  <span className="text-muted-foreground">
                                    幣別 {r.currency}　匯率快照（{r.currency} per TWD）
                                  </span>
                                  <Input
                                    className="h-8 w-28"
                                    type="number"
                                    step="0.01"
                                    value={
                                      rateEdit?.orderId === r.order.id
                                        ? rateEdit.value
                                        : String(r.order.exchange_rate_snapshot ?? r.exchangeRate)
                                    }
                                    onChange={(e) => setRateEdit({ orderId: r.order.id, value: e.target.value })}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={
                                      rateEdit?.orderId !== r.order.id ||
                                      rateEdit.value === String(r.order.exchange_rate_snapshot ?? r.exchangeRate)
                                    }
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRateConfirmOrderId(r.order.id);
                                    }}
                                  >
                                    儲存匯率
                                  </Button>
                                  {r.order.currency_at_booking == null && (
                                    <span className="text-[11px] text-amber-700">
                                      此訂單無快照，目前使用館別現值計算
                                    </span>
                                  )}
                                </div>
                              )}

                              <div className="text-xs text-muted-foreground border-t pt-2 space-y-0.5">
                                {useGc ? (
                                  r.isForeign && r.order.currency_at_booking ? (
                                    <>
                                      <div>
                                        入住營收 {getCurrencySymbol(r.currency)}{fmt(gc.finalPriceOriginal)} × 匯率快照 {r.exchangeRate} = NT$ {fmt(gc.finalPrice)}
                                      </div>
                                      <div className="text-amber-700">非台幣訂單不列入抽成與溢價分潤</div>
                                    </>
                                  ) : (
                                  <>
                                    <div>
                                      入住營收 NT$ {fmt(gc.finalPrice)} − 加購項目 NT$ {fmt(gc.addonTotal)} = 抽成基礎 NT$ {fmt(gc.commissionBase)}
                                    </div>
                                    <div>
                                      抽成基礎 NT$ {fmt(gc.commissionBase)} × {config.commission_rate}% = 人客多抽成 NT$ {fmt(gc.commission)}
                                      {gc.exempt && "（不抽成）"}
                                    </div>
                                    <div>
                                      入住人數 {Number(r.order.guest_count || 0)} × {PREMIUM_SHARE_PER_GUEST} ÷ 2 = 溢價分潤 NT$ {fmt(gc.premiumShare)}
                                      {gc.exempt && "（不分潤）"}
                                    </div>
                                    <div className="font-medium text-foreground">
                                      平台費用合計 = 人客多抽成 NT$ {fmt(gc.commission)} + 溢價分潤 NT$ {fmt(gc.premiumShare)} = NT$ {fmt(gc.platformFeeTotal)}
                                    </div>
                                  </>
                                  )


                                ) : (
                                  <div>
                                    本月營收 = 實付 {cur}{fmt(Number(r.order.final_price || 0))} × {std?.nightsInMonth}/{std?.totalNights}
                                    {r.isForeign ? ` ÷ ${r.exchangeRate}` : ""} = NT$ {fmt(r.revenue)}
                                    {!r.exempt && <>；抽成 = NT$ {fmt(r.orderAmount)} × {config.commission_rate}% = NT$ {fmt(r.commission)}</>}
                                  </div>

                                )}
                                {!useGc && r.exempt && r.isForeign && r.order.currency_at_booking && (
                                  <div className="text-amber-700">非台幣訂單不列入抽成與溢價分潤</div>
                                )}
                              </div>
                              <div>
                                <Link
                                  to={`/admin/orders/${r.order.id}`}
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                >
                                  開啟完整訂單頁 <ExternalLink className="h-3 w-3" />
                                </Link>
                              </div>

                            </div>
                          </TableCell>
                        </TableRow>
                        );
                      })()}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 購物商品明細 */}
      {addonItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingBag className="h-4 w-4" />
              {monthLabel}購物商品（非訂房收入）明細
            </CardTitle>
            <CardDescription>
              共 {addonItems.length} 筆，合計 NT$ {fmt(totals.addonTotal)}；不列入平台抽成，全額計入業主淨收益。
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table className="fixed-table">
              <TableHeader>
                <TableRow>
                  <TableHead>日期</TableHead>
                  <TableHead>分類</TableHead>
                  <TableHead>品項</TableHead>
                  <TableHead className="text-right">數量</TableHead>
                  <TableHead className="text-right">單價</TableHead>
                  <TableHead className="text-right">小計</TableHead>
                  <TableHead>關聯訂單</TableHead>
                  <TableHead>備註</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {addonItems.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-xs">{a.sale_date}</TableCell>
                    <TableCell className="text-xs">{a.category || "—"}</TableCell>
                    <TableCell className="text-sm">{a.item_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(Number(a.unit_price) || 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(Number(a.total_amount) || 0)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {a.related_order_id && a.related_order_number ? (
                        <Link to={`/admin/orders/${a.related_order_id}`} className="text-primary hover:underline">
                          {a.related_order_number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.notes || ""}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={5} className="font-medium">合計</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">NT$ {fmt(totals.addonTotal)}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

    <AlertDialog open={!!rateConfirmOrderId} onOpenChange={(o) => !o && setRateConfirmOrderId(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>確認修改匯率快照</AlertDialogTitle>
          <AlertDialogDescription>
            修改此匯率將影響已計算的抽成與獎金結果，請確認是否同意修改？
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={savingRate}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={savingRate}
            onClick={(e) => {
              e.preventDefault();
              handleSaveRate();
            }}
          >
            確認修改
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </div>


    </TooltipProvider>
  );
}

function BreakdownRow({
  icon: Icon,
  label,
  sublabel,
  value,
  originalValue,
  prefixNote,
  tone,
  indent,
}: {
  icon: any;
  label: string;
  sublabel?: React.ReactNode;
  value: number;
  originalValue?: number;
  /** 台幣金額左側的外幣換算式，例：¥14,769 ÷ 5.02 = */
  prefixNote?: React.ReactNode;
  tone: "income" | "neutral" | "subtotal" | "fee" | "final";
  indent?: boolean;
}) {
  const isNegative = value < 0;
  const display = `${isNegative ? "−" : ""}NT$ ${fmt(Math.abs(value))}`;
  const showOriginal =
    typeof originalValue === "number" && Math.abs(originalValue) !== Math.abs(value);
  const originalDisplay = showOriginal
    ? `NT$ ${fmt(Math.abs(originalValue!))}`
    : "";

  const valueClass =
    tone === "final"
      ? "text-primary font-bold text-xl"
      : tone === "subtotal"
      ? "font-semibold"
      : tone === "fee"
      ? "text-muted-foreground"
      : tone === "neutral"
      ? "text-muted-foreground"
      : "font-medium";

  const rowClass =
    tone === "final"
      ? "bg-primary/5 rounded-md"
      : tone === "subtotal"
      ? "bg-muted/40 rounded-md"
      : "";

  return (
    <div className={`flex items-center justify-between gap-3 px-3 py-2.5 ${rowClass} ${indent ? "pl-8" : ""}`}>
      <div className="flex items-center gap-3 min-w-0">
        <Icon className={`h-4 w-4 shrink-0 ${tone === "final" ? "text-primary" : "text-muted-foreground"}`} />
        <div className="min-w-0">
          <div className={`text-sm ${tone === "final" ? "font-semibold" : ""}`}>{label}</div>
          {sublabel && (
            <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{sublabel}</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {prefixNote && (
          <span className="tabular-nums text-xs text-muted-foreground">{prefixNote}</span>
        )}
        {showOriginal && (
          <span className="tabular-nums text-xs text-muted-foreground/70 line-through">
            {originalDisplay}
          </span>
        )}
        <span className={`tabular-nums ${valueClass}`}>{display}</span>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}

function ServiceItem({
  icon: Icon,
  title,
  desc,
}: {
  icon: any;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-3 p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors">
      <div className="shrink-0 h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium leading-tight">{title}</div>
        <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{desc}</div>
      </div>
    </div>
  );
}

