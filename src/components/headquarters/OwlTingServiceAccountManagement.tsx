import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Copy, Plug, Trash2, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

interface ServiceAccount {
  id: string;
  username: string;
  password: string;
  is_active: boolean;
  description: string | null;
  last_used_at: string | null;
  created_at: string;
}

function generatePassword(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/[+/=]/g, "")
    .slice(0, 32);
}

export function OwlTingServiceAccountManagement() {
  const [accounts, setAccounts] = useState<ServiceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [formUsername, setFormUsername] = useState("owlting_partner");
  const [formPassword, setFormPassword] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("owlting_service_accounts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error("載入失敗：" + error.message);
    else setAccounts((data || []) as ServiceAccount[]);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!formUsername.trim() || !formPassword.trim()) {
      toast.error("請輸入帳號與密碼");
      return;
    }
    const { error } = await supabase.from("owlting_service_accounts").insert({
      username: formUsername.trim(),
      password: formPassword.trim(),
      description: formDescription.trim() || null,
    });
    if (error) {
      toast.error("建立失敗：" + error.message);
      return;
    }
    toast.success("已建立服務帳號");
    setCreateOpen(false);
    setFormUsername("owlting_partner");
    setFormPassword("");
    setFormDescription("");
    loadAccounts();
  };

  const toggleActive = async (acc: ServiceAccount) => {
    const { error } = await supabase
      .from("owlting_service_accounts")
      .update({ is_active: !acc.is_active })
      .eq("id", acc.id);
    if (error) toast.error("更新失敗");
    else {
      toast.success(acc.is_active ? "已停用" : "已啟用");
      loadAccounts();
    }
  };

  const rotatePassword = async (acc: ServiceAccount) => {
    const newPass = generatePassword();
    const { error } = await supabase
      .from("owlting_service_accounts")
      .update({ password: newPass })
      .eq("id", acc.id);
    if (error) {
      toast.error("輪替失敗：" + error.message);
      return;
    }
    toast.success("密碼已輪替");
    setVisibleIds((prev) => new Set(prev).add(acc.id));
    loadAccounts();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("owlting_service_accounts").delete().eq("id", deleteId);
    if (error) toast.error("刪除失敗");
    else {
      toast.success("已刪除");
      loadAccounts();
    }
    setDeleteId(null);
  };

  const toggleVisible = (id: string) => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("已複製到剪貼簿");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Plug className="h-5 w-5" />
                奧丁丁 (OwlTing) 服務帳號
              </CardTitle>
              <CardDescription>
                管理奧丁丁通路 SOAP API 共用憑證（WS-Security UsernameToken / PasswordText）。
                <Link to="/owlting-cm-docs" className="ml-2 text-primary underline">
                  查看 API 文件
                </Link>
              </CardDescription>
            </div>
            <Button
              onClick={() => {
                setFormUsername("owlting_partner");
                setFormPassword(generatePassword());
                setFormDescription("");
                setCreateOpen(true);
              }}
            >
              新增服務帳號
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Password</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>備註</TableHead>
                <TableHead>最後使用</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">載入中...</TableCell>
                </TableRow>
              ) : accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">尚無服務帳號</TableCell>
                </TableRow>
              ) : (
                accounts.map((acc) => (
                  <TableRow key={acc.id}>
                    <TableCell className="font-mono">{acc.username}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs">
                          {visibleIds.has(acc.id) ? acc.password : "••••••••••••"}
                        </span>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleVisible(acc.id)}>
                          {visibleIds.has(acc.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copy(acc.password)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={acc.is_active} onCheckedChange={() => toggleActive(acc)} />
                        <Badge variant={acc.is_active ? "default" : "secondary"}>
                          {acc.is_active ? "啟用" : "停用"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{acc.description || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {acc.last_used_at ? new Date(acc.last_used_at).toLocaleString("zh-TW") : "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => rotatePassword(acc)} title="輪替密碼">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteId(acc.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增奧丁丁服務帳號</DialogTitle>
            <DialogDescription>
              將此 Username / Password 提供給奧丁丁，用於 SOAP API 的 WS-Security UsernameToken 認證。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={formUsername} onChange={(e) => setFormUsername(e.target.value)} className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <div className="flex gap-2">
                <Input value={formPassword} onChange={(e) => setFormPassword(e.target.value)} className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={() => setFormPassword(generatePassword())} title="重新產生">
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={() => copy(formPassword)} title="複製">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">建議使用系統產生的高熵密碼。</p>
            </div>
            <div className="space-y-2">
              <Label>備註（選填）</Label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="例：奧丁丁正式環境"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreate}>建立</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除服務帳號？</AlertDialogTitle>
            <AlertDialogDescription>
              刪除後奧丁丁將立即無法呼叫 API，請先確認對方已切換到新帳號。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
