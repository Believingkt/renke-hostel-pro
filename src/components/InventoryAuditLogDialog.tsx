import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { History, RefreshCw } from "lucide-react";

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

export function InventoryAuditLogDialog({ open, onOpenChange, accommodationId, roomTypes, templates = [] }: Props) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [roomTypeFilter, setRoomTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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
        .select("*")
        .eq("accommodation_id", accommodationId)
        .order("changed_at", { ascending: false })
        .limit(500);

      if (roomTypeFilter !== "all") q = q.eq("room_type_id", roomTypeFilter);
      if (dateFrom) q = q.gte("date", dateFrom);
      if (dateTo) q = q.lte("date", dateTo);

      const { data, error } = await q;
      if (error) throw error;
      setRows((data as AuditRow[]) || []);
    } catch (e: any) {
      toast.error("讀取變更紀錄失敗：" + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchLog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accommodationId, roomTypeFilter, dateFrom, dateTo]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            庫存變更紀錄
          </DialogTitle>
          <DialogDescription>
            追蹤每日房型可售數、價格、販售狀態的歷次變更與操作人員（最近 500 筆）。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3 py-2 border-b">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">房型</span>
            <Select value={roomTypeFilter} onValueChange={setRoomTypeFilter}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部房型</SelectItem>
                {roomTypes.map(rt => (
                  <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">日期起</span>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-[160px]" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">日期迄</span>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-[160px]" />
          </div>
          <Button variant="outline" size="sm" onClick={fetchLog} disabled={loading} className="gap-1.5">
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            重新整理
          </Button>
          <div className="ml-auto text-sm text-muted-foreground">共 {rows.length} 筆</div>
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b z-10">
              <tr className="text-left">
                <th className="py-2 pr-3 font-medium whitespace-nowrap">變更時間</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">操作人</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">房型 / 專案</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">套用日期</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">動作</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">可售數</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">售價</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">販售狀態</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">無紀錄</td></tr>
              )}
              {rows.map(r => {
                const action = actionLabel[r.action];
                const availDiff = diff(r.old_available_rooms, r.new_available_rooms);
                const priceDiff = diff(r.old_price, r.new_price);
                const onDiff = diff(r.old_is_available, r.new_is_available);
                return (
                  <tr key={r.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                      {format(new Date(r.changed_at), "yyyy-MM-dd HH:mm:ss")}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {r.changed_by_email || (r.changed_by ? r.changed_by.slice(0, 8) : "系統")}
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
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                      {r.action === "INSERT" ? (
                        <span className="text-green-700 dark:text-green-400">+ {r.new_available_rooms}</span>
                      ) : r.action === "DELETE" ? (
                        <span className="text-red-700 dark:text-red-400">- {r.old_available_rooms}</span>
                      ) : availDiff ? (
                        <span>
                          {availDiff.oldV ?? "-"} <span className="text-muted-foreground">→</span>{" "}
                          <span className="font-medium">{availDiff.newV ?? "-"}</span>
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                      {r.action === "INSERT" ? (
                        <span>{r.new_price?.toLocaleString()}</span>
                      ) : r.action === "DELETE" ? (
                        <span className="text-muted-foreground">{r.old_price?.toLocaleString()}</span>
                      ) : priceDiff ? (
                        <span>
                          {priceDiff.oldV?.toLocaleString() ?? "-"} <span className="text-muted-foreground">→</span>{" "}
                          <span className="font-medium">{priceDiff.newV?.toLocaleString() ?? "-"}</span>
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {onDiff ? (
                        <span>
                          {onDiff.oldV ? "開放" : "關閉"} <span className="text-muted-foreground">→</span>{" "}
                          <span className="font-medium">{onDiff.newV ? "開放" : "關閉"}</span>
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
      </DialogContent>
    </Dialog>
  );
}
