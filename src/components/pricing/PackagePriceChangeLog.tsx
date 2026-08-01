import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { History } from "lucide-react";

interface LogRow {
  id: string;
  package_id: string;
  date: string;
  action: "create" | "update" | "delete";
  old_sale_price: number | null;
  new_sale_price: number | null;
  changed_by: string | null;
  created_at: string;
}

const ACTION_LABEL: Record<LogRow["action"], string> = {
  create: "新增指定價",
  update: "修改指定價",
  delete: "清除指定價",
};

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : `NT$ ${Number(n).toLocaleString("zh-TW")}`;

interface Props {
  accommodationId: string;
  packageNames: Record<string, string>;
}

export function PackagePriceChangeLog({ accommodationId, packageNames }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("package_date_price_logs")
      .select("id, package_id, date, action, old_sale_price, new_sale_price, changed_by, created_at")
      .eq("accommodation_id", accommodationId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) {
      setLoading(false);
      return;
    }
    const list = (data || []) as LogRow[];
    setRows(list);
    const ids = Array.from(new Set(list.map((r) => r.changed_by).filter(Boolean))) as string[];
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", ids);
      const map: Record<string, string> = {};
      (profs || []).forEach((p: any) => {
        map[p.id] = p.name || p.email || p.id.slice(0, 8);
      });
      setUsers(map);
    }
    setLoading(false);
  }, [accommodationId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <History className="h-4 w-4 mr-2" />
        變更紀錄
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>價格變更紀錄</DialogTitle>
            <DialogDescription>
              記錄每一次「單日指定價」的新增、修改與清除，含操作者與改前／改後金額（最近 300 筆）。
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">載入中…</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">尚無變更紀錄</p>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <table className="w-full text-sm tabular-nums">
                <thead className="sticky top-0 bg-background">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 whitespace-nowrap">操作時間</th>
                    <th className="py-2 pr-3 whitespace-nowrap">操作者</th>
                    <th className="py-2 pr-3 whitespace-nowrap">方案</th>
                    <th className="py-2 pr-3 whitespace-nowrap">入住日期</th>
                    <th className="py-2 pr-3 whitespace-nowrap">動作</th>
                    <th className="py-2 pr-3 whitespace-nowrap">改前</th>
                    <th className="py-2 whitespace-nowrap">改後</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                        {format(new Date(r.created_at), "yyyy/MM/dd HH:mm")}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {r.changed_by ? users[r.changed_by] || "—" : "系統"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {packageNames[r.package_id] || "（已刪除方案）"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">{r.date}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <Badge
                          variant={
                            r.action === "delete"
                              ? "destructive"
                              : r.action === "create"
                                ? "default"
                                : "secondary"
                          }
                        >
                          {ACTION_LABEL[r.action]}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                        {fmt(r.old_sale_price)}
                      </td>
                      <td className="py-2 whitespace-nowrap font-medium">
                        {fmt(r.new_sale_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
