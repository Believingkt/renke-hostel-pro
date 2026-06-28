import { useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Sparkles, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface QuotaRow {
  id: string;
  year_month: string;
  quota: number;
  note: string | null;
}

interface UsageRow {
  year_month: string;
  used: number;
}

export default function KolReciprocalQuota() {
  const { currentAccommodationId } = useAccommodation();
  const [rows, setRows] = useState<QuotaRow[]>([]);
  const [usageMap, setUsageMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<QuotaRow | null>(null);
  const [form, setForm] = useState({ year_month: format(new Date(), "yyyy-MM"), quota: 5, note: "" });

  const load = async () => {
    if (!currentAccommodationId) return;
    setLoading(true);
    const { data } = await supabase
      .from("kol_reciprocal_monthly_quotas")
      .select("id, year_month, quota, note")
      .eq("accommodation_id", currentAccommodationId)
      .order("year_month", { ascending: false });
    const list = (data ?? []) as QuotaRow[];
    setRows(list);

    // 撈每個月份的目前使用量
    const usage: Record<string, number> = {};
    await Promise.all(
      list.map(async (r) => {
        const { data: cnt } = await supabase.rpc("count_kol_reciprocal_orders", {
          _accommodation_id: currentAccommodationId,
          _year_month: r.year_month,
          _exclude_order_id: null,
        });
        usage[r.year_month] = (cnt as number | null) ?? 0;
      })
    );
    setUsageMap(usage);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccommodationId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ year_month: format(new Date(), "yyyy-MM"), quota: 5, note: "" });
    setDialogOpen(true);
  };
  const openEdit = (r: QuotaRow) => {
    setEditing(r);
    setForm({ year_month: r.year_month, quota: r.quota, note: r.note ?? "" });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!currentAccommodationId) return;
    if (!/^\d{4}-\d{2}$/.test(form.year_month)) {
      toast({ title: "月份格式錯誤", description: "請使用 YYYY-MM 格式", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(form.quota) || form.quota < 0) {
      toast({ title: "額度錯誤", description: "請輸入 0 以上的整數", variant: "destructive" });
      return;
    }
    const payload = {
      accommodation_id: currentAccommodationId,
      year_month: form.year_month,
      quota: Math.floor(form.quota),
      note: form.note.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("kol_reciprocal_monthly_quotas").update(payload).eq("id", editing.id)
      : await supabase.from("kol_reciprocal_monthly_quotas").upsert(payload, { onConflict: "accommodation_id,year_month" });
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: editing ? "已更新" : "已新增" });
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (r: QuotaRow) => {
    if (!confirm(`確定刪除 ${r.year_month} 的額度設定？`)) return;
    const { error } = await supabase.from("kol_reciprocal_monthly_quotas").delete().eq("id", r.id);
    if (error) {
      toast({ title: "刪除失敗", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "已刪除" });
    load();
  };

  const renderRow = (r: QuotaRow) => {
    const used = usageMap[r.year_month] ?? 0;
    const pct = r.quota === 0 ? 100 : Math.round((used / r.quota) * 100);
    const variant = used > r.quota ? "destructive" : used === r.quota ? "default" : used / Math.max(1, r.quota) >= 0.8 ? "secondary" : "outline";
    return (
      <TableRow key={r.id}>
        <TableCell className="font-medium">{r.year_month}</TableCell>
        <TableCell>{r.quota}</TableCell>
        <TableCell>
          <Badge variant={variant as any}>{used} / {r.quota} ({pct}%)</Badge>
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">{r.note || "—"}</TableCell>
        <TableCell className="text-right">
          <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => handleDelete(r)}><Trash2 className="h-4 w-4" /></Button>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <AdminPageHeader
      title="KOL 互惠額度"
      icon={Sparkles}
      breadcrumbs={[{ label: "訂單資訊" }]}
      action={
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" />新增月份額度
        </Button>
      }
    >
      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b text-sm text-muted-foreground">
            設定每月可建立的「KOL 互惠」訂單上限，依<strong className="text-foreground">入住日</strong>歸屬月份。建立或修改訂單時若超出將跳出確認框（管理員可強制覆寫）。
          </div>
          {loading ? (
            <div className="p-6 text-center text-muted-foreground">載入中…</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">尚未設定任何月份額度</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>月份</TableHead>
                  <TableHead>上限</TableHead>
                  <TableHead>目前使用量</TableHead>
                  <TableHead>備註</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{rows.map(renderRow)}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯月份額度" : "新增月份額度"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>月份 (YYYY-MM)</Label>
              <Input
                type="month"
                value={form.year_month}
                onChange={(e) => setForm({ ...form, year_month: e.target.value })}
                disabled={!!editing}
              />
            </div>
            <div className="space-y-2">
              <Label>上限筆數</Label>
              <Input
                type="number"
                min={0}
                value={form.quota}
                onChange={(e) => setForm({ ...form, quota: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>備註（誰核定/原因）</Label>
              <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSave}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminPageHeader>
  );
}
