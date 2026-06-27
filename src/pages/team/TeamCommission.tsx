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
      <Tabs defaultValue="payouts">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="payouts">發放管理</TabsTrigger>
            {showAdminTabs && <TabsTrigger value="payout">結算規則</TabsTrigger>}
            {showAdminTabs && <TabsTrigger value="multiplier">獎金加倍活動</TabsTrigger>}
          </TabsList>
        </div>
        <TabsContent value="payouts">
          <PayoutsBlock scoutManagerOnly={scoutManagerOnly} readOnly={financeReadOnly} />
        </TabsContent>
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
          {!readOnly && (
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
          )}
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
          {!readOnly && (
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" /> 新增規則
            </Button>
          )}
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

function MultiplierBlock({ readOnly = false }: { readOnly?: boolean }) {
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
        {!readOnly && (
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
        )}
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
                      {active && !readOnly && (
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

/* ============================== Tab 1: Payouts (彙整所有獎金來源) ============================== */

interface SourceItem {
  key: string;                  // unique: source_table:source_id:role_key
  source_table: string;
  source_id: string;
  role_key: string;
  member_id: string | null;     // team_member_profiles.id
  source_label: string;
  detail: string;               // 訂單描述 / 客戶名
  amount: number;
  paid: boolean;
  payout_date: string | null;
}

interface MemberGroup {
  member_id: string;
  display_name: string;
  items: SourceItem[];
  total: number;
}

const SOURCE_LABEL: Record<string, string> = {
  closer: "成交組分潤",
  video: "影音組分潤",
  franchise_internal_sales: "特許加盟業務",
  franchise_internal_leader: "特許加盟隊長",
  franchise_external_sales: "特許加盟外部業務",
  franchise_external_co1: "特許加盟外部協同業務1",
  franchise_external_co2: "特許加盟外部協同業務2",
  starlink: "星鏈分潤",
};

function previousMonthRange(year: number, month: number) {
  // 選定 year/month 代表「發放月」，資料為上個月
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const start = `${prevYear}-${String(prevMonth).padStart(2, "0")}-01`;
  // 月末
  const lastDay = new Date(prevYear, prevMonth, 0).getDate();
  const end = `${prevYear}-${String(prevMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const payoutMonthKey = `${year}-${String(month).padStart(2, "0")}`;
  return { start, end, payoutMonthKey, prevYear, prevMonth };
}

function PayoutsBlock({ scoutManagerOnly: _scoutManagerOnly = false, readOnly = false }: { scoutManagerOnly?: boolean; readOnly?: boolean }) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkMarking, setBulkMarking] = useState(false);

  const range = useMemo(() => previousMonthRange(year, month), [year, month]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end, payoutMonthKey } = range;

      // 1. team_member_profiles：建立 id ↔ user_id ↔ display_name 對照
      const { data: profiles } = await supabase
        .from("team_member_profiles")
        .select("id, user_id, display_name");
      const profileById = new Map<string, { id: string; user_id: string | null; display_name: string }>();
      const profileByUserId = new Map<string, { id: string; user_id: string | null; display_name: string }>();
      (profiles ?? []).forEach((p: any) => {
        profileById.set(p.id, p);
        if (p.user_id) profileByUserId.set(p.user_id, p);
      });

      // 2. 並行撈取四種來源
      const [
        { data: closers },
        { data: fInternal },
        { data: fExternal },
        { data: starlinks },
        { data: teamSettings },
      ] = await Promise.all([
        supabase
          .from("closer_commission_snapshots")
          .select("id, closer_id, video_creator_id, closer_commission_amount, video_commission_amount, payout_month, order_id")
          .eq("payout_month", payoutMonthKey),
        supabase
          .from("franchise_orders")
          .select("id, sold_by, commission_amount, leader_amount, customer_name, plan_name, sold_at")
          .gte("sold_at", start)
          .lte("sold_at", end),
        supabase
          .from("franchise_external_orders")
          .select("id, sales_member_id, co_sales_member_id, co_sales_member_id2, sales_bonus, co_sales_bonus, co_sales_bonus2, customer_name, project_name, signed_at")
          .gte("signed_at", start)
          .lte("signed_at", end),
        supabase
          .from("starlink_orders")
          .select("id, sold_by, commission_amount, client_name, plan_name, sold_at")
          .gte("sold_at", start)
          .lte("sold_at", end),
        supabase
          .from("franchise_team_settings")
          .select("member_id, direct_leader_id"),
      ]);

      // 隊長對應：member_id (team_member_profiles.id) → direct_leader_id (user_id)
      const leaderByMember = new Map<string, string>();
      (teamSettings ?? []).forEach((t: any) => {
        if (t.direct_leader_id) leaderByMember.set(t.member_id, t.direct_leader_id);
      });

      const items: SourceItem[] = [];
      const pushItem = (
        source_table: string,
        source_id: string,
        role_key: string,
        memberRef: { id: string } | undefined,
        source_label: string,
        detail: string,
        amount: number,
      ) => {
        if (!amount || amount === 0) return;
        items.push({
          key: `${source_table}:${source_id}:${role_key}`,
          source_table,
          source_id,
          role_key,
          member_id: memberRef?.id ?? null,
          source_label,
          detail,
          amount: Number(amount),
          paid: false,
          payout_date: null,
        });
      };

      (closers ?? []).forEach((r: any) => {
        if (r.closer_id && Number(r.closer_commission_amount) > 0) {
          pushItem("closer_commission_snapshots", r.id, "closer", profileByUserId.get(r.closer_id), SOURCE_LABEL.closer, `訂單 ${String(r.order_id).slice(0, 8)}`, r.closer_commission_amount);
        }
        if (r.video_creator_id && Number(r.video_commission_amount) > 0) {
          pushItem("closer_commission_snapshots", r.id, "video", profileByUserId.get(r.video_creator_id), SOURCE_LABEL.video, `訂單 ${String(r.order_id).slice(0, 8)}`, r.video_commission_amount);
        }
      });

      (fInternal ?? []).forEach((r: any) => {
        const detail = `${r.customer_name ?? ""}・${r.plan_name ?? ""}`.trim();
        if (r.sold_by && Number(r.commission_amount) > 0) {
          pushItem("franchise_orders", r.id, "sales", profileByUserId.get(r.sold_by), SOURCE_LABEL.franchise_internal_sales, detail, r.commission_amount);
        }
        if (r.sold_by && Number(r.leader_amount) > 0) {
          const seller = profileByUserId.get(r.sold_by);
          const leaderUserId = seller ? leaderByMember.get(seller.id) : undefined;
          const leader = leaderUserId ? profileByUserId.get(leaderUserId) : undefined;
          pushItem("franchise_orders", r.id, "leader", leader, SOURCE_LABEL.franchise_internal_leader, detail, r.leader_amount);
        }
      });

      (fExternal ?? []).forEach((r: any) => {
        const detail = `${r.project_name ?? ""}・${r.customer_name ?? ""}`.trim();
        if (r.sales_member_id && Number(r.sales_bonus) > 0) {
          pushItem("franchise_external_orders", r.id, "sales", profileById.get(r.sales_member_id), SOURCE_LABEL.franchise_external_sales, detail, r.sales_bonus);
        }
        if (r.co_sales_member_id && Number(r.co_sales_bonus) > 0) {
          pushItem("franchise_external_orders", r.id, "co1", profileById.get(r.co_sales_member_id), SOURCE_LABEL.franchise_external_co1, detail, r.co_sales_bonus);
        }
        if (r.co_sales_member_id2 && Number(r.co_sales_bonus2) > 0) {
          pushItem("franchise_external_orders", r.id, "co2", profileById.get(r.co_sales_member_id2), SOURCE_LABEL.franchise_external_co2, detail, r.co_sales_bonus2);
        }
      });

      (starlinks ?? []).forEach((r: any) => {
        const detail = `${r.client_name ?? ""}・${r.plan_name ?? ""}`.trim();
        if (r.sold_by && Number(r.commission_amount) > 0) {
          pushItem("starlink_orders", r.id, "sales", profileByUserId.get(r.sold_by), SOURCE_LABEL.starlink, detail, r.commission_amount);
        }
      });

      // 3. 撈取已標記紀錄
      const sourceIds = Array.from(new Set(items.map((i) => i.source_id)));
      if (sourceIds.length > 0) {
        const { data: marks } = await supabase
          .from("commission_payout_marks")
          .select("source_table, source_id, role_key, payout_status, payout_date")
          .in("source_id", sourceIds);
        const markMap = new Map<string, { paid: boolean; date: string | null }>();
        (marks ?? []).forEach((m: any) => {
          markMap.set(`${m.source_table}:${m.source_id}:${m.role_key}`, {
            paid: m.payout_status === "paid",
            date: m.payout_date,
          });
        });
        items.forEach((it) => {
          const m = markMap.get(it.key);
          if (m) {
            it.paid = m.paid;
            it.payout_date = m.date;
          }
        });
      }

      // 4. 依人分組
      const groupMap = new Map<string, MemberGroup>();
      items.forEach((it) => {
        const key = it.member_id ?? "__unassigned__";
        const name = it.member_id
          ? (profileById.get(it.member_id)?.display_name ?? "未命名成員")
          : "（未對應到成員）";
        if (!groupMap.has(key)) {
          groupMap.set(key, { member_id: key, display_name: name, items: [], total: 0 });
        }
        const g = groupMap.get(key)!;
        g.items.push(it);
        g.total += it.amount;
      });

      const list = Array.from(groupMap.values()).sort((a, b) => b.total - a.total);
      setGroups(list);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const markItem = async (item: SourceItem) => {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("commission_payout_marks")
      .upsert(
        {
          source_table: item.source_table,
          source_id: item.source_id,
          role_key: item.role_key,
          member_id: item.member_id,
          payout_status: "paid",
          payout_date: todayStr(),
          marked_by: auth.user?.id ?? null,
        },
        { onConflict: "source_table,source_id,role_key" },
      );
    if (error) return toast.error(error.message);
    toast.success("已標記為發放");
    fetchData();
  };

  const bulkMarkAll = async () => {
    const unpaid = groups.flatMap((g) => g.items).filter((i) => !i.paid);
    if (unpaid.length === 0) return toast.info("沒有待標記的記錄");
    if (!confirm(`確定要將 ${unpaid.length} 筆待發放記錄全部標記為已發放？`)) return;
    setBulkMarking(true);
    const { data: auth } = await supabase.auth.getUser();
    const payload = unpaid.map((i) => ({
      source_table: i.source_table,
      source_id: i.source_id,
      role_key: i.role_key,
      member_id: i.member_id,
      payout_status: "paid",
      payout_date: todayStr(),
      marked_by: auth.user?.id ?? null,
    }));
    const { error } = await supabase
      .from("commission_payout_marks")
      .upsert(payload, { onConflict: "source_table,source_id,role_key" });
    setBulkMarking(false);
    if (error) return toast.error(error.message);
    toast.success(`已標記 ${unpaid.length} 筆`);
    fetchData();
  };

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i + 1);
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  const totalAll = groups.reduce((s, g) => s + g.total, 0);
  const totalUnpaid = groups.reduce(
    (s, g) => s + g.items.filter((i) => !i.paid).reduce((a, i) => a + i.amount, 0),
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>發放管理</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          每月 10 號發放上個月份的所有獎金。選擇下方「發放年月」，將載入該月對應的上個月份結算資料。
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <Label className="text-xs">發放年份</Label>
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
            <Label className="text-xs">發放月份</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={String(m)}>{m} 月</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground self-center ml-2">
            資料區間：{range.start} ~ {range.end}
          </div>
          {!readOnly && (
            <Button size="sm" onClick={bulkMarkAll} disabled={bulkMarking || loading}>
              {bulkMarking ? "處理中…" : "一鍵標記全部已發放"}
            </Button>
          )}
        </div>

        {!loading && groups.length > 0 && (
          <div className="flex gap-6 text-sm bg-muted/30 rounded p-3">
            <div>總人數：<span className="font-medium">{groups.length}</span></div>
            <div>總金額：<span className="font-medium">{formatMoney(totalAll)}</span></div>
            <div>未發放：<span className="font-medium text-amber-700">{formatMoney(totalUnpaid)}</span></div>
          </div>
        )}

        {loading ? null : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">本期間無發放記錄</p>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => {
              const allPaid = g.items.every((i) => i.paid);
              return (
                <div key={g.member_id} className="border rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-muted/40">
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{g.display_name}</span>
                      <span className="text-xs text-muted-foreground">{g.items.length} 筆</span>
                      {allPaid ? (
                        <Badge variant="outline">全部已發放</Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200">部分待發放</Badge>
                      )}
                    </div>
                    <div className="text-sm font-medium">合計 {formatMoney(g.total)}</div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">來源類型</TableHead>
                        <TableHead>明細</TableHead>
                        <TableHead className="text-right w-[120px]">金額</TableHead>
                        <TableHead className="w-[120px]">狀態</TableHead>
                        <TableHead className="w-[140px] text-right"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.items.map((it) => (
                        <TableRow key={it.key}>
                          <TableCell className="text-xs">{it.source_label}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{it.detail || "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(it.amount)}</TableCell>
                          <TableCell>
                            {it.paid ? (
                              <Badge variant="outline" className="text-xs">已發放 {it.payout_date ?? ""}</Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">待發放</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {!it.paid && !readOnly && it.member_id && (
                              <Button size="sm" variant="outline" onClick={() => markItem(it)}>
                                標記已發放
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
