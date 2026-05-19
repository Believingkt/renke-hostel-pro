import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface RawEmail {
  id: string;
  received_at: string;
  from_email: string | null;
  from_domain: string | null;
  subject: string | null;
  message_type: string | null;
  obe_number: string | null;
  accommodation_name: string | null;
  status: string;
  notes: string | null;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  parsed: "default",
  received: "secondary",
  matched: "default",
  ignored: "outline",
  failed: "destructive",
};

const TYPE_LABEL: Record<string, string> = {
  new_order: "新訂單",
  modified: "修改",
  cancelled: "取消",
  unknown: "未知",
};

export default function OwlTingEmailIngest() {
  const [rows, setRows] = useState<RawEmail[]>([]);
  const [stats, setStats] = useState({ total: 0, failed: 0, ignored: 0, parsed: 0 });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: list }, { count: total }, { count: failed }, { count: ignored }, { count: parsed }] =
      await Promise.all([
        supabase
          .from("owlting_email_orders_raw")
          .select("id,received_at,from_email,from_domain,subject,message_type,obe_number,accommodation_name,status,notes")
          .order("received_at", { ascending: false })
          .limit(50),
        supabase.from("owlting_email_orders_raw").select("*", { count: "exact", head: true }),
        supabase.from("owlting_email_parse_failures").select("*", { count: "exact", head: true }).eq("resolved", false),
        supabase.from("owlting_email_orders_raw").select("*", { count: "exact", head: true }).eq("status", "ignored"),
        supabase.from("owlting_email_orders_raw").select("*", { count: "exact", head: true }).eq("status", "parsed"),
      ]);
    setRows((list as RawEmail[]) ?? []);
    setStats({ total: total ?? 0, failed: failed ?? 0, ignored: ignored ?? 0, parsed: parsed ?? 0 });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        title="OwlTing Email 收件監控"
        description="SendGrid Inbound Parse 送進來的奧丁丁訂單通知 email"
        action={<Button variant="outline" onClick={load} disabled={loading}>重新整理</Button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">總收件數</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{stats.total}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">成功解析</CardTitle></CardHeader><CardContent className="text-2xl font-bold text-primary">{stats.parsed}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">隔離區(未處理)</CardTitle></CardHeader><CardContent className="text-2xl font-bold text-destructive">{stats.failed}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">已忽略(非信任來源)</CardTitle></CardHeader><CardContent className="text-2xl font-bold text-muted-foreground">{stats.ignored}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>最近 50 筆 Email</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>時間</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>類型</TableHead>
                <TableHead>OBE</TableHead>
                <TableHead>來源</TableHead>
                <TableHead>主旨</TableHead>
                <TableHead>備註</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {format(new Date(r.received_at), "MM/dd HH:mm:ss")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status] ?? "secondary"}>{r.status}</Badge>
                  </TableCell>
                  <TableCell>{r.message_type ? TYPE_LABEL[r.message_type] ?? r.message_type : "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.obe_number ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.from_domain ?? r.from_email ?? "—"}</TableCell>
                  <TableCell className="max-w-[360px] truncate text-xs" title={r.subject ?? ""}>{r.subject ?? "—"}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground" title={r.notes ?? ""}>{r.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">尚無收件記錄</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
