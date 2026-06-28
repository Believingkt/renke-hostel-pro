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
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
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
  const [datesMap, setDatesMap] = useState<Record<string, { date: string; orderId: string }[]>>({});
  const [overrideOrderIds, setOverrideOrderIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<QuotaRow | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [form, setForm] = useState({ year_month: format(new Date(), "yyyy-MM"), end_month: format(new Date(), "yyyy-MM"), quota: 5, note: "" });

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

    // 一次撈取相關月份的 KOL 訂單入住日
    const usage: Record<string, number> = {};
    const dates: Record<string, { date: string; orderId: string }[]> = {};
    const overrides = new Set<string>();
    if (list.length > 0) {
      const months = list.map((r) => r.year_month).sort();
      const minStart = `${months[0]}-01`;
      const [maxY, maxM] = months[months.length - 1].split("-").map(Number);
      const maxEndDate = new Date(maxY, maxM, 1);
      const maxEnd = format(maxEndDate, "yyyy-MM-dd");
      const { data: ordersData } = await supabase
        .from("orders")
        .select("id, check_in_date, order_status")
        .eq("accommodation_id", currentAccommodationId)
        .eq("order_source", "kol")
        .gte("check_in_date", minStart)
        .lt("check_in_date", maxEnd);
      const orderIds: string[] = [];
      for (const o of (ordersData ?? []) as any[]) {
        if (o.order_status === "cancelled") continue;
        const ym = (o.check_in_date as string).slice(0, 7);
        usage[ym] = (usage[ym] ?? 0) + 1;
        (dates[ym] ||= []).push({ date: o.check_in_date, orderId: o.id });
        orderIds.push(o.id);
      }
      for (const ym of Object.keys(dates)) {
        dates[ym].sort((a, b) => a.date.localeCompare(b.date));
      }

      // 撈取 KOL 額度覆寫紀錄
      if (orderIds.length > 0) {
        const { data: logs } = await supabase
          .from("audit_logs")
          .select("entity_id, details")
          .eq("entity_type", "order")
          .in("entity_id", orderIds);
        for (const log of (logs ?? []) as any[]) {
          if (log.details?.type === "kol_quota_override" && log.entity_id) {
            overrides.add(log.entity_id);
          }
        }
      }
    }
    setUsageMap(usage);
    setDatesMap(dates);
    setOverrideOrderIds(overrides);
    setLoading(false);
  };


  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAccommodationId]);

  const openCreate = () => {
    setEditing(null);
    setBulkMode(false);
    const cur = format(new Date(), "yyyy-MM");
    setForm({ year_month: cur, end_month: cur, quota: 5, note: "" });
    setDialogOpen(true);
  };
  const openEdit = (r: QuotaRow) => {
    setEditing(r);
    setBulkMode(false);
    setForm({ year_month: r.year_month, end_month: r.year_month, quota: r.quota, note: r.note ?? "" });
    setDialogOpen(true);
  };

  const enumerateMonths = (start: string, end: string): string[] => {
    if (start > end) return [];
    const months: string[] = [];
    const [sy, sm] = start.split("-").map(Number);
    const [ey, em] = end.split("-").map(Number);
    let y = sy, m = sm;
    while (y < ey || (y === ey && m <= em)) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) { m = 1; y++; }
      if (months.length > 60) break; // safety
    }
    return months;
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

    if (!editing && bulkMode) {
      if (!/^\d{4}-\d{2}$/.test(form.end_month) || form.end_month < form.year_month) {
        toast({ title: "結束月份錯誤", description: "結束月份需大於等於起始月份", variant: "destructive" });
        return;
      }
      const months = enumerateMonths(form.year_month, form.end_month);
      const payloads = months.map((ym) => ({
        accommodation_id: currentAccommodationId,
        year_month: ym,
        quota: Math.floor(form.quota),
        note: form.note.trim() || null,
      }));
      const { error } = await supabase
        .from("kol_reciprocal_monthly_quotas")
        .upsert(payloads, { onConflict: "accommodation_id,year_month" });
      if (error) {
        toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: `已批次設定 ${months.length} 個月份` });
      setDialogOpen(false);
      load();
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
    const dates = datesMap[r.year_month] ?? [];
    return (
      <TableRow key={r.id}>
        <TableCell className="font-medium w-24">{r.year_month}</TableCell>
        <TableCell className="w-16">{r.quota}</TableCell>
        <TableCell className="w-40">
          {used > 0 ? (
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="cursor-pointer">
                  <Badge variant={variant as any}>{used} / {r.quota} ({pct}%)</Badge>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="start">
                <UsedOrdersList accommodationId={currentAccommodationId} yearMonth={r.year_month} overrideOrderIds={overrideOrderIds} />
              </PopoverContent>

            </Popover>
          ) : (
            <Badge variant={variant as any}>{used} / {r.quota} ({pct}%)</Badge>
          )}
        </TableCell>
        <TableCell className="text-sm tabular-nums">
          {dates.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {dates.map((d, i) => {
                const [, m, day] = d.date.split("-");
                const isOverride = overrideOrderIds.has(d.orderId);
                return (
                  <span
                    key={`${d.date}-${i}`}
                    title={isOverride ? "超額強制建立" : undefined}
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs ${
                      isOverride
                        ? "bg-orange-100 text-orange-700 border border-orange-300"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {isOverride && <span>⚠️</span>}
                    {Number(m)}/{Number(day)}
                  </span>
                );
              })}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>

        <TableCell className="text-muted-foreground text-sm w-48">{r.note || "—"}</TableCell>
        <TableCell className="text-right w-24">
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
                  <TableHead className="w-24">月份</TableHead>
                  <TableHead className="w-16">上限</TableHead>
                  <TableHead className="w-40">目前使用量</TableHead>
                  <TableHead>已使用入住日</TableHead>
                  <TableHead className="w-48">備註</TableHead>
                  <TableHead className="text-right w-24">操作</TableHead>
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
            {!editing && (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/40">
                <div>
                  <div className="text-sm font-medium">批次設定多個月份</div>
                  <div className="text-xs text-muted-foreground">同時建立 / 覆寫一段連續月份的額度</div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={bulkMode}
                    onChange={(e) => setBulkMode(e.target.checked)}
                    className="h-4 w-4"
                  />
                  啟用
                </label>
              </div>
            )}
            <div className={bulkMode ? "grid grid-cols-2 gap-3" : "space-y-2"}>
              <div className="space-y-2">
                <Label>{bulkMode ? "起始月份" : "月份 (YYYY-MM)"}</Label>
                <Input
                  type="month"
                  value={form.year_month}
                  onChange={(e) => setForm({ ...form, year_month: e.target.value, end_month: bulkMode && form.end_month < e.target.value ? e.target.value : form.end_month })}
                  disabled={!!editing}
                />
              </div>
              {bulkMode && (
                <div className="space-y-2">
                  <Label>結束月份</Label>
                  <Input
                    type="month"
                    value={form.end_month}
                    min={form.year_month}
                    onChange={(e) => setForm({ ...form, end_month: e.target.value })}
                  />
                </div>
              )}
            </div>
            {bulkMode && (
              <div className="text-xs text-muted-foreground">
                將套用至 <strong className="text-foreground">{enumerateMonths(form.year_month, form.end_month).length}</strong> 個月份（已存在的月份會被覆寫）
              </div>
            )}
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

interface UsedOrder {
  id: string;
  order_number: string | null;
  check_in_date: string;
  check_out_date: string | null;
  guest_name: string | null;
}

function UsedOrdersList({ accommodationId, yearMonth, overrideOrderIds }: { accommodationId: string | null; yearMonth: string; overrideOrderIds: Set<string> }) {
  const [list, setList] = useState<UsedOrder[] | null>(null);

  useEffect(() => {
    if (!accommodationId) return;
    const [y, m] = yearMonth.split("-").map(Number);
    const start = `${yearMonth}-01`;
    const endDate = new Date(y, m, 1); // 下個月 1 號
    const end = format(endDate, "yyyy-MM-dd");
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, check_in_date, check_out_date, guest_name, order_status")
        .eq("accommodation_id", accommodationId)
        .eq("order_source", "kol")
        .gte("check_in_date", start)
        .lt("check_in_date", end)
        .order("check_in_date", { ascending: true });
      setList(((data ?? []) as any[]).filter(o => o.order_status !== "cancelled"));
    })();
  }, [accommodationId, yearMonth]);

  if (list === null) return <div className="p-3 text-sm text-muted-foreground">載入中…</div>;
  if (list.length === 0) return <div className="p-3 text-sm text-muted-foreground">無資料</div>;

  const overrideCount = list.filter(o => overrideOrderIds.has(o.id)).length;

  return (
    <div className="max-h-80 overflow-y-auto">
      <div className="px-3 py-2 border-b text-xs text-muted-foreground flex items-center justify-between gap-2">
        <span>{yearMonth} 已使用 {list.length} 筆</span>
        {overrideCount > 0 && (
          <span className="text-orange-700">⚠️ 超額強制 {overrideCount} 筆</span>
        )}
      </div>
      <ul className="divide-y">
        {list.map((o) => {
          const isOverride = overrideOrderIds.has(o.id);
          return (
            <li
              key={o.id}
              className={`px-3 py-2 text-sm flex items-center justify-between gap-3 ${isOverride ? "bg-orange-50" : ""}`}
            >
              <div className="min-w-0">
                <div className="font-medium tabular-nums flex items-center gap-1">
                  {isOverride && <span title="超額強制建立" className="text-orange-700">⚠️</span>}
                  {o.check_in_date}{o.check_out_date ? ` → ${o.check_out_date}` : ""}
                </div>
                <div className="text-xs text-muted-foreground truncate">{o.guest_name || "—"}</div>
              </div>
              <a
                href={`/admin/orders/${o.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline shrink-0 tabular-nums"
              >
                {o.order_number || o.id.slice(0, 8)}
              </a>
            </li>
          );
        })}
      </ul>
    </div>

  );
}
