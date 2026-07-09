import { useEffect, useMemo, useState, useCallback } from "react";
import { differenceInDays } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, Loader2, Plus } from "lucide-react";


/* ---------- helpers ---------- */

interface WeekRange {
  start: string; // YYYY-MM-DD (inclusive, clipped to month)
  end: string;   // YYYY-MM-DD (inclusive, clipped to month)
  label: string; // e.g. "週1 (7/1-7/5)"
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

const taipeiWeekdayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Taipei",
  weekday: "short",
});

/** Weekday index of a YYYY-MM-DD date in Taipei; 0=Sun, 1=Mon, ..., 6=Sat */
function taipeiWeekday(dateStr: string): number {
  // Interpret as Taipei noon to be safe; formatter yields weekday name.
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  const wd = taipeiWeekdayFmt.format(d);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 0;
}

function addDaysStr(dateStr: string, days: number): string {
  // Use Taipei-noon to avoid DST edge; Taipei has no DST.
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return taipeiDateFmt.format(d);
}

/** Build Mon-Sun weeks that overlap the given year/month (Taipei). 4~5 weeks. */
function buildWeeks(year: number, month: number): WeekRange[] {
  const mm = String(month).padStart(2, "0");
  const monthStart = `${year}-${mm}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${mm}-${String(daysInMonth).padStart(2, "0")}`;

  const dow = taipeiWeekday(monthStart); // 0=Sun..6=Sat
  const daysFromMonday = (dow + 6) % 7; // Mon=0, Sun=6
  let weekStart = addDaysStr(monthStart, -daysFromMonday);

  const weeks: WeekRange[] = [];
  while (weekStart <= monthEnd && weeks.length < 6) {
    const weekEnd = addDaysStr(weekStart, 6);
    const clipStart = weekStart < monthStart ? monthStart : weekStart;
    const clipEnd = weekEnd > monthEnd ? monthEnd : weekEnd;
    if (clipStart <= clipEnd) {
      const sm = Number(clipStart.slice(5, 7));
      const sd = Number(clipStart.slice(8, 10));
      const em = Number(clipEnd.slice(5, 7));
      const ed = Number(clipEnd.slice(8, 10));
      weeks.push({
        start: clipStart,
        end: clipEnd,
        label: `週${weeks.length + 1} (${sm}/${sd}-${em}/${ed})`,
      });
    }
    weekStart = addDaysStr(weekStart, 7);
  }
  return weeks;
}

/** Return 0-based week index for a Taipei date string; -1 if not in month. */
function getWeekIndex(dateStr: string, weeks: WeekRange[]): number {
  for (let i = 0; i < weeks.length; i++) {
    if (dateStr >= weeks[i].start && dateStr <= weeks[i].end) return i;
  }
  return -1;
}

const fmtMoney = (n: number) => `NT$ ${Math.round(n).toLocaleString()}`;

