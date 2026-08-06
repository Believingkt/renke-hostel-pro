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
import { Plus, Trash2, ChevronDown, ChevronRight, RefreshCw, Bell } from "lucide-react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import FinancialReportTab from "@/components/team/FinancialReportTab";
import RagicSyncTab from "@/components/team/RagicSyncTab";
import BonusSettingsTab from "@/components/team/BonusSettingsTab";

// 統一獎金類型清單（結算規則 + 加倍活動共用）
const BONUS_TYPE_LABEL: Record<string, string> = {
  all: "全部獎金",
  closer: "成交組獎金",
  video: "影音組分潤",
  scout_kol: "KOL訂單星探分潤",
  scout_discount_code: "星探折扣碼獎金",
  scout_rarity: "星探稀有度獎金",
  scout_base: "星探底薪",
  scout_team: "星探團隊獎金",
  franchise_internal: "特許加盟內部",
  franchise_external: "特許加盟外部",
  starlink: "星鏈分潤",
  am_performance: "AM績效獎金",
  am_venue_bonus: "AM場域獎金",
  closer_performance: "成交組績效獎金",
  am_manager: "AM總管獎金",
  closer_manager: "成交組主管管理獎金",
  kol_commission: "網紅營銷專利獎金(抽成)",
  kol_monthly: "網紅營銷專利獎金(月費)",
  venue_closing: "場域成交獎金",
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
  `NT$ ${Math.round(Number(n ?? 0)).toLocaleString()}`;


export default function TeamCommission() {
  const { roles } = useTeam();
  const isAdmin = roles.includes("super_admin") || roles.includes("admin");
  const isFinance = roles.includes("finance");
  const canAccess = isAdmin || isFinance;
  // finance 在其他設定 Tab 仍為唯讀（不能新增/刪除規則、加倍活動）
  const financeReadOnly = isFinance && !isAdmin;
  // 但在「發放管理」開放 finance 標記已發放（單筆 / 個人批次 / 一鍵全部）
  const payoutsReadOnly = false;
  const [tab, setTab] = useState("payouts");

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
      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="payouts">發放管理</TabsTrigger>
            {showAdminTabs && <TabsTrigger value="financial-report">財務報表</TabsTrigger>}
            {showAdminTabs && <TabsTrigger value="payout">結算規則</TabsTrigger>}
            {showAdminTabs && <TabsTrigger value="multiplier">獎金加倍活動</TabsTrigger>}
            {showAdminTabs && <TabsTrigger value="ragic-sync">Ragic匯入</TabsTrigger>}
            {showAdminTabs && <TabsTrigger value="bonus-settings">獎金設定</TabsTrigger>}
          </TabsList>
        </div>
        <TabsContent value="payouts">
          <PayoutsBlock
            readOnly={payoutsReadOnly}
            onOpenRules={showAdminTabs ? () => setTab("payout") : undefined}
          />
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
        {showAdminTabs && (
          <TabsContent value="financial-report">
            <FinancialReportTab />
          </TabsContent>
        )}
        {showAdminTabs && (
          <TabsContent value="ragic-sync">
            <RagicSyncTab />
          </TabsContent>
        )}
        {showAdminTabs && (
          <TabsContent value="bonus-settings">
            <BonusSettingsTab />
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
  void readOnly;
  return (
    <Card>
      <CardHeader>
        <CardTitle>結算規則說明</CardTitle>
      </CardHeader>
      <CardContent className="text-sm leading-7 space-y-4">
        <p className="text-muted-foreground">各獎金類型的結算週期與發放日如下：</p>
        <ul className="space-y-2">
          <li><span className="font-medium">成交組訂房佣金：</span>每月 10 日發放，結算上個月整月訂單。</li>
          <li><span className="font-medium">影音組分潤：</span>每月 10 日發放，結算上個月整月訂單。</li>
          <li>
            <div><span className="font-medium">KOL訂單星探分潤：</span>每月 10 日與 25 日各發放一次。</div>
            <ul className="pl-6 mt-1 space-y-1 text-muted-foreground list-disc">
              <li>10 日期：結算上月 21 日 ～ 當月 5 日的入住訂單</li>
              <li>25 日期：結算當月 6 日 ～ 當月 20 日的入住訂單</li>
            </ul>
          </li>
          <li><span className="font-medium">星探底薪：</span>每月 10 日發放，以上月整月邀約達標為計算基準。</li>
          <li><span className="font-medium">星探團隊獎金：</span>每月 10 日發放，以上月整月全隊達標為計算基準。</li>
          <li><span className="font-medium">星探稀有度獎金：</span>10 日與 25 日各發放一次，計算區間同 KOL訂單星探分潤。</li>
          <li><span className="font-medium">特許加盟內部：</span>每月 10 日發放，結算上個月成交且已確認付款的訂單。</li>
          <li><span className="font-medium">特許加盟外部：</span>每月 10 日發放，結算上個月簽約且合約已完成的訂單。</li>
          <li><span className="font-medium">星鏈分潤：</span>每月 10 日發放，結算上個月成交且已確認付款的訂單。</li>
          <li><span className="font-medium">AM績效獎金：</span>每月 10 日發放，結算上個月非旅行日管理場館營收，僅計入已勾選的訂單來源。</li>
          <li><span className="font-medium">AM場域獎金：</span>每月 10 日發放，結算上個月非旅行日管理場館數固定金額。</li>
          <li><span className="font-medium">成交組績效獎金：</span>每月 10 日發放，結算上個月全公司營收，僅計入已勾選的訂單來源。</li>
          <li><span className="font-medium">AM總管獎金：</span>每月 10 日發放，結算上個月全公司營收，僅計入已勾選的訂單來源。</li>
          <li><span className="font-medium">成交組主管管理獎金：</span>每月 10 日發放，結算上個月全公司營收，僅計入已勾選的訂單來源。</li>
          <li><span className="font-medium">網紅營銷專利獎金(抽成)：</span>每月 10 日發放，結算上個月全公司營收，僅計入該獎金專屬已勾選的訂單來源。</li>
          <li><span className="font-medium">網紅營銷專利獎金(月費)：</span>每月 10 日發放，固定金額。</li>
          <li><span className="font-medium">場域成交獎金：</span>每月 10 日發放，結算上個月簽約場域中已收行銷推廣費者，固定金額。</li>
        </ul>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
          ⚠️ 如需調整結算週期或發放日，請聯繫系統管理員。變更涉及 Edge Function 排程與多處計算邏輯，需整體評估後執行。
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================== Tab 3: Multiplier ============================== */
interface MultiplierRow {
  id: string;
  bonus_type: string;
  multiplier: number;
  start_month: string;
  end_month: string;
  reason: string | null;
}

function currentMonthKeyTaipei(): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of f.formatToParts(new Date())) parts[p.type] = p.value;
  return `${parts.year}-${parts.month}`;
}

function MultiplierBlock({ readOnly = false }: { readOnly?: boolean }) {
  const [rows, setRows] = useState<MultiplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const nowKey = currentMonthKeyTaipei();
  const [nowY, nowM] = nowKey.split("-");
  const [draft, setDraft] = useState({
    bonus_type: "all",
    multiplier: "1.5",
    start_year: nowY,
    start_month: nowM,
    end_year: nowY,
    end_month: nowM,
    reason: "",
  });
  const [saving, setSaving] = useState(false);

  const yearOptions = useMemo(() => {
    const y = Number(nowY);
    return Array.from({ length: 5 }, (_, i) => String(y - 1 + i));
  }, [nowY]);
  const monthOptions = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bonus_multiplier_settings")
      .select("id, bonus_type, multiplier, start_month, end_month, reason")
      .order("start_month", { ascending: false });
    if (error) toast.error(error.message);
    else setRows((data as unknown as MultiplierRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const save = async () => {
    if (Number(draft.multiplier) < 1) return toast.error("倍率最小 1.0");
    const startMonth = `${draft.start_year}-${draft.start_month}`;
    const endMonth = `${draft.end_year}-${draft.end_month}`;
    if (startMonth > endMonth) return toast.error("結束發放月不能早於生效發放月");

    setSaving(true);
    // 防呆：與同 bonus_type 的現有設定月份範圍重疊即擋下
    const { data: existing, error: exErr } = await supabase
      .from("bonus_multiplier_settings")
      .select("bonus_type, start_month, end_month")
      .eq("bonus_type", draft.bonus_type);
    if (exErr) {
      setSaving(false);
      return toast.error(exErr.message);
    }
    const overlap = (existing ?? []).find(
      (r: any) => r.start_month <= endMonth && r.end_month >= startMonth,
    );
    if (overlap) {
      setSaving(false);
      return toast.error(
        `與現有設定重疊（${BONUS_TYPE_LABEL[(overlap as any).bonus_type] ?? (overlap as any).bonus_type} ${(overlap as any).start_month}～${(overlap as any).end_month} 已存在），請調整月份範圍`,
      );
    }

    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("bonus_multiplier_settings").insert({
      bonus_type: draft.bonus_type,
      multiplier: Number(draft.multiplier),
      start_month: startMonth,
      end_month: endMonth,
      reason: draft.reason || null,
      created_by: auth.user?.id ?? null,
    } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("已新增活動");
    setOpen(false);
    fetchRows();
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleting(true);
    const { error } = await supabase.from("bonus_multiplier_settings").delete().eq("id", deletingId);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success("已刪除");
    setDeletingId(null);
    fetchRows();
  };

  const statusOf = (r: MultiplierRow): { label: string; className: string } => {
    if (r.start_month > nowKey) return { label: "未開始", className: "" };
    if (r.end_month < nowKey) return { label: "已結束", className: "" };
    return { label: "進行中", className: "bg-green-100 text-green-700 border-green-200" };
  };

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
                start_year: nowY,
                start_month: nowM,
                end_year: nowY,
                end_month: nowM,
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
        <div className="text-sm text-muted-foreground mb-3 space-y-1">
          <p>獎金加倍活動以「發放月份」為單位設定，設定生效後，該發放月的對應獎金發放金額將乘以指定倍率。</p>
          <p className="font-medium mt-2">設定欄位說明：</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>獎金類型：選擇要加倍的獎金種類</li>
            <li>倍率：例如 2 = 雙倍、1.5 = 1.5 倍</li>
            <li>生效發放月：從哪個月的發放開始套用</li>
            <li>結束發放月：到哪個月的發放結束（含該月）</li>
          </ul>
          <p className="font-medium mt-2">舉例：</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>稀有度獎金從 8 月到 12 月雙倍：設定「稀有度獎金 / 倍率 2 / 生效 2026-08 / 結束 2026-12」→ 這段期間每次發放的稀有度獎金都會 × 2</li>
            <li>9 月成交組三倍，10 月恢復正常：設定「成交組 / 倍率 3 / 生效 2026-09 / 結束 2026-09」→ 只有 9 月發放的成交組獎金 × 3，10 月自動恢復</li>
          </ul>
          <p className="font-medium mt-2">注意事項：</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>無加倍設定的月份自動視為倍率 1（不加倍）</li>
            <li>加倍計算套用於發放金額，原始業績統計數字不受影響</li>
          </ul>
        </div>
        {loading ? null : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>類型</TableHead>
                <TableHead>倍率</TableHead>
                <TableHead>發放月份範圍</TableHead>
                <TableHead>說明</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="w-16 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const s = statusOf(r);
                return (
                  <TableRow key={r.id}>
                    <TableCell>{BONUS_TYPE_LABEL[r.bonus_type] ?? r.bonus_type}</TableCell>
                    <TableCell>{Number(r.multiplier).toFixed(2)}x</TableCell>
                    <TableCell>{r.start_month} ~ {r.end_month}</TableCell>
                    <TableCell>{r.reason ?? "-"}</TableCell>
                    <TableCell>
                      {s.className ? (
                        <Badge className={s.className}>{s.label}</Badge>
                      ) : (
                        <Badge variant="outline">{s.label}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!readOnly && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeletingId(r.id)}
                          aria-label="刪除"
                        >
                          <Trash2 className="h-4 w-4" />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>生效發放月</Label>
                <div className="flex gap-2">
                  <Select value={draft.start_year} onValueChange={(v) => setDraft({ ...draft, start_year: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={draft.start_month} onValueChange={(v) => setDraft({ ...draft, start_month: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((m) => <SelectItem key={m} value={m}>{m} 月</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>結束發放月</Label>
                <div className="flex gap-2">
                  <Select value={draft.end_year} onValueChange={(v) => setDraft({ ...draft, end_year: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={draft.end_month} onValueChange={(v) => setDraft({ ...draft, end_month: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((m) => <SelectItem key={m} value={m}>{m} 月</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
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

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && !deleting && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除</AlertDialogTitle>
            <AlertDialogDescription>確定要刪除此加倍活動設定嗎？此動作無法復原。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "刪除中…" : "刪除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  amount: number;               // 原始金額
  multiplier: number;           // 套用倍率（1 = 不加倍）
  multiplied_amount: number;    // 加倍後金額（顯示與合計用）
  paid: boolean;
  payout_date: string | null;
  venue_name?: string | null;   // 館別名稱（訂單類獎金）
  base_revenue?: number | null; // 該館別計算基準營收（抽成類獎金）
  order_number?: string | null; // 訂單編號
}

// 依 (source_table, role_key) 對應到 bonus_multiplier_settings.bonus_type
function bonusTypeOf(source_table: string, role_key: string): string | null {
  if (source_table === "closer_commission_snapshots") {
    if (role_key === "closer") return "closer";
    if (role_key === "video") return "video";
  }
  if (source_table === "scout_monthly_payouts") {
    if (role_key === "base") return "scout_base";
    if (role_key === "rarity") return "scout_rarity";
    if (role_key === "kol") return "scout_kol";
    if (role_key === "team") return "scout_team";
  }
  if (source_table === "franchise_orders") return "franchise_internal";
  if (source_table === "franchise_external_orders") return "franchise_external";
  if (source_table === "starlink_orders") return "starlink";
  if (source_table === "scout_discount_code_payouts") return "scout_discount_code";
  if (source_table === "closer_team_bonus_distribution") return "closer";
  if (source_table === "teamcommission_bonus_snapshots") return role_key;
  // 補差需跟著原始分潤的倍率，否則加倍期間取消訂單會「發 1.5x、扣回 1x」造成多發
  if (source_table === "closer_commission_adjustments") {
    if (role_key === "closer") return "closer";
    if (role_key === "video") return "video";
  }
  return null;
}

// 分潤補差類型中文對照
function adjustmentTypeLabel(t: string): string {
  if (t === "amount_change") return "金額調整";
  if (t === "cancellation") return "訂單取消扣回";
  if (t === "reactivation") return "取消復原補回";
  return t;
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
  scout_base: "星探底薪",
  scout_rarity: "星探稀有度獎金",
  scout_kol: "KOL訂單星探分潤",
  scout_team: "星探團隊獎金",
  scout_discount_scout: "星探折扣碼獎金（星探）",
  scout_discount_closer: "星探折扣碼獎金（協助成交）",

  closer_team_bonus: "成交組團隊獎金",

  am_performance: "AM績效獎金",
  am_venue_bonus: "AM場域獎金",
  closer_performance: "成交組績效獎金",
  am_manager: "AM總管獎金",
  closer_manager: "成交組主管管理獎金",
  kol_commission: "網紅營銷專利獎金(抽成)",
  kol_monthly: "網紅營銷專利獎金(月費)",
  venue_closing: "場域成交獎金",
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

/** 稀有度獎金／KOL 分潤的實際結算區間（Asia/Taipei）。
 *  X月10日期 = 上月21日 ~ 當月05日；X月25日期 = 當月06日 ~ 當月20日 */
function commissionPeriodRange(year: number, month: number, period: "10" | "25") {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (period === "10") {
    const pm = month === 1 ? 12 : month - 1;
    const py = month === 1 ? year - 1 : year;
    return { start: `${py}-${pad(pm)}-21`, end: `${year}-${pad(month)}-05` };
  }
  return { start: `${year}-${pad(month)}-06`, end: `${year}-${pad(month)}-20` };
}


function PayoutsBlock({ scoutManagerOnly: _scoutManagerOnly = false, readOnly = false, onOpenRules }: { scoutManagerOnly?: boolean; readOnly?: boolean; onOpenRules?: () => void }) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkMarking, setBulkMarking] = useState(false);
  const [markingMember, setMarkingMember] = useState<string | null>(null);
  const [confirmMember, setConfirmMember] = useState<MemberGroup | null>(null);
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [markingSource, setMarkingSource] = useState<string | null>(null);
  const [recalcOpen, setRecalcOpen] = useState(false);
  const [recalcPeriod, setRecalcPeriod] = useState<"10" | "25">("10");
  const [recalcRunning, setRecalcRunning] = useState(false);
  const [teamBonusNotFinalized, setTeamBonusNotFinalized] = useState(false);
  const [venueDetail, setVenueDetail] = useState<{
    member: string;
    sourceLabel: string;
    venue: string;
    items: SourceItem[];
  } | null>(null);



  const toggleMember = useCallback((id: string) => {
    setExpandedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleSource = useCallback((memberId: string, sourceLabel: string) => {
    const key = `${memberId}:${sourceLabel}`;
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const range = useMemo(() => previousMonthRange(year, month), [year, month]);

  // Widen fetch window (±3 months around prev month) so we can pick up early_payout_month rows via JS filter
  const wideRange = useMemo(() => {
    const [py, pm] = [range.prevYear, range.prevMonth];
    const start = new Date(py, pm - 1 - 3, 1);
    const endMonth = new Date(py, pm - 1 + 3 + 1, 0); // last day of prev+3
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { start: fmt(start), end: fmt(endMonth) };
  }, [range]);
  const prevMonthKey = useMemo(
    () => `${range.prevYear}-${String(range.prevMonth).padStart(2, "0")}`,
    [range],
  );

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

      const { prevYear, prevMonth } = range;
      const nextMonthStart = `${prevMonth === 12 ? prevYear + 1 : prevYear}-${String(prevMonth === 12 ? 1 : prevMonth + 1).padStart(2, "0")}-01`;

      const [
        { data: closers },
        { data: fInternal },
        { data: fExternal },
        { data: starlinks },
        { data: teamSettings },
        { data: scoutPayouts },
        { data: discountPayoutRows },
        { data: teamBonusDist },
        { data: teamBonusSnapshots },
        { data: closerAdjustments },
        { data: accommodations },
      ] = await Promise.all([
        supabase
          .from("closer_commission_snapshots")
          .select("id, closer_id, video_creator_id, closer_commission_amount, video_commission_amount, payout_month, order_id, accommodation_id, orders!inner(order_number)")
          .eq("payout_month", payoutMonthKey),
        supabase
          .from("franchise_orders")
          .select("id, sold_by, commission_amount, leader_amount, customer_name, plan_name, sold_at, early_payout_month")
          .gte("sold_at", wideRange.start)
          .lte("sold_at", wideRange.end),
        supabase
          .from("franchise_external_orders")
          .select("id, sales_member_id, co_sales_member_id, co_sales_member_id2, sales_bonus, co_sales_bonus, co_sales_bonus2, customer_name, project_name, signed_at, early_payout_month")
          .gte("signed_at", wideRange.start)
          .lte("signed_at", wideRange.end),
        supabase
          .from("starlink_orders")
          .select("id, sold_by, commission_amount, client_name, plan_name, sold_at")
          .gte("sold_at", start)
          .lte("sold_at", end),
        supabase
          .from("franchise_team_settings")
          .select("member_id, direct_leader_id"),
        supabase
          .from("scout_monthly_payouts")
          .select("id, scout_id, year, month, period, base_salary, team_bonus, kol_commission, bonus_breakdown, payout_status, payout_date")
          .eq("year", year)
          .eq("month", month),
        supabase
          .from("scout_discount_code_payouts")
          .select("id, order_id, discount_code, commission_type, recipient_role, recipient_id, rate, base_amount, commission_amount, year, month, period, orders(order_number, accommodation_id)")
          .eq("year", year)
          .eq("month", month),
        supabase
          .from("closer_team_bonus_distribution")
          .select("id, closer_id, year, month, bonus_amount, is_finalized")
          .eq("is_finalized", true)
          .eq("year", range.prevYear)
          .eq("month", range.prevMonth),
        supabase
          .from("teamcommission_bonus_snapshots")
          .select("id, bonus_type, member_id, amount, snapshot_month, venue_count, settings_snapshot")
          .eq("payout_month", payoutMonthKey),
        supabase
          .from("closer_commission_adjustments")
          .select("id, order_id, closer_id, video_creator_id, adjustment_type, closer_amount, video_amount, reason, adjustment_month, orders(order_number, accommodation_id)")
          .eq("adjustment_month", payoutMonthKey),
        supabase.from("accommodation_info").select("id, name"),
      ]);

      const venueNameById = new Map<string, string>();
      (accommodations ?? []).forEach((a: any) => venueNameById.set(a.id, a.name));
      const venueOf = (id?: string | null) => (id ? venueNameById.get(id) ?? null : null);


      // （星探折扣碼獎金已改為後端試算，見下方 discountPayoutRows）




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
        extra?: {
          venue_name?: string | null;
          order_number?: string | null;
          base_revenue?: number | null;
        },
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
          multiplier: 1,
          multiplied_amount: Number(amount),
          paid: false,
          payout_date: null,
          venue_name: extra?.venue_name ?? null,
          base_revenue: extra?.base_revenue ?? null,
          order_number: extra?.order_number ?? null,
        });
      };

      (closers ?? []).forEach((r: any) => {
        const orderNo = r.orders?.order_number ?? String(r.order_id).slice(0, 8);
        const meta = { venue_name: venueOf(r.accommodation_id), order_number: orderNo };
        if (r.closer_id && Number(r.closer_commission_amount) > 0) {
          pushItem("closer_commission_snapshots", r.id, "closer", profileByUserId.get(r.closer_id), SOURCE_LABEL.closer, `訂單 ${orderNo}`, r.closer_commission_amount, meta);
        }
        if (r.video_creator_id && Number(r.video_commission_amount) > 0) {
          pushItem("closer_commission_snapshots", r.id, "video", profileByUserId.get(r.video_creator_id), SOURCE_LABEL.video, `訂單 ${orderNo}`, r.video_commission_amount, meta);
        }
      });

      // 分潤補差（closer_commission_adjustments）：獨立項目，金額可為負，不套倍率
      (closerAdjustments ?? []).forEach((r: any) => {
        const orderNo = r.orders?.order_number ?? String(r.order_id ?? "").slice(0, 8);
        const venue = venueOf(r.orders?.accommodation_id);
        const detail = `補差(${adjustmentTypeLabel(r.adjustment_type)}) ${venue ? `${venue} ` : ""}訂單 ${orderNo}${r.reason ? ` ${r.reason}` : ""}`;
        const meta = { venue_name: venue, order_number: orderNo };
        // 補差獨立成一個類別，不與成交組／影音組分潤混在一起
        if (r.closer_id && Number(r.closer_amount) !== 0) {
          pushItem("closer_commission_adjustments", r.id, "closer", profileByUserId.get(r.closer_id), `${SOURCE_LABEL.closer}補差`, detail, Number(r.closer_amount), meta);
        }
        if (r.video_creator_id && Number(r.video_amount) !== 0) {
          pushItem("closer_commission_adjustments", r.id, "video", profileByUserId.get(r.video_creator_id), `${SOURCE_LABEL.video}補差`, detail, Number(r.video_amount), meta);
        }
      });


      // 決定該筆特許加盟訂單是否屬於本次「發放月」：
      // - 有 early_payout_month → 該值 === prevMonthKey（期別月，即發放月-1）
      // - 無 → sold_at / signed_at 的 YYYY-MM === prevMonthKey（上月）
      const matchesPayoutMonth = (r: any, dateField: string) => {
        const ep = (r?.early_payout_month ?? null) as string | null;
        if (ep) return ep === prevMonthKey;
        return String(r?.[dateField] ?? "").slice(0, 7) === prevMonthKey;
      };

      (fInternal ?? []).forEach((r: any) => {
        if (!matchesPayoutMonth(r, "sold_at")) return;
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
        if (!matchesPayoutMonth(r, "signed_at")) return;
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

      // 星探折扣碼獎金：由後端 calculate-scout-payout 試算並寫入 scout_discount_code_payouts
      // scout_self → 只有 scout 一筆；partner → scout / closer 各一筆（疊加，不與成交組抽成互斥）
      (discountPayoutRows ?? []).forEach((r: any) => {
        const amount = Math.round(Number(r.commission_amount ?? 0));
        if (!amount) return;
        const periodLabel = r.period === 10 ? "10日期" : "25日期";
        pushItem(
          "scout_discount_code_payouts",
          r.id,
          r.recipient_role,
          profileById.get(r.recipient_id),
          r.recipient_role === "closer"
            ? SOURCE_LABEL.scout_discount_closer
            : SOURCE_LABEL.scout_discount_scout,
          `訂單 ${r.orders?.order_number ?? String(r.order_id).slice(0, 8)}・${r.discount_code}・${r.year}/${String(r.month).padStart(2, "0")} ${periodLabel}`,
          amount,
          {
            venue_name: venueOf(r.orders?.accommodation_id),
            order_number: r.orders?.order_number ?? String(r.order_id).slice(0, 8),
          },
        );
      });






      (scoutPayouts ?? []).forEach((r: any) => {
        const scout = r.scout_id ? profileByUserId.get(r.scout_id) : undefined;
        const periodLabel = r.period === 10 ? "10日期" : "25日期";
        const detail = `${r.year}/${String(r.month).padStart(2, "0")} ${periodLabel}`;
        const breakdown = (r.bonus_breakdown ?? {}) as Record<string, unknown>;
        const rarityBonus = Number(breakdown.rarity_bonus ?? 0);
        const paid = r.payout_status === "paid";
        const baseItems: Array<[string, string, number]> = [
          ["base", SOURCE_LABEL.scout_base, Number(r.base_salary ?? 0)],
          ["rarity", SOURCE_LABEL.scout_rarity, rarityBonus],
          ["kol", SOURCE_LABEL.scout_kol, Number(r.kol_commission ?? 0)],
          ["team", SOURCE_LABEL.scout_team, Number(r.team_bonus ?? 0)],
        ];
        baseItems.forEach(([roleKey, label, amount]) => {
          if (!amount || amount === 0) return;
          items.push({
            key: `scout_monthly_payouts:${r.id}:${roleKey}`,
            source_table: "scout_monthly_payouts",
            source_id: r.id,
            role_key: roleKey,
            member_id: scout?.id ?? null,
            source_label: label,
            detail,
            amount,
            multiplier: 1,
            multiplied_amount: amount,
            paid,
            payout_date: r.payout_date ?? null,
            venue_name: "-",
            order_number: null,
          });
        });
      });

      // 成交組團隊獎金：closer_team_bonus_distribution 已定案分配
      (teamBonusDist ?? []).forEach((r: any) => {
        if (!r.closer_id || !Number(r.bonus_amount)) return;
        pushItem(
          "closer_team_bonus_distribution",
          r.id,
          "closer",
          profileByUserId.get(r.closer_id),
          SOURCE_LABEL.closer_team_bonus,
          `${prevYear}年${prevMonth}月 成交組團隊獎金分配`,
          Math.round(Number(r.bonus_amount)),
        );
      });

      // 八種團隊獎金：由 create-team-bonus-snapshots 每月10日鎖定寫入
      // 固定金額×館別數的類型（AM 場域／場域成交／網紅月費）拆成逐館一筆
      // 抽成類（營收 × 費率）依「各館別營收」拆成逐館一筆，並顯示該館營收
      const PER_VENUE_BONUS = new Set(["am_venue_bonus", "venue_closing", "kol_monthly"]);
      const REVENUE_BONUS = new Set([
        "am_performance",
        "closer_performance",
        "am_manager",
        "closer_manager",
        "kol_commission",
      ]);
      for (const r of (teamBonusSnapshots ?? []) as any[]) {
        const amount = Math.round(Number(r.amount ?? 0));
        if (amount <= 0) continue;
        const label = SOURCE_LABEL[r.bonus_type] ?? r.bonus_type;
        const detail = `${payoutMonthKey.replace("-", "/")} 10日期`;
        const snap = (r.settings_snapshot ?? {}) as any;
        const accIds: string[] = Array.isArray(snap.accommodation_ids) ? snap.accommodation_ids : [];
        const snapNames: string[] = Array.isArray(snap.accommodation_names) ? snap.accommodation_names : [];

        if (PER_VENUE_BONUS.has(r.bonus_type) && accIds.length > 0) {
          const per = Math.round(amount / accIds.length);
          accIds.forEach((accId, idx) => {
            const name = snapNames[idx] || venueOf(accId) || "其他";
            // 最後一筆吸收整數尾差，確保逐館加總 = 快照金額
            const value = idx === accIds.length - 1 ? amount - per * (accIds.length - 1) : per;
            pushItem(
              "teamcommission_bonus_snapshots",
              r.id,
              `${r.bonus_type}#${accId}`,
              profileById.get(r.member_id),
              label,
              detail,
              value,
              { venue_name: name },
            );
          });
          continue;
        }

        if (REVENUE_BONUS.has(r.bonus_type) && accIds.length > 0) {
          const sources: string[] = Array.isArray(snap.kol_sources)
            ? snap.kol_sources
            : Array.isArray(snap.shared_sources)
              ? snap.shared_sources
              : [];
          const snapMonth = String(r.snapshot_month ?? "");
          const [sy, sm] = snapMonth.split("-").map(Number);
          if (sources.length > 0 && sy && sm) {
            const nextY = sm === 12 ? sy + 1 : sy;
            const nextM = sm === 12 ? 1 : sm + 1;
            const byAcc = await getAccommodationRevenueByAcc(
              supabase as any,
              accIds,
              `${snapMonth}-01`,
              `${nextY}-${String(nextM).padStart(2, "0")}-01`,
              sources,
            );
            const entries = Object.entries(byAcc)
              .filter(([, rev]) => rev > 0)
              .sort((a, b) => b[1] - a[1]);
            const totalRev = entries.reduce((s2, [, v]) => s2 + v, 0);
            if (entries.length > 0 && totalRev > 0) {
              let allocated = 0;
              entries.forEach(([accId, rev], idx) => {
                const value =
                  idx === entries.length - 1
                    ? amount - allocated
                    : Math.round((amount * rev) / totalRev);
                allocated += value;
                pushItem(
                  "teamcommission_bonus_snapshots",
                  r.id,
                  `${r.bonus_type}#${accId}`,
                  profileById.get(r.member_id),
                  label,
                  detail,
                  value,
                  { venue_name: venueOf(accId) || "其他", base_revenue: Math.round(rev) },
                );
              });
              continue;
            }
          }
        }

        pushItem(
          "teamcommission_bonus_snapshots",
          r.id,
          r.bonus_type,
          profileById.get(r.member_id),
          label,
          detail,
          amount,
          { venue_name: "全館別", base_revenue: Number(r.base_revenue ?? 0) || null },
        );
      }



      // 提醒：上月有成交組分潤快照 + 該月確實有生效的團隊獎金比例設定，但分配尚未定案
      const prevMonthFirstDay = `${range.prevYear}-${String(range.prevMonth).padStart(2, "0")}-01`;
      const { data: bonusSetting } = await supabase
        .from("closer_team_bonus_settings")
        .select("bonus_rate, effective_from")
        .lte("effective_from", prevMonthFirstDay)
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      const hasBonusPool = Number(bonusSetting?.bonus_rate ?? 0) > 0;
      setTeamBonusNotFinalized(
        hasBonusPool && (teamBonusDist ?? []).length === 0 && (closers ?? []).length > 0,
      );





      // 3. 撈取已標記紀錄（scout_monthly_payouts 已自帶 payout_status，跳過）
      const markableItems = items.filter((i) => i.source_table !== "scout_monthly_payouts");
      const sourceIds = Array.from(new Set(markableItems.map((i) => i.source_id)));
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
        markableItems.forEach((it) => {
          const m = markMap.get(it.key);
          if (m) {
            it.paid = m.paid;
            it.payout_date = m.date;
          }
        });
      }


      // 3.5 加倍活動：查該發放月的所有設定，建立 bonus_type → multiplier map
      const { data: multRows } = await supabase
        .from("bonus_multiplier_settings")
        .select("bonus_type, multiplier, start_month, end_month")
        .lte("start_month", payoutMonthKey)
        .gte("end_month", payoutMonthKey);
      const multiplierMap = new Map<string, number>();
      (multRows ?? []).forEach((r: any) => {
        multiplierMap.set(r.bonus_type, Number(r.multiplier ?? 1));
      });
      const allMult = multiplierMap.get("all") ?? 1;
      items.forEach((it) => {
        const bt = bonusTypeOf(it.source_table, it.role_key);
        const specific = bt ? (multiplierMap.get(bt) ?? 1) : 1;
        const mult = specific * allMult;
        it.multiplier = mult;
        it.multiplied_amount = Math.round(it.amount * mult);
      });

      // 4. 依人分組（合計使用加倍後金額）
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
        g.total += it.multiplied_amount;
      });

      const list = Array.from(groupMap.values()).sort((a, b) => b.total - a.total);
      setGroups(list);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [range, wideRange, prevMonthKey, year, month]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 手動重新試算：呼叫 cron-dispatcher-commission，帶入發放年月與期別
  const runRecalc = async () => {
    setRecalcRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("cron-dispatcher-commission", {
        body: {
          year,
          month,
          period: recalcPeriod,
          snapshot_month: prevMonthKey,
        },
      });
      if (error) throw error;
      const res = data as {
        failed?: string[];
        results?: Array<{ fn: string; body?: unknown }>;
      };
      const failed: string[] = res?.failed ?? [];
      const snapBody = res?.results?.find((r) => r.fn === "create-commission-snapshots")?.body as
        | {
            created?: number;
            skipped?: number;
            created_backfill_total?: number;
            created_backfill?: Array<{ month: string; count: number }>;
            resynced?: number;
            resync_cancelled_adjustments?: number;
          }
        | undefined;
      const createdCurrent = Number(snapBody?.created ?? 0);
      const createdBackfill = Number(
        snapBody?.created_backfill_total ??
          (snapBody?.created_backfill ?? []).reduce((s, b) => s + Number(b.count ?? 0), 0),
      );
      const skippedCount = Number(snapBody?.skipped ?? 0);
      const resyncedCount = Number(snapBody?.resynced ?? 0);
      const cancelAdjCount = Number(snapBody?.resync_cancelled_adjustments ?? 0);
      const detail = `本期新增 ${createdCurrent} 筆，回溯補建 ${createdBackfill} 筆，略過 ${skippedCount} 筆（已存在），金額重算 ${resyncedCount} 筆（未發放），取消扣回補差 ${cancelAdjCount} 筆`;


      if (failed.length > 0) {
        toast.error(`部分步驟失敗：${failed.join("、")}`);
      } else {
        toast.success(`已重新試算 ${year}/${String(month).padStart(2, "0")} 期別 ${recalcPeriod}`, {
          description: detail,
        });
      }
      setRecalcOpen(false);
      await fetchData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRecalcRunning(false);
    }
  };


  const markItem = async (item: SourceItem) => {
    const { data: auth } = await supabase.auth.getUser();
    if (item.source_table === "scout_monthly_payouts") {
      const { error } = await supabase
        .from("scout_monthly_payouts")
        .update({ payout_status: "paid", payout_date: todayStr() })
        .eq("id", item.source_id);
      if (error) return toast.error(error.message);
    } else {
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
    }
    toast.success("已標記為發放");
    fetchData();
  };

  // 共用批次標記邏輯：對一組 items 執行更新（scout_monthly_payouts 用 update，其餘 upsert commission_payout_marks）
  const markItemsBatch = async (items: SourceItem[]) => {
    const { data: auth } = await supabase.auth.getUser();
    const scoutIds = Array.from(
      new Set(items.filter((i) => i.source_table === "scout_monthly_payouts").map((i) => i.source_id)),
    );
    const others = items.filter((i) => i.source_table !== "scout_monthly_payouts");

    if (scoutIds.length > 0) {
      const { error } = await supabase
        .from("scout_monthly_payouts")
        .update({ payout_status: "paid", payout_date: todayStr() })
        .in("id", scoutIds);
      if (error) throw error;
    }
    if (others.length > 0) {
      const payload = others.map((i) => ({
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
      if (error) throw error;
    }
  };

  const bulkMarkAll = async () => {
    const unpaid = groups.flatMap((g) => g.items).filter((i) => !i.paid);
    if (unpaid.length === 0) return toast.info("沒有待標記的記錄");
    if (!confirm(`確定要將 ${unpaid.length} 筆待發放記錄全部標記為已發放？`)) return;
    setBulkMarking(true);
    try {
      await markItemsBatch(unpaid);
      toast.success(`已標記 ${unpaid.length} 筆`);
      fetchData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBulkMarking(false);
    }
  };

  const markMemberAll = async (group: MemberGroup) => {
    const unpaid = group.items.filter((i) => !i.paid);
    if (unpaid.length === 0) return;
    setMarkingMember(group.member_id);
    try {
      await markItemsBatch(unpaid);
      toast.success(`已標記 ${group.display_name} 全部已發放`);
      setConfirmMember(null);
      fetchData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setMarkingMember(null);
    }
  };

  const markSourceAll = async (memberId: string, sourceLabel: string, items: SourceItem[]) => {
    const unpaid = items.filter((i) => !i.paid);
    if (unpaid.length === 0) return;
    const key = `${memberId}:${sourceLabel}`;
    setMarkingSource(key);
    try {
      await markItemsBatch(unpaid);
      toast.success(`已標記「${sourceLabel}」全部已發放（${unpaid.length} 筆）`);
      fetchData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setMarkingSource(null);
    }
  };


  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i + 1);
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  const totalAll = groups.reduce((s, g) => s + g.total, 0);
  const totalUnpaid = groups.reduce(
    (s, g) => s + g.items.filter((i) => !i.paid).reduce((a, i) => a + i.multiplied_amount, 0),
    0,
  );

  return (
    <Card className="overflow-x-hidden">
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



          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRecalcOpen(true)}
              disabled={recalcRunning || loading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${recalcRunning ? "animate-spin" : ""}`} />
              {recalcRunning ? "試算中…" : "手動重新試算"}
            </Button>
          )}
        </div>

        <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            每月 10、25 日自動寫入；未到日期空白為正常，逾期無資料請按「手動重新試算」。

            {onOpenRules && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={onOpenRules}
                  className="underline underline-offset-2 text-primary hover:opacity-80"
                >
                  結算規則
                </button>
              </>
            )}
          </p>

        </div>

        {teamBonusNotFinalized && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
            <Bell className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
            <div className="text-xs leading-relaxed text-foreground">
              <span className="font-medium">
                {range.prevYear} 年 {range.prevMonth} 月成交組團隊獎金尚未定案
              </span>
              <p className="text-muted-foreground mt-0.5">
                該月已有成交組分潤資料，但團隊獎金分配尚未定案，發放管理不會列出此筆獎金。請至{" "}
                <a
                  href="/team/orders?tab=team-bonus"
                  className="underline underline-offset-2 text-primary hover:opacity-80"
                >
                  團隊成交統計
                </a>{" "}
                完成定案。
              </p>

            </div>
          </div>
        )}





        <AlertDialog open={recalcOpen} onOpenChange={setRecalcOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>手動重新試算</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm">
                  <p>
                    將補建<strong>尚未產生過快照</strong>的訂單（結算月份 {prevMonthKey}，並自動回溯最近 1 個月），
                    並試算金額調整與星探發放。補建的快照歸入{" "}
                    <strong>{year}/{String(month).padStart(2, "0")}</strong> 發放月。
                  </p>
                  <p>
                    同時會檢查<strong>尚未發放</strong>的快照：若訂單金額（分潤基準）事後有異動，
                    會自動以最新金額重寫快照。<strong>已標記發放</strong>的快照永遠不會被修改。
                  </p>

                  <div>
                    <Label className="text-xs">星探期別</Label>
                    <Select
                      value={recalcPeriod}
                      onValueChange={(v) => setRecalcPeriod(v as "10" | "25")}
                    >
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">期別 10（上月21日~本月5日）</SelectItem>
                        <SelectItem value="25">期別 25（本月6日~20日）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={recalcRunning}>取消</AlertDialogCancel>
              <Button onClick={runRecalc} disabled={recalcRunning}>
                {recalcRunning ? "試算中…" : "開始重新試算"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>


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
              const isOpen = expandedMembers.has(g.member_id);
              return (
                <div key={g.member_id} className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleMember(g.member_id)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-center gap-3">
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`}
                      />
                      <span className="font-medium">{g.display_name}</span>
                      <span className="text-xs text-muted-foreground">{g.items.length} 筆</span>
                      {allPaid ? (
                        <Badge variant="outline">全部已發放</Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200">部分待發放</Badge>
                      )}
                    </div>
                    <div className="text-sm font-medium">合計 {formatMoney(g.total)}</div>
                  </button>
                  {isOpen && (
                    <>
                      {!readOnly && g.items.some((it) => !it.paid) && (
                        <div className="flex justify-end px-4 py-2 border-b bg-background">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={markingMember === g.member_id}
                            onClick={() => setConfirmMember(g)}
                          >
                            {markingMember === g.member_id
                              ? "處理中…"
                              : `標記 ${g.display_name} 全部已發放`}
                          </Button>
                        </div>
                      )}
                    <div className="divide-y">
                      {(() => {
                        // 依 source_label 分組
                        const bySource = new Map<string, SourceItem[]>();
                        for (const it of g.items) {
                          const arr = bySource.get(it.source_label) ?? [];
                          arr.push(it);
                          bySource.set(it.source_label, arr);
                        }
                        const itemsBySource = Array.from(bySource.entries()).map(([label, items]) => ({
                          label,
                          items,
                          subtotal: items.reduce((s, i) => s + i.multiplied_amount, 0),
                          allPaid: items.every((i) => i.paid),
                        }));
                        return itemsBySource.map((src) => {
                          const srcKey = `${g.member_id}:${src.label}`;
                          const srcOpen = expandedSources.has(srcKey);
                          const unpaidCount = src.items.filter((i) => !i.paid).length;
                          return (
                            <div key={src.label}>
                              <div className="flex flex-col gap-2 px-4 py-2 bg-background hover:bg-muted/30 transition-colors sm:flex-row sm:items-center sm:justify-between">
                                <button
                                  type="button"
                                  onClick={() => toggleSource(g.member_id, src.label)}
                                  className="flex flex-wrap items-center gap-x-2 gap-y-1 flex-1 min-w-0 text-left"
                                  aria-expanded={srcOpen}
                                >
                                  {srcOpen ? (
                                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  )}
                                  <span className="text-sm font-medium whitespace-nowrap">{src.label}</span>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 whitespace-nowrap">
                                    {src.items.length} 筆
                                  </Badge>
                                  {src.allPaid ? (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 whitespace-nowrap">已發放</Badge>
                                  ) : unpaidCount < src.items.length ? (
                                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0 whitespace-nowrap">
                                      待發放 {unpaidCount} 筆
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0 whitespace-nowrap">
                                      待發放
                                    </Badge>
                                  )}
                                </button>
                                <div className="flex items-center justify-between gap-3 sm:justify-end">
                                  <span className="text-sm font-medium tabular-nums whitespace-nowrap">
                                    小計 {formatMoney(src.subtotal)}
                                  </span>
                                  {!readOnly && !src.allPaid && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="whitespace-nowrap"
                                      disabled={markingSource === srcKey}
                                      onClick={() => markSourceAll(g.member_id, src.label, src.items)}
                                    >
                                      {markingSource === srcKey ? "處理中…" : "標記此類型全部已發放"}
                                    </Button>
                                  )}
                                </div>
                              </div>

                              {srcOpen && (
                                <div className="overflow-x-auto bg-muted/10">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>館別</TableHead>
                                        <TableHead className="w-[120px] text-right">營收</TableHead>
                                        <TableHead className="w-[90px] text-right">筆數</TableHead>
                                        <TableHead className="text-right w-[120px]">小計</TableHead>
                                        <TableHead className="w-[120px]">狀態</TableHead>
                                        <TableHead className="w-[140px] text-right"></TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {(() => {
                                        const byVenue = new Map<string, SourceItem[]>();
                                        for (const it of src.items) {
                                          const v = it.venue_name || "其他";
                                          const arr = byVenue.get(v) ?? [];
                                          arr.push(it);
                                          byVenue.set(v, arr);
                                        }
                                         // 與「業績統計」一致：依小計金額由大到小排序
                                         const sortedVenues = Array.from(byVenue.entries()).sort((a, b) => {
                                           const sa = a[1].reduce((s, i) => s + i.multiplied_amount, 0);
                                           const sb = b[1].reduce((s, i) => s + i.multiplied_amount, 0);
                                           return sb === sa ? a[0].localeCompare(b[0], "zh-Hant") : sb - sa;
                                         });
                                         return sortedVenues.map(([venue, vItems]) => {
                                          const subtotal = vItems.reduce((s, i) => s + i.multiplied_amount, 0);
                                          const unpaid = vItems.filter((i) => !i.paid);
                                          const vKey = `${g.member_id}:${src.label}:${venue}`;
                                          return (
                                            <TableRow
                                              key={vKey}
                                              className="cursor-pointer"
                                              onClick={() =>
                                                setVenueDetail({
                                                  member: g.display_name,
                                                  sourceLabel: src.label,
                                                  venue,
                                                  items: vItems,
                                                })
                                              }
                                            >
                                              <TableCell className="text-sm">{venue}</TableCell>
                                              <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                                                {(() => {
                                                  const rev = vItems.reduce(
                                                    (s2, i) => s2 + Number(i.base_revenue ?? 0),
                                                    0,
                                                  );
                                                  return rev > 0 ? formatMoney(rev) : "—";
                                                })()}
                                              </TableCell>
                                              <TableCell className="text-right tabular-nums text-sm">{vItems.length}</TableCell>
                                              <TableCell className="text-right tabular-nums">{formatMoney(subtotal)}</TableCell>
                                              <TableCell>
                                                {unpaid.length === 0 ? (
                                                  <Badge variant="outline" className="text-xs">已發放</Badge>
                                                ) : (
                                                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                                                    待發放 {unpaid.length} 筆
                                                  </Badge>
                                                )}
                                              </TableCell>
                                              <TableCell className="text-right">
                                                {unpaid.length > 0 && !readOnly && (
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={markingSource === vKey}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      markSourceAll(g.member_id, `${src.label}・${venue}`, vItems);
                                                    }}
                                                  >
                                                    標記已發放
                                                  </Button>
                                                )}
                                              </TableCell>
                                            </TableRow>
                                          );
                                        });
                                      })()}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

        )}
      </CardContent>

      <Sheet open={!!venueDetail} onOpenChange={(open) => !open && setVenueDetail(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {venueDetail?.member} ・ {venueDetail?.venue}
            </SheetTitle>
            <SheetDescription>
              {venueDetail?.sourceLabel} ・ 共 {venueDetail?.items.length ?? 0} 筆 ・ 合計{" "}
              {formatMoney((venueDetail?.items ?? []).reduce((s, i) => s + i.multiplied_amount, 0))}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>訂單</TableHead>
                  <TableHead className="text-right w-[110px]">金額</TableHead>
                  <TableHead className="w-[100px]">狀態</TableHead>
                  <TableHead className="w-[110px] text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(venueDetail?.items ?? []).map((it) => (
                  <TableRow key={it.key}>
                    <TableCell className="text-xs">{it.detail || it.order_number || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="flex items-center justify-end gap-1.5">
                        {it.multiplier > 1 && (
                          <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-[10px] px-1.5 py-0">
                            × {Number(it.multiplier).toFixed(2)} 倍
                          </Badge>
                        )}
                        <span>{formatMoney(it.multiplied_amount)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {it.paid ? (
                        <Badge variant="outline" className="text-xs">已發放 {it.payout_date ?? ""}</Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">待發放</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!it.paid && !readOnly && it.member_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await markItem(it);
                            setVenueDetail(null);
                          }}
                        >
                          標記已發放
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SheetContent>
      </Sheet>

      {!readOnly && (
        <div className="mt-6 pt-4 px-4 border-t border-border flex justify-end">
          <Button size="sm" onClick={bulkMarkAll} disabled={bulkMarking || loading}>
            {bulkMarking ? "處理中…" : "一鍵標記全部已發放"}
          </Button>
        </div>
      )}


      <AlertDialog open={!!confirmMember} onOpenChange={(open) => !open && setConfirmMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>標記全部已發放</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMember
                ? `確定將 ${confirmMember.display_name} 的所有待發放項目（${confirmMember.items.filter((i) => !i.paid).length} 筆）標記為已發放？`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmMember) markMemberAll(confirmMember);
              }}
            >
              確認標記
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
