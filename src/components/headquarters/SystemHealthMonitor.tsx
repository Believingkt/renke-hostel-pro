import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  CheckCircle2,
  Mail,
  Plus,
  RefreshCw,
  Trash2,
  Activity,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";

interface AlertRecipient {
  id: string;
  email: string;
  is_active: boolean;
  notify_health_check: boolean;
  notify_frontend_error: boolean;
  created_at: string;
}

interface HealthLog {
  id: string;
  target_url: string;
  target_label: string | null;
  status_code: number | null;
  response_time_ms: number | null;
  is_healthy: boolean;
  error_message: string | null;
  alert_sent: boolean;
  checked_at: string;
}

interface ErrorReport {
  id: string;
  error_type: string;
  error_message: string;
  url: string | null;
  user_agent: string | null;
  alert_sent: boolean;
  created_at: string;
}

export function SystemHealthMonitor() {
  const [recipients, setRecipients] = useState<AlertRecipient[]>([]);
  const [healthLogs, setHealthLogs] = useState<HealthLog[]>([]);
  const [errorReports, setErrorReports] = useState<ErrorReport[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    const [r, h, e] = await Promise.all([
      supabase
        .from("alert_recipients")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("system_health_logs")
        .select("*")
        .order("checked_at", { ascending: false })
        .limit(50),
      supabase
        .from("frontend_error_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    setRecipients((r.data ?? []) as AlertRecipient[]);
    setHealthLogs((h.data ?? []) as HealthLog[]);
    setErrorReports((e.data ?? []) as ErrorReport[]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleAdd = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("請輸入有效的 Email");
      return;
    }
    setAdding(true);
    const { error } = await supabase
      .from("alert_recipients")
      .insert({ email });
    setAdding(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "此 Email 已存在" : "新增失敗");
      return;
    }
    toast.success("已加入告警收件人");
    setNewEmail("");
    loadAll();
  };

  const handleToggle = async (id: string, field: keyof AlertRecipient, value: boolean) => {
    const { error } = await supabase
      .from("alert_recipients")
      .update({ [field]: value } as any)
      .eq("id", id);
    if (error) {
      toast.error("更新失敗");
      return;
    }
    setRecipients((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  };

  const handleDelete = async (id: string) => {
    if (!confirm("確定要移除此告警收件人嗎？")) return;
    const { error } = await supabase.from("alert_recipients").delete().eq("id", id);
    if (error) {
      toast.error("移除失敗");
      return;
    }
    toast.success("已移除");
    loadAll();
  };

  const handleRunCheck = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("health-check", { body: {} });
      if (error) throw error;
      toast.success("健檢已執行");
      setTimeout(loadAll, 1000);
    } catch (err) {
      toast.error("健檢執行失敗");
    } finally {
      setRunning(false);
    }
  };

  const recentFailures = healthLogs.filter((l) => !l.is_healthy).length;
  const lastCheck = healthLogs[0];

  return (
    <div className="space-y-4">
      {/* 狀態卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">最近一次健檢</CardDescription>
          </CardHeader>
          <CardContent>
            {lastCheck ? (
              <div className="flex items-center gap-2">
                {lastCheck.is_healthy ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                )}
                <div>
                  <div className="font-semibold">
                    {lastCheck.is_healthy ? "正常" : "失敗"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(lastCheck.checked_at), "MM/dd HH:mm:ss", { locale: zhTW })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">尚無紀錄</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">近 50 次失敗數</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${recentFailures > 0 ? "text-destructive" : ""}`}>
              {recentFailures}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">前端錯誤回報（近 30 筆）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${errorReports.length > 0 ? "text-amber-600" : ""}`}>
              {errorReports.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 告警收件人管理 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            告警收件人
          </CardTitle>
          <CardDescription>
            設定接收健檢失敗與前端崩潰告警的 Email
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="admin@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button onClick={handleAdd} disabled={adding}>
              <Plus className="h-4 w-4 mr-1" />
              新增
            </Button>
          </div>

          {recipients.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">
              尚未設定任何告警收件人，系統異常時將不會發送通知
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-24 text-center">健檢告警</TableHead>
                  <TableHead className="w-24 text-center">前端錯誤</TableHead>
                  <TableHead className="w-24 text-center">啟用</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recipients.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.email}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={r.notify_health_check}
                        onCheckedChange={(v) => handleToggle(r.id, "notify_health_check", v)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={r.notify_frontend_error}
                        onCheckedChange={(v) => handleToggle(r.id, "notify_frontend_error", v)}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={r.is_active}
                        onCheckedChange={(v) => handleToggle(r.id, "is_active", v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(r.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 健檢歷史 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              健檢歷史（每 10 分鐘自動執行）
            </CardTitle>
            <CardDescription>最近 50 次首頁 HTTP 狀態檢查</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={handleRunCheck} disabled={running}>
            <RefreshCw className={`h-4 w-4 mr-1 ${running ? "animate-spin" : ""}`} />
            立即檢查
          </Button>
        </CardHeader>
        <CardContent>
          {healthLogs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              {loading ? "載入中..." : "尚無健檢紀錄，等待第一次排程執行"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">狀態</TableHead>
                  <TableHead>目標</TableHead>
                  <TableHead className="w-20 text-right">HTTP</TableHead>
                  <TableHead className="w-24 text-right">回應時間</TableHead>
                  <TableHead className="w-40">時間</TableHead>
                  <TableHead>錯誤訊息</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {healthLogs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      {l.is_healthy ? (
                        <Badge variant="outline" className="text-green-700 border-green-300">
                          正常
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          {l.alert_sent ? "已告警" : "失敗"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{l.target_label ?? l.target_url}</TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {l.status_code ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {l.response_time_ms ?? "—"} ms
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(l.checked_at), "MM/dd HH:mm:ss", { locale: zhTW })}
                    </TableCell>
                    <TableCell className="text-xs text-destructive max-w-xs truncate">
                      {l.error_message ?? ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 前端錯誤回報 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4" />
            前端錯誤回報
          </CardTitle>
          <CardDescription>用戶端 ChunkErrorBoundary 與其他關鍵錯誤即時回報</CardDescription>
        </CardHeader>
        <CardContent>
          {errorReports.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              {loading ? "載入中..." : "近 30 天無錯誤回報，狀態良好 ✓"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">類型</TableHead>
                  <TableHead>錯誤訊息</TableHead>
                  <TableHead className="w-40">URL</TableHead>
                  <TableHead className="w-32">時間</TableHead>
                  <TableHead className="w-20 text-center">告警</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errorReports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Badge variant="outline">{r.error_type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-md truncate text-destructive">
                      {r.error_message}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-xs">
                      {r.url ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(r.created_at), "MM/dd HH:mm", { locale: zhTW })}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.alert_sent ? (
                        <Badge variant="outline" className="text-green-700">已寄</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