const emptyBuckets = (n: number): number[] => Array.from({ length: n }, () => 0);

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
  const [row1, setRow1] = useState<number[]>([]);
  const [row2, setRow2] = useState<number[]>([]);
  const [row3, setRow3] = useState<GroupedRow>({ key: "row3", label: "特許加盟", buckets: [], children: [] });
  const [row4, setRow4] = useState<GroupedRow>({ key: "row4", label: "住房營收", buckets: [], children: [] });
  const [row5, setRow5] = useState<GroupedRow & { hasAnyRate: boolean }>({ key: "row5", label: "管顧費用", buckets: [], children: [], hasAnyRate: false });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [canManageFees, setCanManageFees] = useState(false);
  const [canViewFees, setCanViewFees] = useState(false);

  // 月首日/末日字串（純日期比較用）
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const monthStart = `${monthStr}-01`;
  const monthEndDate = new Date(year, month, 0); // 0 = 上個月最後一天
  const daysInMonth = monthEndDate.getDate();
  const monthEnd = `${monthStr}-${String(daysInMonth).padStart(2, "0")}`;

  const weeks = useMemo(() => buildWeeks(year, month), [year, month]);
  const weekCount = weeks.length;

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

  /* --- role permissions for 管顧費率設定 --- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (cancelled) return;
      const roleSet = new Set((roles ?? []).map((r: any) => r.role));
      const manage = roleSet.has("hotel_admin") || roleSet.has("super_admin");
      const view = manage || roleSet.has("finance");
      setCanManageFees(manage);
      setCanViewFees(view);
    })();
    return () => { cancelled = true; };
  }, []);

  /* --- load report --- */
  useEffect(() => {
    if (!accsLoaded) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        /* ---- Row 1 & Row 2: orders in selectedAccs during month ---- */
        const r1 = emptyBuckets(weekCount);
        const r2 = emptyBuckets(weekCount);

        // KOL 折扣碼白名單：scout_discount_codes ∪ kol_profiles.cid_code（全域，比對用大寫集合）
        const [{ data: scoutCodesRaw }, { data: kolCidRaw }] = await Promise.all([
          supabase.from("scout_discount_codes").select("discount_code"),
          supabase.from("kol_profiles").select("cid_code").not("cid_code", "is", null),
        ]);
        const kolCodeSet = new Set<string>();
        for (const r of (scoutCodesRaw ?? []) as any[]) {
          const c = String(r.discount_code ?? "").toUpperCase();
          if (c) kolCodeSet.add(c);
        }
        for (const r of (kolCidRaw ?? []) as any[]) {
          const c = String(r.cid_code ?? "").toUpperCase();
          if (c) kolCodeSet.add(c);
        }

        if (selectedAccs.length > 0) {
          // 台北時區月份邊界（[startDay, endExclusive)）
          const nextYear = month === 12 ? year + 1 : year;
          const nextMonth = month === 12 ? 1 : month + 1;
          const startDay = `${year}-${String(month).padStart(2, "0")}-01T00:00:00+08:00`;
          const endExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+08:00`;

          // Row 1：COALESCE(confirmed_at, order_date) 落在當月（對齊 TeamOrders 口徑）
          const { data: row1Orders } = await supabase
            .from("orders")
            .select("id, order_date, confirmed_at, final_price, order_status, guest_name, accommodation_id")
            .in("accommodation_id", selectedAccs)
            .neq("order_status", "cancelled")
            .or(
              `and(confirmed_at.gte.${startDay},confirmed_at.lt.${endExclusive}),` +
                `and(confirmed_at.is.null,order_date.gte.${startDay},order_date.lt.${endExclusive})`,
            );

          // Row 2：order_date 落在當月（KOL 邏輯不變）
          const { data: row2Orders } = await supabase
            .from("orders")
            .select("id, order_date, final_price, order_status, guest_name, discount_code, accommodation_id")
            .in("accommodation_id", selectedAccs)
            .neq("order_status", "cancelled")
            .gte("order_date", startDay)
            .lt("order_date", endExclusive);

          const row1List = (row1Orders ?? []) as any[];
          const row2List = (row2Orders ?? []) as any[];

          // 只需 Row 1 訂單查 order_meta eligibility
          const row1Ids = row1List.map((o) => o.id).filter(Boolean);
          const eligibleCloserSet = new Set<string>();
          if (row1Ids.length > 0) {
            const CHUNK = 500;
            for (let i = 0; i < row1Ids.length; i += CHUNK) {
              const slice = row1Ids.slice(i, i + CHUNK);
              const { data: metas } = await supabase
                .from("order_meta")
                .select("order_id, closer_id, is_excluded")
                .in("order_id", slice)
                .not("closer_id", "is", null);
              for (const m of (metas ?? []) as any[]) {
                if (m.is_excluded === true) continue;
                if (m.order_id) eligibleCloserSet.add(m.order_id);
              }
            }
          }

          // Row 1 累計
          for (const o of row1List) {
            if (o.guest_name === "保留單") continue;
            const price = Number(o.final_price ?? 0);
            if (!(price > 0)) continue;
            if (!eligibleCloserSet.has(o.id)) continue;
            const basisIso: string | null = o.confirmed_at ?? o.order_date ?? null;
            if (!basisIso) continue;
            const basisStr = toTaipeiDateStr(basisIso);
            if (basisStr < monthStart || basisStr > monthEnd) continue;
            const w = getWeekIndex(basisStr, weeks);
            if (w < 0) continue;
            r1[w] += price;
          }

          // Row 2 累計（KOL）
          for (const o of row2List) {
            if (o.guest_name === "保留單") continue;
            const price = Number(o.final_price ?? 0);
            if (!(price > 0)) continue;
            if (!o.order_date) continue;
            const orderDateStr = toTaipeiDateStr(o.order_date);
            if (orderDateStr < monthStart || orderDateStr > monthEnd) continue;
            const dc = String(o.discount_code ?? "").toUpperCase();
            if (!dc || !kolCodeSet.has(dc)) continue;
            const w = getWeekIndex(orderDateStr, weeks);
            if (w < 0) continue;
            r2[w] += price;
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
        for (const id of franchiseAccIds) row3ByAcc.set(id, emptyBuckets(weekCount));

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
            const w = getWeekIndex(soldAt, weeks);
            if (w < 0) continue;
            const b = row3ByAcc.get(accId) ?? emptyBuckets(weekCount);
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
            const w = getWeekIndex(signed, weeks);
            if (w < 0) continue;
            const b = row3ByAcc.get(accId) ?? emptyBuckets(weekCount);
            b[w] += amount;
            row3ByAcc.set(accId, b);
          }
        }

        const row3Total = emptyBuckets(weekCount);
        const row3Children: GroupedRow[] = [];
        for (const [accId, b] of row3ByAcc.entries()) {
          for (let i = 0; i < weekCount; i++) row3Total[i] += b[i];
          row3Children.push({
            key: `row3-${accId}`,
            label: franchiseAccNameMap.get(accId) ?? accId,
            buckets: b,
          });
        }
        row3Children.sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));

        /* ---- Row 4: 住房營收 (stay-range overlap，按晚均分) ---- */
        const row4ByAcc = new Map<string, number[]>();
        for (const id of franchiseAccIds) row4ByAcc.set(id, emptyBuckets(weekCount));

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
            let cur = ci;
            for (let n = 0; n < nights; n++) {
              if (cur >= monthStart && cur <= monthEnd) {
                const w = getWeekIndex(cur, weeks);
                if (w >= 0) {
                  const b = row4ByAcc.get(o.accommodation_id) ?? emptyBuckets(weekCount);
                  b[w] += daily;
                  row4ByAcc.set(o.accommodation_id, b);
                }
              }
              cur = addDaysStr(cur, 1);
            }
          }
        }

        const row4Total = emptyBuckets(weekCount);
        const row4Children: GroupedRow[] = [];
        for (const [accId, b] of row4ByAcc.entries()) {
          for (let i = 0; i < weekCount; i++) row4Total[i] += b[i];
          row4Children.push({
            key: `row4-${accId}`,
            label: franchiseAccNameMap.get(accId) ?? accId,
            buckets: b,
          });
        }
        row4Children.sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));

        /* ---- Row 5: 管顧費用 = 住房營收 × 費率（依館別、依生效日取最新） ---- */
        const row5ByAcc = new Map<string, number[]>();
        let hasAnyRate = false;
        if (franchiseAccIds.length > 0) {
          const { data: feeRows } = await supabase
            .from("consulting_fee_settings")
            .select("rate, accommodation_id, effective_from")
            .lte("effective_from", monthStart)
            .order("effective_from", { ascending: false });
          const fees = (feeRows ?? []) as any[];
          const pickRate = (accId: string): number | null => {
            const specific = fees.find((f) => f.accommodation_id === accId);
            if (specific) return Number(specific.rate);
            const fallback = fees.find((f) => f.accommodation_id == null);
            if (fallback) return Number(fallback.rate);
            return null;
          };
          for (const accId of franchiseAccIds) {
            const stay = row4ByAcc.get(accId) ?? emptyBuckets(weekCount);
            const rate = pickRate(accId);
            if (rate == null) {
              row5ByAcc.set(accId, emptyBuckets(weekCount));
              continue;
            }
            hasAnyRate = true;
            row5ByAcc.set(accId, stay.map((v) => v * rate));
          }
        }
        const row5Total = emptyBuckets(weekCount);
        const row5Children: GroupedRow[] = [];
        for (const [accId, b] of row5ByAcc.entries()) {
          for (let i = 0; i < weekCount; i++) row5Total[i] += b[i];
          row5Children.push({
            key: `row5-${accId}`,
            label: franchiseAccNameMap.get(accId) ?? accId,
            buckets: b,
          });
        }
        row5Children.sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));

        if (cancelled) return;
        setRow1(r1);
        setRow2(r2);
        setRow3({ key: "row3", label: "特許加盟", buckets: row3Total, children: row3Children });
        setRow4({ key: "row4", label: "住房營收", buckets: row4Total, children: row4Children });
        setRow5({ key: "row5", label: "管顧費用", buckets: row5Total, children: row5Children, hasAnyRate });
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
    // Row 5
    flat.push({ row: { key: row5.key, label: row5.label, buckets: row5.buckets }, depth: 0 });
    return flat;
  }, [row1, row2, row3, row4, row5, expanded]);

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
                {weeks.map((w, i) => (
                  <TableHead key={i} className="text-right whitespace-nowrap">{w.label}</TableHead>
                ))}
                <TableHead className="text-right whitespace-nowrap">TOTAL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={weekCount + 2} className="text-center py-8">
                    <Loader2 className="inline h-4 w-4 animate-spin mr-2" />載入中…
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(({ row, depth, isChild }) => {
                  const total = row.buckets.reduce((a, b) => a + b, 0);
                  const expandable = !isChild && (row.children?.length ?? 0) > 0;
                  const isOpen = !!expanded[row.key];
                  const isRow5 = row.key === "row5";
                  const totalDash = isRow5 && !row5.hasAnyRate;
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
                          {isRow5 ? "—" : fmtMoney(v)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums whitespace-nowrap font-semibold">
                        {totalDash ? "—" : fmtMoney(total)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
              {!loading && (() => {
                const totals = emptyBuckets(weekCount);
                // Row 5 週欄位不納入合計；只有 TOTAL 加入 Row 5 總額
                for (const b of [row1, row2, row3.buckets, row4.buckets]) {
                  for (let i = 0; i < weekCount; i++) totals[i] += (b[i] ?? 0);
                }
                const row5Total = row5.buckets.reduce((a, b) => a + b, 0);
                const grand = totals.reduce((a, b) => a + b, 0) + row5Total;
                return (
                  <TableRow className="bg-muted font-bold border-t-2">
                    <TableCell className="font-bold">合計</TableCell>
                    {totals.map((v, i) => (
                      <TableCell key={i} className="text-right tabular-nums whitespace-nowrap font-bold">
                        {fmtMoney(v)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums whitespace-nowrap font-bold">
                      {fmtMoney(grand)}
                    </TableCell>
                  </TableRow>
                );
              })()}
            </TableBody>
          </Table>
        </div>

        <div className="text-xs text-muted-foreground space-y-2 leading-relaxed pt-2 border-t">
          <p>
            <span className="font-medium text-foreground">訂房組業績：</span>
            以「訂單確認時間」（confirmed_at）為歸屬基準；若訂單尚未有確認時間，則改以「下單日」（order_date）為準。僅統計已指定成交人且未被標記「不分潤」的訂單，排除保留單與金額為零的訂單。此數字口徑與成交大師一致。
          </p>
          <p>
            <span className="font-medium text-foreground">KOL 總額：</span>
            以「下單日」（order_date）為歸屬基準。訂單折扣碼需符合星探邀約 CID（kol_profiles）或星探專屬折扣碼(scout_discount_codes）之一才列入，排除保留單與金額為零的訂單。
          </p>
          <div>
            <span className="font-medium text-foreground">特許加盟：</span>
            <ul className="list-none pl-4 mt-1 space-y-1">
              <li>・內部訂單（franchise_orders）：以「成交日期」（sold_at）為歸屬基準，需已確認付款（payment_confirmed = true）。</li>
              <li>・外部訂單（franchise_external_orders）：以「簽約日期」（signed_at）為歸屬基準，需合約進度為「已完成」。</li>
            </ul>
          </div>
          <p>
            <span className="font-medium text-foreground">住房營收：</span>
            以「入住日期」（check_in_date）逐晚均分計算，跨月訂單按實際住宿晚數拆分至對應月份。納入已確認（confirmed）及保留單（hold）訂單，KOL 訂單（order_source = kol）金額計為零。
          </p>
          <p>
            <span className="font-medium text-foreground">管顧費用：</span>
            = 住房營收 × 管顧費率。費率以「當月起始日」為基準，取生效日 ≤ 當月 1 日的最新一筆設定；優先套用館別專屬費率，若無則使用全館通用預設值。無任何費率設定時該欄顯示「—」。
          </p>
          <p className="text-amber-600 dark:text-amber-500">
            ⚠️ 各列日期基準不同，與財務 Excel 對帳時請注意各列所使用的日期口徑。
          </p>
        </div>

        {canViewFees && <ConsultingFeeSettingsBlock canManage={canManageFees} />}
      </CardContent>
    </Card>
  );
}

/* ---------- 管顧費率設定區塊 ---------- */

interface FeeRow {
  id: string;
  rate: number;
  accommodation_id: string | null;
  effective_from: string;
  note: string | null;
}

function ConsultingFeeSettingsBlock({ canManage }: { canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [accs, setAccs] = useState<AccOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    effective_from: new Date().toISOString().slice(0, 10),
    ratePercent: "",
    accommodation_id: "all" as string,
    note: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: feeData }, { data: accData }] = await Promise.all([
        supabase
          .from("consulting_fee_settings")
          .select("id, rate, accommodation_id, effective_from, note")
          .order("effective_from", { ascending: false }),
        supabase.from("accommodation_info").select("id, name").order("name"),
      ]);
      setRows((feeData ?? []) as FeeRow[]);
      setAccs(((accData ?? []) as any[]).map((a) => ({ id: a.id, name: a.name })));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const accMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accs) m.set(a.id, a.name);
    return m;
  }, [accs]);

  const handleSubmit = async () => {
    const pct = Number(form.ratePercent);
    if (!form.effective_from || !Number.isFinite(pct) || pct < 0) {
      toast.error("請輸入有效的生效日期與費率");
      return;
    }
    const rate = pct / 100;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("consulting_fee_settings").insert({
        rate,
        accommodation_id: form.accommodation_id === "all" ? null : form.accommodation_id,
        effective_from: form.effective_from,
        note: form.note.trim() || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast.success("已新增費率版本");
      setDialogOpen(false);
      setForm({
        effective_from: new Date().toISOString().slice(0, 10),
        ratePercent: "",
        accommodation_id: "all",
        note: "",
      });
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "新增失敗");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pt-4 border-t mt-4">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        管顧費率設定
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {canManage && (
            <div className="flex justify-end">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    新增費率版本
                  </Button>
                </DialogTrigger>
                <DialogContent className="overflow-x-hidden">
                  <DialogHeader>
                    <DialogTitle>新增費率版本</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label>生效日期</Label>
                      <Input
                        type="date"
                        value={form.effective_from}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, effective_from: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>費率 (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="例如 10 表示 10%"
                        value={form.ratePercent}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, ratePercent: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>適用館別</Label>
                      <Select
                        value={form.accommodation_id}
                        onValueChange={(v) =>
                          setForm((f) => ({ ...f, accommodation_id: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">全館通用</SelectItem>
                          {accs.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>備註</Label>
                      <Textarea
                        value={form.note}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, note: e.target.value }))
                        }
                        rows={2}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      disabled={saving}
                    >
                      取消
                    </Button>
                    <Button onClick={handleSubmit} disabled={saving}>
                      {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                      新增
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">生效日期</TableHead>
                  <TableHead className="text-right whitespace-nowrap">費率</TableHead>
                  <TableHead className="whitespace-nowrap">適用館別</TableHead>
                  <TableHead>備註</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6">
                      <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
                      載入中…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                      尚無費率設定
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{r.effective_from}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {(Number(r.rate) * 100).toFixed(2)}%
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.accommodation_id
                          ? accMap.get(r.accommodation_id) ?? "（已刪除）"
                          : <span className="text-muted-foreground">全館通用</span>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.note ?? ""}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
