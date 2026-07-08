import { useEffect, useMemo, useState } from "react";
import { differenceInDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

/* ---------- helpers ---------- */

const WEEK_LABELS = ["週1 (1-7)", "週2 (8-14)", "週3 (15-21)", "週4 (22-月底)"] as const;

function getWeekIndex(day: number): 0 | 1 | 2 | 3 {
  if (day <= 7) return 0;
  if (day <= 14) return 1;
  if (day <= 21) return 2;
  return 3;
}

const taipeiDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** timestamptz ISO → 'YYYY-MM-DD' 台北時區 */
function toTaipeiDateStr(iso: string): string {
  return taipeiDateFmt.format(new Date(iso));
}

const fmtMoney = (n: number) => `NT$ ${Math.round(n).toLocaleString()}`;

const emptyBuckets = (): number[] => [0, 0, 0, 0];

/* ---------- component ---------- */

interface AccOption {
  id: string;
  name: string;
}

interface RowBuckets {
  buckets: number[]; // length 4
}

interface GroupedRow extends RowBuckets {
  key: string;
  label: string;
  children?: GroupedRow[];
}

const now = new Date();
const CURRENT_YEAR = now.getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR + 1 - 2023 + 1 }, (_, i) => 2023 + i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function FinancialReportTab() {
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [month, setMonth] = useState<number>(now.getMonth() + 1);

  const [notifAccs, setNotifAccs] = useState<AccOption[]>([]);
  const [selectedAccs, setSelectedAccs] = useState<string[]>([]);
  const [accsLoaded, setAccsLoaded] = useState(false);

  const [loading, setLoading] = useState(false);
  const [row1, setRow1] = useState<number[]>(emptyBuckets());
  const [row2, setRow2] = useState<number[]>(emptyBuckets());
  const [row3, setRow3] = useState<GroupedRow>({ key: "row3", label: "特許加盟", buckets: emptyBuckets(), children: [] });
  const [row4, setRow4] = useState<GroupedRow>({ key: "row4", label: "住房營收", buckets: emptyBuckets(), children: [] });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // 月首日/末日字串（純日期比較用）
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const monthStart = `${monthStr}-01`;
  const monthEndDate = new Date(year, month, 0); // 0 = 上個月最後一天
  const daysInMonth = monthEndDate.getDate();
  const monthEnd = `${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

  /* --- load enabled notification accommodations --- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: settings } = await supabase
        .from("performance_notification_settings")
        .select("accommodation_id")
        .eq("enabled", true);
      const ids = (settings ?? []).map((r: any) => r.accommodation_id).filter(Boolean);
      let opts: AccOption[] = [];
      if (ids.length > 0) {
        const { data: accs } = await supabase
          .from("accommodation_info")
          .select("id, name")
          .in("id", ids);
        opts = (accs ?? []).map((a: any) => ({ id: a.id, name: a.name }));
        opts.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
      }
      if (cancelled) return;
      setNotifAccs(opts);
      setSelectedAccs(opts.map((o) => o.id));
      setAccsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* --- load report --- */
  useEffect(() => {
    if (!accsLoaded) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        /* ---- Row 1 & Row 2: orders in selectedAccs during month ---- */
        const r1 = emptyBuckets();
        const r2 = emptyBuckets();

        // Scout discount codes（全域，比對用大寫集合）
        const { data: scoutCodesRaw } = await supabase
          .from("scout_discount_codes")
          .select("discount_code");
        const scoutCodeSet = new Set<string>(
          (scoutCodesRaw ?? [])
            .map((r: any) => String(r.discount_code ?? "").toUpperCase())
            .filter((c) => c.length > 0),
        );

        if (selectedAccs.length > 0) {
          // 台北月首/月末的 UTC 邊界（涵蓋所有訂單）
          const rangeStart = `${monthStart}T00:00:00+08:00`;
          const rangeEnd = `${monthEnd}T23:59:59.999+08:00`;

          const { data: orders } = await supabase
            .from("orders")
            .select("order_date, final_price, order_status, guest_name, discount_code, accommodation_id")
            .in("accommodation_id", selectedAccs)
            .neq("order_status", "cancelled")
            .gte("order_date", rangeStart)
            .lte("order_date", rangeEnd);

          for (const o of (orders ?? []) as any[]) {
            if (!o.order_date) continue;
            if (o.guest_name === "保留單") continue;
            const price = Number(o.final_price ?? 0);
            if (!(price > 0)) continue;
            const dateStr = toTaipeiDateStr(o.order_date);
            if (dateStr < monthStart || dateStr > monthEnd) continue;
            const day = Number(dateStr.slice(8, 10));
            const w = getWeekIndex(day);
            r1[w] += price;
            const dc = String(o.discount_code ?? "").toUpperCase();
            if (dc && scoutCodeSet.has(dc)) {
              r2[w] += price;
            }
          }
        }

        /* ---- 特許加盟館別 ---- */
        const { data: flagRows } = await supabase
          .from("accommodation_info_flags")
          .select("accommodation_id")
          .eq("has_franchise", true);
        const franchiseAccIds = (flagRows ?? [])
          .map((r: any) => r.accommodation_id)
          .filter(Boolean) as string[];

        const franchiseAccNameMap = new Map<string, string>();
        if (franchiseAccIds.length > 0) {
          const { data: accs } = await supabase
            .from("accommodation_info")
            .select("id, name")
            .in("id", franchiseAccIds);
          for (const a of (accs ?? []) as any[]) {
            franchiseAccNameMap.set(a.id, a.name);
          }
        }

        // project_name → accommodation_id
        const projectToAcc = new Map<string, string>();
        if (franchiseAccIds.length > 0) {
          const { data: projects } = await supabase
            .from("franchise_projects")
            .select("name, accommodation_id")
            .in("accommodation_id", franchiseAccIds);
          for (const p of (projects ?? []) as any[]) {
            if (p.name && p.accommodation_id) {
              projectToAcc.set(p.name, p.accommodation_id);
            }
          }
        }

        /* ---- Row 3: franchise ---- */
        const row3ByAcc = new Map<string, number[]>();
        for (const id of franchiseAccIds) row3ByAcc.set(id, emptyBuckets());

        if (projectToAcc.size > 0) {
          const projectNames = Array.from(projectToAcc.keys());

          const { data: fOrders } = await supabase
            .from("franchise_orders")
            .select("sold_at, plan_name, plan_price, quantity, payment_confirmed")
            .in("plan_name", projectNames)
            .eq("payment_confirmed", true)
            .gte("sold_at", monthStart)
            .lte("sold_at", monthEnd);

          for (const o of (fOrders ?? []) as any[]) {
            const soldAt: string = String(o.sold_at ?? "").slice(0, 10);
            if (!soldAt) continue;
            const accId = projectToAcc.get(o.plan_name);
            if (!accId) continue;
            const qty = Number(o.quantity ?? 1) || 1;
            const amount = Number(o.plan_price ?? 0) * qty;
            const day = Number(soldAt.slice(8, 10));
            const w = getWeekIndex(day);
            const b = row3ByAcc.get(accId) ?? emptyBuckets();
            b[w] += amount;
            row3ByAcc.set(accId, b);
          }

          const { data: fExt } = await supabase
            .from("franchise_external_orders")
            .select("signed_at, project_name, total_amount, contract_progress")
            .in("project_name", projectNames)
            .eq("contract_progress", "已完成")
            .gte("signed_at", monthStart)
            .lte("signed_at", monthEnd);

          for (const o of (fExt ?? []) as any[]) {
            const signed: string = String(o.signed_at ?? "").slice(0, 10);
            if (!signed) continue;
            const accId = projectToAcc.get(o.project_name);
            if (!accId) continue;
            const amount = Number(o.total_amount ?? 0);
            const day = Number(signed.slice(8, 10));
            const w = getWeekIndex(day);
            const b = row3ByAcc.get(accId) ?? emptyBuckets();
            b[w] += amount;
            row3ByAcc.set(accId, b);
          }
        }

        const row3Total = emptyBuckets();
        const row3Children: GroupedRow[] = [];
        for (const [accId, b] of row3ByAcc.entries()) {
          for (let i = 0; i < 4; i++) row3Total[i] += b[i];
          row3Children.push({
            key: `row3-${accId}`,
            label: franchiseAccNameMap.get(accId) ?? accId,
            buckets: b,
          });
        }
        row3Children.sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));

        /* ---- Row 4: 住房營收 (stay-range overlap，按晚均分) ---- */
        const row4ByAcc = new Map<string, number[]>();
        for (const id of franchiseAccIds) row4ByAcc.set(id, emptyBuckets());

        if (franchiseAccIds.length > 0) {
          const { data: stayOrders } = await supabase
            .from("orders")
            .select("check_in_date, check_out_date, final_price, order_status, order_source, accommodation_id")
            .in("accommodation_id", franchiseAccIds)
            .in("order_status", ["confirmed", "hold"])
            .lte("check_in_date", monthEnd)
            .gte("check_out_date", monthStart);

          for (const o of (stayOrders ?? []) as any[]) {
            const ci: string = String(o.check_in_date ?? "").slice(0, 10);
            const co: string = String(o.check_out_date ?? "").slice(0, 10);
            if (!ci || !co) continue;
            const orderPrice = o.order_source === "kol" ? 0 : Number(o.final_price ?? 0);
            const ciDate = new Date(`${ci}T00:00:00`);
            const coDate = new Date(`${co}T00:00:00`);
            const nights = Math.max(1, differenceInDays(coDate, ciDate));
            const daily = orderPrice / nights;
            for (let n = 0; n < nights; n++) {
              const d = new Date(ciDate);
              d.setDate(d.getDate() + n);
              const y = d.getFullYear();
              const m = d.getMonth() + 1;
              if (y !== year || m !== month) continue;
              const day = d.getDate();
              const w = getWeekIndex(day);
              const b = row4ByAcc.get(o.accommodation_id) ?? emptyBuckets();
              b[w] += daily;
              row4ByAcc.set(o.accommodation_id, b);
            }
          }
        }

        const row4Total = emptyBuckets();
        const row4Children: GroupedRow[] = [];
        for (const [accId, b] of row4ByAcc.entries()) {
          for (let i = 0; i < 4; i++) row4Total[i] += b[i];
          row4Children.push({
            key: `row4-${accId}`,
            label: franchiseAccNameMap.get(accId) ?? accId,
            buckets: b,
          });
        }
        row4Children.sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));

        if (cancelled) return;
        setRow1(r1);
        setRow2(r2);
        setRow3({ key: "row3", label: "特許加盟", buckets: row3Total, children: row3Children });
        setRow4({ key: "row4", label: "住房營收", buckets: row4Total, children: row4Children });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, month, selectedAccs, accsLoaded, monthStart, monthEnd]);

  const allSelected = selectedAccs.length === notifAccs.length && notifAccs.length > 0;
  const toggleAcc = (id: string) => {
    setSelectedAccs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };
  const toggleAll = () => {
    setSelectedAccs(allSelected ? [] : notifAccs.map((a) => a.id));
  };

  const rows = useMemo(() => {
    const flat: { row: GroupedRow; depth: number; isChild?: boolean; parentKey?: string }[] = [];
    // Row 1
    flat.push({ row: { key: "row1", label: "訂房組業績", buckets: row1 }, depth: 0 });
    // Row 2
    flat.push({ row: { key: "row2", label: "KOL 總額", buckets: row2 }, depth: 0 });
    // Row 3
    flat.push({ row: row3, depth: 0 });
    if (expanded[row3.key] && row3.children) {
      for (const c of row3.children) flat.push({ row: c, depth: 1, isChild: true, parentKey: row3.key });
    }
    // Row 4
    flat.push({ row: row4, depth: 0 });
    if (expanded[row4.key] && row4.children) {
      for (const c of row4.children) flat.push({ row: c, depth: 1, isChild: true, parentKey: row4.key });
    }
    return flat;
  }, [row1, row2, row3, row4, expanded]);

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>財務報表</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>年份</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>月份</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m} value={String(m)}>{m} 月</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>館別（Row 1、2）</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="truncate">
                    {selectedAccs.length === 0
                      ? "未選擇"
                      : allSelected
                        ? `全部（${notifAccs.length}）`
                        : `已選 ${selectedAccs.length} 家`}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="max-h-72 overflow-y-auto space-y-1">
                  <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    <span className="text-sm font-medium">全選</span>
                  </label>
                  <div className="border-t my-1" />
                  {notifAccs.map((a) => (
                    <label
                      key={a.id}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedAccs.includes(a.id)}
                        onCheckedChange={() => toggleAcc(a.id)}
                      />
                      <span className="text-sm">{a.name}</span>
                    </label>
                  ))}
                  {notifAccs.length === 0 && (
                    <div className="text-sm text-muted-foreground px-2 py-4 text-center">
                      無啟用館別
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px]">項目</TableHead>
                {WEEK_LABELS.map((w) => (
                  <TableHead key={w} className="text-right whitespace-nowrap">{w}</TableHead>
                ))}
                <TableHead className="text-right whitespace-nowrap">TOTAL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="inline h-4 w-4 animate-spin mr-2" />載入中…
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(({ row, depth, isChild }) => {
                  const total = row.buckets.reduce((a, b) => a + b, 0);
                  const expandable = !isChild && (row.children?.length ?? 0) > 0;
                  const isOpen = !!expanded[row.key];
                  return (
                    <TableRow key={row.key} className={isChild ? "bg-muted/30" : ""}>
                      <TableCell className={`font-medium ${depth > 0 ? "pl-8" : ""}`}>
                        {expandable ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:underline"
                            onClick={() =>
                              setExpanded((p) => ({ ...p, [row.key]: !p[row.key] }))
                            }
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            {row.label}
                          </button>
                        ) : (
                          <span>{row.label}</span>
                        )}
                      </TableCell>
                      {row.buckets.map((v, i) => (
                        <TableCell key={i} className="text-right tabular-nums whitespace-nowrap">
                          {fmtMoney(v)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums whitespace-nowrap font-semibold">
                        {fmtMoney(total)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
