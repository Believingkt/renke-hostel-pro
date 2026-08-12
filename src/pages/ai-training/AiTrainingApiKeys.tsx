import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Copy, Check } from "lucide-react";

type Key = {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  rate_limit_per_min: number;
  created_at: string;
  last_used_at: string | null;
  accommodation_id: string;
};

type Acc = { id: string; name: string };

/**
 * HQ 版 API 金鑰管理：可跨全平台檢視，並在建立時選擇要發卡的民宿。
 */
export default function AiTrainingApiKeys() {
  const [accs, setAccs] = useState<Acc[]>([]);
  const [filterAcc, setFilterAcc] = useState<string>("all");
  const [rows, setRows] = useState<Key[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAcc, setNewAcc] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("accommodation_info")
        .select("id, name")
        .order("name");
      setAccs((data as Acc[]) || []);
    })();
  }, []);

  const load = useCallback(async () => {
    let q = supabase
      .from("accommodation_ai_api_keys")
      .select("*")
      .order("created_at", { ascending: false });
    if (filterAcc !== "all") q = q.eq("accommodation_id", filterAcc);
    const { data } = await q;
    setRows((data as Key[]) || []);
  }, [filterAcc]);

  useEffect(() => { void load(); }, [load]);

  const accName = (id: string) => accs.find((a) => a.id === id)?.name || "—";

  const create = async () => {
    if (!newName.trim() || !newAcc) return;
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("create-accommodation-ai-api-key", {
      body: { accommodation_id: newAcc, name: newName.trim() },
    });
    setCreating(false);
    if (error || !data?.key) {
      toast.error("建立失敗：" + (error?.message || "未知錯誤"));
      return;
    }
    setRevealedKey(data.key);
    setNewName("");
    await load();
  };

  const toggle = async (k: Key, v: boolean) => {
    await supabase.from("accommodation_ai_api_keys").update({
      is_active: v, revoked_at: v ? null : new Date().toISOString(),
    }).eq("id", k.id);
    await load();
  };

  const remove = async (k: Key) => {
    if (!confirm(`刪除金鑰「${k.name}」？此操作無法復原。`)) return;
    await supabase.from("accommodation_ai_api_keys").delete().eq("id", k.id);
    await load();
  };

  const copyKey = () => {
    if (!revealedKey) return;
    navigator.clipboard.writeText(revealedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">API 金鑰</h1>
          <p className="text-sm text-muted-foreground mt-1">
            總部統一管理各民宿供外部平台串接 AI 管家的 API 金鑰。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterAcc} onValueChange={setFilterAcc}>
            <SelectTrigger className="w-48"><SelectValue placeholder="全部民宿" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部民宿</SelectItem>
              {accs.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              setNewName("");
              setNewAcc(filterAcc !== "all" ? filterAcc : "");
              setRevealedKey(null);
              setCreateOpen(true);
            }}
            className="bg-[#F97316] hover:bg-[#F97316]/90 text-white"
          >
            <Plus className="h-4 w-4" />新增金鑰
          </Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名稱</TableHead>
              <TableHead>民宿</TableHead>
              <TableHead>金鑰前綴</TableHead>
              <TableHead className="w-28">速率/分鐘</TableHead>
              <TableHead className="w-40">最後使用</TableHead>
              <TableHead className="w-20">啟用</TableHead>
              <TableHead className="w-20 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">尚未建立金鑰</TableCell>
              </TableRow>
            ) : rows.map((k) => (
              <TableRow key={k.id}>
                <TableCell className="font-medium">{k.name}</TableCell>
                <TableCell className="text-sm">{accName(k.accommodation_id)}</TableCell>
                <TableCell><code className="text-xs">{k.key_prefix}...</code></TableCell>
                <TableCell>{k.rate_limit_per_min}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {k.last_used_at ? new Date(k.last_used_at).toLocaleString("zh-TW") : "—"}
                </TableCell>
                <TableCell><Switch checked={k.is_active} onCheckedChange={(v) => toggle(k, v)} /></TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => remove(k)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{revealedKey ? "金鑰建立成功" : "新增 API 金鑰"}</DialogTitle>
            <DialogDescription>
              {revealedKey
                ? "請立即複製並安全保存此金鑰，關閉視窗後將無法再次查看。"
                : "選擇要發卡的民宿並命名，方便日後追蹤用途。"}
            </DialogDescription>
          </DialogHeader>
          {revealedKey ? (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted p-3 flex items-center gap-2">
                <code className="flex-1 text-xs break-all">{revealedKey}</code>
                <Button size="icon" variant="ghost" onClick={copyKey}>
                  {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <Badge variant="destructive">此金鑰只會顯示這一次</Badge>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>發卡民宿 *</Label>
                <Select value={newAcc} onValueChange={setNewAcc}>
                  <SelectTrigger><SelectValue placeholder="選擇民宿" /></SelectTrigger>
                  <SelectContent>
                    {accs.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>金鑰名稱 *</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="例：台灣旅圖串接" maxLength={100} />
              </div>
            </div>
          )}
          <DialogFooter>
            {revealedKey ? (
              <Button onClick={() => { setCreateOpen(false); setRevealedKey(null); }}>完成</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
                <Button onClick={create} disabled={creating || !newName.trim() || !newAcc}
                  className="bg-[#F97316] hover:bg-[#F97316]/90 text-white">
                  {creating ? "建立中..." : "建立"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
