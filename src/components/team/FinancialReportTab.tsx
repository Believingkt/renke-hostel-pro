import { Fragment, useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
import { Badge } from "@/components/ui/badge";


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
  const [row1, setRow1] = useState<GroupedRow>({ key: "row1", label: "訂房組業績", buckets: [], children: [] });
  const [row2, setRow2] = useState<GroupedRow>({ key: "row2", label: "KOL 總額", buckets: [], children: [] });
  const [row3, setRow3] = useState<GroupedRow>({ key: "row3", label: "特許加盟", buckets: [], children: [] });
  const [row4, setRow4] = useState<GroupedRow>({ key: "row4", label: "住房營收", buckets: [], children: [] });
  const [row5, setRow5] = useState<GroupedRow & { hasAnyRate: boolean }>({ key: "row5", label: "管顧費用", buckets: [], children: [], hasAnyRate: false });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [totalsOpen, setTotalsOpen] = useState(false);

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
        /* ---- 幣別換算：抓所有相關館別的副幣別匯率 ---- */
        // DB final_price 為訂單原幣別金額（JPY 館訂單即為日圓），此處統一換算成 TWD 顯示。
        const jpyRateByAcc = new Map<string, number>(); // accId → JPY per TWD
        {
          const { data: accCurrencyRows } = await supabase
            .from("accommodation_info")
            .select("id, secondary_currency, secondary_currency_rate");
          for (const a of (accCurrencyRows ?? []) as any[]) {
            if (String(a.secondary_currency ?? "").toUpperCase() === "JPY") {
              const r = Number(a.secondary_currency_rate);
              if (Number.isFinite(r) && r > 0) jpyRateByAcc.set(a.id, r);
            }
          }
        }
        const toTwd = (price: number, accId: string, displayCurrency: string | null | undefined): number => {
          const rate = jpyRateByAcc.get(accId);
          if (!rate || rate <= 0) return price; // 非 JPY 館 → 原值
          const cur = String(displayCurrency ?? "").toUpperCase();
          // JPY 館：display_currency 為 JPY 或未標記時視為原幣 JPY，換算成 TWD
          if (cur === "" || cur === "JPY") return price / rate;
          return price; // 已明確標為 TWD → 不動
        };
        const readDisplayCurrency = (o: any): string | null => {
          const meta = o?.order_meta;
          const v = Array.isArray(meta) ? meta[0]?.display_currency : meta?.display_currency;
          return v ?? null;
        };

        /* ---- Row 1 & Row 2: orders in selectedAccs during month ---- */
        const r1ByAcc = new Map<string, number[]>();
        const r2ByAcc = new Map<string, number[]>();
        for (const id of selectedAccs) {
          r1ByAcc.set(id, emptyBuckets(weekCount));
          r2ByAcc.set(id, emptyBuckets(weekCount));
        }

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

          // Row 1：order_date（下單日）落在當月，對齊成交大師口徑
          const { data: row1Orders } = await supabase
            .from("orders")
            .select("id, order_date, final_price, order_status, guest_name, accommodation_id, order_meta(display_currency)")
            .in("accommodation_id", selectedAccs)
            .neq("order_status", "cancelled")
            .gte("order_date", startDay)
            .lt("order_date", endExclusive);

          // Row 2：order_date 落在當月（KOL 邏輯不變）
          const { data: row2Orders } = await supabase
            .from("orders")
            .select("id, order_date, final_price, order_status, guest_name, discount_code, accommodation_id, order_meta(display_currency)")
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

          // Row 2 累計（KOL，依館別）— 先算，並收集 KOL 訂單 ID 供 Row 1 排除
          const kolOrderIds = new Set<string>();
          for (const o of row2List) {
            if (o.order_status === "hold") continue;
            const rawPrice = Number(o.final_price ?? 0);
            if (!(rawPrice > 0)) continue;
            if (!o.order_date) continue;
            const orderDateStr = toTaipeiDateStr(o.order_date);
            if (orderDateStr < monthStart || orderDateStr > monthEnd) continue;
            const dc = String(o.discount_code ?? "").toUpperCase();
            if (!dc || !kolCodeSet.has(dc)) continue;
            if (o.id) kolOrderIds.add(o.id);
            const w = getWeekIndex(orderDateStr, weeks);
            if (w < 0) continue;
            const accId = o.accommodation_id;
            if (!accId) continue;
            const price = toTwd(rawPrice, accId, readDisplayCurrency(o));
            const b = r2ByAcc.get(accId) ?? emptyBuckets(weekCount);
            b[w] += price;
            r2ByAcc.set(accId, b);
          }

          // Row 1 累計（依館別）— 排除已計入 Row 2 的 KOL 訂單，避免重複
          for (const o of row1List) {
            if (o.order_status === "hold") continue;
            const rawPrice = Number(o.final_price ?? 0);
            if (!(rawPrice > 0)) continue;
            if (!eligibleCloserSet.has(o.id)) continue;
            if (kolOrderIds.has(o.id)) continue;
            if (!o.order_date) continue;
            const basisStr = toTaipeiDateStr(o.order_date);
            if (basisStr < monthStart || basisStr > monthEnd) continue;
            const w = getWeekIndex(basisStr, weeks);
            if (w < 0) continue;
            const accId = o.accommodation_id;
            if (!accId) continue;
            const price = toTwd(rawPrice, accId, readDisplayCurrency(o));
            const b = r1ByAcc.get(accId) ?? emptyBuckets(weekCount);
            b[w] += price;
            r1ByAcc.set(accId, b);
          }
        }

        const notifAccNameMap = new Map<string, string>();
        for (const a of notifAccs) notifAccNameMap.set(a.id, a.name);
        const buildGrouped = (
          key: string,
          label: string,
          byAcc: Map<string, number[]>,
        ): GroupedRow => {
          const total = emptyBuckets(weekCount);
          const children: GroupedRow[] = [];
          for (const accId of selectedAccs) {
            const b = byAcc.get(accId) ?? emptyBuckets(weekCount);
            for (let i = 0; i < weekCount; i++) total[i] += b[i];
            const accTotal = b.reduce((a, v) => a + v, 0);
            if (accTotal <= 0) continue;
            children.push({
              key: `${key}-${accId}`,
              label: notifAccNameMap.get(accId) ?? accId,
              buckets: b,
            });
          }
          children.sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));
          return { key, label, buckets: total, children };
        };

        const row1Grouped = buildGrouped("row1", "訂房組業績", r1ByAcc);
        const row2Grouped = buildGrouped("row2", "KOL 總額", r2ByAcc);

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

          // Widen fetch to ±3 months so we can pick up early_payout_month rows via JS filter
          const wideStart = `${year}-${String(month).padStart(2, "0")}-01`;
          const wideStartDate = new Date(year, month - 1 - 3, 1);
          const wideEndDate = new Date(year, month - 1 + 3 + 1, 0);
          const fmtDate = (d: Date) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const fetchStart = fmtDate(wideStartDate);
          const fetchEnd = fmtDate(wideEndDate);
          void wideStart;

          const monthKey = `${year}-${String(month).padStart(2, "0")}`;
          const matchesTargetMonth = (r: any, dateField: string) => {
            const ep = (r?.early_payout_month ?? null) as string | null;
            if (ep) return ep === monthKey;
            return String(r?.[dateField] ?? "").slice(0, 7) === monthKey;
          };

          const { data: fOrders } = await supabase
            .from("franchise_orders")
            .select("sold_at, plan_name, plan_price, quantity, payment_confirmed, early_payout_month")
            .in("plan_name", projectNames)
            .eq("payment_confirmed", true)
            .gte("sold_at", fetchStart)
            .lte("sold_at", fetchEnd);

          for (const o of (fOrders ?? []) as any[]) {
            if (!matchesTargetMonth(o, "sold_at")) continue;
            const soldAt: string = String(o.sold_at ?? "").slice(0, 10);
            if (!soldAt) continue;
            const accId = projectToAcc.get(o.plan_name);
            if (!accId) continue;
            const qty = Number(o.quantity ?? 1) || 1;
            const amount = Number(o.plan_price ?? 0) * qty;
            // Early-paid rows may sit outside target month; drop them into first week for visibility.
            let w = getWeekIndex(soldAt, weeks);
            if (w < 0) w = 0;
            const b = row3ByAcc.get(accId) ?? emptyBuckets(weekCount);
            b[w] += amount;
            row3ByAcc.set(accId, b);
          }

          const { data: fExt } = await supabase
            .from("franchise_external_orders")
            .select("signed_at, project_name, total_amount, contract_progress, early_payout_month")
            .in("project_name", projectNames)
            .eq("contract_progress", "已完成")
            .gte("signed_at", fetchStart)
            .lte("signed_at", fetchEnd);

          for (const o of (fExt ?? []) as any[]) {
            if (!matchesTargetMonth(o, "signed_at")) continue;
            const signed: string = String(o.signed_at ?? "").slice(0, 10);
            if (!signed) continue;
            const accId = projectToAcc.get(o.project_name);
            if (!accId) continue;
            const amount = Number(o.total_amount ?? 0);
            let w = getWeekIndex(signed, weeks);
            if (w < 0) w = 0;
            const b = row3ByAcc.get(accId) ?? emptyBuckets(weekCount);
            b[w] += amount;
            row3ByAcc.set(accId, b);
          }
        }

        const row3Total = emptyBuckets(weekCount);
        const row3Children: GroupedRow[] = [];
        for (const [accId, b] of row3ByAcc.entries()) {
          for (let i = 0; i < weekCount; i++) row3Total[i] += b[i];
          const accTotal = b.reduce((a, v) => a + v, 0);
          if (accTotal <= 0) continue;
          row3Children.push({
            key: `row3-${accId}`,
            label: franchiseAccNameMap.get(accId) ?? accId,
            buckets: b,
          });
        }
        row3Children.sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));


        /* ---- 收集有管顧費率設定的館別（Row 4/5 使用）
               費率來源已收斂為業主月結費率 owner_settlement_pricing_rules ---- */
        const { data: feeRowsAll } = await supabase
          .from("owner_settlement_pricing_rules")
          .select("commission_rate, commission_threshold, accommodation_id, effective_from")
          .lte("effective_from", monthStart)
          .order("effective_from", { ascending: false });
        const fees = ((feeRowsAll ?? []) as any[]).map((f) => ({
          accommodation_id: f.accommodation_id as string,
          rate: Number(f.commission_rate) || 0,
          revenue_threshold: Number(f.commission_threshold) || 0,
          effective_from: f.effective_from as string,
        }));
        const consultingAccIds = Array.from(
          new Set(fees.map((f) => f.accommodation_id).filter(Boolean) as string[])
        );

        // Row 4/5 適用館別 = 有費率設定「且」為特許加盟的館別
        const franchiseIdSet = new Set(franchiseAccIds);
        const stayAccIdSet = new Set<string>(consultingAccIds.filter((id) => franchiseIdSet.has(id)));
        const stayAccIds = Array.from(stayAccIdSet);



        // 補齊名稱對照
        const stayAccNameMap = new Map<string, string>(franchiseAccNameMap);
        const missingNameIds = stayAccIds.filter((id) => !stayAccNameMap.has(id));
        if (missingNameIds.length > 0) {
          const { data: extraAccs } = await supabase
            .from("accommodation_info")
            .select("id, name")
            .in("id", missingNameIds);
          for (const a of (extraAccs ?? []) as any[]) {
            stayAccNameMap.set(a.id, a.name);
          }
        }

        /* ---- Row 4: 住房營收 (stay-range overlap，按晚均分) ---- */
        const row4ByAcc = new Map<string, number[]>();
        for (const id of stayAccIds) row4ByAcc.set(id, emptyBuckets(weekCount));

        if (stayAccIds.length > 0) {
          const { data: stayOrders } = await supabase
            .from("orders")
            .select("check_in_date, check_out_date, final_price, order_status, order_source, accommodation_id, order_meta(display_currency)")
            .in("accommodation_id", stayAccIds)
            .eq("order_status", "confirmed")
            .lte("check_in_date", monthEnd)
            .gte("check_out_date", monthStart);

          for (const o of (stayOrders ?? []) as any[]) {
            const ci: string = String(o.check_in_date ?? "").slice(0, 10);
            const co: string = String(o.check_out_date ?? "").slice(0, 10);
            if (!ci || !co) continue;
            const orderPrice = toTwd(Number(o.final_price ?? 0), o.accommodation_id, readDisplayCurrency(o));
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
          const accTotal = b.reduce((a, v) => a + v, 0);
          if (accTotal <= 0) continue;
          row4Children.push({
            key: `row4-${accId}`,
            label: stayAccNameMap.get(accId) ?? accId,
            buckets: b,
          });
        }
        row4Children.sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));


        /* ---- Row 5: 管顧費用 = 住房營收 × 費率（依館別、依生效日取最新） ---- */
        const row5ByAcc = new Map<string, number[]>();
        let hasAnyRate = false;
        if (stayAccIds.length > 0) {
          const pickRateConfig = (accId: string): { rate: number; threshold: number } | null => {
            const specific = fees.find((f) => f.accommodation_id === accId);
            if (specific) return { rate: Number(specific.rate), threshold: Number(specific.revenue_threshold ?? 0) || 0 };
            const fallback = fees.find((f) => f.accommodation_id == null);
            if (fallback) return { rate: Number(fallback.rate), threshold: Number(fallback.revenue_threshold ?? 0) || 0 };
            return null;
          };
          for (const accId of stayAccIds) {
            const stay = row4ByAcc.get(accId) ?? emptyBuckets(weekCount);
            const cfg = pickRateConfig(accId);
            if (cfg == null) {
              row5ByAcc.set(accId, emptyBuckets(weekCount));
              continue;
            }
            hasAnyRate = true;
            const monthStayTotal = stay.reduce((a, b) => a + b, 0);
            if (cfg.threshold > 0) {
              // 累進制：僅超過門檻的部分計費，並按各週住房營收比例分配
              if (monthStayTotal <= cfg.threshold) {
                row5ByAcc.set(accId, emptyBuckets(weekCount));
                continue;
              }
              const billableBase = monthStayTotal - cfg.threshold;
              row5ByAcc.set(
                accId,
                stay.map((v) => (monthStayTotal > 0 ? (v / monthStayTotal) * billableBase * cfg.rate : 0)),
              );
            } else {
              // 無門檻：整月住房營收 × 費率
              row5ByAcc.set(accId, stay.map((v) => v * cfg.rate));
            }
          }
        }
        const row5Total = emptyBuckets(weekCount);
        const row5Children: GroupedRow[] = [];
        for (const [accId, b] of row5ByAcc.entries()) {
          for (let i = 0; i < weekCount; i++) row5Total[i] += b[i];
          const stayTotal = (row4ByAcc.get(accId) ?? []).reduce((a, v) => a + v, 0);
          if (stayTotal <= 0) continue;
          row5Children.push({
            key: `row5-${accId}`,
            label: stayAccNameMap.get(accId) ?? accId,
            buckets: b,
          });
        }
        row5Children.sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));


        if (cancelled) return;
        setRow1(row1Grouped);
        setRow2(row2Grouped);
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
    flat.push({ row: row1, depth: 0 });
    if (expanded[row1.key] && row1.children) {
      for (const c of row1.children) flat.push({ row: c, depth: 1, isChild: true, parentKey: row1.key });
    }
    // Row 2
    flat.push({ row: row2, depth: 0 });
    if (expanded[row2.key] && row2.children) {
      for (const c of row2.children) flat.push({ row: c, depth: 1, isChild: true, parentKey: row2.key });
    }
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
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          報表數據為即時查詢：KOL總額於10日快照後執行最終金額結算。
        </p>
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
            <Label>可篩選訂房組業績與 KOL 總額</Label>
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
                rows.map(({ row, depth, isChild }, idx) => {
                  const total = row.buckets.reduce((a, b) => a + b, 0);
                  const expandable = !isChild && (row.children?.length ?? 0) > 0;
                  const isOpen = !!expanded[row.key];
                  const isRow5 = row.key === "row5";
                  const totalDash = isRow5 && !row5.hasAnyRate;
                  const nextKey = rows[idx + 1]?.row.key;
                  const isRow2Group = row.key === "row2" || row.key.startsWith("row2-");
                  const showTotalsAfter =
                    isRow2Group && (!nextKey || !(nextKey === "row2" || nextKey.startsWith("row2-")));
                  const totalsBuckets = emptyBuckets(weekCount);
                  for (let i = 0; i < weekCount; i++) {
                    totalsBuckets[i] = (row1.buckets[i] ?? 0) + (row2.buckets[i] ?? 0);
                  }
                  const totalsGrand = totalsBuckets.reduce((a, b) => a + b, 0);
                  return (
                    <Fragment key={row.key}>
                    <TableRow className={isChild ? "bg-muted/30" : ""}>
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
                    {showTotalsAfter && (
                      totalsOpen ? (
                        <TableRow className="bg-muted font-bold border-y-2">
                          <TableCell className="font-bold">
                            <span className="inline-flex items-center gap-2">
                              合計
                              <button
                                type="button"
                                className="text-xs font-normal text-muted-foreground hover:underline"
                                onClick={() => setTotalsOpen(false)}
                              >
                                − 收合
                              </button>
                            </span>
                          </TableCell>
                          {totalsBuckets.map((v, i) => (
                            <TableCell key={i} className="text-right tabular-nums whitespace-nowrap font-bold">
                              {fmtMoney(v)}
                            </TableCell>
                          ))}
                          <TableCell className="text-right tabular-nums whitespace-nowrap font-bold">
                            {fmtMoney(totalsGrand)}
                          </TableCell>
                        </TableRow>
                      ) : (
                        <TableRow className="hover:bg-transparent border-0">
                          <TableCell colSpan={weekCount + 2} className="py-1 text-center">
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                              onClick={() => setTotalsOpen(true)}
                            >
                              + 展開合計
                            </button>
                          </TableCell>
                        </TableRow>
                      )
                    )}

                    </Fragment>
                  );
                })

              )}
            </TableBody>
          </Table>
        </div>

        <div className="text-xs text-muted-foreground space-y-2 leading-relaxed pt-2 border-t">
          <p>
            <span className="font-medium text-foreground">訂房組業績：</span>
            以下單日為基準，僅統計已指定成交人且未排除分潤的訂單。數字口徑與成交大師一致。
          </p>
          <p>
            <span className="font-medium text-foreground">KOL 總額：</span>
            以下單日為基準，折扣碼需符合星探邀約 CID 或星探專屬折扣碼之一才列入。
          </p>
          <p>
            <span className="font-medium text-foreground">特許加盟：</span>
            內部訂單以成交日期為基準（需已確認付款）；外部訂單以簽約日期為基準（需合約已完成）。
          </p>
          <p>
            <span className="font-medium text-foreground">住房營收：</span>
            以入住日逐晚均分計算,僅納入已確認訂單（不含保留單）,KOL 訂單依實際付款金額計算。⚠️ 與 admin 住房率分析頁面口徑不同（admin 含保留單且 KOL 訂單強制計為零）。
          </p>
          <p>
            <span className="font-medium text-foreground">管顧費用：</span>
            住房營收 × 管顧費率。若設有業績門檻,僅超過門檻的部分金額計費。費率以當月起始日為基準取最新一筆設定,優先套用館別專屬費率。
          </p>
          <p className="text-amber-600 dark:text-amber-500">
            ⚠️ 各列日期基準不同,對帳時請特別注意。
          </p>
        </div>


        {canViewFees && <ConsultingFeeSettingsBlock canManage={canManageFees} year={year} month={month} />}
      </CardContent>
    </Card>
  );
}

