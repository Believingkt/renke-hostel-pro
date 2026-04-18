import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Copy, KeyRound, Trash2, Power } from "lucide-react";
import { Link } from "react-router-dom";

interface ApiKey {
  id: string;
  accommodation_id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

interface Accommodation {
  id: string;
  name: string;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateKey(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  const hex = Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `acc_${hex}`;
}

export function AccommodationApiKeysManagement() {
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [selectedAccId, setSelectedAccId] = useState<string>("");
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("accommodation_info")
        .select("id, name")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      setAccommodations(data || []);
      if (data && data.length > 0) setSelectedAccId(data[0].id);
    })();
  }, []);

  useEffect(() => {
    if (selectedAccId) loadKeys();
  }, [selectedAccId]);

  const loadKeys = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("accommodation_api_keys")
      .select("*")
      .eq("accommodation_id", selectedAccId)
      .order("created_at", { ascending: false });
    if (error) toast.error("無法載入 API Keys");
    setKeys((data || []) as ApiKey[]);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      toast.error("請輸入名稱");
      return;
    }
    const fullKey = generateKey();
    const keyHash = await sha256Hex(fullKey);
    const keyPrefix = fullKey.slice(0, 12) + "...";
    const { error } = await supabase.from("accommodation_api_keys").insert({
      accommodation_id: selectedAccId,
      name: newKeyName.trim(),
      key_hash: keyHash,
      key_prefix: keyPrefix,
    });
    if (error) {
      toast.error("建立失敗：" + error.message);
      return;
    }
    setCreatedKey(fullKey);
    setNewKeyName("");
    loadKeys();
  };

  const toggleActive = async (key: ApiKey) => {
    const { error } = await supabase
      .from("accommodation_api_keys")
      .update({ is_active: !key.is_active })
      .eq("id", key.id);
    if (error) toast.error("更新失敗");
    else {
      toast.success(key.is_active ? "已停用" : "已啟用");
      loadKeys();
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("accommodation_api_keys").delete().eq("id", deleteId);
    if (error) toast.error("刪除失敗");
    else {
      toast.success("已刪除");
      loadKeys();
    }
    setDeleteId(null);
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
                <KeyRound className="h-5 w-5" />
                民宿 API Keys
              </CardTitle>
              <CardDescription>
                為各民宿產生 API 金鑰，供其後端系統呼叫房型管理 API。
                <Link to="/accommodation-api-docs" className="ml-2 text-primary underline">
                  查看 API 文件
                </Link>
              </CardDescription>
            </div>
            <Button onClick={() => { setCreatedKey(null); setCreateOpen(true); }} disabled={!selectedAccId}>
              新增 API Key
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs">
            <Label>選擇民宿</Label>
            <Select value={selectedAccId} onValueChange={setSelectedAccId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-background">
                {accommodations.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名稱</TableHead>
                <TableHead>金鑰前綴</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>最後使用</TableHead>
                <TableHead>建立時間</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">載入中...</TableCell></TableRow>
              ) : keys.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">尚無 API Keys</TableCell></TableRow>
              ) : (
                keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell className="font-mono text-sm">{k.key_prefix}</TableCell>
                    <TableCell>
                      <Badge variant={k.is_active ? "default" : "secondary"}>
                        {k.is_active ? "啟用" : "停用"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleString("zh-TW") : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(k.created_at).toLocaleDateString("zh-TW")}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(k)}>
                        <Power className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteId(k.id)}>
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

      <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) setCreatedKey(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createdKey ? "API Key 已建立" : "新增 API Key"}</DialogTitle>
            <DialogDescription>
              {createdKey
                ? "請妥善保管此金鑰，關閉視窗後將無法再次查看。"
                : "為這把金鑰命名（例：第三方訂房系統、PMS 整合）"}
            </DialogDescription>
          </DialogHeader>

          {createdKey ? (
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="flex gap-2">
                <Input value={createdKey} readOnly className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={() => copy(createdKey)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-destructive">⚠️ 此金鑰僅顯示一次，請立即複製保存</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>名稱</Label>
              <Input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="例：PMS 整合"
              />
            </div>
          )}

          <DialogFooter>
            {createdKey ? (
              <Button onClick={() => { setCreateOpen(false); setCreatedKey(null); }}>完成</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
                <Button onClick={handleCreate}>建立</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除 API Key？</AlertDialogTitle>
            <AlertDialogDescription>
              刪除後將無法復原，使用此金鑰的服務將立即失效。
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
