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
import { useBonusMultipliers } from "@/hooks/use-bonus-multipliers";
import BoostedAmount from "@/components/team/BoostedAmount";
import { isHoldOrder } from "@/lib/holdOrder";
import { boostedAmount } from "@/lib/bonusMultiplier";

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
  confirmed_at: string | null;
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
  team_commission_price: number | null;
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
  const { multiplierForDataMonth } = useBonusMultipliers();
  const isPrivileged = roles.some((r) =>
    ["admin", "super_admin", "hotel_admin"].includes(r as string)
  );
  const hasCloserOrVideo = roles.some((r) => r === "closer" || r === "closer_manager" || r === "video");
  const isScoutOnly =
    !isPrivileged &&
    !hasCloserOrVideo &&
    roles.some((r) => r === "scout" || r === "scout_manager");
  const now = new Date();
  // Default period: if today (Taipei) is on/before the 10th, current month; otherwise next month.
  const tpeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const tpeY = Number(tpeParts.find((p) => p.type === "year")?.value);
  const tpeM = Number(tpeParts.find((p) => p.type === "month")?.value);
  const tpeD = Number(tpeParts.find((p) => p.type === "day")?.value);
  const defaultPeriodY = tpeD <= 10 ? tpeY : tpeM === 12 ? tpeY + 1 : tpeY;
  const defaultPeriodM = tpeD <= 10 ? tpeM : tpeM === 12 ? 1 : tpeM + 1;
  const [mode, setMode] = useState<"period" | "custom">("period");
  const [year, setYear] = useState<string>(String(defaultPeriodY));
  const [month, setMonth] = useState<string>(String(defaultPeriodM));
  const [customStart, setCustomStart] = useState<Date>(
    new Date(now.getFullYear(), now.getMonth(), 1),
  );
  const [customEnd, setCustomEnd] = useState<Date>(now);
  const [loading, setLoading] = useState(false);

  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [metaMap, setMetaMap] = useState<Map<string, MetaLite>>(new Map());
  const [commissionByAcc, setCommissionByAcc] = useState<
    Map<string, CommissionRow[]>
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
  const [bonusRate, setBonusRate] = useState<number>(0);
  // 成交組分潤即時預估：由 preview-closer-commission Edge Function 提供，
  // 公式與正式快照 closer_commission_snapshots 一致（扣加購、排非台幣 / isExempt）。
  const [previewMap, setPreviewMap] = useState<
    Map<string, { base: number; closer_rate: number; video_rate: number }>
  >(new Map());

  // Sheet / expanded state
  const [expandedCloser, setExpandedCloser] = useState<Set<string>>(new Set());
  const [expandedVideo, setExpandedVideo] = useState<Set<string>>(new Set());
  const [accSheet, setAccSheet] = useState<{
    title: string;
    breakdown: AccBreakdown;
    backfillList?: {
      id: string;
      snapshot_month: string;
      order_number: string | null;
      amount: number;
    }[];
    adjList?: {
      id: string;
      adjustment_type: string;
      order_number: string | null;
      reason: string | null;
      amount: number;
    }[];
  } | null>(null);
  const [scoutSheet, setScoutSheet] = useState<{
    title: string;
    rate: number;
    validList: OrderLite[];
    cancelList: OrderLite[];
  } | null>(null);

  // 分潤補差（closer_commission_adjustments）：以「發放月」為單位，僅期別模式顯示
  const [adjustments, setAdjustments] = useState<
    {
      id: string;
      adjustment_type: string;
      closer_id: string | null;
      video_creator_id: string | null;
      closer_amount: number;
      video_amount: number;
      reason: string | null;
      order_number: string | null;
      accommodation_id: string | null;
    }[]
  >([]);

  // 回溯補建（本期發放月的快照中，資料月不等於本期資料月者＝前期漏建、本期才補上）
  const [backfills, setBackfills] = useState<
    {
      id: string;
      snapshot_month: string;
      closer_id: string | null;
      video_creator_id: string | null;
      closer_amount: number;
      video_amount: number;
      order_number: string | null;
      accommodation_id: string | null;
    }[]
  >([]);



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

  const dataMonthKey = useMemo(() => period.startDate.slice(0, 7), [period.startDate]);
  const closerMultiplier = multiplierForDataMonth("closer", dataMonthKey);
  const videoMultiplier = multiplierForDataMonth("video", dataMonthKey);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.startIso, period.nextIso, period.label]);

  // 補差資料：期別模式下 adjustment_month = 發放年月（YYYY-MM）
  const payoutMonthKey = useMemo(
    () => `${year}-${String(Number(month)).padStart(2, "0")}`,
    [year, month],
  );
  useEffect(() => {
    if (mode !== "period") {
      setAdjustments([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("closer_commission_adjustments")
        .select(
          "id, adjustment_type, closer_id, video_creator_id, closer_amount, video_amount, reason, orders(order_number, accommodation_id, order_date)",
        )
        .eq("adjustment_month", payoutMonthKey);
      if (cancelled) return;
      setAdjustments(
        ((data ?? []) as any[])
          // 取消扣回：若該訂單的下單日就落在本期別，統計口徑已直接排除該筆分潤，
          // 再扣一次補差會重複扣款（發放管理是「快照 + 補差」，統計是「即時排除」）。
          .filter((r) => {
            const isCancel = String(r.adjustment_type ?? "").includes("cancel");
            if (!isCancel) return true;
            const od = r.orders?.order_date as string | undefined;
            if (!od || !period.startIso || !period.nextIso) return true;
            return !(od >= period.startIso && od < period.nextIso);
          })
          .map((r) => ({
            id: r.id,
            adjustment_type: r.adjustment_type,
            closer_id: r.closer_id,
            video_creator_id: r.video_creator_id,
            closer_amount: Number(r.closer_amount ?? 0),
            video_amount: Number(r.video_amount ?? 0),
            reason: r.reason ?? null,
            order_number: r.orders?.order_number ?? null,
            accommodation_id: r.orders?.accommodation_id ?? null,
          })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, payoutMonthKey, period.startIso, period.nextIso]);

  // 回溯補建：本期發放月的快照中，資料月 ≠ 本期資料月者
  useEffect(() => {
    if (mode !== "period") {
      setBackfills([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("closer_commission_snapshots")
        .select(
          "id, snapshot_month, closer_id, video_creator_id, closer_commission_amount, video_commission_amount, accommodation_id, orders(order_number)",
        )
        .eq("payout_month", payoutMonthKey)
        .neq("snapshot_month", dataMonthKey);
      if (cancelled) return;
      setBackfills(
        ((data ?? []) as any[]).map((r) => ({
          id: r.id,
          snapshot_month: String(r.snapshot_month ?? ""),
          closer_id: r.closer_id,
          video_creator_id: r.video_creator_id,
          closer_amount: Number(r.closer_commission_amount ?? 0),
          video_amount: Number(r.video_commission_amount ?? 0),
          order_number: r.orders?.order_number ?? null,
          accommodation_id: r.accommodation_id ?? null,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, payoutMonthKey, dataMonthKey]);

  // 回溯補建彙總：成員層級 / 成員+館別層級
  const backfillMaps = useMemo(() => {
    const closerByUid = new Map<string, number>();
    const closerByUidAcc = new Map<string, number>();
    const videoByUid = new Map<string, number>();
    const videoByUidAcc = new Map<string, number>();
    const add = (m: Map<string, number>, k: string, v: number) =>
      m.set(k, (m.get(k) ?? 0) + v);
    for (const b of backfills) {
      if (b.closer_id && b.closer_amount !== 0) {
        add(closerByUid, b.closer_id, b.closer_amount);
        if (b.accommodation_id)
          add(closerByUidAcc, `${b.closer_id}|${b.accommodation_id}`, b.closer_amount);
      }
      if (b.video_creator_id && b.video_amount !== 0) {
        add(videoByUid, b.video_creator_id, b.video_amount);
        if (b.accommodation_id)
          add(videoByUidAcc, `${b.video_creator_id}|${b.accommodation_id}`, b.video_amount);
      }
    }
    return { closerByUid, closerByUidAcc, videoByUid, videoByUidAcc };
  }, [backfills]);

  // 補差彙總：成員層級 / 成員+館別層級（供業績卡片欄位使用）
  const adjMaps = useMemo(() => {
    const closerByUid = new Map<string, number>();
    const closerByUidAcc = new Map<string, number>();
    const videoByUid = new Map<string, number>();
    const videoByUidAcc = new Map<string, number>();
    const add = (m: Map<string, number>, k: string, v: number) =>
      m.set(k, (m.get(k) ?? 0) + v);
    for (const a of adjustments) {
      if (a.closer_id && a.closer_amount !== 0) {
        add(closerByUid, a.closer_id, a.closer_amount);
        if (a.accommodation_id)
          add(closerByUidAcc, `${a.closer_id}|${a.accommodation_id}`, a.closer_amount);
      }
      if (a.video_creator_id && a.video_amount !== 0) {
        add(videoByUid, a.video_creator_id, a.video_amount);
        if (a.accommodation_id)
          add(videoByUidAcc, `${a.video_creator_id}|${a.accommodation_id}`, a.video_amount);
      }
    }
    return { closerByUid, closerByUidAcc, videoByUid, videoByUidAcc };
  }, [adjustments]);





  useEffect(() => {
    (async () => {
      const [c, cm, v, fp, ts, bm] = await Promise.all([
        supabase.rpc("get_team_role_members", { p_role: "closer" as any }),
        supabase.rpc("get_team_role_members", { p_role: "closer_manager" as any }),
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
      // 成交組名單需同時包含 closer 與 closer_manager（依 user_id 去重）
      setClosersList(
        Array.from(
          new Map(
            [...(((c.data as any[]) || [])), ...(((cm.data as any[]) || []))].map((m: any) => [
              m.user_id,
              m,
            ]),
          ).values(),
        ),
      );

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

      // 有效訂單：期間基準統一為 order_date（與 closer_commission_snapshots 正式試算一致）
      const validRows = await fetchAllPaged((from, to) => {
        let q = supabase
          .from("orders")
          .select(selectCols)
          .neq("order_status", "cancelled")
          .order("order_date", { ascending: true })
          .range(from, to);
        if (period.startIso && period.nextIso) {
          q = q.gte("order_date", period.startIso).lt("order_date", period.nextIso);
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
                "order_id, closer_id, video_creator_id, is_excluded, exclusion_note, booking_method, traffic_source, team_commission_price",
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
        .order("effective_from", { ascending: false });
      const csMap = new Map<string, CommissionRow[]>();
      (csData ?? []).forEach((r: any) => {
        const arr = csMap.get(r.accommodation_id) ?? [];
        arr.push(r as CommissionRow);
        csMap.set(r.accommodation_id, arr);
      });
      setCommissionByAcc(csMap);

      // 成交組分潤預估（Edge Function 試算，只計算不寫入）
      // extra_order_ids 讓已取消訂單也套用相同 gate（合作期間／抽成門檻／免抽成／幣別）
      const pMap = new Map<string, { base: number; closer_rate: number; video_rate: number }>();
      try {
        const { data: preview } = await supabase.functions.invoke(
          "preview-closer-commission",
          {
            body: {
              scope: "team",
              year: Number(year),
              month: Number(month),
              start_iso: period.startIso,
              end_iso: period.nextIso,
              extra_order_ids: cancelRows.map((o: any) => o.id as string),
            },
          },
        );
        if (preview?.success) {
          [...(preview.orders ?? []), ...(preview.extra_orders ?? [])].forEach((d: any) => {
            pMap.set(d.order_id as string, {
              base: Number(d.base ?? 0),
              closer_rate: Number(d.closer_rate ?? 0),
              video_rate: Number(d.video_rate ?? 0),
            });
          });
        }
      } catch {
        /* 預估失敗時退回空 map，畫面顯示 0，不中斷其他統計 */
      }
      setPreviewMap(pMap);


      // 讀取當期適用的成交組團獎比例（以結算月份第一天為基準）
      try {
        const { data: bonusData } = await supabase
          .from("closer_team_bonus_settings")
          .select("bonus_rate, effective_from")
          .lte("effective_from", period.startDate)
          .order("effective_from", { ascending: false })
          .limit(1);
        const br = Number((bonusData?.[0] as any)?.bonus_rate ?? 0);
        setBonusRate(Number.isFinite(br) ? br : 0);
      } catch {
        setBonusRate(0);
      }

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


  // 費率一律由 preview-closer-commission 提供（含合作期間／抽成門檻 factor），前端不再自行挑費率


  // 通用：依成交人/影音 + 館別 + rate 聚合（同館可能拆多列）
  function buildMemberStats(field: "closer_id" | "video_creator_id", rateKey: "closer_rate" | "video_rate"): MemberStats[] {
    type Bucket = AccBreakdown;
    const agg = new Map<string, Map<string, Bucket>>(); // uid -> `${accId}|${rate}` -> bucket
    const getBucket = (uid: string, accId: string, rate: number): Bucket => {
      if (!agg.has(uid)) agg.set(uid, new Map());
      const accMap = agg.get(uid)!;
      const key = `${accId}|${rate}`;
      if (!accMap.has(key)) {
        accMap.set(key, {
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
      return accMap.get(key)!;
    };
    validOrders.forEach((o) => {
      const m = metaMap.get(o.id);
      const uid = (m as any)?.[field] as string | undefined;
      if (!uid) return;
      // 對齊 TeamHome：排除保留中訂單與 final_price <= 0
      if (isHoldOrder(o)) return;
      if ((o.final_price || 0) <= 0) return;
      // 金額基礎與費率一律採用 Edge Function 的試算結果（扣加購、排非台幣 / isExempt）
      const pv = previewMap.get(o.id);
      if (!pv) return; // 不在預估名單 = 免抽成 / 非台幣 / 已排除
      const rate = rateKey === "closer_rate" ? pv.closer_rate : pv.video_rate;
      const amount = pv.base;
      const b = getBucket(uid, o.accommodation_id, rate);
      b.validCount += 1;
      b.validAmount += amount;
      // 對齊發放管理：每筆訂單先四捨五入再加總，避免尾差
      b.commission += Math.round(amount * rate);
      b.validOrders.push(o);
    });
    cancelOrders.forEach((o) => {
      const m = metaMap.get(o.id);
      const uid = (m as any)?.[field] as string | undefined;
      if (!uid) return;
      if (isHoldOrder(o)) return;
      if ((o.final_price || 0) <= 0) return;
      // 與有效訂單同口徑：不在預估名單 = 免抽成／非台幣／不在合作期間／未達抽成門檻
      const pv = previewMap.get(o.id);
      if (!pv) return;
      const rate = rateKey === "closer_rate" ? pv.closer_rate : pv.video_rate;
      const amount = pv.base;
      const b = getBucket(uid, o.accommodation_id, rate);
      b.cancelCount += 1;
      b.cancelAmount += amount;
      b.cancelCommission += Math.round(amount * rate);
      b.cancelOrders.push(o);
    });

    return Array.from(agg.entries())
      .map(([uid, accMap]) => {
        const byAcc = Array.from(accMap.values()).sort(
          (a, b) => (a.accName === b.accName ? b.rate - a.rate : b.validAmount - a.validAmount),
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
    [validOrders, cancelOrders, metaMap, commissionByAcc, nameMapByUserId, accNameMap, previewMap],
  );
  const videoStats = useMemo(
    () => buildMemberStats("video_creator_id", "video_rate"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [validOrders, cancelOrders, metaMap, commissionByAcc, nameMapByUserId, accNameMap, previewMap],
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
    applyBonus: boolean = false,
    role: "closer" | "video" = "closer",
  ) => {
    const showBonus = applyBonus && bonusRate > 0;
    const netFactor = 1 - bonusRate;
    const showAdj = mode === "period";
    const byUid = role === "closer" ? adjMaps.closerByUid : adjMaps.videoByUid;
    const byUidAcc = role === "closer" ? adjMaps.closerByUidAcc : adjMaps.videoByUidAcc;
    const bfByUid = role === "closer" ? backfillMaps.closerByUid : backfillMaps.videoByUid;
    const bfByUidAcc =
      role === "closer" ? backfillMaps.closerByUidAcc : backfillMaps.videoByUidAcc;
    const hasBackfill = showAdj && backfills.length > 0;
    const bonusMultiplier = role === "closer" ? closerMultiplier : videoMultiplier;
    const netCommission = (amount: number) => (showBonus ? amount * netFactor : amount);
    const renderCommissionCell = (amount: number) => {
      if (!showBonus) return <BoostedAmount amount={amount} multiplier={bonusMultiplier} />;
      return (
        <div className="flex flex-col leading-tight">
          <span className="text-muted-foreground line-through text-xs">
            {fmtMoney(amount)}
          </span>
          <span className="text-orange-600 font-medium">
            <BoostedAmount amount={amount * netFactor} multiplier={bonusMultiplier} />
          </span>
        </div>
      );
    };
    const renderAdjCell = (amount: number) => {
      const cls = cn(
        "tabular-nums",
        amount === 0
          ? "text-muted-foreground"
          : amount < 0
            ? "text-destructive"
            : "text-emerald-600",
      );
      if (amount === 0) return <span className={cls}>—</span>;
      if (bonusMultiplier <= 1) return <span className={cls}>{fmtMoney(amount)}</span>;
      return (
        <div className="flex flex-col leading-tight items-end">
          <span className="text-muted-foreground line-through text-xs">{fmtMoney(amount)}</span>
          <span className={cls}>
            {fmtMoney(boostedAmount(amount, bonusMultiplier))}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ×{bonusMultiplier.toFixed(2)}
            </span>
          </span>
        </div>
      );
    };

    return (
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
                <TableHead className="whitespace-nowrap tabular-nums">
                  分潤金額
                  {showBonus && (
                    <span
                      className="ml-1 text-[10px] text-muted-foreground font-normal"
                      title={`已扣除 ${(bonusRate * 100).toFixed(1)}% 團隊獎金`}
                    >
                      (扣{(bonusRate * 100).toFixed(1)}%團獎)
                    </span>
                  )}
                </TableHead>
                {showAdj && (
                  <>
                    <TableHead className="whitespace-nowrap tabular-nums">
                      分潤補差
                      <span className="ml-1 text-[10px] text-muted-foreground font-normal">
                        （{payoutMonthKey} 發放月）
                      </span>
                    </TableHead>
                    <TableHead className="whitespace-nowrap tabular-nums">發放總計</TableHead>
                  </>
                )}
                <TableHead className="whitespace-nowrap tabular-nums">取消訂單數</TableHead>
                <TableHead className="whitespace-nowrap tabular-nums">取消訂單總金額</TableHead>
                <TableHead className="whitespace-nowrap tabular-nums">取消分潤金額</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={showAdj ? 11 : 9} className="text-center py-6 text-muted-foreground">
                    無資料
                  </TableCell>
                </TableRow>
              ) : (

                stats.map((r) => {
                  const isOpen = expanded.has(r.uid);
                  const memberAdj = byUid.get(r.uid) ?? 0;
                  const memberTotal = netCommission(r.commission) + memberAdj;
                  const memberTotalBoosted = boostedAmount(netCommission(r.commission), bonusMultiplier) + boostedAmount(memberAdj, bonusMultiplier);
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
                        <TableCell className="tabular-nums">{renderCommissionCell(r.commission)}</TableCell>
                        {showAdj && (
                          <>
                            <TableCell className="tabular-nums">{renderAdjCell(memberAdj)}</TableCell>
                            <TableCell className="tabular-nums font-semibold">
                              {bonusMultiplier > 1 ? (
                                <div className="flex flex-col leading-tight items-end">
                                  <span className="text-muted-foreground line-through text-xs font-normal">
                                    {fmtMoney(memberTotal)}
                                  </span>
                                  <span className="text-primary">
                                    {fmtMoney(memberTotalBoosted)}
                                    <span className="ml-1 text-xs font-normal text-primary/80">×{bonusMultiplier.toFixed(2)}</span>
                                  </span>
                                </div>
                              ) : (
                                fmtMoney(memberTotal)
                              )}
                            </TableCell>
                          </>
                        )}
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
                        r.byAcc.map((b, bi) => {
                          // 同館別可能有多筆費率列，補差只掛在第一筆避免重複
                          const firstOfAcc =
                            r.byAcc.findIndex((x) => x.accId === b.accId) === bi;
                          const accAdj = firstOfAcc
                            ? (byUidAcc.get(`${r.uid}|${b.accId}`) ?? 0)
                            : 0;
                          const adjList =
                            showAdj && firstOfAcc
                              ? adjustments
                                  .filter((a) =>
                                    role === "closer"
                                      ? a.closer_id === r.uid && a.closer_amount !== 0
                                      : a.video_creator_id === r.uid && a.video_amount !== 0,
                                  )
                                  .filter((a) => a.accommodation_id === b.accId)
                                  .map((a) => ({
                                    id: a.id,
                                    adjustment_type: a.adjustment_type,
                                    order_number: a.order_number,
                                    reason: a.reason,
                                    amount: role === "closer" ? a.closer_amount : a.video_amount,
                                  }))
                              : [];
                          const openSheet = () =>
                            setAccSheet({
                              title: `${r.name} ・ ${b.accName}`,
                              breakdown: b,
                              adjList,
                            });
                          return (
                            <TableRow
                              key={`${r.uid}-${b.accId}-${b.rate}`}
                              className="bg-muted/30 cursor-pointer hover:bg-muted/60"
                              onClick={openSheet}
                            >
                              <TableCell />
                              <TableCell className="pl-8 text-sm text-muted-foreground">
                                ↳ {b.accName}（{pct(b.rate)}）
                              </TableCell>
                              <TableCell className="tabular-nums">{b.validCount}</TableCell>
                              <TableCell className="tabular-nums">{fmtMoney(b.validAmount)}</TableCell>
                              <TableCell className="tabular-nums">{renderCommissionCell(b.commission)}</TableCell>
                              {showAdj && (
                                <>
                                  <TableCell className="tabular-nums">{renderAdjCell(accAdj)}</TableCell>
                                  <TableCell className="tabular-nums font-medium">
                                    {bonusMultiplier > 1 ? (
                                      <div className="flex flex-col leading-tight items-end">
                                        <span className="text-muted-foreground line-through text-xs font-normal">
                                          {fmtMoney(netCommission(b.commission) + accAdj)}
                                        </span>
                                        <span className="text-primary">
                                          {fmtMoney(
                                            boostedAmount(netCommission(b.commission), bonusMultiplier) +
                                              boostedAmount(accAdj, bonusMultiplier),
                                          )}
                                        </span>
                                      </div>
                                    ) : (
                                      fmtMoney(netCommission(b.commission) + accAdj)
                                    )}
                                  </TableCell>
                                </>
                              )}
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
  };

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
          {renderMemberCard("成交組業績", closerStats, expandedCloser, setExpandedCloser, "成交組成員", true, "closer")}
          {renderMemberCard("影音組業績", videoStats, expandedVideo, setExpandedVideo, "影音組成員", false, "video")}

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
              {!!accSheet.adjList?.length && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">
                    分潤補差（{payoutMonthKey} 發放月）
                  </h3>
                  <Table className="fixed-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>訂單編號</TableHead>
                        <TableHead>類型</TableHead>
                        <TableHead>說明</TableHead>
                        <TableHead className="tabular-nums">補差金額</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accSheet.adjList.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-mono">{a.order_number ?? "—"}</TableCell>
                          <TableCell className="text-sm">
                            {a.adjustment_type === "order_cancelled"
                              ? "訂單取消扣回"
                              : a.adjustment_type === "amount_changed"
                                ? "金額調整"
                                : a.adjustment_type}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-normal">
                            {a.reason ?? "—"}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "tabular-nums",
                              a.amount < 0 ? "text-destructive" : "text-emerald-600",
                            )}
                          >
                            {fmtMoney(a.amount)}
                          </TableCell>
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
