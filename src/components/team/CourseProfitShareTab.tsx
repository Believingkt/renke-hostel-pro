import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DateField } from "@/components/admin/DateFields";
import { toast } from "@/hooks/use-toast";
import { checkRateChange } from "@/lib/courseProfitRateValidation";
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
import { ChevronsUpDown, Info, Loader2, Lock, Plus, Trash2 } from "lucide-react";


/**
 * 課程分潤設定（總部限定）。
 *
 * 兩個輸入源，其餘全自動：
 * 1. 每月課程結算盈餘（貝瑞手動 key in，未發放前可反覆修改）
 * 2. 參與夥伴的分潤 % 版本（append-only，與成員底薪同一套版本制）
 *
 * 金額由資料庫 trigger 自動計算寫入 course_profit_payouts，
 * TeamHome 卡片與發放管理 Tab 直接讀該表，不需要任何「產生結算」動作。
 * 課程分潤明確不列入獎金加倍活動。
 */

interface MonthRow {
  id: string;
  month: string;
  payout_month: string;
  surplus_amount: number;
  note: string | null;
  remittance_date: string | null;
  updated_at: string;
  updated_by_email: string | null;
  created_by_email: string | null;
}

interface RateVersion {
  id: string;
  user_id: string;
  percent: number;
  effective_from: string;
  note: string | null;
  created_at: string;
  created_by_email: string | null;
}

interface PayoutRow {
  id: string;
  month: string;
  payout_month: string;
  user_id: string;
  amount: number;
  percent_snapshot: number;
}

interface MemberRow {
  user_id: string;
  display_name: string;
  role: string;
}

const ROLE_ORDER = [
  "super_admin",
  "admin",
  "am",
  "am_manager",
  "scout_manager",
  "franchise_manager",
  "scout",
  "closer",
  "closer_manager",
  "franchise_internal",
  "franchise_external",
  "starlink",
  "owner",
  "finance",
  "venue_manager",
] as const;

const NORRIS_USER_ID = "1bc5761a-49a3-40ee-aa45-96ab87070c2e";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "超級管理員",
  admin: "管理員",
  am: "AM",
  am_manager: "AM總管",
  scout_manager: "星探主管",
  scout: "星探",
  closer_manager: "成交組主管",
  closer: "成交組",
  franchise_manager: "特許加盟主管",
  franchise_internal: "特許加盟內部",
  franchise_external: "特許加盟外部",
  starlink: "星鏈",
  venue_manager: "業主",
  owner: "屋主",
  finance: "財務",
  unknown: "未分類",
};

function todayTaipei() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function firstOfThisMonthTaipei() {
  return `${todayTaipei().slice(0, 7)}-01`;
}

/** 台北時區的本月 YYYY-MM */
function currentYm() {
  return todayTaipei().slice(0, 7);
}

