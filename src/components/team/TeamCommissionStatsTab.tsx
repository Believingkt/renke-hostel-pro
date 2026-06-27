import { useEffect, useMemo, useState, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ChevronDown, ChevronRight, Eye, Pencil, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTeam } from "@/components/team/TeamContext";

function DateYMDPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
}) {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = 2023; y <= currentYear + 1; y++) years.push(y);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const daysInMonth = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const update = (y: number, m: number, d: number) => {
    const lastDay = new Date(y, m, 0).getDate();
    const safeD = Math.min(d, lastDay);
    onChange(new Date(y, m - 1, safeD));
  };

  return (
    <div className="flex items-center gap-1" aria-label={label}>
      <Select
        value={String(value.getFullYear())}
        onValueChange={(v) => update(Number(v), value.getMonth() + 1, value.getDate())}
      >
        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
        <SelectContent>
          {years.map((y) => <SelectItem key={y} value={String(y)}>{y} 年</SelectItem>)}
        </SelectContent>
      </Select>
      <Select
        value={String(value.getMonth() + 1)}
        onValueChange={(v) => update(value.getFullYear(), Number(v), value.getDate())}
      >
        <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
        <SelectContent>
          {months.map((m) => <SelectItem key={m} value={String(m)}>{m} 月</SelectItem>)}
        </SelectContent>
      </Select>
      <Select
        value={String(value.getDate())}
        onValueChange={(v) => update(value.getFullYear(), value.getMonth() + 1, Number(v))}
      >
        <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
        <SelectContent>
          {days.map((d) => <SelectItem key={d} value={String(d)}>{d} 日</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

interface OrderLite {
  id: string;
  accommodation_id: string;
  final_price: number;
  order_status: string;
  discount_code: string | null;
  order_number: string | null;
  guest_name: string | null;
  check_in_date: string | null;
  order_date: string | null;
  order_source: string | null;
}
interface MetaLite {
  order_id: string;
  closer_id: string | null;
  video_creator_id: string | null;
  is_excluded: boolean | null;
  exclusion_note: string | null;
  booking_method: string | null;
  traffic_source: string | null;
}
interface CommissionRow {
  accommodation_id: string;
  closer_rate: number | null;
  video_rate: number | null;
  effective_from: string;
}
interface ScoutCode {
  id: string;
  discount_code: string;
  scout_id: string | null;
  closer_id: string | null;
  scout_rate: number | null;
  closer_rate: number | null;
  accommodation_id: string | null;
}

const fmtMoney = (n: number) => `NT$ ${Math.round(n).toLocaleString()}`;
const pct = (r: number | null | undefined) =>
  r == null ? "—" : `${(Number(r) * 100).toFixed(1)}%`;

interface AccBreakdown {
  accId: string;
  accName: string;
  rate: number;
  validCount: number;
  validAmount: number;
  commission: number;
  cancelCount: number;
  cancelAmount: number;
  cancelCommission: number;
  validOrders: OrderLite[];
  cancelOrders: OrderLite[];
}
interface MemberStats {
  uid: string;
  name: string;
  validCount: number;
  validAmount: number;
  commission: number;
  cancelCount: number;
  cancelAmount: number;
  cancelCommission: number;
  byAcc: AccBreakdown[];
}

export default function TeamCommissionStatsTab() {
  const { roles } = useTeam();
  const isPrivileged = roles.some((r) =>
    ["admin", "super_admin", "hotel_admin"].includes(r as string)
  );
  const hasCloserOrVideo = roles.some((r) => r === "closer" || r === "video");
  const isScoutOnly =
    !isPrivileged &&
    !hasCloserOrVideo &&
    roles.some((r) => r === "scout" || r === "scout_manager");
  const now = new Date();
  const [mode, setMode] = useState<"period" | "custom">("period");
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1));
  const [customStart, setCustomStart] = useState<Date>(
    new Date(now.getFullYear(), now.getMonth(), 1),
  );
  const [customEnd, setCustomEnd] = useState<Date>(now);
  const [loading, setLoading] = useState(false);

  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [metaMap, setMetaMap] = useState<Map<string, MetaLite>>(new Map());
  const [commissionByAcc, setCommissionByAcc] = useState<
    Map<string, CommissionRow>
  >(new Map());
  const [nameMapByUserId, setNameMapByUserId] = useState<Map<string, string>>(
    new Map(),
  );
  const [nameMapById, setNameMapById] = useState<Map<string, string>>(
    new Map(),
  );
  const [scoutCodes, setScoutCodes] = useState<ScoutCode[]>([]);
  const [accNameMap, setAccNameMap] = useState<Map<string, string>>(new Map());
  const [closersList, setClosersList] = useState<{ user_id: string; display_name: string }[]>([]);
  const [videosList, setVideosList] = useState<{ user_id: string; display_name: string }[]>([]);
  const [franchiseProjects, setFranchiseProjects] = useState<{ id: string; name: string }[]>([]);
  const [trafficSources, setTrafficSources] = useState<{ id: string; name: string }[]>([]);
  const [bookingMethods, setBookingMethods] = useState<{ id: string; name: string }[]>([]);

  // Sheet / expanded state
  const [expandedCloser, setExpandedCloser] = useState<Set<string>>(new Set());
  const [expandedVideo, setExpandedVideo] = useState<Set<string>>(new Set());
  const [accSheet, setAccSheet] = useState<{
    title: string;
    breakdown: AccBreakdown;
  } | null>(null);
  const [scoutSheet, setScoutSheet] = useState<{
    title: string;
    rate: number;
    validList: OrderLite[];
    cancelList: OrderLite[];
  } | null>(null);

  const period = useMemo(() => {
    if (mode === "custom") {
      // 防呆：若起始 > 結束，自動 swap
      const a = new Date(customStart.getFullYear(), customStart.getMonth(), customStart.getDate());
      const b = new Date(customEnd.getFullYear(), customEnd.getMonth(), customEnd.getDate());
      const [s, e] = a.getTime() <= b.getTime() ? [a, b] : [b, a];
      const eNext = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1);
      const startDateStr = format(s, "yyyy-MM-dd");
      const endDateStr = format(e, "yyyy-MM-dd");
      return {
        startIso: s.toISOString(),
        nextIso: eNext.toISOString(),
        startDate: startDateStr,
        label: `${startDateStr} ～ ${endDateStr}（自訂區間）`,
        cancelField: "order_date" as "order_date" | "cancelled_at",
      };
    }

    const y = Number(year);
    const X = Number(month);
    const targetYear = X === 1 ? y - 1 : y;
    const targetMonth = X === 1 ? 12 : X - 1;
    const startIso = new Date(targetYear, targetMonth - 1, 1).toISOString();
    const nextIso = new Date(targetYear, targetMonth, 1).toISOString();
    return {
      startIso,
      nextIso,
      startDate: `${targetYear}-${String(targetMonth).padStart(2, "0")}-01`,
      label: `${targetYear}年${targetMonth}月（${y}年${X}月10日發放）`,
      cancelField: "cancelled_at" as "order_date" | "cancelled_at",
    };
  }, [mode, year, month, customStart, customEnd]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.startIso, period.nextIso, period.label]);

  useEffect(() => {
    (async () => {
      const [c, v, fp, ts, bm] = await Promise.all([
        supabase.rpc("get_team_role_members", { p_role: "closer" as any }),
        supabase.rpc("get_team_role_members", { p_role: "video" as any }),
        supabase
          .from("franchise_projects")
          .select("id, name")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("traffic_sources")
          .select("id, name")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("booking_methods")
          .select("id, name")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
      ]);
      setClosersList((c.data as any[]) || []);
      setVideosList((v.data as any[]) || []);
      setFranchiseProjects((fp.data as any[]) || []);
      setTrafficSources((ts.data as any[]) || []);
      setBookingMethods((bm.data as any[]) || []);
    })();
  }, []);


  async function load() {
    setLoading(true);
    try {
      const selectCols =
        "id, accommodation_id, final_price, order_status, discount_code, order_number, guest_name, check_in_date, order_date, confirmed_at, order_source, cancelled_at";

      // 分頁抓取以繞過 PostgREST 1000 筆上限
      async function fetchAllPaged(
        build: (from: number, to: number) => any,
      ): Promise<any[]> {
        const PAGE = 1000;
        const all: any[] = [];
        let from = 0;
        // 安全上限：最多 50 頁（50000 筆）
        for (let p = 0; p < 50; p++) {
          const to = from + PAGE - 1;
          const { data, error } = await build(from, to);
          if (error) throw error;
          const rows = (data ?? []) as any[];
          all.push(...rows);
          if (rows.length < PAGE) break;
          from += PAGE;
        }
        return all;
      }

      // 有效訂單：期間以 COALESCE(confirmed_at, order_date) 為準
      // → confirmed_at 落在期間，或 confirmed_at 為 null 且 order_date 落在期間
      const validRows = await fetchAllPaged((from, to) => {
        let q = supabase
          .from("orders")
          .select(selectCols)
          .neq("order_status", "cancelled")
          .order("order_date", { ascending: true })
          .range(from, to);
        if (period.startIso && period.nextIso) {
          q = q.or(
            `and(confirmed_at.gte.${period.startIso},confirmed_at.lt.${period.nextIso}),` +
              `and(confirmed_at.is.null,order_date.gte.${period.startIso},order_date.lt.${period.nextIso})`,
          );
        }
        return q;
      });


      const cancelField = period.cancelField;
      const cancelRows = await fetchAllPaged((from, to) => {
        let q = supabase
          .from("orders")
          .select(selectCols)
          .eq("order_status", "cancelled")
          .not("cancelled_at", "is", null)
          .order(cancelField, { ascending: true })
          .range(from, to);
        if (period.startIso) q = q.gte(cancelField, period.startIso);
        if (period.nextIso) q = q.lt(cancelField, period.nextIso);
        return q;
      });

      const ords = [...validRows, ...cancelRows] as OrderLite[];
      setOrders(ords);


      const ids = ords.map((o) => o.id);
      const mMap = new Map<string, MetaLite>();
      const batchSizes: number[] = [];
      let batchCount = 0;
      if (ids.length) {
        // 分批查詢 order_meta，每批 100 筆，避免 URL 過長導致 400
        const BATCH = 100;
        const batches: string[][] = [];
        for (let i = 0; i < ids.length; i += BATCH) {
          batches.push(ids.slice(i, i + BATCH));
        }
        batchCount = batches.length;
        const results = await Promise.all(
          batches.map((chunk) =>
            supabase
              .from("order_meta")
              .select(
                "order_id, closer_id, video_creator_id, is_excluded, exclusion_note, booking_method, traffic_source",
              )
              .in("order_id", chunk),
          ),
        );
        results.forEach(({ data }) => {
          const rows = data ?? [];
          batchSizes.push(rows.length);
          rows.forEach((m: any) => mMap.set(m.order_id, m as MetaLite));
        });
      }
      setMetaMap(mMap);


      if (mode === "custom") {
        const withCloser = ords.filter((o) => !!mMap.get(o.id)?.closer_id).length;
        console.log("[TeamCommissionStats/custom]", {
          startIso: period.startIso,
          nextIso: period.nextIso,
          startDate: period.startDate,
          validOrdersLength: validRows.length,
          cancelOrdersLength: cancelRows.length,
          totalOrders: ords.length,
          metaMapSize: mMap.size,
          ordersWithCloserId: withCloser,
          orderMetaBatchCount: batchCount,
          orderMetaBatchSizes: batchSizes,
        });
      }

      const { data: csData } = await supabase
        .from("accommodation_commission_settings")
        .select("accommodation_id, closer_rate, video_rate, effective_from")
        .lte("effective_from", period.startDate)
        .order("effective_from", { ascending: false });
      const csMap = new Map<string, CommissionRow>();
      (csData ?? []).forEach((r: any) => {
        if (!csMap.has(r.accommodation_id))
          csMap.set(r.accommodation_id, r as CommissionRow);
      });
      setCommissionByAcc(csMap);

      const { data: scData } = await supabase
        .from("scout_discount_codes")
        .select(
          "id, discount_code, scout_id, closer_id, scout_rate, closer_rate, accommodation_id",
        );
      const codes = ((scData ?? []) as ScoutCode[]).map((c) => ({
        ...c,
        discount_code: (c.discount_code || "").toUpperCase(),
      }));
      setScoutCodes(codes);

      // 收集需要查名稱的 ID
      const userIds = new Set<string>();
      const tmpIds = new Set<string>();
      mMap.forEach((m) => {
        if (m.closer_id) userIds.add(m.closer_id);
        if (m.video_creator_id) userIds.add(m.video_creator_id);
      });
      codes.forEach((s) => {
        if (s.scout_id) tmpIds.add(s.scout_id); // scout_id 對應 team_member_profiles.id
        if (s.closer_id) userIds.add(s.closer_id);
      });

      const nByUser = new Map<string, string>();
      const nById = new Map<string, string>();
      // 一次撈：包含 user_id 在集合內 或 id 在集合內 的紀錄
      if (userIds.size || tmpIds.size) {
        const orParts: string[] = [];
        if (userIds.size)
          orParts.push(`user_id.in.(${Array.from(userIds).join(",")})`);
        if (tmpIds.size)
          orParts.push(`id.in.(${Array.from(tmpIds).join(",")})`);
        const { data: profs } = await supabase
          .from("team_member_profiles")
          .select("id, user_id, display_name")
          .or(orParts.join(","));
        (profs ?? []).forEach((p: any) => {
          if (p.user_id) nByUser.set(p.user_id, p.display_name);
          if (p.id) nById.set(p.id, p.display_name);
        });
      }
      setNameMapByUserId(nByUser);
      setNameMapById(nById);

      const accIds = new Set<string>();
      ords.forEach((o) => o.accommodation_id && accIds.add(o.accommodation_id));
      codes.forEach((s) => s.accommodation_id && accIds.add(s.accommodation_id));
      const aMap = new Map<string, string>();
      if (accIds.size) {
        const { data: accs } = await supabase
          .from("accommodation_info")
          .select("id, name")
          .in("id", Array.from(accIds));
        (accs ?? []).forEach((a: any) => aMap.set(a.id, a.name));
      }
      setAccNameMap(aMap);
    } catch (e: any) {
      toast.error("載入統計失敗：" + (e.message || ""));
    } finally {
      setLoading(false);
    }
  }

  const { validOrders, cancelOrders } = useMemo(() => {
    const valid: OrderLite[] = [];
    const cancel: OrderLite[] = [];
    orders.forEach((o) => {
      if (o.order_status === "cancelled" || o.order_status === "已取消") {
        cancel.push(o);
      } else {
        const m = metaMap.get(o.id);
        if (m?.is_excluded) return;
        valid.push(o);
      }
    });
    return { validOrders: valid, cancelOrders: cancel };
  }, [orders, metaMap]);


  // 通用：依成交人/影音 + 館別 聚合
  function buildMemberStats(field: "closer_id" | "video_creator_id", rateKey: "closer_rate" | "video_rate"): MemberStats[] {
    type Bucket = AccBreakdown;
    const agg = new Map<string, Map<string, Bucket>>(); // uid -> accId -> bucket
    const getBucket = (uid: string, accId: string): Bucket => {
      if (!agg.has(uid)) agg.set(uid, new Map());
      const accMap = agg.get(uid)!;
      if (!accMap.has(accId)) {
        const rate = Number(commissionByAcc.get(accId)?.[rateKey] ?? 0);
        accMap.set(accId, {
          accId,
          accName: accNameMap.get(accId) ?? "—",
          rate,
          validCount: 0,
          validAmount: 0,
          commission: 0,
          cancelCount: 0,
          cancelAmount: 0,
          cancelCommission: 0,
          validOrders: [],
          cancelOrders: [],
        });
      }
      return accMap.get(accId)!;
    };
    validOrders.forEach((o) => {
      const m = metaMap.get(o.id);
      const uid = (m as any)?.[field] as string | undefined;
      if (!uid) return;
      const b = getBucket(uid, o.accommodation_id);
      b.validCount += 1;
      b.validAmount += o.final_price || 0;
      b.commission += (o.final_price || 0) * b.rate;
      b.validOrders.push(o);
    });
    cancelOrders.forEach((o) => {
      const m = metaMap.get(o.id);
      const uid = (m as any)?.[field] as string | undefined;
      if (!uid) return;
      const b = getBucket(uid, o.accommodation_id);
      b.cancelCount += 1;
      b.cancelAmount += o.final_price || 0;
      b.cancelCommission += (o.final_price || 0) * b.rate;
      b.cancelOrders.push(o);
    });
    return Array.from(agg.entries())
      .map(([uid, accMap]) => {
        const byAcc = Array.from(accMap.values()).sort(
          (a, b) => b.validAmount - a.validAmount,
        );
        const totals = byAcc.reduce(
          (acc, b) => {
            acc.validCount += b.validCount;
            acc.validAmount += b.validAmount;
            acc.commission += b.commission;
            acc.cancelCount += b.cancelCount;
            acc.cancelAmount += b.cancelAmount;
            acc.cancelCommission += b.cancelCommission;
            return acc;
          },
          { validCount: 0, validAmount: 0, commission: 0, cancelCount: 0, cancelAmount: 0, cancelCommission: 0 },
        );
        return {
          uid,
          name: nameMapByUserId.get(uid) ?? uid.slice(0, 8),
          ...totals,
          byAcc,
        } as MemberStats;
      })
      .sort((a, b) => b.validAmount - a.validAmount);
  }

  const closerStats = useMemo(
    () => buildMemberStats("closer_id", "closer_rate"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [validOrders, cancelOrders, metaMap, commissionByAcc, nameMapByUserId, accNameMap],
  );
  const videoStats = useMemo(
    () => buildMemberStats("video_creator_id", "video_rate"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [validOrders, cancelOrders, metaMap, commissionByAcc, nameMapByUserId, accNameMap],
  );

  const scoutStats = useMemo(() => {
    return scoutCodes
      .map((c) => {
        const code = (c.discount_code || "").toUpperCase();
        const matchValid = validOrders.filter(
          (o) => (o.discount_code || "").toUpperCase() === code,
        );
        const matchCancel = cancelOrders.filter(
          (o) => (o.discount_code || "").toUpperCase() === code,
        );
        const validAmount = matchValid.reduce(
          (s, o) => s + (o.final_price || 0),
          0,
        );
        const cancelAmount = matchCancel.reduce(
          (s, o) => s + (o.final_price || 0),
          0,
        );
        const scoutRate = Number(c.scout_rate ?? 0);
        const closerRate = Number(c.closer_rate ?? 0);
        return {
          id: c.id,
          code: c.discount_code,
          scoutName: c.scout_id ? nameMapById.get(c.scout_id) ?? "—" : "—",
          closerName: c.closer_id ? nameMapByUserId.get(c.closer_id) ?? "—" : "—",
          accName: c.accommodation_id
            ? accNameMap.get(c.accommodation_id) ?? "—"
            : "—",
          validCount: matchValid.length,
          validAmount,
          scoutRate,
          scoutCommission: validAmount * scoutRate,
          closerRate,
          closerCommission: validAmount * closerRate,
          cancelCount: matchCancel.length,
          cancelAmount,
          validList: matchValid,
          cancelList: matchCancel,
        };
      })
      .filter((r) => r.validCount > 0 || r.cancelCount > 0)
      .sort((a, b) => b.validAmount - a.validAmount);
  }, [scoutCodes, validOrders, cancelOrders, nameMapById, nameMapByUserId, accNameMap]);

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1].map(String);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, uid: string) => {
    const n = new Set(set);
    if (n.has(uid)) n.delete(uid);
    else n.add(uid);
    setSet(n);
  };

  const renderMemberCard = (
    title: string,
    stats: MemberStats[],
    expanded: Set<string>,
    setExpanded: (s: Set<string>) => void,
    memberLabel: string,
  ) => (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="overflow-x-auto">
          <Table className="fixed-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="whitespace-nowrap">{memberLabel}</TableHead>
                <TableHead className="whitespace-nowrap tabular-nums">有效訂單數</TableHead>
                <TableHead className="whitespace-nowrap tabular-nums">有效訂單總金額</TableHead>
                <TableHead className="whitespace-nowrap tabular-nums">分潤金額</TableHead>
                <TableHead className="whitespace-nowrap tabular-nums">取消訂單數</TableHead>
                <TableHead className="whitespace-nowrap tabular-nums">取消訂單總金額</TableHead>
                <TableHead className="whitespace-nowrap tabular-nums">取消分潤金額</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-6 text-muted-foreground">
                    無資料
                  </TableCell>
                </TableRow>
              ) : (
                stats.map((r) => {
                  const isOpen = expanded.has(r.uid);
                  return (
                    <Fragment key={r.uid}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => toggle(expanded, setExpanded, r.uid)}
                      >
                        <TableCell>
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="tabular-nums">{r.validCount}</TableCell>
                        <TableCell className="tabular-nums">{fmtMoney(r.validAmount)}</TableCell>
                        <TableCell className="tabular-nums">{fmtMoney(r.commission)}</TableCell>
                        <TableCell className="tabular-nums">{r.cancelCount}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {fmtMoney(r.cancelAmount)}
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {fmtMoney(r.cancelCommission)}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                      {isOpen &&
                        r.byAcc.map((b) => {
                          const openSheet = () =>
                            setAccSheet({
                              title: `${r.name} ・ ${b.accName}`,
                              breakdown: b,
                            });
                          return (
                            <TableRow
                              key={`${r.uid}-${b.accId}`}
                              className="bg-muted/30 cursor-pointer hover:bg-muted/60"
                              onClick={openSheet}
                            >
                              <TableCell />
                              <TableCell className="pl-8 text-sm text-muted-foreground">
                                ↳ {b.accName}（{pct(b.rate)}）
                              </TableCell>
                              <TableCell className="tabular-nums">{b.validCount}</TableCell>
                              <TableCell className="tabular-nums">{fmtMoney(b.validAmount)}</TableCell>
                              <TableCell className="tabular-nums">{fmtMoney(b.commission)}</TableCell>
                              <TableCell className="tabular-nums">{b.cancelCount}</TableCell>
                              <TableCell className="tabular-nums text-muted-foreground">
                                {fmtMoney(b.cancelAmount)}
                              </TableCell>
                              <TableCell className="tabular-nums text-muted-foreground">
                                {fmtMoney(b.cancelCommission)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openSheet();
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* 模式切換 */}
          <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
            <Button
              type="button"
              size="sm"
              variant={mode === "period" ? "default" : "ghost"}
              className="h-8"
              onClick={() => setMode("period")}
            >
              期別模式
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "custom" ? "default" : "ghost"}
              className="h-8"
              onClick={() => setMode("custom")}
            >
              自訂區間
            </Button>
          </div>

          {mode === "period" ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>
                        {y} 年
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => String(i + 1)).map(
                      (m) => (
                        <SelectItem key={m} value={m}>
                          {m} 月 10 日
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                統計上月的訂單，例如選擇 6 月 10 日，計算的是 5 月 1 日～5 月 31 日的訂單
              </p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
              <DateYMDPicker label="起始日期" value={customStart} onChange={setCustomStart} />
                <span className="text-muted-foreground hidden sm:inline">～</span>
              <DateYMDPicker label="結束日期" value={customEnd} onChange={setCustomEnd} />
              </div>
              <p className="text-xs text-muted-foreground">
                依下單日 (order_date) 篩選，包含起訖兩日；有效訂單與取消訂單皆套用此區間
              </p>
              <p className="text-xs font-medium text-primary">
                查詢區間：{period.startDate} ～ {format(new Date(new Date(period.nextIso).getTime() - 86400000), "yyyy-MM-dd")}
                {customStart.getTime() > customEnd.getTime() && (
                  <span className="ml-2 text-amber-600">（已自動對調起訖日期）</span>
                )}
              </p>
            </>
          )}
          <div className="text-sm text-muted-foreground space-y-1">
            
            {loading ? (
              <div>載入中...</div>
            ) : (
              <>
                <div>
                  {validOrders.filter((o) => !!metaMap.get(o.id)?.closer_id).length} 筆成交組有效訂單 /{" "}
                  {cancelOrders.filter((o) => !!metaMap.get(o.id)?.closer_id).length} 筆取消訂單
                </div>
                <div>
                  {validOrders.filter((o) => !!metaMap.get(o.id)?.video_creator_id).length} 筆影音組有效訂單 /{" "}
                  {cancelOrders.filter((o) => !!metaMap.get(o.id)?.video_creator_id).length} 筆取消訂單
                </div>
                {(() => {
                  const scoutCodeSet = new Set(
                    scoutCodes.map((c) => (c.discount_code || "").toUpperCase()).filter(Boolean)
                  );
                  const isScoutCode = (code: string | null | undefined) =>
                    !!code && scoutCodeSet.has(code.toUpperCase());
                  return (
                    <div>
                      {validOrders.filter((o) => isScoutCode(o.discount_code)).length} 筆星探折扣碼有效訂單 /{" "}
                      {cancelOrders.filter((o) => isScoutCode(o.discount_code)).length} 筆取消訂單
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </CardContent>
      </Card>


      {/* 成交組 / 影音組業績 */}
      {!isScoutOnly && (
        <>
          {renderMemberCard("成交組業績", closerStats, expandedCloser, setExpandedCloser, "成交組成員")}
          {renderMemberCard("影音組業績", videoStats, expandedVideo, setExpandedVideo, "影音組成員")}
        </>
      )}

      {/* 星探折扣碼業績 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="text-lg font-semibold">星探折扣碼業績</h2>
          <div className="overflow-x-auto">
            <Table className="fixed-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">星探</TableHead>
                  <TableHead className="whitespace-nowrap">折扣碼</TableHead>
                  <TableHead className="whitespace-nowrap">民宿</TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">有效訂單數</TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">有效訂單總金額</TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">星探分潤%</TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">星探分潤金額</TableHead>
                  <TableHead className="whitespace-nowrap">成交組</TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">成交組分潤%</TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">成交組分潤金額</TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">取消訂單數</TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">取消訂單總金額</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {scoutStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-6 text-muted-foreground">
                      無資料
                    </TableCell>
                  </TableRow>
                ) : (
                  scoutStats.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.scoutName}</TableCell>
                      <TableCell className="font-mono">{r.code}</TableCell>
                      <TableCell>{r.accName}</TableCell>
                      <TableCell className="tabular-nums">{r.validCount}</TableCell>
                      <TableCell className="tabular-nums">{fmtMoney(r.validAmount)}</TableCell>
                      <TableCell className="tabular-nums">{pct(r.scoutRate)}</TableCell>
                      <TableCell className="tabular-nums">{fmtMoney(r.scoutCommission)}</TableCell>
                      <TableCell>{r.closerName}</TableCell>
                      <TableCell className="tabular-nums">{pct(r.closerRate)}</TableCell>
                      <TableCell className="tabular-nums">{fmtMoney(r.closerCommission)}</TableCell>
                      <TableCell className="tabular-nums">{r.cancelCount}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {fmtMoney(r.cancelAmount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setScoutSheet({
                              title: `${r.scoutName} ・ ${r.code}`,
                              rate: r.scoutRate,
                              validList: r.validList,
                              cancelList: r.cancelList,
                            })
                          }
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 館別訂單明細 Sheet（成交/影音） */}
      <Sheet open={!!accSheet} onOpenChange={(o) => !o && setAccSheet(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg flex flex-col overflow-x-hidden overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>{accSheet?.title}</SheetTitle>
            <SheetDescription>
              分潤比例 {pct(accSheet?.breakdown.rate ?? 0)} ・ 有效 {accSheet?.breakdown.validCount} 筆 / 取消 {accSheet?.breakdown.cancelCount} 筆
            </SheetDescription>
          </SheetHeader>
          {accSheet && (
            <div className="mt-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">有效訂單</h3>
                <Table className="fixed-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>訂單編號</TableHead>
                      <TableHead className="tabular-nums">訂單日期</TableHead>
                      <TableHead>訂房方式</TableHead>
                      <TableHead>來源</TableHead>
                      <TableHead>來源管道</TableHead>
                      <TableHead className="tabular-nums">訂單金額</TableHead>
                      <TableHead className="tabular-nums">分潤金額</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accSheet.breakdown.validOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-4">無</TableCell>
                      </TableRow>
                    ) : (
                      accSheet.breakdown.validOrders.map((o) => {
                        const m = metaMap.get(o.id);
                        const bmName = m?.booking_method
                          ? bookingMethods.find((x) => x.id === m.booking_method)?.name ?? m.booking_method
                          : "—";
                        const tsName = m?.traffic_source
                          ? trafficSources.find((x) => x.id === m.traffic_source)?.name ?? m.traffic_source
                          : "—";
                        return (
                          <TableRow key={o.id}>
                            <TableCell className="font-mono">{o.order_number ?? "—"}</TableCell>
                            <TableCell className="tabular-nums">{o.order_date ? o.order_date.slice(0, 10) : "—"}</TableCell>
                            <TableCell>{bmName}</TableCell>
                            <TableCell>{o.order_source ?? "—"}</TableCell>
                            <TableCell>{tsName}</TableCell>
                            <TableCell className="tabular-nums">{fmtMoney(o.final_price || 0)}</TableCell>
                            <TableCell className="tabular-nums">
                              {fmtMoney((o.final_price || 0) * accSheet.breakdown.rate)}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              {accSheet.breakdown.cancelOrders.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">取消訂單</h3>
                  <Table className="fixed-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>訂單編號</TableHead>
                        <TableHead className="tabular-nums">訂單日期</TableHead>
                        <TableHead>訂房方式</TableHead>
                        <TableHead>來源</TableHead>
                        <TableHead>來源管道</TableHead>
                        <TableHead className="tabular-nums">訂單金額</TableHead>
                        <TableHead className="tabular-nums">分潤金額</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accSheet.breakdown.cancelOrders.map((o) => {
                        const m = metaMap.get(o.id);
                        const bmName = m?.booking_method
                          ? bookingMethods.find((x) => x.id === m.booking_method)?.name ?? m.booking_method
                          : "—";
                        const tsName = m?.traffic_source
                          ? trafficSources.find((x) => x.id === m.traffic_source)?.name ?? m.traffic_source
                          : "—";
                        return (
                          <TableRow key={o.id}>
                            <TableCell className="font-mono">{o.order_number ?? "—"}</TableCell>
                            <TableCell className="tabular-nums">{o.order_date ? o.order_date.slice(0, 10) : "—"}</TableCell>
                            <TableCell>{bmName}</TableCell>
                            <TableCell>{o.order_source ?? "—"}</TableCell>
                            <TableCell>{tsName}</TableCell>
                            <TableCell className="tabular-nums">{fmtMoney(o.final_price || 0)}</TableCell>
                            <TableCell className="tabular-nums text-muted-foreground">
                              {fmtMoney((o.final_price || 0) * accSheet.breakdown.rate)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* 星探訂單明細 Sheet */}
      <Sheet open={!!scoutSheet} onOpenChange={(o) => !o && setScoutSheet(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg flex flex-col overflow-x-hidden overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>{scoutSheet?.title}</SheetTitle>
            <SheetDescription>
              星探分潤 {pct(scoutSheet?.rate ?? 0)} ・ 有效 {scoutSheet?.validList.length} 筆 / 取消 {scoutSheet?.cancelList.length} 筆
            </SheetDescription>
          </SheetHeader>
          {scoutSheet && (
            <div className="mt-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-2">有效訂單</h3>
                <Table className="fixed-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>訂單編號</TableHead>
                      <TableHead>館別</TableHead>
                      <TableHead className="tabular-nums">入住日</TableHead>
                      <TableHead className="tabular-nums">訂單金額</TableHead>
                      <TableHead className="tabular-nums">星探分潤金額</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scoutSheet.validList.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-4">無</TableCell>
                      </TableRow>
                    ) : (
                      scoutSheet.validList.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono">{o.order_number ?? "—"}</TableCell>
                          <TableCell>{accNameMap.get(o.accommodation_id) ?? "—"}</TableCell>
                          <TableCell className="tabular-nums">{o.check_in_date ?? "—"}</TableCell>
                          <TableCell className="tabular-nums">{fmtMoney(o.final_price || 0)}</TableCell>
                          <TableCell className="tabular-nums">
                            {fmtMoney((o.final_price || 0) * scoutSheet.rate)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {scoutSheet.cancelList.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">取消訂單</h3>
                  <Table className="fixed-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>訂單編號</TableHead>
                        <TableHead>館別</TableHead>
                        <TableHead className="tabular-nums">入住日</TableHead>
                        <TableHead className="tabular-nums">訂單金額</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scoutSheet.cancelList.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono">{o.order_number ?? "—"}</TableCell>
                          <TableCell>{accNameMap.get(o.accommodation_id) ?? "—"}</TableCell>
                          <TableCell className="tabular-nums">{o.check_in_date ?? "—"}</TableCell>
                          <TableCell className="tabular-nums">{fmtMoney(o.final_price || 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

    </div>
  );
}
