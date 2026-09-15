import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Headset, RefreshCw, ExternalLink } from "lucide-react";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { useAliasPrefix } from "@/hooks/use-alias-prefix";

interface TaskRow {
  id: string;
  order_id: string;
  task_type: string;
  reason_code: string | null;
  requested_guest_count: number | null;
  requested_check_in: string | null;
  requested_check_out: string | null;
  requester_note: string | null;
  status: string;
  resolution_note: string | null;
  resolved_amount: number | null;
  resolved_at: string | null;
  created_at: string;
  orders?: {
    order_number: string;
    guest_name: string | null;
    check_in_date: string;
    check_out_date: string;
    guest_count: number | null;
    final_price: number;
  } | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "待處理",
  in_progress: "處理中",
  resolved: "已完成",
  dismissed: "無需處理",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "destructive",
  in_progress: "default",
  resolved: "secondary",
  dismissed: "outline",
};

const typeLabel = (t: string) =>
  t === "date_change_request"
    ? "申請改期"
    : t === "refund_failed"
      ? "退款待處理"
      : "變更人數需重新計價";

const fmtDate = (v: string | null) => (v ? v.slice(0, 10) : "-");

export default function ManualReviewTasks() {
  const { currentAccommodationId } = useAccommodation();
  const { withPrefix } = useAliasPrefix();
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [keyword, setKeyword] = useState("");

  const load = useCallback(async () => {
    if (!currentAccommodationId) return;
    setLoading(true);
    const { data } = await supabase
      .from("order_manual_review_tasks")
      .select(
        "*, orders(order_number, guest_name, check_in_date, check_out_date, guest_count, final_price)",
      )
      .eq("accommodation_id", currentAccommodationId)
      .order("created_at", { ascending: false })
      .limit(300);
    setRows((data ?? []) as unknown as TaskRow[]);
    setLoading(false);
  }, [currentAccommodationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === "open" && !["pending", "in_progress"].includes(r.status)) return false;
      if (statusFilter !== "open" && statusFilter !== "all" && r.status !== statusFilter) return false;
      if (typeFilter !== "all" && r.task_type !== typeFilter) return false;
      if (kw) {
        const hay = `${r.orders?.order_number ?? ""} ${r.orders?.guest_name ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, typeFilter, keyword]);

  const pendingCount = rows.filter((r) => ["pending", "in_progress"].includes(r.status)).length;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="客服待辦"
        description="客人於會員中心送出的改期／人數變更申請，需人工確認金額後處理"
        icon={Headset}
        breadcrumbs={[{ label: "訂單資訊" }]}
        action={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            重新整理
          </Button>
        }
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <CardTitle className="text-base">
            待辦清單
            {pendingCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                未結案 {pendingCount}
              </Badge>
            )}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="搜尋訂單編號／姓名"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-52"
            />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部類型</SelectItem>
                <SelectItem value="date_change_request">申請改期</SelectItem>
                <SelectItem value="guest_count_repricing">變更人數</SelectItem>
                <SelectItem value="refund_failed">退款待處理</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">未結案</SelectItem>
                <SelectItem value="pending">待處理</SelectItem>
                <SelectItem value="in_progress">處理中</SelectItem>
                <SelectItem value="resolved">已完成</SelectItem>
                <SelectItem value="dismissed">無需處理</SelectItem>
                <SelectItem value="all">全部</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32 whitespace-nowrap">訂單編號</TableHead>
                  <TableHead className="w-28 whitespace-nowrap">訂房人</TableHead>
                  <TableHead className="w-40 whitespace-nowrap">類型</TableHead>
                  <TableHead className="w-56 whitespace-nowrap">申請內容</TableHead>
                  <TableHead className="w-44 whitespace-nowrap">原訂單</TableHead>
                  <TableHead className="w-24 whitespace-nowrap">狀態</TableHead>
                  <TableHead className="w-32 whitespace-nowrap">建立時間</TableHead>
                  <TableHead className="w-24 whitespace-nowrap text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                      目前沒有符合條件的客服待辦
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {r.orders?.order_number ?? "-"}
                      </TableCell>
                      <TableCell className="truncate">{r.orders?.guest_name ?? "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">{typeLabel(r.task_type)}</TableCell>
                      <TableCell className="text-sm">
                        {r.task_type === "date_change_request"
                          ? `${fmtDate(r.requested_check_in)} ~ ${fmtDate(r.requested_check_out)}`
                          : r.task_type === "refund_failed"
                            ? "取消退款"
                            : `${r.requested_guest_count ?? "-"} 人`}
                        {r.requester_note && (
                          <div className="text-xs text-muted-foreground truncate">
                            {r.requester_note}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {fmtDate(r.orders?.check_in_date ?? null)} ~{" "}
                        {fmtDate(r.orders?.check_out_date ?? null)}
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {r.orders?.guest_count ?? "-"} 人 / NT$
                          {Math.round(Number(r.orders?.final_price ?? 0)).toLocaleString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap tabular-nums">
                        {new Date(r.created_at).toLocaleDateString("zh-TW")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link to={withPrefix(`/admin/orders/${r.order_id}`)}>
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            處理
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
