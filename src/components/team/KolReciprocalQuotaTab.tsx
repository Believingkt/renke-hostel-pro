import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, CalendarDays, History, Info } from "lucide-react";

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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { toast } from "@/hooks/use-toast";
import {
  logKolQuotaChange, fetchKolQuotaAuditLogs, describeChange,
  type QuotaAuditLogRow,
} from "@/lib/kolQuotaAudit";
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
  source: "package" | "room_type";
}

type Mode = "shared" | "per_package";

interface Props {
  isManager: boolean;
  defaultAccommodationId?: string | null;
  /** 若提供，館別下拉僅顯示這些館別（AM 只能操作負責館別） */
  allowedAccommodationIds?: string[] | null;
}

interface AccommodationOption {
  id: string;
  name: string;
}

export function KolReciprocalQuotaTab({
  isManager,
  defaultAccommodationId,
  allowedAccommodationIds,
}: Props) {
  const editable = isManager;

  const [accList, setAccList] = useState<AccommodationOption[]>([]);
  const [accListLoading, setAccListLoading] = useState(true);
  const [selectedAccId, setSelectedAccId] = useState<string | null>(null);
  const currentAccommodationId = selectedAccId;
  const allowedKey = (allowedAccommodationIds ?? []).join(",");

  useEffect(() => {
    (async () => {
      setAccListLoading(true);
      const { data, error } = await supabase
        .from("accommodation_info")
        .select("id, name")
        .eq("is_active", true)
        .neq("name", "奧丁丁測試")
        .order("name", { ascending: true });
      if (error) {
        toast({ title: "館別載入失敗", description: error.message, variant: "destructive" });
        setAccListLoading(false);
        return;
      }
      let list = (data ?? []) as AccommodationOption[];
      if (allowedAccommodationIds) {
        const allow = new Set(allowedAccommodationIds);
        list = list.filter((a) => allow.has(a.id));
      }
      setAccList(list);
      setSelectedAccId((prev) => {
        if (prev && list.some((a) => a.id === prev)) return prev;
        if (defaultAccommodationId && list.some((a) => a.id === defaultAccommodationId)) {
          return defaultAccommodationId;
        }
        return list[0]?.id ?? null;
      });
      setAccListLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultAccommodationId, allowedKey]);

  const [rows, setRows] = useState<QuotaRow[]>([]);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [mode, setMode] = useState<Mode>("shared");
  const [trackedIds, setTrackedIds] = useState<string[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);

  const [usageMap, setUsageMap] = useState<Record<string, number>>({});
  const [datesMap, setDatesMap] = useState<Record<string, { date: string; orderId: string }[]>>({});
  const [overrideOrderIds, setOverrideOrderIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [editing, setEditing] = useState<QuotaRow | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuotaRow | null>(null);
  const [form, setForm] = useState({
    year_month: format(new Date(), "yyyy-MM"),
    end_month: format(new Date(), "yyyy-MM"),
    quota: 5,
    note: "",
    package_id: SHARED_KEY as string,
  });

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<QuotaAuditLogRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const packageNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of packages) map[p.id] = p.name;
    return map;
  }, [packages]);

  const currentAccName = useMemo(
    () => accList.find((a) => a.id === selectedAccId)?.name ?? null,
    [accList, selectedAccId],
  );
  const isScoped = Array.isArray(allowedAccommodationIds);

  const openHistory = async () => {
    if (!currentAccommodationId) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistoryRows(await fetchKolQuotaAuditLogs(currentAccommodationId, 100));
    } catch (e) {
      setHistoryRows([]);
      setHistoryError((e as Error).message);
    } finally {
      setHistoryLoading(false);
    }
  };

  const audit = (
    actionType: "create" | "update" | "delete",
    yearMonth: string,
    scopeLabelText: string,
    changes: { field: string; label: string; before?: unknown; after?: unknown }[],
    quotaId?: string | null,
  ) => {
    if (!currentAccommodationId) return;
    void logKolQuotaChange({
      actionType,
      accommodationId: currentAccommodationId,
      accommodationName: currentAccName,
      yearMonth,
      scopeLabel: scopeLabelText,
      quotaId: quotaId ?? null,
      changes: changes as any,
    });
  };


  const load = async () => {
    if (!currentAccommodationId) {
      setRows([]);
      setPackages([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const [accRes, roomTypePkgRes, quotaRes] = await Promise.all([
      (supabase as any)
        .from("accommodation_info")
        .select("kol_quota_mode, kol_quota_tracked_package_ids")
        .eq("id", currentAccommodationId)
        .maybeSingle(),
      supabase
        .from("room_types")
        .select("id, name")
        .eq("accommodation_id", currentAccommodationId)
        .eq("is_exclusive_package", true)
        .order("display_order", { ascending: true }),
      supabase
        .from("kol_reciprocal_monthly_quotas")
        .select("id, year_month, quota, note, package_id")
        .eq("accommodation_id", currentAccommodationId)
        .order("year_month", { ascending: false }),
    ]);

    const loadedMode = ((accRes.data as any)?.kol_quota_mode as Mode) || "shared";
    const loadedTrackedIds = ((accRes.data as any)?.kol_quota_tracked_package_ids as string[]) || [];
    setMode(loadedMode);
    setTrackedIds(loadedTrackedIds);
    const mergedPackages: PackageOption[] = (((roomTypePkgRes.data as any[]) || []).map((p) => ({
      id: p.id,
      name: p.name,
      source: "room_type" as const,
    })));
    setPackages(mergedPackages);
    const list = ((quotaRes.data as any[]) || []) as QuotaRow[];
    setRows(list);

    const usage: Record<string, number> = {};
    const dates: Record<string, { date: string; orderId: string }[]> = {};
    const overrides = new Set<string>();
    if (list.length > 0) {
      const months = list.map((r) => r.year_month).sort();
      const minStart = `${months[0]}-01`;
      const [maxY, maxM] = months[months.length - 1].split("-").map(Number);
      const maxEnd = format(new Date(maxY, maxM, 1), "yyyy-MM-dd");
      // 以 security definer RPC 讀取，讓沒有訂單存取權的團隊角色（如 scout）也能看到使用量
      const { data: ordersData } = await (supabase as any).rpc("list_kol_reciprocal_orders", {
        _accommodation_id: currentAccommodationId,
        _start: minStart,
        _end: maxEnd,
      });
      const orderIds: string[] = [];
      for (const o of (ordersData ?? []) as any[]) {
        if (o.order_status === "cancelled") continue;
        const ym = (o.check_in_date as string).slice(0, 7);
        const packageIds = [o.package_id, o.room_type_id].filter(Boolean) as string[];
        const sharedKey = `${ym}::${SHARED_KEY}`;
        const trackedByThisOrder = packageIds.some((id) => loadedTrackedIds.includes(id));
        if (loadedMode !== "per_package" || !trackedByThisOrder) {
          usage[sharedKey] = (usage[sharedKey] ?? 0) + 1;
          (dates[sharedKey] ||= []).push({ date: o.check_in_date, orderId: o.id });
        }
        for (const packageId of packageIds) {
          const pkgKey = `${ym}::${packageId}`;
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
    const { error } = await (supabase as any).rpc("update_kol_quota_config", {
      p_accommodation_id: currentAccommodationId,
      p_mode: nextMode,
      p_tracked_ids: nextTracked,
    });
    setSavingConfig(false);
    if (error) {
      toast({ title: "設定失敗", description: error.message, variant: "destructive" });
      return;
    }
    setMode(nextMode);
    setTrackedIds(nextTracked);
    toast({ title: "已更新設定" });
    load();
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
      const scopeText = pkgId ? (packageNameById[pkgId] ?? "指定包棟") : "全館共用";
      for (const p of payloads) {
        let q = supabase
          .from("kol_reciprocal_monthly_quotas")
          .select("id, quota, note")
          .eq("accommodation_id", p.accommodation_id)
          .eq("year_month", p.year_month);
        q = p.package_id ? q.eq("package_id", p.package_id) : q.is("package_id", null);
        const { data: exist } = await q.maybeSingle();
        if (exist?.id) {
          await supabase
            .from("kol_reciprocal_monthly_quotas")
            .update({ quota: p.quota, note: p.note })
            .eq("id", exist.id);
          audit("update", p.year_month, scopeText, [
            { field: "quota", label: "額度上限", before: (exist as any).quota, after: p.quota },
            { field: "note", label: "備註", before: (exist as any).note, after: p.note },
          ], exist.id);
        } else {
          await supabase.from("kol_reciprocal_monthly_quotas").insert(p as any);
          audit("create", p.year_month, scopeText, [
            { field: "quota", label: "額度上限", before: null, after: p.quota },
            { field: "note", label: "備註", before: null, after: p.note },
          ]);
        }
      }
      toast({ title: `已批次設定 ${months.length} 個月份` });
      setDialogOpen(false);
      load();
      return;
    }

    const scopeText = pkgId ? (packageNameById[pkgId] ?? "指定包棟") : "全館共用";
    const nextQuota = Math.floor(form.quota);
    const nextNote = form.note.trim() || null;

    if (editing) {
      const { error } = await supabase
        .from("kol_reciprocal_monthly_quotas")
        .update({ quota: nextQuota, note: nextNote })
        .eq("id", editing.id);
      if (error) { toast({ title: "儲存失敗", description: error.message, variant: "destructive" }); return; }
      audit("update", editing.year_month, scopeLabel(editing), [
        { field: "quota", label: "額度上限", before: editing.quota, after: nextQuota },
        { field: "note", label: "備註", before: editing.note, after: nextNote },
      ], editing.id);
    } else {
      let q = supabase
        .from("kol_reciprocal_monthly_quotas")
        .select("id, quota, note")
        .eq("accommodation_id", currentAccommodationId)
        .eq("year_month", form.year_month);
      q = pkgId ? q.eq("package_id", pkgId) : q.is("package_id", null);
      const { data: exist } = await q.maybeSingle();
      if (exist?.id) {
        const { error } = await supabase
          .from("kol_reciprocal_monthly_quotas")
          .update({ quota: nextQuota, note: nextNote })
          .eq("id", exist.id);
        if (error) { toast({ title: "儲存失敗", description: error.message, variant: "destructive" }); return; }
        audit("update", form.year_month, scopeText, [
          { field: "quota", label: "額度上限", before: (exist as any).quota, after: nextQuota },
          { field: "note", label: "備註", before: (exist as any).note, after: nextNote },
        ], exist.id);
      } else {
        const { error } = await supabase
          .from("kol_reciprocal_monthly_quotas")
          .insert({
            accommodation_id: currentAccommodationId,
            year_month: form.year_month,
            quota: nextQuota,
            note: nextNote,
            package_id: pkgId,
          } as any);
        if (error) { toast({ title: "儲存失敗", description: error.message, variant: "destructive" }); return; }
        audit("create", form.year_month, scopeText, [
          { field: "quota", label: "額度上限", before: null, after: nextQuota },
          { field: "note", label: "備註", before: null, after: nextNote },
        ]);
      }
    }
    toast({ title: editing ? "已更新" : "已新增" });
    setDialogOpen(false);
    load();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const { error } = await supabase
      .from("kol_reciprocal_monthly_quotas")
      .delete()
      .eq("id", target.id);
    if (error) {
      toast({ title: "刪除失敗", description: error.message, variant: "destructive" });
      return;
    }
    audit("delete", target.year_month, scopeLabel(target), [
      { field: "quota", label: "額度上限", before: target.quota, after: null },
      { field: "note", label: "備註", before: target.note, after: null },
    ], target.id);
    toast({ title: "已刪除" });
    setDeleteTarget(null);
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
                  mode={mode}
                  trackedPackageIds={trackedIds}
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
        {editable && (
          <TableCell className="text-right w-24">
            <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(r)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </TableCell>
        )}
      </TableRow>
    );
  };

  const accSelector = (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Label className="text-sm shrink-0">管理館別</Label>
          <Select
            value={selectedAccId ?? undefined}
            onValueChange={(v) => setSelectedAccId(v)}
            disabled={accListLoading || accList.length === 0}
          >
            <SelectTrigger className="sm:max-w-xs">
              <SelectValue placeholder={accListLoading ? "載入中…" : "請選擇館別"} />
            </SelectTrigger>
            <SelectContent>
              {accList.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isScoped && (
          <div className="mt-3 rounded-md border bg-muted/40 p-3 space-y-2">
            <div className="flex items-start gap-2 text-sm">
              <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <div className="font-medium">你可編輯的館別範圍</div>
                <div className="text-xs text-muted-foreground">
                  依你的 AM 負責館別設定（am_managed_accommodation_ids）自動帶入，僅以下館別可檢視與編輯互惠額度。
                </div>
              </div>
            </div>
            {accListLoading ? (
              <div className="text-xs text-muted-foreground">載入中…</div>
            ) : accList.length === 0 ? (
              <div className="text-xs text-amber-600">尚未指派任何負責館別，請聯繫主管設定。</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {accList.map((a) => (
                  <Badge
                    key={a.id}
                    variant={a.id === selectedAccId ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setSelectedAccId(a.id)}
                  >
                    {a.name}
                    {a.id === selectedAccId ? "（目前選中）" : ""}
                  </Badge>
                ))}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              目前操作依據：<span className="text-foreground font-medium">{currentAccName ?? "未選擇"}</span>
              ；所有新增／修改／刪除都只會影響此館別，並會留下操作紀錄。
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );


  if (!currentAccommodationId) {
    return (
      <div className="space-y-4">
        {accSelector}
        <div className="p-6 text-center text-muted-foreground text-sm">
          {accListLoading ? "載入館別中…" : "請先選擇館別"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {accSelector}
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setCalOpen(true)}>
          <CalendarDays className="h-4 w-4 mr-2" />
          日曆檢視
        </Button>
        {editable ? (
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />新增月份額度
          </Button>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">唯讀</Badge>
        )}
      </div>

      {/* 額度模式卡片暫時隱藏（功能保留，設定沿用資料庫既有值） */}


      {/* 月份額度列表 */}
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">月份</TableHead>
                    <TableHead className="w-40">範圍</TableHead>
                    <TableHead className="w-16">上限</TableHead>
                    <TableHead className="w-40">目前使用量</TableHead>
                    <TableHead>已使用入住日</TableHead>
                    <TableHead className="w-48">備註</TableHead>
                    {editable && <TableHead className="text-right w-24">操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>{rows.map(renderRow)}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 新增/編輯 Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md overflow-x-hidden">
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

      {/* 刪除確認 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="overflow-x-hidden">
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除月份額度？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>將刪除 <strong>{deleteTarget.year_month}</strong>（
                {deleteTarget.package_id ? (packageNameById[deleteTarget.package_id] ?? "包棟") : "全館共用"}
                ）的額度設定，此動作無法復原。</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {currentAccommodationId && (
        <AvailabilityCalendarDialog
          open={calOpen}
          onOpenChange={setCalOpen}
          accommodationId={currentAccommodationId}
        />
      )}
    </div>
  );
}

interface UsedOrder {
  id: string;
  order_number: string | null;
  check_in_date: string;
  check_out_date: string | null;
  guest_name: string | null;
  package_id: string | null;
  room_type_id: string | null;
}

function UsedOrdersList({
  accommodationId, yearMonth, packageId, mode, trackedPackageIds, overrideOrderIds,
}: {
  accommodationId: string | null;
  yearMonth: string;
  packageId: string | null;
  mode: Mode;
  trackedPackageIds: string[];
  overrideOrderIds: Set<string>;
}) {
  const [list, setList] = useState<UsedOrder[] | null>(null);

  useEffect(() => {
    if (!accommodationId) return;
    const [y, m] = yearMonth.split("-").map(Number);
    const start = `${yearMonth}-01`;
    const end = format(new Date(y, m, 1), "yyyy-MM-dd");
    (async () => {
      const { data } = await (supabase as any).rpc("list_kol_reciprocal_orders", {
        _accommodation_id: accommodationId,
        _start: start,
        _end: end,
      });
      const filtered = ((data ?? []) as any[]).filter((o) => {
        if (o.order_status === "cancelled") return false;
        if (packageId) return o.package_id === packageId || o.room_type_id === packageId;
        if (mode === "per_package") {
          return !trackedPackageIds.some((id) => o.package_id === id || o.room_type_id === id);
        }
        return true;
      });
      setList(filtered);
    })();
  }, [accommodationId, yearMonth, packageId, mode, trackedPackageIds]);

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
