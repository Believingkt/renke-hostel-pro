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
import { Banknote, TrendingUp, Utensils, Percent, Megaphone, Wallet, CalendarClock, ArrowRight, Info, Globe, CreditCard, Headphones, Sparkles, Megaphone as MegaphoneIcon, ShieldCheck, Calendar as CalendarIcon, Bot, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, startOfMonth, endOfMonth, addDays, differenceInDays, parseISO, addMonths } from "date-fns";
import { zhTW } from "date-fns/locale";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";
import { getOrderStatusLabel, getOrderSourceConfig } from "@/utils/orderHelpers";

const MEAL_PLAN_LABEL: Record<string, string> = {
  no_meal: "不含餐",
  breakfast: "含早餐",
  "2_meals": "兩餐（早晚餐）",
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
}

interface SettlementConfig {
  commission_rate: number;
  marketing_fee_base: number;
  marketing_fee_per_extra_property: number;
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
}

const fmt = (n: number) => Math.round(n).toLocaleString("zh-TW");

export default function OwnerSettlement() {
  const { currentAccommodationId } = useAccommodation();
  const [monthStr, setMonthStr] = useState<string>(format(new Date(), "yyyy-MM"));
  const month = useMemo(() => startOfMonth(parseISO(monthStr + "-01")), [monthStr]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomTypePricing[]>([]);
  const [config, setConfig] = useState<SettlementConfig>({
    commission_rate: 15,
    marketing_fee_base: 48000,
    marketing_fee_per_extra_property: 3000,
  });
  const [propertyCount, setPropertyCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentAccommodationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);

      const monthStart = format(startOfMonth(month), "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(month), "yyyy-MM-dd");

      const [ordersRes, roomTypesRes, configRes, accRes] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, order_number, guest_name, check_in_date, check_out_date, total_price, discount_amount, final_price, meal_plan_total, meal_plan, meal_plan_details, order_status, order_source, owner_direct, room_type_id"
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
          .select("setting_value")
          .eq("setting_key", "owner_settlement_config")
          .maybeSingle(),
        supabase.from("accommodation_info").select("building_count").eq("id", currentAccommodationId).maybeSingle(),
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
      if (configRes.data?.setting_value) {
        setConfig(configRes.data.setting_value as unknown as SettlementConfig);
      }
      setPropertyCount((accRes.data as any)?.building_count ?? 1);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentAccommodationId, month]);

  const rows: OrderRow[] = useMemo(() => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const rtMap = new Map(roomTypes.map((r) => [r.id, r]));

    return orders
      .map((o) => {
        const ci = parseISO(o.check_in_date);
        const co = parseISO(o.check_out_date);
        const totalNights = Math.max(1, differenceInDays(co, ci));

        // count nights overlapping with this month
        let nightsInMonth = 0;
        for (let i = 0; i < totalNights; i++) {
          const d = addDays(ci, i);
          if (d >= monthStart && d <= monthEnd) nightsInMonth++;
        }
        if (nightsInMonth === 0) return null;

        const ratio = nightsInMonth / totalNights;

        const monthFinal = Number(o.final_price || 0) * ratio;
        const monthDiscount = Number(o.discount_amount || 0) * ratio;
        const monthCommissionable = monthFinal;

        const exempt = !!o.owner_direct;
        const commission = exempt
          ? 0
          : monthCommissionable * (config.commission_rate / 100);

        return {
          order: o,
          nightsInMonth,
          totalNights,
          monthRatio: ratio,
          monthFinal,
          monthFood: 0,
          monthDiscount,
          monthCommissionable,
          commission,
          exempt,
        } as OrderRow;
      })
      .filter((x): x is OrderRow => x !== null)
      .sort((a, b) => a.order.check_in_date.localeCompare(b.order.check_in_date));
  }, [orders, roomTypes, month, config.commission_rate]);

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
    const ownerNet = totalRevenue - totalCommission - marketingFee;
    return { totalRevenue, totalFood, totalCommissionable, totalCommission, marketingFee, marketingFeeOriginal, ownerNet };
  }, [rows, config, propertyCount]);

  const monthLabel = format(month, "yyyy 年 M 月", { locale: zhTW });
  const monthShort = format(month, "M 月", { locale: zhTW });
  const paymentDueDate = format(addMonths(month, 1), "yyyy/MM/10");

  return (
    <TooltipProvider delayDuration={150}>
    <div className="container mx-auto py-6 space-y-6">
      <AdminPageHeader
        title="業主收益報告"
        description={`${monthLabel} 房務營運摘要與業主撥款明細`}
        icon={Banknote}
        action={
          <MonthPicker value={monthStr} onChange={(v) => v && v !== "all" && setMonthStr(v)} />
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
                NT$ {fmt(totals.ownerNet)}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 md:gap-6 md:text-right text-xs">
              <div>
                <div className="text-muted-foreground">本月入住營收</div>
                <div className="text-base font-semibold tabular-nums mt-0.5">
                  NT$ {fmt(totals.totalRevenue)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">訂單數</div>
                <div className="text-base font-semibold tabular-nums mt-0.5">
                  {rows.length}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">本月總夜數</div>
                <div className="text-base font-semibold tabular-nums mt-0.5">
                  {rows.reduce((s, r) => s + r.nightsInMonth, 0)}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 收益歸屬一覽：業主 vs 平台 */}
      {totals.totalRevenue > 0 && (() => {
        const platformTotal = totals.totalCommission + totals.marketingFee;
        const ownerPct = Math.max(0, Math.min(100, (totals.ownerNet / totals.totalRevenue) * 100));
        const platformPct = Math.max(0, Math.min(100, (platformTotal / totals.totalRevenue) * 100));
        const foodPct = Math.max(0, 100 - ownerPct - platformPct);
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">本月收益歸屬</CardTitle>
              <CardDescription>本月入住營收 NT$ {fmt(totals.totalRevenue)} 的分配比例</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                <div className="bg-primary" style={{ width: `${ownerPct}%` }} title={`業主淨收益 ${ownerPct.toFixed(1)}%`} />
                <div className="bg-muted-foreground/40" style={{ width: `${platformPct}%` }} title={`平台費用 ${platformPct.toFixed(1)}%`} />
                {foodPct > 0 && (
                  <div className="bg-muted-foreground/15" style={{ width: `${foodPct}%` }} title={`餐飲費用 ${foodPct.toFixed(1)}%`} />
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Banknote className="h-3.5 w-3.5 text-primary" />
                    業主淨收益
                  </div>
                  <div className="mt-1 text-2xl font-bold text-primary tabular-nums">
                    NT$ {fmt(totals.ownerNet)}
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
                    <span>服務費 {config.commission_rate}%：NT$ {fmt(totals.totalCommission)}</span>
                    <span>行銷推廣費：NT$ {fmt(totals.marketingFee)}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    請於 <span className="font-semibold text-foreground">{paymentDueDate}</span> 前完成匯款（每月 10 號）
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
            tone="income"
          />
          <BreakdownRow
            icon={Utensils}
            label="餐飲費用"
            sublabel="不計入平台服務費基礎"
            value={-totals.totalFood}
            tone="neutral"
            indent
          />
          <BreakdownRow
            icon={Wallet}
            label="訂單金額（房費）"
            sublabel="入住營收 − 餐飲費用"
            value={totals.totalCommissionable}
            tone="subtotal"
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
            sublabel={`服務費 + 行銷推廣費　占入住營收 ${totals.totalRevenue > 0 ? Math.round(((totals.totalCommission + totals.marketingFee) / totals.totalRevenue) * 100) : 0}%`}
            value={-(totals.totalCommission + totals.marketingFee)}
            tone="subtotal"
          />

          <div className="h-px bg-border my-2" />

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

      {/* 訂單明細 */}
      <Card>
        <CardHeader>
          <CardTitle>{monthLabel}訂單明細（依入住日逐日攤分至本月）</CardTitle>
          <CardDescription>
            含 {monthLabel} 入住的訂單；跨月訂單僅計入本月住宿夜數的比例。已取消訂單不列入。
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <TableSkeleton rows={6} columns={8} />
          ) : rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{monthLabel} 無入住訂單</p>
          ) : (
            <Table className="fixed-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>訂單編號</TableHead>
                  <TableHead>訂購人</TableHead>
                  <TableHead>入住 / 退房</TableHead>
                  <TableHead className="text-right">本月夜數</TableHead>
                  <TableHead className="text-right tabular-nums">本月營收</TableHead>
                  <TableHead className="text-right tabular-nums">餐飲</TableHead>
                  <TableHead className="text-right tabular-nums">訂單金額</TableHead>
                  <TableHead className="text-right tabular-nums">抽成</TableHead>
                  <TableHead>備註</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
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
                        <TableCell className="text-right tabular-nums">
                          {r.nightsInMonth} / {r.totalNights}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.monthFinal)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {fmt(r.monthFood)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmt(r.monthCommissionable)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.exempt ? (
                            <Badge variant="secondary">業主自帶</Badge>
                          ) : (
                            <span className="text-destructive">-{fmt(r.commission)}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.order.owner_direct && (
                            <Badge variant="outline" className="text-xs">不抽成</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow key={`${r.order.id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={10} className="p-0">
                            <div className="px-6 py-4 space-y-3">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <DetailItem label="訂單總額" value={`NT$ ${fmt(Number(r.order.total_price || 0))}`} />
                                <DetailItem label="折扣" value={`-NT$ ${fmt(Number(r.order.discount_amount || 0))}`} />
                                <DetailItem label="實付金額" value={`NT$ ${fmt(Number(r.order.final_price || 0))}`} />
                                <DetailItem label="餐飲總額" value={`NT$ ${fmt(Number(r.order.meal_plan_total || 0))}`} />
                                <DetailItem label="訂單狀態" value={getOrderStatusLabel(r.order.order_status)} />
                                <DetailItem label="訂單來源" value={getOrderSourceConfig(r.order.order_source).label} />
                                <DetailItem label="餐型" value={r.order.meal_plan ? (MEAL_PLAN_LABEL[r.order.meal_plan] || r.order.meal_plan) : "—"} />
                                <DetailItem label="本月攤分比例" value={`${(r.monthRatio * 100).toFixed(1)}%`} />
                              </div>
                              <div className="text-xs text-muted-foreground border-t pt-2">
                                本月營收 = 實付 NT$ {fmt(Number(r.order.final_price || 0))} × {r.nightsInMonth}/{r.totalNights} = NT$ {fmt(r.monthFinal)}
                                ；訂單金額（房費）= 本月營收 − 餐飲 NT$ {fmt(r.monthFood)} = NT$ {fmt(r.monthCommissionable)}
                                {!r.exempt && <>；抽成 = NT$ {fmt(r.monthCommissionable)} × {config.commission_rate}% = NT$ {fmt(r.commission)}</>}
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
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
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
  tone,
  indent,
}: {
  icon: any;
  label: string;
  sublabel?: React.ReactNode;
  value: number;
  originalValue?: number;
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

