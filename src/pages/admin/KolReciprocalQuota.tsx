import { useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Sparkles, Plus, Pencil, Trash2, CalendarDays } from "lucide-react";
import { AvailabilityCalendarDialog } from "@/components/AvailabilityCalendarDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

const SHARED_KEY = "__shared__";

interface QuotaRow {
  id: string;
  year_month: string;
  quota: number;
  note: string | null;
  package_id: string | null;
}

interface PackageOption {
  id: string;
  name: string;
}

type Mode = "shared" | "per_package";

export default function KolReciprocalQuota() {
  const { currentAccommodationId } = useAccommodation();
  const { canEdit } = useStaffPermissions();
  const editable = canEdit("kol_quota");

  const [rows, setRows] = useState<QuotaRow[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [mode, setMode] = useState<Mode>("shared");
  const [trackedIds, setTrackedIds] = useState<string[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);

  // 使用量：key = `${year_month}::${package_id || SHARED_KEY}`
  const [usageMap, setUsageMap] = useState<Record<string, number>>({});
  const [datesMap, setDatesMap] = useState<Record<string, { date: string; orderId: string }[]>>({});
  const [overrideOrderIds, setOverrideOrderIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [editing, setEditing] = useState<QuotaRow | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [form, setForm] = useState({
    year_month: format(new Date(), "yyyy-MM"),
    end_month: format(new Date(), "yyyy-MM"),
    quota: 5,
    note: "",
    package_id: SHARED_KEY as string, // SHARED_KEY = 全館共用
  });

  const packageNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of packages) map[p.id] = p.name;
    return map;
  }, [packages]);

  const load = async () => {
    if (!currentAccommodationId) return;
    setLoading(true);

    const [accRes, pkgRes, quotaRes] = await Promise.all([
      (supabase as any)
        .from("accommodation_info")
        .select("kol_quota_mode, kol_quota_tracked_package_ids")
        .eq("id", currentAccommodationId)
        .maybeSingle(),
      supabase
        .from("accommodation_packages")
        .select("id, name")
        .eq("accommodation_id", currentAccommodationId)
        .eq("enabled", true)
        .order("display_order", { ascending: true }),
      supabase
        .from("kol_reciprocal_monthly_quotas")
        .select("id, year_month, quota, note, package_id")
        .eq("accommodation_id", currentAccommodationId)
        .order("year_month", { ascending: false }),
    ]);

    setMode(((accRes.data as any)?.kol_quota_mode as Mode) || "shared");
    setTrackedIds(((accRes.data as any)?.kol_quota_tracked_package_ids as string[]) || []);
    setPackages(((pkgRes.data as any[]) || []).map((p) => ({ id: p.id, name: p.name })));
    const list = ((quotaRes.data as any[]) || []) as QuotaRow[];
    setRows(list);

    // 統計使用量
    const usage: Record<string, number> = {};
    const dates: Record<string, { date: string; orderId: string }[]> = {};
    const overrides = new Set<string>();
    if (list.length > 0) {
      const months = list.map((r) => r.year_month).sort();
      const minStart = `${months[0]}-01`;
      const [maxY, maxM] = months[months.length - 1].split("-").map(Number);
      const maxEnd = format(new Date(maxY, maxM, 1), "yyyy-MM-dd");
      const { data: ordersData } = await supabase
        .from("orders")
        .select("id, check_in_date, order_status, package_id")
        .eq("accommodation_id", currentAccommodationId)
        .eq("order_source", "kol")
        .gte("check_in_date", minStart)
        .lt("check_in_date", maxEnd);
      const orderIds: string[] = [];
      for (const o of (ordersData ?? []) as any[]) {
        if (o.order_status === "cancelled") continue;
        const ym = (o.check_in_date as string).slice(0, 7);
        // 該訂單分別計入：全館 key 與（若有 package_id）該包棟 key
        const sharedKey = `${ym}::${SHARED_KEY}`;
        usage[sharedKey] = (usage[sharedKey] ?? 0) + 1;
        (dates[sharedKey] ||= []).push({ date: o.check_in_date, orderId: o.id });
        if (o.package_id) {
          const pkgKey = `${ym}::${o.package_id}`;
          usage[pkgKey] = (usage[pkgKey] ?? 0) + 1;
          (dates[pkgKey] ||= []).push({ date: o.check_in_date, orderId: o.id });
        }
        orderIds.push(o.id);
      }
      for (const k of Object.keys(dates)) dates[k].sort((a, b) => a.date.localeCompare(b.date));

      if (orderIds.length > 0) {
        const { data: logs } = await supabase
          .from("audit_logs")
          .select("entity_id, details")
          .eq("entity_type", "order")
          .in("entity_id", orderIds);
        for (const log of (logs ?? []) as any[]) {
          if (log.details?.type === "kol_quota_override" && log.entity_id) overrides.add(log.entity_id);
        }
      }
    }
    setUsageMap(usage);
    setDatesMap(dates);
    setOverrideOrderIds(overrides);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentAccommodationId]);

  const saveConfig = async (nextMode: Mode, nextTracked: string[]) => {
    if (!currentAccommodationId || !editable) return;
    setSavingConfig(true);
    const { error } = await (supabase as any)
      .from("accommodation_info")
      .update({ kol_quota_mode: nextMode, kol_quota_tracked_package_ids: nextTracked })
      .eq("id", currentAccommodationId);
    setSavingConfig(false);
    if (error) {
      toast({ title: "設定失敗", description: error.message, variant: "destructive" });
      return;
    }
    setMode(nextMode);
    setTrackedIds(nextTracked);
    toast({ title: "已更新設定" });
  };

  const toggleTracked = (pkgId: string) => {
    if (!editable) return;
    const next = trackedIds.includes(pkgId)
      ? trackedIds.filter((x) => x !== pkgId)
      : [...trackedIds, pkgId];
    saveConfig(mode, next);
  };

  const openCreate = () => {
    setEditing(null);
    setBulkMode(false);
    const cur = format(new Date(), "yyyy-MM");
    setForm({ year_month: cur, end_month: cur, quota: 5, note: "", package_id: SHARED_KEY });
    setDialogOpen(true);
  };
  const openEdit = (r: QuotaRow) => {
    setEditing(r);
    setBulkMode(false);
    setForm({
      year_month: r.year_month,
      end_month: r.year_month,
      quota: r.quota,
      note: r.note ?? "",
      package_id: r.package_id ?? SHARED_KEY,
    });
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
      if (months.length > 60) break;
    }
    return months;
  };

  const handleSave = async () => {
    if (!currentAccommodationId) return;
    if (!/^\d{4}-\d{2}$/.test(form.year_month)) {
      toast({ title: "月份格式錯誤", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(form.quota) || form.quota < 0) {
      toast({ title: "額度錯誤", description: "請輸入 0 以上整數", variant: "destructive" });
      return;
    }
    const pkgId = form.package_id === SHARED_KEY ? null : form.package_id;

    if (!editing && bulkMode) {
      if (!/^\d{4}-\d{2}$/.test(form.end_month) || form.end_month < form.year_month) {
        toast({ title: "結束月份錯誤", variant: "destructive" });
        return;
      }
      const months = enumerateMonths(form.year_month, form.end_month);
      const payloads = months.map((ym) => ({
        accommodation_id: currentAccommodationId,
        year_month: ym,
        quota: Math.floor(form.quota),
        note: form.note.trim() || null,
        package_id: pkgId,
      }));
      // 手動 upsert：先撈既有再決定 insert / update
      for (const p of payloads) {
        let q = supabase
          .from("kol_reciprocal_monthly_quotas")
          .select("id")
          .eq("accommodation_id", p.accommodation_id)
          .eq("year_month", p.year_month);
        q = p.package_id ? q.eq("package_id", p.package_id) : q.is("package_id", null);
        const { data: exist } = await q.maybeSingle();
        if (exist?.id) {
          await supabase
            .from("kol_reciprocal_monthly_quotas")
            .update({ quota: p.quota, note: p.note })
            .eq("id", exist.id);
        } else {
          await supabase.from("kol_reciprocal_monthly_quotas").insert(p as any);
        }
      }
      toast({ title: `已批次設定 ${months.length} 個月份` });
      setDialogOpen(false);
      load();
      return;
    }

    if (editing) {
      const { error } = await supabase
        .from("kol_reciprocal_monthly_quotas")
        .update({ quota: Math.floor(form.quota), note: form.note.trim() || null })
        .eq("id", editing.id);
      if (error) { toast({ title: "儲存失敗", description: error.message, variant: "destructive" }); return; }
    } else {
      // 檢查同 (accommodation, year_month, package_id) 是否已存在
      let q = supabase
        .from("kol_reciprocal_monthly_quotas")
        .select("id")
        .eq("accommodation_id", currentAccommodationId)
        .eq("year_month", form.year_month);
      q = pkgId ? q.eq("package_id", pkgId) : q.is("package_id", null);
      const { data: exist } = await q.maybeSingle();
      if (exist?.id) {
        const { error } = await supabase
          .from("kol_reciprocal_monthly_quotas")
          .update({ quota: Math.floor(form.quota), note: form.note.trim() || null })
          .eq("id", exist.id);
        if (error) { toast({ title: "儲存失敗", description: error.message, variant: "destructive" }); return; }
      } else {
        const { error } = await supabase
          .from("kol_reciprocal_monthly_quotas")
          .insert({
            accommodation_id: currentAccommodationId,
            year_month: form.year_month,
            quota: Math.floor(form.quota),
            note: form.note.trim() || null,
            package_id: pkgId,
          } as any);
        if (error) { toast({ title: "儲存失敗", description: error.message, variant: "destructive" }); return; }
      }
    }
    toast({ title: editing ? "已更新" : "已新增" });
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (r: QuotaRow) => {
    const scopeLabel = r.package_id ? packageNameById[r.package_id] ?? "包棟" : "全館共用";
    if (!confirm(`確定刪除 ${r.year_month}（${scopeLabel}）的額度設定？`)) return;
    const { error } = await supabase.from("kol_reciprocal_monthly_quotas").delete().eq("id", r.id);
    if (error) { toast({ title: "刪除失敗", description: error.message, variant: "destructive" }); return; }
    toast({ title: "已刪除" });
    load();
  };

  const scopeLabel = (r: QuotaRow) =>
    r.package_id ? packageNameById[r.package_id] ?? "（已刪除包棟）" : "全館共用";

  const renderRow = (r: QuotaRow) => {
    const key = `${r.year_month}::${r.package_id ?? SHARED_KEY}`;
    const used = usageMap[key] ?? 0;
    const pct = r.quota === 0 ? 100 : Math.round((used / r.quota) * 100);
    const variant = used > r.quota ? "destructive" : used === r.quota ? "default" : used / Math.max(1, r.quota) >= 0.8 ? "secondary" : "outline";
    const dates = datesMap[key] ?? [];
    return (
      <TableRow key={r.id}>
        <TableCell className="font-medium w-24">{r.year_month}</TableCell>
        <TableCell className="w-40">
          {r.package_id ? (
            <Badge variant="secondary">{scopeLabel(r)}</Badge>
          ) : (
            <Badge variant="outline">全館共用</Badge>
          )}
        </TableCell>
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
                <UsedOrdersList
                  accommodationId={currentAccommodationId}
                  yearMonth={r.year_month}
                  packageId={r.package_id}
                  overrideOrderIds={overrideOrderIds}
                />
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
                      isOverride ? "bg-orange-100 text-orange-700 border border-orange-300" : "bg-muted text-foreground"
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
          <Button size="sm" variant="ghost" onClick={() => openEdit(r)} disabled={!editable}><Pencil className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => handleDelete(r)} disabled={!editable}><Trash2 className="h-4 w-4" /></Button>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <AdminPageHeader
      title="KOL 互惠額度"
      icon={Sparkles}
      breadcrumbs={[{ label: "KOL 互惠額度" }]}
      action={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCalOpen(true)}>
            <CalendarDays className="h-4 w-4 mr-2" />
            日曆檢視
          </Button>
          {editable ? (
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4 mr-2" />新增月份額度
            </Button>
          ) : (
            <Badge variant="outline">唯讀預覽</Badge>
          )}
        </div>
      }
    >
      {/* 設定模式與追蹤包棟 */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">額度模式</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={mode}
            onValueChange={(v) => saveConfig(v as Mode, trackedIds)}
            className="grid gap-2 sm:grid-cols-2"
          >
            <label
              className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer ${mode === "shared" ? "border-primary bg-primary/5" : ""}`}
            >
              <RadioGroupItem value="shared" id="mode-shared" disabled={!editable || savingConfig} className="mt-1" />
              <div>
                <div className="text-sm font-medium">全部共用</div>
                <div className="text-xs text-muted-foreground">整家民宿共用同一個月度上限，任何 KOL 訂單都計入。</div>
              </div>
            </label>
            <label
              className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer ${mode === "per_package" ? "border-primary bg-primary/5" : ""}`}
            >
              <RadioGroupItem value="per_package" id="mode-per_package" disabled={!editable || savingConfig} className="mt-1" />
              <div>
                <div className="text-sm font-medium">分棟設定</div>
                <div className="text-xs text-muted-foreground">
                  勾選的包棟各自獨立額度（未設定該月＝視為 0）；未勾選的包棟訂單併入「全館共用」額度。
                </div>
              </div>
            </label>
          </RadioGroup>

          {mode === "per_package" && (
            <div>
              <Label className="text-sm mb-2 block">追蹤包棟（勾選要獨立設額度的包棟）</Label>
              {packages.length === 0 ? (
                <div className="text-sm text-muted-foreground">此民宿尚無啟用中的包棟方案</div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {packages.map((p) => {
                    const checked = trackedIds.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer ${checked ? "border-primary bg-primary/5" : ""}`}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!editable || savingConfig}
                          onCheckedChange={() => toggleTracked(p.id)}
                        />
                        <span className="text-sm">{p.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b text-sm text-muted-foreground">
            設定每月可建立的「KOL 互惠」訂單上限，依<strong className="text-foreground">入住日</strong>歸屬月份。分棟模式下可為每個追蹤包棟單獨設定；未追蹤的包棟訂單併入「全館共用」計算。
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
                  <TableHead className="w-40">範圍</TableHead>
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

            <div className="space-y-2">
              <Label>適用範圍</Label>
              <Select
                value={form.package_id}
                onValueChange={(v) => setForm({ ...form, package_id: v })}
                disabled={!!editing}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SHARED_KEY}>全館共用</SelectItem>
                  {packages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode === "shared" && form.package_id !== SHARED_KEY && (
                <div className="text-xs text-amber-600">目前為「全部共用」模式，設定個別包棟額度暫不會生效。</div>
              )}
              {mode === "per_package" && form.package_id !== SHARED_KEY && !trackedIds.includes(form.package_id) && (
                <div className="text-xs text-amber-600">此包棟未加入追蹤清單，設定後不會被檢查；請至上方勾選。</div>
              )}
            </div>

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

      {currentAccommodationId && (
        <AvailabilityCalendarDialog
          open={calOpen}
          onOpenChange={setCalOpen}
          accommodationId={currentAccommodationId}
        />
      )}
    </AdminPageHeader>
  );
}

interface UsedOrder {
  id: string;
  order_number: string | null;
  check_in_date: string;
  check_out_date: string | null;
  guest_name: string | null;
  package_id: string | null;
}

function UsedOrdersList({
  accommodationId, yearMonth, packageId, overrideOrderIds,
}: {
  accommodationId: string | null;
  yearMonth: string;
  packageId: string | null;
  overrideOrderIds: Set<string>;
}) {
  const [list, setList] = useState<UsedOrder[] | null>(null);

  useEffect(() => {
    if (!accommodationId) return;
    const [y, m] = yearMonth.split("-").map(Number);
    const start = `${yearMonth}-01`;
    const end = format(new Date(y, m, 1), "yyyy-MM-dd");
    (async () => {
      let q = supabase
        .from("orders")
        .select("id, order_number, check_in_date, check_out_date, guest_name, order_status, package_id")
        .eq("accommodation_id", accommodationId)
        .eq("order_source", "kol")
        .gte("check_in_date", start)
        .lt("check_in_date", end)
        .order("check_in_date", { ascending: true });
      if (packageId) q = q.eq("package_id", packageId);
      const { data } = await q;
      setList(((data ?? []) as any[]).filter(o => o.order_status !== "cancelled"));
    })();
  }, [accommodationId, yearMonth, packageId]);

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
