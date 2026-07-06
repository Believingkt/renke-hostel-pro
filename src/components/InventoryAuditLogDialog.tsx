import { useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { History, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { getChangeSourceBadge, CHANGE_SOURCE_LABEL } from "@/utils/inventoryChangeSource";

interface AuditRow {
  id: string;
  room_type_id: string;
  date: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_available_rooms: number | null;
  new_available_rooms: number | null;
  old_price: number | null;
  new_price: number | null;
  old_is_available: boolean | null;
  new_is_available: boolean | null;
  changed_by: string | null;
  changed_by_email: string | null;
  changed_at: string;
  pricing_template_id: string | null;
  change_source: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accommodationId: string;
  roomTypes: { id: string; name: string }[];
  templates?: { id: string; project_name: string | null; template_name: string }[];
}

const actionLabel: Record<string, { text: string; cls: string }> = {
  INSERT: { text: "新增", cls: "bg-green-500/15 text-green-700 dark:text-green-400" },
  UPDATE: { text: "修改", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  DELETE: { text: "刪除", cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

const diff = (oldV: any, newV: any) => {
  if (oldV === null && newV === null) return null;
  if (oldV === newV) return null;
  return { oldV, newV };
};

const PAGE_SIZE = 100;

const isoDate = (d: Date) => format(d, "yyyy-MM-dd");

export function InventoryAuditLogDialog({ open, onOpenChange, accommodationId, roomTypes, templates = [] }: Props) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [roomTypeFilter, setRoomTypeFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  // 預設抓最近 30 天（依「變更時間」）
  const [changedFrom, setChangedFrom] = useState(isoDate(subDays(new Date(), 30)));
  const [changedTo, setChangedTo] = useState(isoDate(new Date()));
  const [page, setPage] = useState(0);
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({});

  const roomTypeMap = useMemo(
    () => Object.fromEntries(roomTypes.map(r => [r.id, r.name])),
    [roomTypes]
  );
  const templateMap = useMemo(
    () => Object.fromEntries(templates.map(t => [t.id, t.project_name || t.template_name])),
    [templates]
  );

  const fetchLog = async () => {
    if (!accommodationId) return;
    setLoading(true);
    try {
      let q = (supabase as any)
        .from("room_inventory_audit_log")
        .select("*", { count: "exact" })
        .eq("accommodation_id", accommodationId)
        .order("changed_at", { ascending: false });

      if (roomTypeFilter !== "all") q = q.eq("room_type_id", roomTypeFilter);
      if (sourceFilter !== "all") {
        if (sourceFilter === "__null__") q = q.is("change_source", null);
        else q = q.eq("change_source", sourceFilter);
      }
      if (actionFilter !== "all") q = q.eq("action", actionFilter);
      if (changedFrom) q = q.gte("changed_at", `${changedFrom}T00:00:00`);
      if (changedTo) q = q.lte("changed_at", `${changedTo}T23:59:59.999`);

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      q = q.range(from, to);

      const { data, error, count } = await q;
      if (error) throw error;
      const list = (data as AuditRow[]) || [];
      setRows(list);
      setTotalCount(count || 0);

      const uids = Array.from(new Set(list.map(r => r.changed_by).filter(Boolean))) as string[];
      const missing = uids.filter(u => !(u in userNameMap));
      if (missing.length) {
        const [profRes, teamRes] = await Promise.all([
          supabase.from("profiles").select("id, name").in("id", missing),
          (supabase as any).from("team_member_profiles").select("user_id, display_name").in("user_id", missing),
        ]);
        setUserNameMap(prev => {
          const next = { ...prev };
          (profRes.data || []).forEach((p: any) => { if (p.name) next[p.id] = p.name; });
          (teamRes.data || []).forEach((t: any) => {
            if (t.display_name && !next[t.user_id]) next[t.user_id] = t.display_name;
          });
          return next;
        });
      }
    } catch (e: any) {
      toast.error("讀取變更紀錄失敗：" + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accommodationId, roomTypeFilter, sourceFilter, actionFilter, changedFrom, changedTo, page]);

  // 篩選條件變更時，回到第一頁
  useEffect(() => {
    setPage(0);
  }, [roomTypeFilter, sourceFilter, actionFilter, changedFrom, changedTo]);

  const resetFilters = () => {
    setRoomTypeFilter("all");
    setSourceFilter("all");
    setActionFilter("all");
    setChangedFrom(isoDate(subDays(new Date(), 30)));
    setChangedTo(isoDate(new Date()));
    setPage(0);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            庫存變更紀錄
          </DialogTitle>
          <DialogDescription>
            追蹤每日房型可售數、價格、販售狀態的歷次變更與操作人員。預設顯示最近 30 天，可調整日期範圍。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3 py-2 border-b">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">房型</span>
            <Select value={roomTypeFilter} onValueChange={setRoomTypeFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部房型</SelectItem>
                {roomTypes.map(rt => (
                  <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">來源</span>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部來源</SelectItem>
                {Object.entries(CHANGE_SOURCE_LABEL).map(([key, v]) => (
                  <SelectItem key={key} value={key}>{v.text}</SelectItem>
                ))}
                <SelectItem value="__null__">未指定 / 早期</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">動作</span>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="INSERT">新增</SelectItem>
                <SelectItem value="UPDATE">修改</SelectItem>
                <SelectItem value="DELETE">刪除</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">變更日期起</span>
            <Input type="date" value={changedFrom} onChange={e => setChangedFrom(e.target.value)} className="w-[150px]" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">變更日期迄</span>
            <Input type="date" value={changedTo} onChange={e => setChangedTo(e.target.value)} className="w-[150px]" />
          </div>
          <Button variant="ghost" size="sm" onClick={resetFilters} className="text-muted-foreground">
            重設
          </Button>
          <Button variant="outline" size="sm" onClick={fetchLog} disabled={loading} className="gap-1.5">
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            重新整理
          </Button>
          <div className="ml-auto text-sm text-muted-foreground tabular-nums">
            共 <span className="font-medium text-foreground">{totalCount}</span> 筆
          </div>
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b z-10">
              <tr className="text-left">
                <th className="py-2 pr-3 font-medium whitespace-nowrap">變更時間</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">操作人</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">來源</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">房型 / 專案</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">套用日期</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">動作</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap text-right">可售數</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap text-right">售價</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">販售狀態</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">此範圍內無紀錄</td></tr>
              )}
              {rows.map((r, i) => {
                const action = actionLabel[r.action];
                const availDiff = diff(r.old_available_rooms, r.new_available_rooms);
                const priceDiff = diff(r.old_price, r.new_price);
                const onDiff = diff(r.old_is_available, r.new_is_available);
                const operator = (r.changed_by && userNameMap[r.changed_by]) || r.changed_by_email ||
                  (r.changed_by ? r.changed_by.slice(0, 8) : null);
                return (
                  <tr key={r.id} className={`border-b hover:bg-muted/40 ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-muted-foreground">
                      {format(new Date(r.changed_at), "yyyy-MM-dd HH:mm:ss")}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {operator ? (
                        <span>{operator}</span>
                      ) : (
                        <span className="text-muted-foreground italic">系統</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {(() => {
                        const s = getChangeSourceBadge(r.change_source);
                        return <Badge variant="secondary" className={s.cls}>{s.text}</Badge>;
                      })()}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <div>{roomTypeMap[r.room_type_id] || r.room_type_id.slice(0, 8)}</div>
                      {r.pricing_template_id && (
                        <div className="text-xs text-muted-foreground">
                          {templateMap[r.pricing_template_id] || "(專案)"}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{r.date}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <Badge variant="secondary" className={action.cls}>{action.text}</Badge>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-right">
                      {r.action === "INSERT" ? (
                        <span className="text-green-700 dark:text-green-400">+ {r.new_available_rooms}</span>
                      ) : r.action === "DELETE" ? (
                        <span className="text-red-700 dark:text-red-400">- {r.old_available_rooms}</span>
                      ) : availDiff ? (
                        <span className={
                          (availDiff.newV ?? 0) > (availDiff.oldV ?? 0)
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-rose-700 dark:text-rose-400"
                        }>
                          {availDiff.oldV ?? "—"} <span className="text-muted-foreground">→</span>{" "}
                          <span className="font-medium">{availDiff.newV ?? "—"}</span>
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums text-right">
                      {r.action === "INSERT" ? (
                        <span>{r.new_price?.toLocaleString()}</span>
                      ) : r.action === "DELETE" ? (
                        <span className="text-muted-foreground">{r.old_price?.toLocaleString()}</span>
                      ) : priceDiff ? (
                        <span className={
                          (priceDiff.newV ?? 0) > (priceDiff.oldV ?? 0)
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-rose-700 dark:text-rose-400"
                        }>
                          {priceDiff.oldV?.toLocaleString() ?? "—"} <span className="text-muted-foreground">→</span>{" "}
                          <span className="font-medium">{priceDiff.newV?.toLocaleString() ?? "—"}</span>
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {onDiff ? (
                        <span>
                          <span className={onDiff.oldV ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}>
                            {onDiff.oldV ? "開放" : "關閉"}
                          </span>{" "}
                          <span className="text-muted-foreground">→</span>{" "}
                          <span className={`font-medium ${onDiff.newV ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                            {onDiff.newV ? "開放" : "關閉"}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {r.action === "INSERT" ? (r.new_is_available ? "開放" : "關閉") : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>

        {totalCount > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t pt-3">
            <div className="text-xs text-muted-foreground tabular-nums">
              第 {page + 1} / {totalPages} 頁 · 每頁 {PAGE_SIZE} 筆
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
              >
                <ChevronLeft className="h-4 w-4" />
                上一頁
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loading}
              >
                下一頁
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
