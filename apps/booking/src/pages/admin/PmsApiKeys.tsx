import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { Button } from "@lakeze/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Label } from "@lakeze/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@lakeze/shared/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@lakeze/shared/components/ui/dialog";
import { KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { READ_WRITE_CONFIRM_TOKEN, type PmsApiKeyRow } from "@lakeze/shared/utils/pmsApiKey";
import { PmsKeyCreateForm, type CreateFormValue } from "@/components/headquarters/pms-api-keys/PmsKeyCreateForm";
import { PmsKeyReveal } from "@/components/headquarters/pms-api-keys/PmsKeyReveal";
import { PmsKeyTable } from "@/components/headquarters/pms-api-keys/PmsKeyTable";
import { PmsKeyConfirmDialog } from "@/components/headquarters/pms-api-keys/PmsKeyConfirmDialog";

type Created = { key: string; isReadOnly: boolean };
type Pending = { key: PmsApiKeyRow; action: "disable" | "delete" } | null;

export default function PmsApiKeys() {
  const [accs, setAccs] = useState<{ id: string; name: string }[]>([]);
  const [accId, setAccId] = useState("");
  const [keys, setKeys] = useState<PmsApiKeyRow[]>([]);
  const [scopes, setScopes] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [ack, setAck] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  useEffect(() => {
    supabase.from("accommodation_info").select("id, name").eq("is_active", true)
      .order("display_order", { ascending: true })
      .then(({ data }) => { setAccs(data || []); if (data?.length) setAccId(data[0].id); });
  }, []);

  const loadKeys = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("accommodation_api_keys")
      .select("id, accommodation_id, name, key_prefix, is_active, is_read_only, last_used_at, created_at")
      .eq("accommodation_id", accId).order("created_at", { ascending: false });
    if (error) toast.error("無法載入 API Keys");
    const rows = (data || []) as PmsApiKeyRow[];
    setKeys(rows);
    const map: Record<string, string[]> = {};
    if (rows.length) {
      const { data: s } = await supabase.from("accommodation_api_key_scopes")
        .select("api_key_id, accommodation_id").in("api_key_id", rows.map((r) => r.id));
      (s || []).forEach((r) => (map[r.api_key_id] ||= []).push(r.accommodation_id));
    }
    setScopes(map);
    setLoading(false);
  };

  useEffect(() => { if (accId) loadKeys(); }, [accId]);

  const accName = (id: string) => accs.find((a) => a.id === id)?.name || id.slice(0, 8);
  const scopeLabel = (keyId: string) => (scopes[keyId]?.length ? `本館 ＋ ${scopes[keyId].map(accName).join("、")}` : "本館");

  const handleCreate = async (v: CreateFormValue) => {
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("create-pms-api-key", {
      body: {
        accommodation_id: accId, name: v.name, extra_accommodation_ids: v.extraAccIds,
        read_write: v.readWrite, ...(v.readWrite ? { confirm_read_write: READ_WRITE_CONFIRM_TOKEN } : {}),
      },
    });
    setSubmitting(false);
    if (error || !data?.key) return toast.error("建立失敗：" + (data?.error || error?.message || "未知錯誤"));
    setAck(false);
    setCreated({ key: data.key, isReadOnly: data.is_read_only !== false });
    loadKeys();
  };

  const closeDialog = () => { setDialogOpen(false); setCreated(null); setAck(false); };
  const canClose = !created || ack;

  const setActive = async (k: PmsApiKeyRow, active: boolean) => {
    const { error } = await supabase.from("accommodation_api_keys").update({ is_active: active }).eq("id", k.id);
    if (error) return toast.error("更新失敗");
    toast.success(active ? "已啟用" : "已停用");
    loadKeys();
  };

  const confirmPending = async () => {
    if (!pending) return;
    const { key, action } = pending;
    setPending(null);
    if (action === "disable") return setActive(key, false);
    const { error } = await supabase.from("accommodation_api_keys").delete().eq("id", key.id).eq("is_active", false);
    if (error) return toast.error("刪除失敗");
    toast.success("已刪除");
    loadKeys();
  };

  return (
    <div className="space-y-6 p-4 md:p-6" data-testid="pms-api-keys-page">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />PMS API 金鑰</CardTitle>
              <CardDescription>
                供 PMS／BI／報表系統即時抓取每日進單軸、入住軸、住房率與可售房。
                <Link to="/accommodation-api-docs" className="ml-2 text-primary underline" data-testid="pms-api-docs-link">API 文件</Link>
              </CardDescription>
            </div>
            <Button onClick={() => { setCreated(null); setAck(false); setDialogOpen(true); }} disabled={!accId} data-testid="pms-key-create-open">
              產生新金鑰
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground" data-testid="pms-key-security-notes">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
            <span>金鑰由伺服器產生（32 bytes 亂數），系統只存 SHA-256 雜湊、明文僅顯示一次；僅總部管理員可建立；預設唯讀、多館金鑰強制唯讀；刪除前須先停用並輸入名稱確認。</span>
          </div>
          <div className="max-w-xs space-y-1">
            <Label>選擇民宿（主館）</Label>
            <Select value={accId} onValueChange={setAccId}>
              <SelectTrigger data-testid="pms-key-acc-select"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-background">
                {accs.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <PmsKeyTable keys={keys} loading={loading} scopeLabel={scopeLabel}
            onToggle={(k) => (k.is_active ? setPending({ key: k, action: "disable" }) : setActive(k, true))}
            onDelete={(k) => setPending({ key: k, action: "delete" })} />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v && canClose) closeDialog(); }}>
        <DialogContent className="max-w-2xl" data-testid="pms-key-dialog"
          onEscapeKeyDown={(e) => !canClose && e.preventDefault()}
          onPointerDownOutside={(e) => !canClose && e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{created ? "金鑰已產生" : "產生 PMS API 金鑰"}</DialogTitle>
            <DialogDescription>{created ? "請立即複製保存，並勾選確認後才能關閉。" : `主館：${accName(accId)}`}</DialogDescription>
          </DialogHeader>
          {created ? (
            <PmsKeyReveal apiKey={created.key} isReadOnly={created.isReadOnly} acknowledged={ack} onAcknowledge={setAck} onDone={closeDialog} />
          ) : (
            <PmsKeyCreateForm primaryName={accName(accId)} others={accs.filter((a) => a.id !== accId)}
              submitting={submitting} onCancel={closeDialog} onSubmit={handleCreate} />
          )}
        </DialogContent>
      </Dialog>

      <PmsKeyConfirmDialog target={pending} onClose={() => setPending(null)} onConfirm={confirmPending} />
    </div>
  );
}
