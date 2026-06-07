import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/components/team/TeamContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, StopCircle, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// 統一獎金類型清單（結算規則 + 加倍活動共用）
const BONUS_TYPE_LABEL: Record<string, string> = {
  all: "全部獎金",
  closer: "成交組訂房佣金",
  video: "影音組分潤",
  scout_kol: "星探KOL分潤",
  scout_base: "星探底薪+團隊獎金",
  franchise_internal: "特許加盟獎金",
  starlink: "星鏈方案獎金",
};

// 結算規則用（不含「全部」）
const COMMISSION_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(BONUS_TYPE_LABEL).filter(([k]) => k !== "all"),
);

const CYCLE_LABEL: Record<string, string> = {
  bimonthly: "每月兩次",
  monthly_early: "月初發放",
  monthly_late: "月底發放",
};

const CYCLE_PAYOUT_DAYS: Record<string, number[]> = {
  bimonthly: [10, 25],
  monthly_early: [10],
  monthly_late: [25],
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const formatMoney = (n: number | null | undefined) =>
  `NT$ ${Number(n ?? 0).toLocaleString()}`;

export default function TeamCommission() {
  const { roles } = useTeam();
  const isAdmin = roles.includes("super_admin") || roles.includes("admin");
  const isScoutManager = roles.includes("scout_manager");
  const isFinance = roles.includes("finance");
  const canAccess = isAdmin || isScoutManager || isFinance;
  const scoutManagerOnly = !isAdmin && isScoutManager;
  const financeReadOnly = isFinance && !isAdmin;

  if (!canAccess) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">獎金管理</h2>
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            您沒有權限訪問此頁面
          </CardContent>
        </Card>
      </div>
    );
  }

  const showAdminTabs = isAdmin || isFinance;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">獎金管理</h2>
      <Tabs defaultValue={showAdminTabs ? "payout" : "payouts"}>
        <TabsList>
          {showAdminTabs && <TabsTrigger value="payout">結算規則</TabsTrigger>}
          {showAdminTabs && <TabsTrigger value="multiplier">獎金加倍活動</TabsTrigger>}
          <TabsTrigger value="payouts">發放管理</TabsTrigger>
        </TabsList>
        {showAdminTabs && (
          <TabsContent value="payout">
            <PayoutRulesBlock readOnly={financeReadOnly} />
          </TabsContent>
        )}
        {showAdminTabs && (
          <TabsContent value="multiplier">
            <MultiplierBlock readOnly={financeReadOnly} />
          </TabsContent>
        )}
        <TabsContent value="payouts">
          <PayoutsBlock scoutManagerOnly={scoutManagerOnly} readOnly={financeReadOnly} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* Tier Settings 與 Salary Settings 區塊已移到 KOL 星探管理 → 設定 Tab（TeamKOL.tsx） */


/* ============================== Tab 2: Payout Rules ============================== */
interface PayoutRuleRow {
  id: string;
  commission_type: string;
  rule_name: string | null;
  cycle_type: string | null;
  payout_days: number[] | null;
  cutoff_description: string | null;
  effective_from: string;
}

