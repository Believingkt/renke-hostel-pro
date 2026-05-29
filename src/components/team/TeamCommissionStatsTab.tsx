import { useEffect, useMemo, useState } from "react";
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
import { toast } from "sonner";

interface OrderLite {
  id: string;
  accommodation_id: string;
  final_price: number;
  order_status: string;
  discount_code: string | null;
}
interface MetaLite {
  order_id: string;
  closer_id: string | null;
  video_creator_id: string | null;
  is_excluded: boolean | null;
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

function lastDayOfMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}

export default function TeamCommissionStatsTab() {
  const now = new Date();
  const [year, setYear] = useState<string>(String(now.getFullYear()));
  const [month, setMonth] = useState<string>(String(now.getMonth() + 1));
  const [loading, setLoading] = useState(false);

  const [orders, setOrders] = useState<OrderLite[]>([]);
  const [metaMap, setMetaMap] = useState<Map<string, MetaLite>>(new Map());
  const [commissionByAcc, setCommissionByAcc] = useState<
    Map<string, CommissionRow>
  >(new Map());
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const [scoutCodes, setScoutCodes] = useState<ScoutCode[]>([]);
  const [accNameMap, setAccNameMap] = useState<Map<string, string>>(new Map());

  // 上個月區間（或全年 / 全部）
  const period = useMemo(() => {
    const allYears = year === "all";
    const allMonths = month === "all";

    // 全部年份
    if (allYears) {
      const todayStr = new Date().toISOString().slice(0, 10);
      return {
        startIso: null as string | null,
        nextIso: null as string | null,
        startDate: todayStr, // 用於 commission_settings 取最新有效設定
        label: "全部年份",
      };
    }

    const y = Number(year);

    // 指定年份 + 全年
    if (allMonths) {
      const startIso = new Date(y, 0, 1).toISOString();
      const nextIso = new Date(y + 1, 0, 1).toISOString();
      return {
        startIso,
        nextIso,
        startDate: `${y}-01-01`,
        label: `${y} 全年`,
      };
    }

    // 指定年月 → 上個月區間
    const m = Number(month);
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const endDay = lastDayOfMonth(prevY, prevM);
    const startIso = new Date(prevY, prevM - 1, 1).toISOString();
    const nextIso = new Date(prevY, prevM - 1, endDay + 1).toISOString();
    return {
      startIso,
      nextIso,
      startDate: `${prevY}-${String(prevM).padStart(2, "0")}-01`,
      label: `${prevY}/${prevM}`,
    };
  }, [year, month]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.startIso, period.nextIso, period.label]);

  async function load() {
    setLoading(true);
    try {
      let q = supabase
        .from("orders")
        .select("id, accommodation_id, final_price, order_status, discount_code");
      if (period.startIso) q = q.gte("order_date", period.startIso);
      if (period.nextIso) q = q.lt("order_date", period.nextIso);
      const { data: ordersData, error: oe } = await q;
      if (oe) throw oe;
      const ords = (ordersData ?? []) as OrderLite[];
      setOrders(ords);

      const ids = ords.map((o) => o.id);
      const mMap = new Map<string, MetaLite>();
      if (ids.length) {
        const { data: metaData } = await supabase
          .from("order_meta")
          .select("order_id, closer_id, video_creator_id, is_excluded")
          .in("order_id", ids);
        (metaData ?? []).forEach((m: any) =>
          mMap.set(m.order_id, m as MetaLite),
        );
      }
      setMetaMap(mMap);

      // accommodation_commission_settings: latest effective_from <= period start, per acc
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
      // orders.discount_code 都是大寫，將星探折扣碼統一轉為大寫後再進行比對
      const codes = ((scData ?? []) as ScoutCode[]).map((c) => ({
        ...c,
        discount_code: (c.discount_code || "").toUpperCase(),
      }));
      setScoutCodes(codes);

      // 名稱對照
      const uids = new Set<string>();
      mMap.forEach((m) => {
        if (m.closer_id) uids.add(m.closer_id);
        if (m.video_creator_id) uids.add(m.video_creator_id);
      });
      codes.forEach((s) => {
        if (s.scout_id) uids.add(s.scout_id);
        if (s.closer_id) uids.add(s.closer_id);
      });
      const nMap = new Map<string, string>();
      if (uids.size) {
        const { data: profs } = await supabase
          .from("team_member_profiles")
          .select("user_id, display_name")
          .in("user_id", Array.from(uids));
        (profs ?? []).forEach((p: any) => nMap.set(p.user_id, p.display_name));
      }
      setNameMap(nMap);

      // 民宿名稱
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
      if (o.order_status === "已取消") {
        cancel.push(o);
      } else {
        const m = metaMap.get(o.id);
        if (m?.is_excluded) return;
        valid.push(o);
      }
    });
    return { validOrders: valid, cancelOrders: cancel };
  }, [orders, metaMap]);

  const closerStats = useMemo(() => {
    const agg = new Map<
      string,
      {
        validCount: number;
        validAmount: number;
        commission: number;
        cancelCount: number;
        cancelAmount: number;
      }
    >();
    const get = (id: string) => {
      if (!agg.has(id))
        agg.set(id, {
          validCount: 0,
          validAmount: 0,
          commission: 0,
          cancelCount: 0,
          cancelAmount: 0,
        });
      return agg.get(id)!;
    };
    validOrders.forEach((o) => {
      const m = metaMap.get(o.id);
      if (!m?.closer_id) return;
      const row = get(m.closer_id);
      const rate = Number(
        commissionByAcc.get(o.accommodation_id)?.closer_rate ?? 0,
      );
      row.validCount += 1;
      row.validAmount += o.final_price || 0;
      row.commission += (o.final_price || 0) * rate;
    });
    cancelOrders.forEach((o) => {
      const m = metaMap.get(o.id);
      if (!m?.closer_id) return;
      const row = get(m.closer_id);
      row.cancelCount += 1;
      row.cancelAmount += o.final_price || 0;
    });
    return Array.from(agg.entries())
      .map(([uid, v]) => ({
        uid,
        name: nameMap.get(uid) ?? uid.slice(0, 8),
        rate: v.validAmount > 0 ? v.commission / v.validAmount : 0,
        ...v,
      }))
      .sort((a, b) => b.validAmount - a.validAmount);
  }, [validOrders, cancelOrders, metaMap, commissionByAcc, nameMap]);

  const videoStats = useMemo(() => {
    const agg = new Map<
      string,
      {
        validCount: number;
        validAmount: number;
        commission: number;
        cancelCount: number;
        cancelAmount: number;
      }
    >();
    const get = (id: string) => {
      if (!agg.has(id))
        agg.set(id, {
          validCount: 0,
          validAmount: 0,
          commission: 0,
          cancelCount: 0,
          cancelAmount: 0,
        });
      return agg.get(id)!;
    };
    validOrders.forEach((o) => {
      const m = metaMap.get(o.id);
      if (!m?.video_creator_id) return;
      const row = get(m.video_creator_id);
      const rate = Number(
        commissionByAcc.get(o.accommodation_id)?.video_rate ?? 0,
      );
      row.validCount += 1;
      row.validAmount += o.final_price || 0;
      row.commission += (o.final_price || 0) * rate;
    });
    cancelOrders.forEach((o) => {
      const m = metaMap.get(o.id);
      if (!m?.video_creator_id) return;
      const row = get(m.video_creator_id);
      row.cancelCount += 1;
      row.cancelAmount += o.final_price || 0;
    });
    return Array.from(agg.entries())
      .map(([uid, v]) => ({
        uid,
        name: nameMap.get(uid) ?? uid.slice(0, 8),
        rate: v.validAmount > 0 ? v.commission / v.validAmount : 0,
        ...v,
      }))
      .sort((a, b) => b.validAmount - a.validAmount);
  }, [validOrders, cancelOrders, metaMap, commissionByAcc, nameMap]);

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
          scoutName: c.scout_id ? nameMap.get(c.scout_id) ?? "—" : "—",
          closerName: c.closer_id ? nameMap.get(c.closer_id) ?? "—" : "—",
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
        };
      })
      .filter((r) => r.validCount > 0 || r.cancelCount > 0)
      .sort((a, b) => b.validAmount - a.validAmount);
  }, [scoutCodes, validOrders, cancelOrders, nameMap, accNameMap]);

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1].map(String);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部年份</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y} 年
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全年</SelectItem>
                {Array.from({ length: 12 }, (_, i) => String(i + 1)).map(
                  (m) => (
                    <SelectItem key={m} value={m}>
                      {m} 月
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            統計上個月的訂單，例如選擇 6 月，計算的是 5 月 1 日~5 月 31 日的訂單
          </p>
          <div className="text-sm text-muted-foreground">
            目前統計區間：{period.label}
            （
            {loading
              ? "載入中..."
              : `共 ${validOrders.length} 筆有效訂單 / ${cancelOrders.length} 筆取消訂單`}
            ）
          </div>
        </CardContent>
      </Card>

      {/* 成交組業績 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="text-lg font-semibold">成交組業績</h2>
          <div className="overflow-x-auto">
            <Table className="fixed-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">成交組成員</TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    有效訂單數
                  </TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    有效訂單總金額
                  </TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    分潤%
                  </TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    分潤金額
                  </TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    取消訂單數
                  </TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    取消訂單總金額
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closerStats.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-6 text-muted-foreground"
                    >
                      無資料
                    </TableCell>
                  </TableRow>
                ) : (
                  closerStats.map((r) => (
                    <TableRow key={r.uid}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="tabular-nums">
                        {r.validCount}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {fmtMoney(r.validAmount)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {pct(r.rate)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {fmtMoney(r.commission)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {r.cancelCount}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {fmtMoney(r.cancelAmount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 影音組業績 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h2 className="text-lg font-semibold">影音組業績</h2>
          <div className="overflow-x-auto">
            <Table className="fixed-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">影音組成員</TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    有效訂單數
                  </TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    有效訂單總金額
                  </TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    分潤%
                  </TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    分潤金額
                  </TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    取消訂單數
                  </TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    取消訂單總金額
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {videoStats.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-6 text-muted-foreground"
                    >
                      無資料
                    </TableCell>
                  </TableRow>
                ) : (
                  videoStats.map((r) => (
                    <TableRow key={r.uid}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="tabular-nums">
                        {r.validCount}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {fmtMoney(r.validAmount)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {pct(r.rate)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {fmtMoney(r.commission)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {r.cancelCount}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {fmtMoney(r.cancelAmount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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
                  <TableHead className="whitespace-nowrap tabular-nums">
                    有效訂單數
                  </TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    有效訂單總金額
                  </TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    星探分潤%
                  </TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    星探分潤金額
                  </TableHead>
                  <TableHead className="whitespace-nowrap">成交組</TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    成交組分潤%
                  </TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    成交組分潤金額
                  </TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    取消訂單數
                  </TableHead>
                  <TableHead className="whitespace-nowrap tabular-nums">
                    取消訂單總金額
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scoutStats.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={12}
                      className="text-center py-6 text-muted-foreground"
                    >
                      無資料
                    </TableCell>
                  </TableRow>
                ) : (
                  scoutStats.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.scoutName}</TableCell>
                      <TableCell className="font-mono">{r.code}</TableCell>
                      <TableCell>{r.accName}</TableCell>
                      <TableCell className="tabular-nums">
                        {r.validCount}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {fmtMoney(r.validAmount)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {pct(r.scoutRate)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {fmtMoney(r.scoutCommission)}
                      </TableCell>
                      <TableCell>{r.closerName}</TableCell>
                      <TableCell className="tabular-nums">
                        {pct(r.closerRate)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {fmtMoney(r.closerCommission)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {r.cancelCount}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {fmtMoney(r.cancelAmount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
