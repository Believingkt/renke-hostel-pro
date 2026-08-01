import { useState, useEffect, useMemo, useCallback } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, DollarSign, Layers, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  detectTierByDate,
  type AccommodationPackage,
  type PackageTier,
} from "@/hooks/use-accommodation-packages";
import {
  fetchPackageDatePrices,
  overrideKey,
  resolvePackagePriceForDate,
  toDateStr,
  PACKAGE_PRICE_SOURCE_LABEL,
  type PackageDatePriceMap,
} from "@/lib/packageDatePrice";

const weekDayNames = ["日", "一", "二", "三", "四", "五", "六"];
const TIER_LABEL: Record<PackageTier, string> = {
  weekday: "平日",
  friday_sunday: "週五/日",
  weekend: "週六",
};

const fmt = (n: number | null | undefined) =>
  n == null ? "-" : Number(n).toLocaleString("zh-TW");

type WeekdayFilter = "all" | "weekday" | "friday_sunday" | "weekend" | "custom";

export default function PackagePriceCalendar() {
  const { currentAccommodationId } = useAccommodation();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [packages, setPackages] = useState<AccommodationPackage[]>([]);
  const [overrides, setOverrides] = useState<PackageDatePriceMap>(new Map());
  const [holidaySet, setHolidaySet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // 單格編輯
  const [cell, setCell] = useState<{ pkg: AccommodationPackage; date: string } | null>(null);
  const [cellSale, setCellSale] = useState("");
  const [cellOriginal, setCellOriginal] = useState("");
  const [saving, setSaving] = useState(false);

  // 批次改價
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPkgIds, setBulkPkgIds] = useState<string[]>([]);
  const [bulkStart, setBulkStart] = useState("");
  const [bulkEnd, setBulkEnd] = useState("");
  const [bulkFilter, setBulkFilter] = useState<WeekdayFilter>("all");
  const [bulkDows, setBulkDows] = useState<number[]>([]);
  const [bulkSale, setBulkSale] = useState("");
  const [bulkOriginal, setBulkOriginal] = useState("");
  const [bulkMode, setBulkMode] = useState<"set" | "clear">("set");

  const monthDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfMonth(currentMonth),
        end: endOfMonth(currentMonth),
      }),
    [currentMonth],
  );

  const isHolidayDate = useCallback(
    (d: Date) => holidaySet.has(toDateStr(d)),
    [holidaySet],
  );

  const loadData = useCallback(async () => {
    if (!currentAccommodationId) return;
    setLoading(true);
    const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");
    const [pkgRes, holidayRes, ovMap] = await Promise.all([
      supabase
        .from("accommodation_packages")
        .select("*")
        .eq("accommodation_id", currentAccommodationId)
        .order("display_order", { ascending: true })
        .order("guest_count", { ascending: true }),
      supabase
        .from("public_holidays")
        .select("holiday_date, holiday_type")
        .eq("accommodation_id", currentAccommodationId)
        .in("holiday_type", ["holiday", "compensatory_day_off"]),
      fetchPackageDatePrices(currentAccommodationId, monthStart, monthEnd),
    ]);
    if (pkgRes.error) {
      toast.error("載入方案失敗");
    } else {
      setPackages(
        ((pkgRes.data || []) as any[]).map((p) => ({
          ...p,
          tier_prices:
            p.tier_prices && typeof p.tier_prices === "object" && !Array.isArray(p.tier_prices)
              ? p.tier_prices
              : {},
          excluded_date_ranges: Array.isArray(p.excluded_date_ranges) ? p.excluded_date_ranges : [],
          room_type_allocation: Array.isArray(p.room_type_allocation) ? p.room_type_allocation : [],
        })) as AccommodationPackage[],
      );
    }
    setHolidaySet(new Set(((holidayRes.data || []) as any[]).map((h) => h.holiday_date)));
    setOverrides(ovMap);
    setLoading(false);
  }, [currentAccommodationId, currentMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setBulkStart(format(startOfMonth(currentMonth), "yyyy-MM-dd"));
    setBulkEnd(format(endOfMonth(currentMonth), "yyyy-MM-dd"));
  }, [currentMonth]);

  const openCell = (pkg: AccommodationPackage, date: string) => {
    const ov = overrides.get(overrideKey(pkg.id, date));
    setCellSale(ov ? String(ov.sale_price) : "");
    setCellOriginal(ov?.original_price != null ? String(ov.original_price) : "");
    setCell({ pkg, date });
  };

  const saveCell = async () => {
    if (!cell || !currentAccommodationId) return;
    const sale = Number(cellSale);
    if (!cellSale || !Number.isFinite(sale) || sale <= 0) {
      toast.error("請輸入有效的售價");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("package_date_prices").upsert(
      {
        accommodation_id: currentAccommodationId,
        package_id: cell.pkg.id,
        date: cell.date,
        sale_price: sale,
        original_price: cellOriginal ? Number(cellOriginal) : null,
      },
      { onConflict: "package_id,date" },
    );
    setSaving(false);
    if (error) {
      toast.error(`儲存失敗：${error.message}`);
      return;
    }
    toast.success("已更新該日價格");
    setCell(null);
    loadData();
  };

  const clearCell = async () => {
    if (!cell) return;
    setSaving(true);
    const { error } = await supabase
      .from("package_date_prices")
      .delete()
      .eq("package_id", cell.pkg.id)
      .eq("date", cell.date);
    setSaving(false);
    if (error) {
      toast.error(`清除失敗：${error.message}`);
      return;
    }
    toast.success("已清除覆寫，回退時段價");
    setCell(null);
    loadData();
  };

  const bulkDates = useMemo(() => {
    if (!bulkStart || !bulkEnd || bulkEnd < bulkStart) return [] as string[];
    const days = eachDayOfInterval({
      start: new Date(`${bulkStart}T00:00:00`),
      end: new Date(`${bulkEnd}T00:00:00`),
    });
    return days
      .filter((d) => {
        if (bulkFilter === "all") return true;
        if (bulkFilter === "custom") return bulkDows.includes(d.getDay());
        return detectTierByDate(d, isHolidayDate(d)) === bulkFilter;
      })
      .map(toDateStr);
  }, [bulkStart, bulkEnd, bulkFilter, bulkDows, isHolidayDate]);

  const runBulk = async () => {
    if (!currentAccommodationId) return;
    if (bulkPkgIds.length === 0) {
      toast.error("請至少選擇一個方案");
      return;
    }
    if (bulkDates.length === 0) {
      toast.error("沒有符合條件的日期");
      return;
    }
    setSaving(true);
    if (bulkMode === "clear") {
      const { error } = await supabase
        .from("package_date_prices")
        .delete()
        .in("package_id", bulkPkgIds)
        .in("date", bulkDates);
      setSaving(false);
      if (error) {
        toast.error(`清除失敗：${error.message}`);
        return;
      }
      toast.success(`已清除 ${bulkPkgIds.length} 個方案 × ${bulkDates.length} 天的覆寫價`);
    } else {
      const sale = Number(bulkSale);
      if (!bulkSale || !Number.isFinite(sale) || sale <= 0) {
        setSaving(false);
        toast.error("請輸入有效的售價");
        return;
      }
      const rows = bulkPkgIds.flatMap((pid) =>
        bulkDates.map((d) => ({
          accommodation_id: currentAccommodationId,
          package_id: pid,
          date: d,
          sale_price: sale,
          original_price: bulkOriginal ? Number(bulkOriginal) : null,
        })),
      );
      const { error } = await supabase
        .from("package_date_prices")
        .upsert(rows, { onConflict: "package_id,date" });
      setSaving(false);
      if (error) {
        toast.error(`批次改價失敗：${error.message}`);
        return;
      }
      toast.success(`已更新 ${rows.length} 筆（${bulkPkgIds.length} 方案 × ${bulkDates.length} 天）`);
    }
    setBulkOpen(false);
    loadData();
  };

  if (!currentAccommodationId) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="方案日期價格"
        description="以「入住方案 × 日期」直接改價，前台訂房頁與伺服器驗價同步採用。庫存數量仍以房價價格設定為準。"
        icon={DollarSign}
      />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => addMonths(m, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[110px] text-center font-medium">
                {format(currentMonth, "yyyy 年 M 月")}
              </span>
              <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" />單日指定價
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-500" />平日假日價
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted-foreground/40" />方案預設價
                </span>
              </div>
              <PackagePriceChangeLog
                accommodationId={currentAccommodationId}
                packageNames={packageNames}
              />
              <Button
                size="sm"
                onClick={() => {
                  setBulkPkgIds(packages.map((p) => p.id));
                  setBulkMode("set");
                  setBulkOpen(true);
                }}
              >
                <Layers className="h-4 w-4 mr-2" />
                整列批次改
              </Button>
            </div>

          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">載入中…</p>
          ) : packages.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">此館別尚未建立入住方案</p>
          ) : (
            <ScrollArea className="w-full">
              <div className="min-w-max">
                <table className="border-collapse text-sm tabular-nums">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-20 bg-background border px-3 py-2 text-left min-w-[180px]">
                        方案
                      </th>
                      {monthDays.map((d) => {
                        const ds = toDateStr(d);
                        const tier = detectTierByDate(d, isHolidayDate(d));
                        return (
                          <th
                            key={ds}
                            className={cn(
                              "border px-1 py-1 text-center min-w-[74px] font-normal",
                              tier === "weekend" && "bg-destructive/10",
                              tier === "friday_sunday" && "bg-amber-500/10",
                            )}
                          >
                            <div className="text-xs font-medium">{format(d, "M/d")}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {weekDayNames[d.getDay()]}
                              {holidaySet.has(ds) ? "・假" : ""}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {packages.map((pkg) => (
                      <tr key={pkg.id}>
                        <td className="sticky left-0 z-10 bg-background border px-3 py-2">
                          <div className="font-medium">{pkg.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {pkg.guest_count} 人・預設 NT$ {fmt(pkg.sale_price)}
                            {!pkg.enabled && "・已停用"}
                          </div>
                        </td>
                        {monthDays.map((d) => {
                          const ds = toDateStr(d);
                          const tier = detectTierByDate(d, isHolidayDate(d));
                          const applicable = (pkg.applicable_tiers || []).includes(tier);
                          const eff = resolvePackagePriceForDate(
                            {
                              id: pkg.id,
                              sale_price: pkg.sale_price,
                              original_price: pkg.original_price,
                              tier_prices: pkg.tier_prices,
                            },
                            ds,
                            tier,
                            overrides,
                          );
                          return (
                            <td key={ds} className="border p-0">
                              <button
                                type="button"
                                onClick={() => openCell(pkg, ds)}
                                title={`${pkg.name}｜${ds}（${TIER_LABEL[tier]}）\n有效價格 NT$ ${fmt(eff.sale)}\n來源：${PACKAGE_PRICE_SOURCE_LABEL[eff.source]}${applicable ? "" : "\n⚠ 此方案不適用該時段"}`}
                                className={cn(
                                  "w-full h-[52px] px-1 flex flex-col items-center justify-center gap-0.5 hover:bg-muted/60 transition-colors",
                                  !applicable && "opacity-40",
                                )}
                              >
                                <span
                                  className={cn(
                                    "text-xs leading-none",
                                    eff.source === "override" ? "font-semibold text-primary" : "",
                                  )}
                                >
                                  {fmt(eff.sale)}
                                </span>
                                <span
                                  className={cn(
                                    "text-[10px] leading-none px-1 rounded",
                                    eff.source === "override" && "bg-primary/15 text-primary",
                                    eff.source === "tier" && "bg-sky-500/15 text-sky-600",
                                    eff.source === "default" && "text-muted-foreground",
                                  )}
                                >
                                  {PACKAGE_PRICE_SOURCE_LABEL[eff.source]}
                                </span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* 單日改價 */}
      <Dialog open={!!cell} onOpenChange={(o) => { if (!o) setCell(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{cell?.pkg.name}｜{cell?.date}</DialogTitle>
            <DialogDescription>
              留空並清除覆寫後，該日將回退至時段價／預設售價。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>當日售價（NT$）</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={cellSale}
                onChange={(e) => setCellSale(e.target.value)}
                placeholder="例：22000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>當日原價（劃掉價，可留空）</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={cellOriginal}
                onChange={(e) => setCellOriginal(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={clearCell} disabled={saving}>
              <Trash2 className="h-4 w-4 mr-2" />
              清除覆寫
            </Button>
            <Button onClick={saveCell} disabled={saving}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批次改價 */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>整列批次改價</DialogTitle>
            <DialogDescription>
              選擇方案與日期條件，一次套用同一價格（例：8 月所有週六的 6 人方案）。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>套用方案</Label>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setBulkPkgIds(packages.map((p) => p.id))}>全選</Button>
                  <Button size="sm" variant="ghost" onClick={() => setBulkPkgIds([])}>清空</Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-md border p-2 max-h-40 overflow-y-auto">
                {packages.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={bulkPkgIds.includes(p.id)}
                      onCheckedChange={(c) =>
                        setBulkPkgIds((prev) =>
                          c ? [...prev, p.id] : prev.filter((x) => x !== p.id),
                        )
                      }
                    />
                    <span className="truncate">{p.name}（{p.guest_count} 人）</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>起始日</Label>
                <Input type="date" value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>結束日</Label>
                <Input type="date" value={bulkEnd} onChange={(e) => setBulkEnd(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>日期條件</Label>
              <div className="flex flex-wrap gap-2">
                {([
                  ["all", "全部日期"],
                  ["weekday", "平日"],
                  ["friday_sunday", "週五/日"],
                  ["weekend", "週六・假日"],
                  ["custom", "自訂星期"],
                ] as [WeekdayFilter, string][]).map(([v, label]) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    variant={bulkFilter === v ? "default" : "outline"}
                    onClick={() => setBulkFilter(v)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {bulkFilter === "custom" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {weekDayNames.map((n, i) => (
                    <Button
                      key={i}
                      type="button"
                      size="sm"
                      variant={bulkDows.includes(i) ? "default" : "outline"}
                      onClick={() =>
                        setBulkDows((prev) =>
                          prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
                        )
                      }
                    >
                      {n}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant={bulkMode === "set" ? "default" : "outline"}
                onClick={() => setBulkMode("set")}
              >
                設定價格
              </Button>
              <Button
                size="sm"
                variant={bulkMode === "clear" ? "destructive" : "outline"}
                onClick={() => setBulkMode("clear")}
              >
                清除覆寫
              </Button>
            </div>

            {bulkMode === "set" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>售價（NT$）</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={bulkSale}
                    onChange={(e) => setBulkSale(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>原價（可留空）</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    value={bulkOriginal}
                    onChange={(e) => setBulkOriginal(e.target.value)}
                  />
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              將影響 {bulkPkgIds.length} 個方案 × {bulkDates.length} 天，共{" "}
              {bulkPkgIds.length * bulkDates.length} 筆。
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>取消</Button>
            <Button onClick={runBulk} disabled={saving}>
              {bulkMode === "clear" ? "確認清除" : "確認套用"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