/* ---------- 管顧費率檢視區塊（唯讀，來源已收斂至業主月結費率） ---------- */

interface RateViewRow {
  accId: string;
  accName: string;
  rate: number | null;
  threshold: number;
  effectiveFrom: string | null;
}

const HQ_RATE_SETTINGS_URL = "/hq/bonus-settings?tab=owner-settlement";

function ConsultingFeeSettingsBlock({
  canManage,
  year,
  month,
}: {
  canManage: boolean;
  year: number;
  month: number;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<RateViewRow[]>([]);
  const [loading, setLoading] = useState(false);

  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: ruleData }, { data: accData }] = await Promise.all([
        supabase
          .from("owner_settlement_pricing_rules")
          .select("accommodation_id, commission_rate, commission_threshold, effective_from")
          .lte("effective_from", monthStart)
          .order("effective_from", { ascending: false }),
        supabase
          .from("accommodation_info")
          .select("id, name, is_active")
          .eq("is_active", true)
          .neq("name", "奧丁丁測試")
          .order("name"),
      ]);
      const rules = (ruleData ?? []) as any[];
      const accList = ((accData ?? []) as any[]).map((a) => ({ id: a.id as string, name: a.name as string }));
      setRows(
        accList.map((a) => {
          const hit = rules.find((r) => r.accommodation_id === a.id);
          return {
            accId: a.id,
            accName: a.name,
            rate: hit ? Number(hit.commission_rate) : null,
            threshold: hit ? Number(hit.commission_threshold ?? 0) || 0 : 0,
            effectiveFrom: hit ? String(hit.effective_from).slice(0, 10) : null,
          };
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [monthStart]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="pt-4 border-t mt-4">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        管顧費率（唯讀）
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-muted-foreground">
              費率已統一由「業主月結服務費」設定，本頁僅供檢視。
            </div>
            {canManage && (
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => window.open(HQ_RATE_SETTINGS_URL, "_blank")}
              >
                前往總部設定頁 →
              </Button>
            )}
          </div>
          <div className="rounded-md border p-3">
            <div className="text-sm font-medium mb-2">
              各館適用費率（{year}/{String(month).padStart(2, "0")}）
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">館別</TableHead>
                    <TableHead className="text-right whitespace-nowrap">費率</TableHead>
                    <TableHead className="text-right whitespace-nowrap">業績門檻</TableHead>
                    <TableHead className="whitespace-nowrap">生效日</TableHead>
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
                        尚無館別資料
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((r) => (
                      <TableRow key={r.accId}>
                        <TableCell className="whitespace-nowrap">{r.accName}</TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {r.rate != null ? `${(r.rate * 100).toFixed(2)}%` : (
                            <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 border-yellow-300">
                              未設定
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {r.threshold > 0 ? fmtMoney(r.threshold) : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {r.effectiveFrom ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
