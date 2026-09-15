/**
 * /admin/line-butler — LINE 管家監看
 * 對話 sessions、來自 LINE 的訂單、今日統計。
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface SessionRow {
  id: string;
  line_user_id: string;
  member_user_id: string | null;
  display_name: string | null;
  last_intent: string | null;
  updated_at: string;
}

interface LineOrderRow {
  order_id: string;
  line_user_id: string | null;
  orders: { order_number: string; guest_name: string; final_price: number; created_at: string } | null;
}

const INTENT_LABEL: Record<string, string> = {
  greeting: "打招呼",
  search_rooms: "找房",
  addon: "加購",
  favorites: "收藏",
  checkout: "結帳",
  pick_room: "選房",
  unknown: "其他",
};

export default function LineButler() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [orders, setOrders] = useState<LineOrderRow[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: o }] = await Promise.all([
        supabase
          .from("line_sessions")
          .select("id, line_user_id, member_user_id, display_name, last_intent, updated_at")
          .order("updated_at", { ascending: false })
          .limit(100),
        supabase
          .from("order_meta")
          .select("order_id, line_user_id, orders!inner(order_number, guest_name, final_price, created_at)")
          .not("line_user_id", "is", null)
          .limit(100),
      ]);
      setSessions((s as SessionRow[]) ?? []);
      setOrders((o as unknown as LineOrderRow[]) ?? []);
    })();
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const todaySessions = sessions.filter((s) => s.updated_at?.slice(0, 10) === today).length;
  const todayOrders = orders.filter((o) => o.orders?.created_at?.slice(0, 10) === today).length;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold text-foreground">LINE AI 管家監看</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">今日對話數</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">{todaySessions}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">今日成單數</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">{todayOrders}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">累計對話用戶</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">{sessions.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-sm">LINE 來源訂單</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold tabular-nums">{orders.length}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">對話 Sessions</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="fixed-table">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">LINE 用戶</TableHead>
                <TableHead className="whitespace-nowrap">綁定會員</TableHead>
                <TableHead className="whitespace-nowrap">最後意圖</TableHead>
                <TableHead className="whitespace-nowrap">更新時間</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {s.display_name ?? `${s.line_user_id.slice(0, 10)}…`}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {s.member_user_id ? <Badge variant="secondary">已綁定</Badge> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{INTENT_LABEL[s.last_intent ?? ""] ?? s.last_intent ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {new Date(s.updated_at).toLocaleString("zh-TW")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">來自 LINE 的訂單</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="fixed-table">
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">訂單編號</TableHead>
                <TableHead className="whitespace-nowrap">訂房人</TableHead>
                <TableHead className="whitespace-nowrap">金額</TableHead>
                <TableHead className="whitespace-nowrap">建立時間</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.order_id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{o.orders?.order_number}</TableCell>
                  <TableCell className="whitespace-nowrap">{o.orders?.guest_name}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    NT$ {Number(o.orders?.final_price ?? 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {o.orders?.created_at ? new Date(o.orders.created_at).toLocaleString("zh-TW") : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
