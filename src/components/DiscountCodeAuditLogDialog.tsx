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
import { History, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";

interface AuditRow {
  id: string;
  discount_code_id: string | null;
  accommodation_id: string;
  code: string | null;
  name: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  changes: Record<string, { old: any; new: any }>;
  changed_by: string | null;
  changed_by_email: string | null;
  changed_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accommodationId: string;
}

const actionLabel: Record<string, { text: string; cls: string }> = {
  INSERT: { text: "新增", cls: "bg-green-500/15 text-green-700 dark:text-green-400" },
  UPDATE: { text: "修改", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  DELETE: { text: "刪除", cls: "bg-red-500/15 text-red-700 dark:text-red-400" },
};

const FIELD_LABELS: Record<string, string> = {
  name: "名稱",
  code: "折扣碼",
  discount_type: "折扣類型",
  discount_value: "折扣值",
  usage_limit: "使用上限",
  valid_from: "生效起",
  valid_until: "生效迄",
  is_active: "啟用狀態",
  min_order_amount: "最低消費",
  applicable_room_types: "適用房型",
  applicable_date_from: "可用日期起",
  applicable_date_to: "可用日期迄",
  display_order: "排序",
  commission_rate: "分潤 %",
};

const formatVal = (v: any): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "啟用" : "停用";
  if (Array.isArray(v)) return v.length === 0 ? "（無）" : `${v.length} 項`;
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    try { return format(new Date(v), "yyyy-MM-dd HH:mm"); } catch { return String(v); }
  }
  return String(v);
};

export function DiscountCodeAuditLogDialog({ open, onOpenChange, accommodationId }: Props) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [userNameMap, setUserNameMap] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchLog = async () => {
    if (!accommodationId) return;
    setLoading(true);
    try {
      let q = (supabase as any)
        .from("discount_code_audit_log")
        .select("*")
        .eq("accommodation_id", accommodationId)
        .order("changed_at", { ascending: false })
        .limit(500);
      if (actionFilter !== "all") q = q.eq("action", actionFilter);
      if (dateFrom) q = q.gte("changed_at", `${dateFrom}T00:00:00`);
      if (dateTo) q = q.lte("changed_at", `${dateTo}T23:59:59`);
      const { data, error } = await q;
      if (error) throw error;
      const list = (data as AuditRow[]) || [];
      setRows(list);

      const uids = Array.from(new Set(list.map(r => r.changed_by).filter(Boolean))) as string[];
      const missing = uids.filter(u => !(u in userNameMap));
      if (missing.length) {
        const { data: profs } = await supabase.from("profiles").select("id, name").in("id", missing);
        if (profs) {
          setUserNameMap(prev => {
            const next = { ...prev };
            profs.forEach((p: any) => { next[p.id] = p.name; });
            return next;
          });
        }
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
  }, [open, accommodationId, actionFilter, dateFrom, dateTo]);

  const filteredRows = useMemo(() => {
    if (!keyword.trim()) return rows;
    const kw = keyword.trim().toLowerCase();
    return rows.filter(r =>
      (r.code || "").toLowerCase().includes(kw) ||
      (r.name || "").toLowerCase().includes(kw)
    );
  }, [rows, keyword]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            折扣碼變更紀錄
          </DialogTitle>
          <DialogDescription>
            追蹤每筆網紅折扣碼的新增、修改、刪除歷次操作（最近 500 筆）。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3 py-2 border-b">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">動作</span>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="INSERT">新增</SelectItem>
                <SelectItem value="UPDATE">修改</SelectItem>
                <SelectItem value="DELETE">刪除</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">搜尋折扣碼／名稱</span>
            <Input value={keyword} onChange={e => setKeyword(e.target.value)} className="w-[200px]" placeholder="關鍵字" />
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
          <div className="ml-auto text-sm text-muted-foreground">共 {filteredRows.length} 筆</div>
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b z-10">
              <tr className="text-left">
                <th className="py-2 pr-3 font-medium whitespace-nowrap w-8"></th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">變更時間</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">操作人</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">動作</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">折扣碼</th>
                <th className="py-2 pr-3 font-medium whitespace-nowrap">名稱</th>
                <th className="py-2 pr-3 font-medium">變更欄位</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && !loading && (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">無紀錄</td></tr>
              )}
              {filteredRows.map(r => {
                const action = actionLabel[r.action];
                const fieldKeys = Object.keys(r.changes || {});
                const isOpen = !!expanded[r.id];
                return (
                  <>
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 pr-1">
                        {fieldKeys.length > 0 && (
                          <button onClick={() => setExpanded(p => ({ ...p, [r.id]: !p[r.id] }))} className="text-muted-foreground">
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        )}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                        {format(new Date(r.changed_at), "yyyy-MM-dd HH:mm:ss")}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {(r.changed_by && userNameMap[r.changed_by]) || r.changed_by_email || (r.changed_by ? r.changed_by.slice(0, 8) : "系統")}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <Badge variant="secondary" className={action.cls}>{action.text}</Badge>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap font-mono text-xs">{r.code || "—"}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{r.name || "—"}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {fieldKeys.length > 0
                          ? fieldKeys.map(k => FIELD_LABELS[k] || k).join("、")
                          : "—"}
                      </td>
                    </tr>
                    {isOpen && fieldKeys.length > 0 && (
                      <tr key={r.id + "-detail"} className="border-b bg-muted/20">
                        <td></td>
                        <td colSpan={6} className="py-3 pr-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {fieldKeys.map(k => {
                              const { old: o, new: n } = r.changes[k];
                              return (
                                <div key={k} className="rounded border bg-background p-2 text-xs">
                                  <div className="font-medium mb-1">{FIELD_LABELS[k] || k}</div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground line-through">{formatVal(o)}</span>
                                    <span className="text-muted-foreground">→</span>
                                    <span className="font-medium">{formatVal(n)}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
