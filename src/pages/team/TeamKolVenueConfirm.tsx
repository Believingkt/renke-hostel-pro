import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ExternalLink, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useTeam } from "@/components/team/TeamContext";

interface Row {
  id: string;
  name: string | null;
  venue_name: string | null;
  cid_code: string | null;
  order_number: string | null;
  check_in_date: string | null;
  kol_direct_ticket_link: string | null;
  cid_configured: boolean | null;
}

export default function TeamKolVenueConfirm() {
  const { roles } = useTeam();
  const allowed =
    roles.includes("super_admin") ||
    roles.includes("admin") ||
    roles.includes("venue_manager");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [linkDialog, setLinkDialog] = useState<{ id: string; value: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("kol_profiles")
      .select(
        "id, kol_name, venue_name, cid_code, order_number, check_in_date, kol_direct_ticket_link, cid_configured",
      )
      .not("cid_code", "is", null)
      .not("order_number", "is", null)
      .neq("cid_code", "")
      .neq("order_number", "")
      .order("check_in_date", { ascending: false });
    if (error) {
      console.error(error);
      toast.error("載入失敗");
    } else {
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (allowed) fetchRows();
  }, [allowed]);

  const pending = useMemo(() => rows.filter((r) => !r.cid_configured), [rows]);
  const done = useMemo(() => rows.filter((r) => r.cid_configured), [rows]);

  if (!allowed) return <Navigate to="/team" replace />;

  const confirmConfigured = async (id: string, next: boolean) => {
    const { error } = await supabase
      .from("kol_profiles")
      .update({ cid_configured: next })
      .eq("id", id);
    if (error) {
      toast.error("操作失敗：" + error.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, cid_configured: next } : r)));
    toast.success(next ? "已確認設定完成" : "已取消確認");
  };

  const saveLink = async () => {
    if (!linkDialog) return;
    const url = linkDialog.value.trim();
    if (!url) {
      toast.error("請輸入網址");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("kol_profiles")
      .update({ kol_direct_ticket_link: url })
      .eq("id", linkDialog.id);
    setSaving(false);
    if (error) {
      toast.error("儲存失敗：" + error.message);
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.id === linkDialog.id ? { ...r, kol_direct_ticket_link: url } : r)),
    );
    toast.success("已儲存購票連結");
    setLinkDialog(null);
  };

  const renderTable = (data: Row[], mode: "pending" | "done") => (
    <div className="overflow-x-auto">
      <Table className="fixed-table">
        <TableHeader>
          <TableRow>
            <TableHead>KOL名稱</TableHead>
            <TableHead>館別</TableHead>
            <TableHead>折扣碼 / CID</TableHead>
            <TableHead>訂單編號</TableHead>
            <TableHead>入住日期</TableHead>
            <TableHead>KOL購票連結</TableHead>
            <TableHead>設定狀態</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                {mode === "pending" ? "目前沒有待設定的折扣碼" : "尚無已完成紀錄"}
              </TableCell>
            </TableRow>
          ) : (
            data.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{r.kol_name || "—"}</TableCell>
                <TableCell className="whitespace-nowrap">{r.venue_name || "—"}</TableCell>
                <TableCell className="whitespace-nowrap font-mono">{r.cid_code}</TableCell>
                <TableCell className="whitespace-nowrap font-mono">{r.order_number}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {r.check_in_date || "—"}
                </TableCell>
                <TableCell>
                  {r.kol_direct_ticket_link ? (
                    <a
                      href={r.kol_direct_ticket_link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-1 underline"
                    >
                      開啟連結 <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">—</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLinkDialog({ id: r.id, value: "" })}
                      >
                        填寫購票連結
                      </Button>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {r.cid_configured ? (
                    <Badge className="bg-green-100 text-green-700 border-green-200">已設定</Badge>
                  ) : (
                    <Badge variant="secondary">待設定</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {mode === "pending" ? (
                    <Button size="sm" onClick={() => confirmConfigured(r.id, true)}>
                      確認已設定
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => confirmConfigured(r.id, false)}
                    >
                      取消確認
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>折扣碼設定管理</CardTitle>
          <p className="text-sm text-muted-foreground">
            請確認以下 KOL 折扣碼已在各平台設定完成
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">載入中...</p>
          ) : (
            renderTable(pending, "pending")
          )}
        </CardContent>
      </Card>

      <Card>
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                已完成紀錄（{done.length}）
              </CardTitle>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>{renderTable(done, "done")}</CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Dialog open={!!linkDialog} onOpenChange={(o) => !o && setLinkDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>填寫 KOL 購票連結</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="link">網址</Label>
            <Input
              id="link"
              placeholder="https://..."
              value={linkDialog?.value ?? ""}
              onChange={(e) =>
                setLinkDialog((d) => (d ? { ...d, value: e.target.value } : d))
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialog(null)} disabled={saving}>
              取消
            </Button>
            <Button onClick={saveLink} disabled={saving}>
              {saving ? "儲存中..." : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
