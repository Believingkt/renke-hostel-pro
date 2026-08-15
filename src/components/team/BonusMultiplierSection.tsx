import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
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
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

/**
 * 獎金加倍活動設定（單一真相來源）。
 * - HQ /hq/bonus-settings →「④ 分多少、何時發」為唯一可編輯入口
 * - /team/commission →「獎金加倍活動」為唯讀鏡像
 */

export const BONUS_MULTIPLIER_TYPE_LABEL: Record<string, string> = {
  all: "全部獎金",
  closer: "成交組獎金",
  video: "影音組分潤（已停用）",
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

export default function BonusMultiplierSection({
  readOnly = false,
  showHqHint = false,
}: {
  readOnly?: boolean;
  /** 唯讀鏡像時顯示「請至總部設定」提示 */
  showHqHint?: boolean;
}) {
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
        `與現有設定重疊（${BONUS_MULTIPLIER_TYPE_LABEL[(overlap as any).bonus_type] ?? (overlap as any).bonus_type} ${(overlap as any).start_month}～${(overlap as any).end_month} 已存在），請調整月份範圍`,
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
        {showHqHint && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            此為唯讀鏡像，加倍活動請至總部「獎金設定 → ④ 分多少、何時發」新增或刪除。
          </div>
        )}
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
                {!readOnly && <TableHead className="w-16 text-right">操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const s = statusOf(r);
                return (
                  <TableRow key={r.id}>
                    <TableCell>{BONUS_MULTIPLIER_TYPE_LABEL[r.bonus_type] ?? r.bonus_type}</TableCell>
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
                    {!readOnly && (
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeletingId(r.id)}
                          aria-label="刪除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
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
                  {Object.entries(BONUS_MULTIPLIER_TYPE_LABEL)
                    .filter(([k]) => k !== "video") /* 影音組分潤已停用：不可新增 */
                    .map(([k, v]) => (
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
