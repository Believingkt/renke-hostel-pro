import { useState, useEffect, useMemo } from "react";
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
import { Banknote, TrendingUp, Utensils, Percent, Megaphone, Wallet, CalendarClock, ArrowRight, Info, Globe, CreditCard, Headphones, Sparkles, Megaphone as MegaphoneIcon, ShieldCheck, Calendar as CalendarIcon, Bot } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, startOfMonth, endOfMonth, addDays, differenceInDays, parseISO, addMonths } from "date-fns";
import { zhTW } from "date-fns/locale";
import { TableSkeleton } from "@/components/skeletons/TableSkeleton";

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

        // 餐飲費用：優先 meal_plan_total / meal_plan_details, 否則用價差
        let foodTotal = 0;
        if (o.meal_plan_total && o.meal_plan_total > 0) {
          foodTotal = Number(o.meal_plan_total);
        } else if (Array.isArray(o.meal_plan_details)) {
          foodTotal = (o.meal_plan_details as any[]).reduce(
            (s, d) => s + (Number(d.total) || 0),
            0
          );
        } else if (o.room_type_id && (o.meal_plan === "2_meals" || o.meal_plan === "3_meals")) {
          const rt = rtMap.get(o.room_type_id);
          if (rt) {
            const mealPrice =
              o.meal_plan === "3_meals" ? rt.price_3_meals : rt.price_2_meals;
            if (mealPrice && mealPrice > rt.base_price) {
              foodTotal = (mealPrice - rt.base_price) * totalNights;
            }
          }
        }

        const monthFinal = Number(o.final_price || 0) * ratio;
        const monthFood = foodTotal * ratio;
        const monthDiscount = Number(o.discount_amount || 0) * ratio;
        const monthCommissionable = Math.max(0, monthFinal - monthFood);

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
          monthFood,
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
    const ownerNet = totalRevenue - totalCommission - marketingFee;
    return { totalRevenue, totalFood, totalCommissionable, totalCommission, marketingFee, ownerNet };
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
                {monthLabel} 業主撥款
              </div>
              <div className="text-4xl md:text-5xl font-bold text-primary tabular-nums leading-tight">
                NT$ {fmt(totals.ownerNet)}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1">
                <CalendarClock className="h-4 w-4" />
                預計於 <span className="font-semibold text-foreground">{paymentDueDate}</span> 前完成匯款（每月 10 號）
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

      {/* 收益拆解：收入 → 費用 → 實收 */}
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
            tone="fee"
          />

          <div className="h-px bg-border my-2" />

          {/* 實收 */}
          <BreakdownRow
            icon={Banknote}
            label="業主實收"
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
                {rows.map((r) => (
                  <TableRow key={r.order.id}>
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
                ))}
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
  tone,
  indent,
}: {
  icon: any;
  label: string;
  sublabel?: React.ReactNode;
  value: number;
  tone: "income" | "neutral" | "subtotal" | "fee" | "final";
  indent?: boolean;
}) {
  const isNegative = value < 0;
  const display = `${isNegative ? "−" : ""}NT$ ${fmt(Math.abs(value))}`;

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
      <div className={`tabular-nums shrink-0 ${valueClass}`}>{display}</div>
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

