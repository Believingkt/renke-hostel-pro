import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Pencil } from "lucide-react";

interface Props {
  isAdmin: boolean;
}

interface BonusSetting {
  id: string;
  bonus_rate: number;
  effective_from: string;
  note: string | null;
  created_at: string;
}

interface Member {
  user_id: string;
  display_name: string;
}

interface CommissionRow {
  accommodation_id: string;
  closer_rate: number | null;
  effective_from: string;
}

interface DistributionRow {
  id: string;
  closer_id: string;
  service_count: number;
  bonus_amount: number;
  pool_total: number;
  pool_total_count: number;
  is_finalized: boolean;
  finalized_by: string | null;
  finalized_at: string | null;
}

const fmtNT = (n: number) =>
  `NT$ ${Math.round(n).toLocaleString("en-US")}`;

// Taipei "yyyy-MM" of a given Date
function taipeiMonthOf(d: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, month };
}

export default function TeamBonusDistributionTab({ isAdmin }: Props) {
  // ============ Card 1: bonus settings ============
  const [settings, setSettings] = useState<BonusSetting[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newEffective, setNewEffective] = useState<string>(
    format(new Date(), "yyyy-MM-dd"),
  );
  const [newRate, setNewRate] = useState<string>("");
  const [newNote, setNewNote] = useState<string>("");
  const [savingSetting, setSavingSetting] = useState(false);

  // Edit note dialog
  const [editTarget, setEditTarget] = useState<BonusSetting | null>(null);
  const [editNote, setEditNote] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);

  async function handleSaveEditNote() {
    if (!editTarget) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("closer_team_bonus_settings")
        .update({ note: editNote.trim() || null })
        .eq("id", editTarget.id);
      if (error) throw error;
      toast.success("備註已更新");
      setEditTarget(null);
      await loadSettings();
    } catch (e: any) {
      toast.error("更新失敗：" + (e.message || ""));
    } finally {
      setSavingEdit(false);
    }
  }

  // ============ Card 2: distribution ============
  // Period selector: "X月10日"; settlement month = period month - 1
  const now = new Date();
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const initPeriodY = taipeiMonthOf(prevMonthDate).year;
  const initPeriodM = taipeiMonthOf(prevMonthDate).month;
  const [periodYear, setPeriodYear] = useState<number>(initPeriodY);
  const [periodMonth, setPeriodMonth] = useState<number>(initPeriodM);

  // Settlement year/month = period month - 1 (wraps to previous year)
  const year = periodMonth === 1 ? periodYear - 1 : periodYear;
  const month = periodMonth === 1 ? 12 : periodMonth - 1;

  const [closers, setClosers] = useState<Member[]>([]);
  const [pool, setPool] = useState<number>(0);
  const [appliedRate, setAppliedRate] = useState<number>(0);
  const [countMap, setCountMap] = useState<Record<string, number>>({});
  const [distributions, setDistributions] = useState<DistributionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [nameByUid, setNameByUid] = useState<Record<string, string>>({});

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    loadClosers();
  }, []);

  useEffect(() => {
    void computePeriod();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  async function loadSettings() {
    const { data, error } = await supabase
      .from("closer_team_bonus_settings")
      .select("id, bonus_rate, effective_from, note, created_at")
      .order("effective_from", { ascending: false });
    if (error) {
      toast.error("讀取比例設定失敗：" + error.message);
      return;
    }
    setSettings((data ?? []) as BonusSetting[]);
  }

  async function loadClosers() {
    const { data, error } = await supabase.rpc("get_team_role_members", {
      p_role: "closer" as any,
    });
    if (error) {
      toast.error("讀取成交組成員失敗：" + error.message);
      return;
    }
    const list = ((data as any[]) || []).map((m) => ({
      user_id: m.user_id,
      display_name: m.display_name ?? m.user_id?.slice(0, 8) ?? "—",
    }));
    setClosers(list);
    const map: Record<string, string> = {};
    list.forEach((m) => (map[m.user_id] = m.display_name));
    setNameByUid((prev) => ({ ...prev, ...map }));
  }

  function pickRate(
    settingsList: BonusSetting[],
    monthFirstDay: string,
  ): number {
    const hit = settingsList.find((s) => s.effective_from <= monthFirstDay);
    return hit ? Number(hit.bonus_rate) : 0;
  }

  function pickCloserRateFor(
    commissionByAcc: Map<string, CommissionRow[]>,
    accId: string,
    orderDateIso: string | null,
  ): number {
    const list = commissionByAcc.get(accId) ?? [];
    if (!list.length || !orderDateIso) return 0;
    const day = orderDateIso.slice(0, 10);
    const hit = list.find((s) => s.effective_from <= day);
    return Number(hit?.closer_rate ?? 0);
  }

  async function computePeriod() {
    setLoading(true);
    try {
      const monthFirst = `${year}-${String(month).padStart(2, "0")}-01`;
      const nextY = month === 12 ? year + 1 : year;
      const nextM = month === 12 ? 1 : month + 1;
      const nextFirst = `${nextY}-${String(nextM).padStart(2, "0")}-01`;

      // Rate for this month
      const { data: sData } = await supabase
        .from("closer_team_bonus_settings")
        .select("id, bonus_rate, effective_from, note, created_at")
        .lte("effective_from", monthFirst)
        .order("effective_from", { ascending: false })
        .limit(1);
      const rate = sData && sData.length > 0 ? Number(sData[0].bonus_rate) : 0;
      setAppliedRate(rate);

      // Commission settings history
      const { data: cData } = await supabase
        .from("accommodation_commission_settings")
        .select("accommodation_id, closer_rate, effective_from")
        .order("effective_from", { ascending: false });
      const commissionByAcc = new Map<string, CommissionRow[]>();
      (cData ?? []).forEach((r: any) => {
        const arr = commissionByAcc.get(r.accommodation_id) ?? [];
        arr.push(r);
        commissionByAcc.set(r.accommodation_id, arr);
      });

      // Orders within Taipei month [monthFirst, nextFirst) on COALESCE(confirmed_at, order_date)
      const startIso = `${monthFirst}T00:00:00+08:00`;
      const endIso = `${nextFirst}T00:00:00+08:00`;

      // Fetch orders + meta separately, join in JS. Paginate.
      const PAGE = 1000;
      const allOrders: any[] = [];
      for (let from = 0; from < 50000; from += PAGE) {
        const { data, error } = await supabase
          .from("orders")
          .select(
            "id, accommodation_id, final_price, order_status, order_date, confirmed_at",
          )
          .neq("order_status", "cancelled")
          .or(
            `and(confirmed_at.gte.${startIso},confirmed_at.lt.${endIso}),and(confirmed_at.is.null,order_date.gte.${startIso},order_date.lt.${endIso})`,
          )
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = data ?? [];
        allOrders.push(...rows);
        if (rows.length < PAGE) break;
      }

      const orderIds = allOrders.map((o) => o.id);
      const metaMap = new Map<string, { closer_id: string | null; is_excluded: boolean }>();
      // batch meta lookups
      for (let i = 0; i < orderIds.length; i += 500) {
        const chunk = orderIds.slice(i, i + 500);
        if (!chunk.length) break;
        const { data: metas } = await supabase
          .from("order_meta")
          .select("order_id, closer_id, is_excluded")
          .in("order_id", chunk);
        (metas ?? []).forEach((m: any) => {
          metaMap.set(m.order_id, {
            closer_id: m.closer_id,
            is_excluded: !!m.is_excluded,
          });
        });
      }

      let poolAcc = 0;
      allOrders.forEach((o) => {
        const m = metaMap.get(o.id);
        if (!m || !m.closer_id || m.is_excluded) return;
        const closerRate = pickCloserRateFor(
          commissionByAcc,
          o.accommodation_id,
          o.order_date,
        );
        const commission = (Number(o.final_price) || 0) * closerRate;
        poolAcc += commission * rate;
      });
      setPool(poolAcc);

      // Load existing distributions
      const { data: dData } = await supabase
        .from("closer_team_bonus_distribution")
        .select(
          "id, closer_id, service_count, bonus_amount, pool_total, pool_total_count, is_finalized, finalized_by, finalized_at",
        )
        .eq("year", year)
        .eq("month", month);
      const dRows = (dData ?? []) as DistributionRow[];
      setDistributions(dRows);
      const cm: Record<string, number> = {};
      dRows.forEach((r) => (cm[r.closer_id] = r.service_count));
      setCountMap(cm);
    } catch (e: any) {
      toast.error("計算失敗：" + (e.message || ""));
    } finally {
      setLoading(false);
    }
  }

  const finalizedRow = useMemo(
    () => distributions.find((d) => d.is_finalized) ?? null,
    [distributions],
  );
  const isFinalized = !!finalizedRow;

  const displayPool = isFinalized ? Number(finalizedRow!.pool_total) : pool;

  const totalCount = useMemo(
    () => closers.reduce((s, m) => s + (Number(countMap[m.user_id]) || 0), 0),
    [closers, countMap],
  );

  function amountFor(uid: string): number {
    const c = Number(countMap[uid]) || 0;
    if (totalCount === 0 || displayPool === 0) return 0;
    return (c / totalCount) * displayPool;
  }

  const totalAmount = useMemo(
    () => closers.reduce((s, m) => s + amountFor(m.user_id), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [closers, countMap, displayPool, totalCount],
  );

  async function handleAddSetting() {
    if (!newEffective || !/^\d{4}-\d{2}-\d{2}$/.test(newEffective)) {
      toast.error("請輸入有效的生效日期");
      return;
    }
    const rateNum = Number(newRate);
    if (Number.isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
      toast.error("比例必須介於 0-100");
      return;
    }
    if (settings.some((s) => s.effective_from === newEffective)) {
      toast.error("此生效日期已有設定");
      return;
    }
    setSavingSetting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const { error } = await supabase
        .from("closer_team_bonus_settings")
        .insert({
          bonus_rate: rateNum / 100,
          effective_from: newEffective,
          note: newNote.trim() || null,
          created_by: uid,
        });
      if (error) throw error;
      toast.success("已新增");
      setAddOpen(false);
      setNewRate("");
      setNewNote("");
      await loadSettings();
      await computePeriod();
    } catch (e: any) {
      toast.error("儲存失敗：" + (e.message || ""));
    } finally {
      setSavingSetting(false);
    }
  }

  async function handleFinalize() {
    if (!isAdmin || isFinalized) return;
    setConfirming(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const nowIso = new Date().toISOString();
      const rows = closers.map((m) => ({
        year,
        month,
        closer_id: m.user_id,
        service_count: Number(countMap[m.user_id]) || 0,
        bonus_amount: amountFor(m.user_id),
        pool_total: pool,
        pool_total_count: totalCount,
        is_finalized: true,
        finalized_by: uid,
        finalized_at: nowIso,
      }));
      const { error } = await supabase
        .from("closer_team_bonus_distribution")
        .upsert(rows, { onConflict: "year,month,closer_id" });
      if (error) throw error;
      toast.success("已定案");
      await computePeriod();
    } catch (e: any) {
      toast.error("定案失敗：" + (e.message || ""));
    } finally {
      setConfirming(false);
    }
  }

  const currentYear = new Date().getFullYear();
  const yearOptions: number[] = [];
  for (let y = 2024; y <= currentYear + 1; y++) yearOptions.push(y);
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="space-y-4 overflow-x-hidden">
      {/* Card 1: 團獎比例設定 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">團獎比例設定</CardTitle>
          {isAdmin && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                新增版本
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>新增團獎比例</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label>生效日期</Label>
                    <Input
                      type="date"
                      value={newEffective}
                      onChange={(e) => setNewEffective(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>比例 (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      placeholder="例如 20"
                      value={newRate}
                      onChange={(e) => setNewRate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>備註（選填）</Label>
                    <Textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      rows={2}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setAddOpen(false)}
                    disabled={savingSetting}
                  >
                    取消
                  </Button>
                  <Button onClick={handleAddSetting} disabled={savingSetting}>
                    {savingSetting ? "儲存中..." : "儲存"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">生效日期</TableHead>
                <TableHead className="w-32">比例</TableHead>
                <TableHead>備註</TableHead>
                {isAdmin && <TableHead className="w-16"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 4 : 3} className="text-center text-muted-foreground">
                    尚無資料
                  </TableCell>
                </TableRow>
              ) : (
                settings.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.effective_from}</TableCell>
                    <TableCell>
                      {Number((s.bonus_rate * 100).toFixed(4))}%
                    </TableCell>
                    <TableCell className="whitespace-pre-wrap">
                      {s.note || "—"}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditTarget(s);
                            setEditNote(s.note ?? "");
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit note dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>編輯備註 — {editTarget?.effective_from}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>備註</Label>
            <Textarea
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={savingEdit}>
              取消
            </Button>
            <Button onClick={handleSaveEditNote} disabled={savingEdit}>
              {savingEdit ? "儲存中..." : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Card 2: 本期分配 */}
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">本期分配</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(periodYear)}
              onValueChange={(v) => setPeriodYear(Number(v))}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y} 年
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(periodMonth)}
              onValueChange={(v) => setPeriodMonth(Number(v))}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m}月10日
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm">
            本期團獎池：
            <span className="font-semibold text-primary">
              {fmtNT(displayPool)}
            </span>
            （比例：{Number((appliedRate * 100).toFixed(4))}%）
            {loading && (
              <span className="ml-2 text-muted-foreground">計算中…</span>
            )}
          </div>
          {isFinalized && finalizedRow?.finalized_at && (
            <div className="text-sm text-muted-foreground">
              已於 {format(new Date(finalizedRow.finalized_at), "yyyy-MM-dd HH:mm")} 由{" "}
              {finalizedRow.finalized_by
                ? nameByUid[finalizedRow.finalized_by] ??
                  finalizedRow.finalized_by.slice(0, 8)
                : "—"}{" "}
              定案
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead className="w-40">本期負責數量</TableHead>
                <TableHead className="w-40 text-right">分配金額</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {closers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-muted-foreground"
                  >
                    尚無成交組成員
                  </TableCell>
                </TableRow>
              ) : (
                closers.map((m) => (
                  <TableRow key={m.user_id}>
                    <TableCell>{m.display_name}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        className="w-28"
                        value={countMap[m.user_id] ?? 0}
                        disabled={isFinalized || !isAdmin}
                        onChange={(e) => {
                          const v = Math.max(
                            0,
                            Math.floor(Number(e.target.value) || 0),
                          );
                          setCountMap((prev) => ({
                            ...prev,
                            [m.user_id]: v,
                          }));
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtNT(amountFor(m.user_id))}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between text-sm">
            <div>
              數量總和：<span className="font-semibold">{totalCount}</span>
            </div>
            <div>
              分配金額總和：
              <span className="font-semibold">{fmtNT(totalAmount)}</span>
              {Math.abs(totalAmount - displayPool) >= 1 && displayPool > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  （與團獎池差異來自小數捨入）
                </span>
              )}
            </div>
          </div>

          {isAdmin && !isFinalized && (
            <div className="flex justify-end">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={confirming || loading}>
                    確認定案
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>確認定案本期分配？</AlertDialogTitle>
                    <AlertDialogDescription>
                      定案後將寫入 {year} 年 {month} 月各成員的分配金額，欄位將鎖定。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={handleFinalize}>
                      確認
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