function PayoutRulesBlock({ readOnly = false }: { readOnly?: boolean }) {
  const [rows, setRows] = useState<PayoutRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PayoutRuleRow | null>(null);
  const [draft, setDraft] = useState({
    commission_type: "closer",
    cycle_type: "bimonthly",
    cutoff_description: "",
    effective_from: todayStr(),
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const latestIdByType = new Map<string, string>();
  const countByType = new Map<string, number>();
  for (const r of rows) {
    countByType.set(r.commission_type, (countByType.get(r.commission_type) ?? 0) + 1);
    if (!latestIdByType.has(r.commission_type)) latestIdByType.set(r.commission_type, r.id);
  }

  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleting(true);
    const { error } = await supabase.from("commission_payout_rules").delete().eq("id", deletingId);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success("已刪除");
    setDeletingId(null);
    fetchRows();
  };

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("commission_payout_rules")
      .select("*")
      .order("commission_type", { ascending: true })
      .order("effective_from", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data as PayoutRuleRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const openNew = () => {
    setEditing({} as PayoutRuleRow);
    setDraft({
      commission_type: "closer",
      cycle_type: "bimonthly",
      cutoff_description: "",
      effective_from: todayStr(),
    });
  };

  const openEdit = (r: PayoutRuleRow) => {
    setEditing(r);
    setDraft({
      commission_type: r.commission_type,
      cycle_type: r.cycle_type ?? "bimonthly",
      cutoff_description: r.cutoff_description ?? "",
      effective_from: todayStr(),
    });
  };

  const save = async () => {
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const days = CYCLE_PAYOUT_DAYS[draft.cycle_type] ?? [];
    const { error } = await supabase.from("commission_payout_rules").insert({
      commission_type: draft.commission_type,
      rule_name: null,
      cycle_type: draft.cycle_type,
      payout_days: days.length > 0 ? days : null,
      cutoff_description: draft.cutoff_description || null,
      effective_from: draft.effective_from,
      created_by: auth.user?.id ?? null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("已儲存");
    setEditing(null);
    fetchRows();
  };

  const currentPayoutDays = CYCLE_PAYOUT_DAYS[draft.cycle_type] ?? [];

  const currentRows = rows.filter((r) => latestIdByType.get(r.commission_type) === r.id);
  const historyRows = rows.filter((r) => latestIdByType.get(r.commission_type) !== r.id);

  const renderRow = (r: PayoutRuleRow, opts: { showDelete: boolean }) => {
    const onlyOne = (countByType.get(r.commission_type) ?? 0) <= 1;
    return (
      <TableRow key={r.id}>
        <TableCell>{COMMISSION_TYPE_LABEL[r.commission_type] ?? r.commission_type}</TableCell>
        <TableCell>{CYCLE_LABEL[r.cycle_type ?? ""] ?? r.cycle_type}</TableCell>
        <TableCell>{(r.payout_days ?? []).join(", ") || "-"}</TableCell>
        <TableCell>{r.cutoff_description ?? "-"}</TableCell>
        <TableCell>{r.effective_from}</TableCell>
        <TableCell>
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
              以此為範本新增版本
            </Button>
            {opts.showDelete && (
              onlyOne ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button size="sm" variant="ghost" disabled>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>至少保留一筆版本</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setDeletingId(r.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const tableHeader = (
    <TableHeader>
      <TableRow>
        <TableHead>獎金類型</TableHead>
        <TableHead>結算週期</TableHead>
        <TableHead>發放日</TableHead>
        <TableHead>說明</TableHead>
        <TableHead>生效日期</TableHead>
        <TableHead></TableHead>
      </TableRow>
    </TableHeader>
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>結算規則</CardTitle>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> 新增規則
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            每新增一筆規則版本，新獎金計算將從該版本的生效日期開始套用。若新增錯誤，可刪除最新版本。
          </p>
          {loading ? null : (
            <Table>
              {tableHeader}
              <TableBody>{currentRows.map((r) => renderRow(r, { showDelete: true }))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!loading && historyRows.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>歷史版本</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              已被新版本取代的舊規則，僅供查閱與作為新版本範本。
            </p>
            <Table>
              {tableHeader}
              <TableBody>{historyRows.map((r) => renderRow(r, { showDelete: false }))}</TableBody>
            </Table>
          </CardContent>
        </Card>
      )}


      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除此版本</AlertDialogTitle>
            <AlertDialogDescription>確定刪除此版本嗎？此操作無法復原。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "刪除中…" : "確認刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>新增結算規則版本（以此為範本）</DialogTitle>
            <DialogDescription>儲存後會新增一筆生效日期版本</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>獎金類型</Label>
              <Select value={draft.commission_type} onValueChange={(v) => setDraft({ ...draft, commission_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(COMMISSION_TYPE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>生效日期</Label>
              <Input type="date" value={draft.effective_from} onChange={(e) => setDraft({ ...draft, effective_from: e.target.value })} />
            </div>
            <div>
              <Label>結算週期</Label>
              <Select value={draft.cycle_type} onValueChange={(v) => setDraft({ ...draft, cycle_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bimonthly">每月兩次</SelectItem>
                  <SelectItem value="monthly_early">月初發放</SelectItem>
                  <SelectItem value="monthly_late">月底發放</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground">
              發放日：{currentPayoutDays.map((d) => `${d} 日`).join(" / ")}
            </div>
            <div>
              <Label>說明</Label>
              <Textarea value={draft.cutoff_description} onChange={(e) => setDraft({ ...draft, cutoff_description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={save} disabled={saving}>{saving ? "儲存中…" : "儲存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ============================== Tab 3: Multiplier ============================== */
interface MultiplierRow {
  id: string;
  bonus_type: string;
  multiplier: number;
  start_date: string;
  end_date: string;
  reason: string | null;
  is_active: boolean;
}

function MultiplierBlock() {
  const [rows, setRows] = useState<MultiplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    bonus_type: "all",
    multiplier: "1.5",
    start_date: todayStr(),
    end_date: todayStr(),
    reason: "",
  });
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bonus_multiplier_settings")
      .select("*")
      .order("start_date", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data as MultiplierRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const save = async () => {
    if (Number(draft.multiplier) < 1) return toast.error("倍率最小 1.0");
    if (!draft.start_date || !draft.end_date) return toast.error("請填日期");
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("bonus_multiplier_settings").insert({
      bonus_type: draft.bonus_type,
      multiplier: Number(draft.multiplier),
      start_date: draft.start_date,
      end_date: draft.end_date,
      reason: draft.reason || null,
      is_active: true,
      created_by: auth.user?.id ?? null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("已新增活動");
    setOpen(false);
    fetchRows();
  };

  const endEarly = async (id: string) => {
    if (!confirm("確定要提前結束此活動嗎？")) return;
    const { error } = await supabase
      .from("bonus_multiplier_settings")
      .update({ is_active: false })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("已結束");
    fetchRows();
  };

  const today = todayStr();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>獎金加倍活動</CardTitle>
        <Button
          size="sm"
          onClick={() => {
            setDraft({
              bonus_type: "all",
              multiplier: "1.5",
              start_date: today,
              end_date: today,
              reason: "",
            });
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> 新增活動
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? null : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>類型</TableHead>
                <TableHead>倍率</TableHead>
                <TableHead>活動期間</TableHead>
                <TableHead>說明</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const active = r.is_active && r.start_date <= today && r.end_date >= today;
                return (
                  <TableRow key={r.id}>
                    <TableCell>{BONUS_TYPE_LABEL[r.bonus_type] ?? r.bonus_type}</TableCell>
                    <TableCell>{Number(r.multiplier).toFixed(2)}x</TableCell>
                    <TableCell>{r.start_date} ~ {r.end_date}</TableCell>
                    <TableCell>{r.reason ?? "-"}</TableCell>
                    <TableCell>
                      {active ? (
                        <Badge className="bg-green-100 text-green-700 border-green-200">進行中</Badge>
                      ) : (
                        <Badge variant="outline">已結束</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {active && (
                        <Button size="sm" variant="ghost" onClick={() => endEarly(r.id)}>
                          <StopCircle className="h-4 w-4 mr-1" />提前結束
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-x-hidden">
          <DialogHeader><DialogTitle>新增加倍活動</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>獎金類型</Label>
              <Select value={draft.bonus_type} onValueChange={(v) => setDraft({ ...draft, bonus_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(BONUS_TYPE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>倍率（最小 1.0）</Label>
              <Input type="number" step="0.1" min="1" value={draft.multiplier} onChange={(e) => setDraft({ ...draft, multiplier: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label>開始日</Label>
                <Input type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
              </div>
              <div>
                <Label>結束日</Label>
                <Input type="date" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>說明</Label>
              <Textarea value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} disabled={saving}>{saving ? "儲存中…" : "儲存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ============================== Tab 4: Payouts ============================== */
interface PayoutRow {
  id: string;
  year: number;
  month: number;
  scout_id: string;
  base_salary: number;
  team_bonus: number;
  kol_commission: number;
  total_payout: number;
  bonus_breakdown: {
    base_salary?: number;
    rarity_bonus?: number;
    kol_commission?: number;
    team_bonus?: number;
  } | null;
  individual_achieved: boolean | null;
  team_achieved: boolean | null;
  payout_status: string | null;
  payout_date: string | null;
  calculated_at: string | null;
  scout_name?: string;
}

const formatTW = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

function PayoutsBlock({ scoutManagerOnly = false }: { scoutManagerOnly?: boolean }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [status, setStatus] = useState<string>("all");
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("scout_monthly_payouts")
      .select("*")
      .eq("year", year)
      .eq("month", month);
    if (status !== "all") q = q.eq("payout_status", status);
    const { data, error } = await q.order("calculated_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const list = (data as unknown as PayoutRow[]) ?? [];
    const scoutIds = Array.from(new Set(list.map((r) => r.scout_id)));
    let nameMap: Record<string, string> = {};
    if (scoutIds.length > 0) {
      const { data: profiles } = await supabase
        .from("team_member_profiles")
        .select("user_id, display_name")
        .in("user_id", scoutIds);
      nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p.display_name]));
    }
    setRows(list.map((r) => ({ ...r, scout_name: nameMap[r.scout_id] ?? r.scout_id })));
    setLoading(false);
  }, [year, month, status]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const { data, error } = await supabase.functions.invoke("calculate-scout-payout", {
        body: { year, month },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error ?? "計算失敗");
      toast.success(`計算完成（${data?.scouts_calculated ?? 0} 位星探）`);
      await fetchRows();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRecalculating(false);
    }
  };

  const markPaid = async (id: string) => {
    const { error } = await supabase
      .from("scout_monthly_payouts")
      .update({
        payout_status: "paid",
        payout_date: todayStr(),
        locked_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("已標記為發放");
    fetchRows();
  };

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  return (
    <Card>
      <CardHeader>
        <CardTitle>發放管理</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          為了增加頁面讀取速度，固定每天晚上 23:59 自動更新數據，若有即時需求可手動「立即更新」。
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <Label className="text-xs">年份</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">月份</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">狀態</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="pending">待發放</SelectItem>
                <SelectItem value="paid">已發放</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={handleRecalculate} disabled={recalculating}>
            {recalculating ? "計算中…" : "立即更新"}
          </Button>
        </div>

        {loading ? null : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">本月份無記錄</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>星探</TableHead>
                <TableHead>底薪</TableHead>
                <TableHead>稀有度獎金</TableHead>
                <TableHead>KOL分潤</TableHead>
                <TableHead>團隊獎金</TableHead>
                <TableHead>合計</TableHead>
                <TableHead>個人</TableHead>
                <TableHead>團隊</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>計算時間</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const bb = r.bonus_breakdown ?? {};
                const baseSalary = bb.base_salary ?? r.base_salary;
                const rarityBonus = bb.rarity_bonus ?? 0;
                const kolCommission = bb.kol_commission ?? r.kol_commission;
                const teamBonus = bb.team_bonus ?? r.team_bonus;
                return (
                  <TableRow key={r.id}>
                    <TableCell>{r.scout_name}</TableCell>
                    <TableCell>{formatMoney(baseSalary)}</TableCell>
                    <TableCell>{formatMoney(rarityBonus)}</TableCell>
                    <TableCell>{formatMoney(kolCommission)}</TableCell>
                    <TableCell>{formatMoney(teamBonus)}</TableCell>
                    <TableCell className="font-medium">{formatMoney(r.total_payout)}</TableCell>
                    <TableCell>{r.individual_achieved ? "✓" : "✗"}</TableCell>
                    <TableCell>{r.team_achieved ? "✓" : "✗"}</TableCell>
                    <TableCell>
                      {r.payout_status === "paid" ? (
                        <Badge variant="outline">已發放</Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200">待發放</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTW(r.calculated_at)}
                    </TableCell>
                    <TableCell>
                      {r.payout_status === "paid" ? (
                        <span className="text-xs text-muted-foreground">{r.payout_date ?? ""}</span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => markPaid(r.id)}>
                          標記已發放
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
