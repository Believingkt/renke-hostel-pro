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
import { Banknote, TrendingUp, Utensils, Percent, Megaphone, Wallet, CalendarClock } from "lucide-react";
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
    <div className="container mx-auto py-6 space-y-6">
      <AdminPageHeader
        title="業主月結"
        description={`${monthLabel}房務營收結算單，扣除餐飲、平台抽成與行銷費用`}
        icon={Banknote}
        action={
          <MonthPicker value={monthStr} onChange={(v) => v && v !== "all" && setMonthStr(v)} />
        }
      />

      {/* 匯款提醒 */}
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="p-4 flex items-center gap-3">
          <CalendarClock className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-semibold">
              匯款提醒：{monthLabel} 結算款請於 <span className="text-primary">{paymentDueDate}（每月 10 號）</span> 前完成匯款
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              金額：NT$ {fmt(totals.ownerNet)}（業主實收）
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 上方總覽卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <SummaryCard
          icon={TrendingUp}
          label={`${monthShort}入住營收`}
          value={`NT$ ${fmt(totals.totalRevenue)}`}
          tone="default"
        />
        <SummaryCard
          icon={Utensils}
          label={`${monthShort}餐飲費用`}
          value={`NT$ ${fmt(totals.totalFood)}`}
          tone="muted"
        />
        <SummaryCard
          icon={Wallet}
          label={`${monthShort}可抽成基礎`}
          value={`NT$ ${fmt(totals.totalCommissionable)}`}
          tone="muted"
          hint="折扣後總價 − 餐飲"
        />
        <SummaryCard
          icon={Percent}
          label={`${monthShort}平台抽成 ${config.commission_rate}%`}
          value={`-NT$ ${fmt(totals.totalCommission)}`}
          tone="warning"
        />
        <SummaryCard
          icon={Megaphone}
          label={`${monthShort}行銷費用 (${propertyCount} 棟)`}
          value={`-NT$ ${fmt(totals.marketingFee)}`}
          tone="warning"
          hint={`基本 ${fmt(config.marketing_fee_base)} + ${Math.max(0, propertyCount - 1)} × ${fmt(config.marketing_fee_per_extra_property)}`}
        />
        <SummaryCard
          icon={Banknote}
          label={`${monthShort}業主實收`}
          value={`NT$ ${fmt(totals.ownerNet)}`}
          tone="primary"
        />
      </div>

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
            <p className="text-center text-muted-foreground py-8">本月無入住訂單</p>
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
                  <TableHead className="text-right tabular-nums">可抽成基礎</TableHead>
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
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "muted" | "warning" | "primary";
}) {
  const toneClass =
    tone === "primary"
      ? "border-primary/40 bg-primary/5"
      : tone === "warning"
      ? "border-destructive/30"
      : "";
  return (
    <Card className={toneClass}>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
        <div
          className={`text-lg font-semibold tabular-nums ${
            tone === "primary" ? "text-primary" : ""
          }`}
        >
          {value}
        </div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