/** 台北時區的上個月 YYYY-MM */
function prevYm() {
  const [y, m] = currentYm().split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** 台北時區的下個月 YYYY-MM */
function nextYm() {
  const [y, m] = currentYm().split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

/**
 * 預設發放期別：目前尚未發放的當期 10 號。
 * 台北時間 10 日（含）之前 → 本月 10 號期；11 日起 → 次月 10 號期。
 */
function defaultPayoutYm() {
  const day = Number(todayTaipei().slice(8, 10));
  return day <= 10 ? currentYm() : nextYm();
}



function fmtTime(iso: string) {
  const d = new Date(new Date(iso).getTime() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 16).replace("T", " ");
}

function primaryRole(roles: string[]) {
  for (const r of ROLE_ORDER) if (roles.includes(r)) return r as string;
  return "unknown";
}

export default function CourseProfitShareTab({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [rates, setRates] = useState<RateVersion[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [paidPayoutIds, setPaidPayoutIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [monthDraft, setMonthDraft] = useState<Record<string, { surplus: string; note: string; payout: string; remittance: string | null }>>({});
  const [newMonth, setNewMonth] = useState({
    month: prevYm(),
    payout: defaultPayoutYm(),
    surplus: "",
    note: "",
    remittance: null as string | null,
  });
  const [rateDraft, setRateDraft] = useState<Record<string, { percent: string; effective_from: string; note: string }>>({});
  /** 使用者在下拉複選中額外勾選、但尚未建立任何 % 版本的成員 */
  const [pendingSelected, setPendingSelected] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const currentMonthYm = currentYm();
  const prevMonthYm = prevYm();

  const load = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roleRows }, { data: monthRows }, { data: rateRows }, { data: payoutRows }] =
      await Promise.all([
        supabase.from("team_member_profiles").select("user_id, display_name, is_active, resigned_at"),
        supabase.from("user_roles").select("user_id, role").is("accommodation_id", null),
        supabase
          .from("course_profit_months")
          .select("id, month, payout_month, surplus_amount, note, remittance_date, updated_at, updated_by_email, created_by_email")
          .order("payout_month", { ascending: false })
          .order("month", { ascending: false }),
        supabase
          .from("course_profit_share_rates")
          .select("id, user_id, percent, effective_from, note, created_at, created_by_email")
          .order("effective_from", { ascending: false }),
        supabase
          .from("course_profit_payouts")
          .select("id, month, payout_month, user_id, amount, percent_snapshot"),
      ]);

    const rolesByUser = new Map<string, string[]>();
    ((roleRows ?? []) as any[]).forEach((r) => {
      const role = String(r.role);
      if (!(ROLE_ORDER as readonly string[]).includes(role)) return;
      if (r.user_id === NORRIS_USER_ID && role === "super_admin") return;
      const list = rolesByUser.get(r.user_id) ?? [];
      list.push(role);
      rolesByUser.set(r.user_id, list);
    });

    const list = ((profiles ?? []) as any[])
      .filter((p) => p?.user_id && p.is_active !== false && !p.resigned_at)
      .map((p) => {
        const roles = rolesByUser.get(p.user_id) ?? [];
        return {
          user_id: p.user_id as string,
          display_name: (p.display_name as string) || "未命名",
          role: primaryRole(roles),
        };
      })
      .sort((a, b) => {
        const ai = ROLE_ORDER.indexOf(a.role as any);
        const bi = ROLE_ORDER.indexOf(b.role as any);
        const ao = ai < 0 ? 999 : ai;
        const bo = bi < 0 ? 999 : bi;
        if (ao !== bo) return ao - bo;
        return a.display_name.localeCompare(b.display_name, "zh-Hant");
      });

    const pays = (payoutRows ?? []) as unknown as PayoutRow[];
    setMembers(list);
    setMonths((monthRows ?? []) as unknown as MonthRow[]);
    setRates((rateRows ?? []) as unknown as RateVersion[]);
    setPayouts(pays);

    // 已標記發放的列（發放管理 Tab 寫入），該月盈餘即鎖定
    if (pays.length > 0) {
      const { data: marks } = await supabase
        .from("commission_payout_marks")
        .select("source_id, payout_status")
        .eq("source_table", "course_profit_payouts")
        .in("source_id", pays.map((p) => p.id));
      setPaidPayoutIds(
        new Set(((marks ?? []) as any[]).filter((m) => m.payout_status === "paid").map((m) => String(m.source_id))),
      );
    } else {
      setPaidPayoutIds(new Set());
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const today = todayTaipei();

  const ratesByUser = useMemo(() => {
    const m = new Map<string, RateVersion[]>();
    rates.forEach((r) => {
      const list = m.get(r.user_id) ?? [];
      list.push(r);
      m.set(r.user_id, list);
    });
    return m;
  }, [rates]);

  /** 參與名單：已有任何 % 版本者 ＋ 本次勾選但尚未建立版本者 */
  const selectedUserIds = useMemo(() => {
    const s = new Set<string>(pendingSelected);
    rates.forEach((r) => s.add(r.user_id));
    return s;
  }, [rates, pendingSelected]);

  const selectedMembers = useMemo(
    () => members.filter((m) => selectedUserIds.has(m.user_id)),
    [members, selectedUserIds],
  );

  /**
   * 分潤 % 的採用基準＝「發放期別當月 1 日」（不是盈餘資料月），
   * 這樣延遲對帳時仍會用發放當下的參與名單與比例。
   */
  const rateAsOf = `${defaultPayoutYm()}-01`;

  const currentPercent = (userId: string) => {
    const list = ratesByUser.get(userId) ?? [];
    const eff = list.find((v) => v.effective_from <= rateAsOf);
    return eff ? Number(eff.percent) : null;
  };

  /** 該發放期別是否已標記發放（同期別的所有盈餘列一起鎖定） */
  const periodLocked = (payoutMonth: string) =>
    payouts.some((p) => p.payout_month === payoutMonth && paidPayoutIds.has(p.id));

  const payoutsByMonth = useMemo(() => {
    const m = new Map<string, PayoutRow[]>();
    payouts.forEach((p) => {
      const list = m.get(p.month) ?? [];
      list.push(p);
      m.set(p.month, list);
    });
    return m;
  }, [payouts]);

  /** 依發放期別分組的盈餘列（同期別可掛多個資料月，卡片合計、明細分列） */
  const monthsByPeriod = useMemo(() => {
    const m = new Map<string, MonthRow[]>();
    months.forEach((r) => {
      const list = m.get(r.payout_month) ?? [];
      list.push(r);
      m.set(r.payout_month, list);
    });
    return m;
  }, [months]);

  const totalCurrentPercent = selectedMembers.reduce((s, m) => s + (currentPercent(m.user_id) ?? 0), 0);
  const latestMonth = months[0];

  /* ---------------- 課程盈餘 ---------------- */

  const addMonth = async () => {
    if (!newMonth.month || !newMonth.payout || newMonth.surplus === "") {
      toast({ title: "請輸入盈餘月份、發放期別與金額", variant: "destructive" });
      return;
    }
    setSavingId("__new__");
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("course_profit_months").insert({
      month: `${newMonth.month}-01`,
      payout_month: `${newMonth.payout}-01`,
      surplus_amount: Number(newMonth.surplus || 0),
      note: newMonth.note || null,
      remittance_date: newMonth.remittance || null,
      created_by: userData?.user?.id ?? null,
      created_by_email: userData?.user?.email ?? null,
      updated_by: userData?.user?.id ?? null,
      updated_by_email: userData?.user?.email ?? null,
    } as any);
    setSavingId(null);
    if (error) {
      toast({
        title: "新增失敗",
        description: error.message.includes("duplicate") ? "該月份已存在，請直接於下方修改" : error.message,
        variant: "destructive",
      });
      return;
    }
    setNewMonth({ month: prevYm(), payout: defaultPayoutYm(), surplus: "", note: "", remittance: null });
    toast({ title: "已新增該月課程盈餘，獎金已自動計算" });
    load();
  };

  const saveMonth = async (row: MonthRow) => {
    const d = monthDraft[row.id];
    if (!d) return;
    setSavingId(row.id);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("course_profit_months")
      .update({
        surplus_amount: Number(d.surplus || 0),
        note: d.note || null,
        payout_month: `${d.payout}-01`,
        remittance_date: d.remittance || null,
        updated_by: userData?.user?.id ?? null,
        updated_by_email: userData?.user?.email ?? null,
      } as any)
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
      return;
    }
    setMonthDraft((p) => {
      const next = { ...p };
      delete next[row.id];
      return next;
    });
    toast({ title: "已更新，獎金金額同步重算" });
    load();
  };

  const removeMonth = async (row: MonthRow) => {
    const { error } = await supabase.from("course_profit_months").delete().eq("id", row.id);
    if (error) {
      toast({ title: "刪除失敗", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "已刪除該月課程盈餘" });
    load();
  };

  /* ---------------- 分潤 % 版本 ---------------- */

  /** 通過防呆檢查、等待二次確認的分潤版本 */
  const [pendingRate, setPendingRate] = useState<{
    userId: string;
    memberName: string;
    percent: number;
    previousPercent: number | null;
    effective_from: string;
    note: string;
  } | null>(null);

  const requestAddRate = (userId: string) => {
    const d = rateDraft[userId];
    const effective_from = d?.effective_from || firstOfThisMonthTaipei();
    const result = checkRateChange({
      percentRaw: d?.percent ?? "",
      effectiveFrom: effective_from,
      versions: ratesByUser.get(userId) ?? [],
      periodLocked: periodLocked(`${effective_from.slice(0, 7)}-01`),
    });
    if (!result.ok) {
      toast({ title: result.title ?? "無法新增版本", description: result.description, variant: "destructive" });
      return;
    }
    setPendingRate({
      userId,
      memberName: members.find((m) => m.user_id === userId)?.display_name ?? "該成員",
      percent: result.percent!,
      previousPercent: result.previousPercent ?? null,
      effective_from,
      note: d?.note ?? "",
    });
  };

  const confirmAddRate = async () => {
    if (!pendingRate) return;
    const { userId, percent, effective_from, note } = pendingRate;
    setSavingId(userId);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("course_profit_share_rates").insert({
      user_id: userId,
      percent,
      effective_from,
      note: note || null,
      created_by: userData?.user?.id ?? null,
      created_by_email: userData?.user?.email ?? null,
    });
    setSavingId(null);
    setPendingRate(null);
    if (error) {
      toast({
        title: "新增失敗",
        description: error.message.includes("duplicate") ? "同一位成員的同一個生效日已存在版本" : error.message,
        variant: "destructive",
      });
      return;
    }
    setRateDraft((p) => ({ ...p, [userId]: { percent: "", effective_from: firstOfThisMonthTaipei(), note: "" } }));
    toast({ title: "已新增分潤版本，獎金已自動重算" });
    load();
  };


  const removeRate = async (v: RateVersion) => {
    const { error } = await supabase.from("course_profit_share_rates").delete().eq("id", v.id);
    if (error) {
      toast({ title: "刪除失敗", description: "只有尚未生效的版本可以刪除", variant: "destructive" });
      return;
    }
    toast({ title: "已刪除未生效版本" });
    load();
  };

  const toggleMember = async (userId: string, checked: boolean) => {
    if (checked) {
      setPendingSelected((p) => new Set(p).add(userId));
      return;
    }
    const hasVersions = (ratesByUser.get(userId) ?? []).length > 0;
    if (!hasVersions) {
      setPendingSelected((p) => {
        const n = new Set(p);
        n.delete(userId);
        return n;
      });
      return;
    }
    // 已有版本者：以「0%」新版本表示停止參與，保留歷史
    const cur = currentPercent(userId);
    if (cur === 0 || cur === null) {
      toast({ title: "該成員目前已非參與中" });
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("course_profit_share_rates").insert({
      user_id: userId,
      percent: 0,
      effective_from: firstOfThisMonthTaipei(),
      note: "取消參與",
      created_by: userData?.user?.id ?? null,
      created_by_email: userData?.user?.email ?? null,
    });
    if (error) {
      toast({ title: "取消參與失敗", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "已新增 0% 版本（取消參與）" });
    load();
  };

  const memberGroups = useMemo(() => {
    const out: { role: string; members: MemberRow[] }[] = [];
    members.forEach((m) => {
      const last = out[out.length - 1];
      if (last && last.role === m.role) last.members.push(m);
      else out.push({ role: m.role, members: [m] });
    });
    return out;
  }, [members]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">讀取中…</p>;
  }

  return (
    <div className="space-y-4">
      {/* A. 課程盈餘（月份總覽） */}
      <Card>
        <CardHeader>
          <CardTitle>課程分潤獎金（每月手動輸入）</CardTitle>
          <CardDescription>
            每一筆盈餘都指定「發放期別（10 號）」，與盈餘所屬月份脫鉤：對帳延遲時，直接把較早月份的盈餘掛到目前未發放的當期即可。
            同一個發放期別可以掛多個月份，TeamHome 卡片顯示合計、明細分列。
            未標記發放前，金額、備註與期別都可修改或刪除；期別一旦標記發放即整期鎖定。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!readOnly && (
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-2 rounded-lg border bg-muted/30 p-3">
              <div className="space-y-1 w-full sm:w-auto">
                <div className="text-xs text-muted-foreground">盈餘月份</div>
                <div className="flex flex-wrap items-center gap-1">
                  <Input
                    type="month"
                    value={newMonth.month}
                    onChange={(e) => setNewMonth((p) => ({ ...p, month: e.target.value }))}
                    className="h-9 w-full sm:w-40 min-w-0"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    variant={newMonth.month === prevMonthYm ? "default" : "outline"}
                    onClick={() => setNewMonth((p) => ({ ...p, month: prevMonthYm }))}
                  >
                    上個月
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    variant={newMonth.month === currentMonthYm ? "default" : "outline"}
                    onClick={() => setNewMonth((p) => ({ ...p, month: currentMonthYm }))}
                  >
                    本月
                  </Button>
                </div>
              </div>
              <div className="space-y-1 w-full sm:w-auto">
                <div className="text-xs text-muted-foreground">發放期別（10 號）</div>
                <div className="flex flex-wrap items-center gap-1">
                  <Input
                    type="month"
                    value={newMonth.payout}
                    onChange={(e) => setNewMonth((p) => ({ ...p, payout: e.target.value }))}
                    className="h-9 w-full sm:w-40 min-w-0"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1 sm:flex-none"
                    variant={newMonth.payout === defaultPayoutYm() ? "default" : "outline"}
                    onClick={() => setNewMonth((p) => ({ ...p, payout: defaultPayoutYm() }))}
                  >
                    當期
                  </Button>
                </div>
              </div>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="課程盈餘"
                value={newMonth.surplus}
                onChange={(e) => setNewMonth((p) => ({ ...p, surplus: e.target.value }))}
                className="h-9 w-full sm:w-36 tabular-nums"
              />
              <Input
                placeholder="備註（選填）"
                value={newMonth.note}
                onChange={(e) => setNewMonth((p) => ({ ...p, note: e.target.value }))}
                className="h-9 w-full sm:min-w-[8rem] sm:flex-1"
              />
              <div className="space-y-1 w-full sm:w-auto">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  匯款日期
                  <RemittanceTooltip />
                </div>
                <DateField
                  value={newMonth.remittance}
                  onChange={(v) => setNewMonth((p) => ({ ...p, remittance: v }))}
                  placeholder="選擇匯款日期"
                  className="h-9 w-full sm:w-44"
                />
              </div>


              <Button size="sm" onClick={addMonth} disabled={savingId === "__new__"} className="w-full sm:w-auto">
                {savingId === "__new__" ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-1 h-4 w-4" />
                )}
                新增
              </Button>
            </div>
          )}

          {months.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚未輸入任何月份的課程盈餘。</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40 whitespace-nowrap">發放期別</TableHead>
                    <TableHead className="w-28 whitespace-nowrap">盈餘月份</TableHead>
                    <TableHead className="w-40 whitespace-nowrap">課程盈餘</TableHead>
                    <TableHead className="w-44 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        匯款日期
                        <RemittanceTooltip />
                      </span>
                    </TableHead>
                    <TableHead className="w-56 whitespace-nowrap">備註</TableHead>
                    <TableHead className="w-40 whitespace-nowrap">分潤合計</TableHead>
                    <TableHead className="w-56 whitespace-nowrap">狀態 / 最後修改</TableHead>
                    <TableHead className="w-32 whitespace-nowrap">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {months.map((row) => {
                    const locked = periodLocked(row.payout_month);
                    const d = monthDraft[row.id];
                    const rows = payoutsByMonth.get(row.month) ?? [];
                    const distributed = rows.reduce((s, p) => s + Number(p.amount), 0);
                    const dirty = !!d;
                    const siblings = monthsByPeriod.get(row.payout_month) ?? [];
                    const draftOf = (over: Partial<{ surplus: string; note: string; payout: string; remittance: string | null }>) => ({
                      surplus: d?.surplus ?? String(Number(row.surplus_amount)),
                      note: d?.note ?? (row.note ?? ""),
                      payout: d?.payout ?? row.payout_month.slice(0, 7),
                      remittance: d ? d.remittance : (row.remittance_date ?? null),
                      ...over,
                    });
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {locked || readOnly ? (
                            `${row.payout_month.slice(0, 7)}-10`
                          ) : (
                            <Input
                              type="month"
                              value={d ? d.payout : row.payout_month.slice(0, 7)}
                              onChange={(e) =>
                                setMonthDraft((p) => ({ ...p, [row.id]: draftOf({ payout: e.target.value }) }))
                              }
                              className="h-9 w-36"
                            />
                          )}
                          {siblings.length > 1 && (
                            <div className="text-xs text-muted-foreground">同期 {siblings.length} 筆合計</div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{row.month.slice(0, 7)}</TableCell>
                        <TableCell className="tabular-nums">
                          {locked || readOnly ? (
                            `$${Number(row.surplus_amount).toLocaleString()}`
                          ) : (
                            <Input
                              type="number"
                              inputMode="numeric"
                              value={d ? d.surplus : String(Number(row.surplus_amount))}
                              onChange={(e) =>
                                setMonthDraft((p) => ({ ...p, [row.id]: draftOf({ surplus: e.target.value }) }))
                              }
                              className="h-9 w-32 tabular-nums"
                            />
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {locked || readOnly ? (
                            <span className="text-sm">{row.remittance_date ?? "—"}</span>
                          ) : (
                            <DateField
                              value={d ? d.remittance : (row.remittance_date ?? null)}
                              onChange={(v) =>
                                setMonthDraft((p) => ({ ...p, [row.id]: draftOf({ remittance: v }) }))
                              }
                              placeholder="選擇日期"
                              className="h-9 w-40"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          {locked || readOnly ? (
                            <span className="text-sm text-muted-foreground">{row.note || "—"}</span>
                          ) : (
                            <Input
                              value={d ? d.note : (row.note ?? "")}
                              onChange={(e) =>
                                setMonthDraft((p) => ({ ...p, [row.id]: draftOf({ note: e.target.value }) }))
                              }
                              className="h-9"
                            />
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          ${distributed.toLocaleString()}
                          <span className="ml-1 text-xs text-muted-foreground">（{rows.length} 人）</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {locked ? (
                            <span className="inline-flex items-center gap-1 text-foreground">
                              <Lock className="h-3.5 w-3.5" />
                              已發放（鎖定）
                            </span>
                          ) : (
                            "未發放"
                          )}
                          <div>
                            {row.updated_by_email ?? row.created_by_email ?? "未知"} · {fmtTime(row.updated_at)}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {!locked && !readOnly && (
                            <div className="flex items-center gap-1">
                              <Button size="sm" disabled={!dirty || savingId === row.id} onClick={() => saveMonth(row)}>
                                {savingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "儲存"}
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 px-1" onClick={() => removeMonth(row)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* B. 參與夥伴與分潤 %（版本制） */}
      <Card>
        <CardHeader>
          <CardTitle>參與夥伴與分潤 %（版本制）</CardTitle>
          <CardDescription>
            先用下拉複選勾選參與的成員，畫面只顯示已勾選者。每次調整分潤 % 就新增一筆生效日版本，
            系統自動沿用到下一次調整；歷史版本不可修改，未生效版本可刪除。
            課程分潤不列入獎金加倍活動，倍率恆為 1。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {!readOnly && (
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="justify-between">
                    選擇參與成員（{selectedMembers.length}）
                    <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="max-h-80 w-72 overflow-y-auto p-2">
                  {memberGroups.map((g) => (
                    <div key={g.role} className="mb-2">
                      <div className="px-1 py-1 text-xs font-semibold text-muted-foreground">
                        {ROLE_LABEL[g.role] ?? g.role}
                      </div>
                      {g.members.map((m) => (
                        <label
                          key={m.user_id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted"
                        >
                          <Checkbox
                            checked={selectedUserIds.has(m.user_id)}
                            onCheckedChange={(c) => toggleMember(m.user_id, c === true)}
                          />
                          {m.display_name}
                        </label>
                      ))}
                    </div>
                  ))}
                </PopoverContent>
              </Popover>
            )}
            <span className="text-sm text-muted-foreground tabular-nums">
              目前生效分潤合計 {totalCurrentPercent}%
            </span>
            {totalCurrentPercent > 100 && (
              <span className="text-sm font-medium text-destructive">合計超過 100%，請確認設定</span>
            )}
          </div>

          {selectedMembers.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚未選擇任何參與成員。</p>
          ) : (
            <div className="space-y-3">
              {selectedMembers.map((m) => {
                const list = ratesByUser.get(m.user_id) ?? [];
                const cur = currentPercent(m.user_id);
                const d = rateDraft[m.user_id] ?? {
                  percent: "",
                  effective_from: firstOfThisMonthTaipei(),
                  note: "",
                };
                const preview =
                  latestMonth && cur
                    ? Math.round((Number(latestMonth.surplus_amount) * cur) / 100)
                    : 0;
                return (
                  <div key={m.user_id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{m.display_name}</span>
                      <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary tabular-nums">
                        目前分潤
                        <span className="text-base">{cur === null ? "未設定" : `${cur}%`}</span>
                      </span>
                      {latestMonth && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {latestMonth.month.slice(0, 7)} 試算 ${preview.toLocaleString()}
                        </span>
                      )}
                    </div>

                    {!readOnly && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Input
                          type="number"
                          inputMode="decimal"
                          placeholder="分潤 %"
                          value={d.percent}
                          onChange={(e) =>
                            setRateDraft((p) => ({ ...p, [m.user_id]: { ...d, percent: e.target.value } }))
                          }
                          className="h-9 w-28 tabular-nums"
                        />
                        <Input
                          type="date"
                          value={d.effective_from}
                          onChange={(e) =>
                            setRateDraft((p) => ({ ...p, [m.user_id]: { ...d, effective_from: e.target.value } }))
                          }
                          className="h-9 w-40"
                        />
                        <Input
                          placeholder="備註（選填）"
                          value={d.note}
                          onChange={(e) =>
                            setRateDraft((p) => ({ ...p, [m.user_id]: { ...d, note: e.target.value } }))
                          }
                          className="h-9 min-w-[8rem] flex-1"
                        />
                        <Button size="sm" onClick={() => requestAddRate(m.user_id)} disabled={savingId === m.user_id}>
                          {savingId === m.user_id ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="mr-1 h-4 w-4" />
                          )}
                          新增版本
                        </Button>
                      </div>
                    )}

                    {list.length > 0 && (
                      <ul className="mt-3 space-y-1.5 text-sm">
                        {list.map((v) => {
                          const future = v.effective_from > today;
                          return (
                            <li
                              key={v.id}
                              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-2.5 py-1.5"
                            >
                              <span className="font-medium tabular-nums">
                                {v.effective_from} 起 {Number(v.percent)}%
                              </span>
                              {future && <span className="text-xs text-primary">（未生效）</span>}
                              <span className="text-muted-foreground">備註：{v.note || "無"}</span>
                              <span className="text-xs text-muted-foreground">
                                （由 {v.created_by_email ?? "未知"} 於 {fmtTime(v.created_at)} 設定）
                              </span>
                              {future && !readOnly && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1"
                                  onClick={() => removeRate(v)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingRate} onOpenChange={(o) => !o && setPendingRate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認新增分潤版本？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <div>
                  成員：<span className="font-medium text-foreground">{pendingRate?.memberName}</span>
                </div>
                <div className="tabular-nums">
                  分潤 %：
                  <span className="font-medium text-foreground">
                    {pendingRate?.previousPercent === null ? "未設定" : `${pendingRate?.previousPercent}%`} →{" "}
                    {pendingRate?.percent}%
                  </span>
                </div>
                <div>
                  生效日：<span className="font-medium text-foreground">{pendingRate?.effective_from}</span>
                  （影響 {pendingRate?.effective_from.slice(0, 7)} 起、尚未發放的期別）
                </div>
                <div>備註：{pendingRate?.note || "無"}</div>
                <div className="pt-1 text-muted-foreground">
                  版本為 append-only，新增後不可修改；僅尚未生效的版本可刪除。獎金金額會立即自動重算。
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmAddRate}>確認新增</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

