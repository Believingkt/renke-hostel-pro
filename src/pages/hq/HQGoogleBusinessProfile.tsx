import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, Copy, ExternalLink, Lock, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * 平台級 Google Business Profile OAuth 設定（僅 Super Admin）。
 *
 * 架構：一組平台 OAuth App，所有民宿老闆用自己的 Google 帳號授權此平台。
 * Client Secret 只會送到 Edge Function 並寫入 Vault，永不回傳前端、永不顯示。
 */

const API_STATUS_LABEL: Record<string, string> = {
  NOT_CONFIGURED: "尚未設定",
  NOT_STARTED: "未申請",
  PENDING: "審核中",
  APPROVED: "已核准",
  REJECTED: "被拒絕",
};

const PROJECT_REF = "dmafqwfynatdvnaeovhz";
const REDIRECT_URI = `https://${PROJECT_REF}.supabase.co/functions/v1/google-business-profile-oauth-callback`;

export default function HQGoogleBusinessProfile() {
  const [rowId, setRowId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [projectNumber, setProjectNumber] = useState("");
  const [clientId, setClientId] = useState("");
  const [savedClientId, setSavedClientId] = useState("");
  const [apiStatus, setApiStatus] = useState("NOT_CONFIGURED");
  const [secretConfigured, setSecretConfigured] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  const [savingSecret, setSavingSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("google_business_profile_platform_config")
      .select(
        "id, project_id, project_number, oauth_client_id, api_access_status, client_secret_configured, redirect_uri",
      )
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      toast.error("讀取平台設定失敗：" + error.message);
      setLoading(false);
      return;
    }
    setRowId(data?.id ?? null);
    setProjectId(data?.project_id ?? "");
    setProjectNumber(data?.project_number ?? "");
    setClientId(data?.oauth_client_id ?? "");
    setSavedClientId(data?.oauth_client_id ?? "");
    setApiStatus(data?.api_access_status ?? "NOT_CONFIGURED");
    setSecretConfigured(!!data?.client_secret_configured);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      project_id: projectId.trim() || null,
      project_number: projectNumber.trim() || null,
      oauth_client_id: clientId.trim() || null,
      api_access_status: apiStatus,
      redirect_uri: REDIRECT_URI,
    };
    const query = rowId
      ? supabase
          .from("google_business_profile_platform_config")
          .update(payload)
          .eq("id", rowId)
          .select("id")
      : supabase
          .from("google_business_profile_platform_config")
          .insert(payload)
          .select("id");
    const { data, error } = await query;
    setSaving(false);
    if (error) {
      toast.error("儲存失敗：" + error.message);
      return;
    }
    if (!data || data.length === 0) {
      toast.error("儲存失敗：沒有任何資料被寫入（權限不足）");
      return;
    }
    setRowId(data[0].id);
    if (savedClientId && savedClientId !== clientId.trim()) {
      toast.warning("OAuth Client ID 已變更，既有商家授權可能需要重新授權。");
    }
    setSavedClientId(clientId.trim());
    toast.success("已儲存平台設定");
  };

  const handleSaveSecret = async () => {
    const value = secretInput.trim();
    if (value.length < 8) {
      toast.error("請輸入有效的 Client Secret");
      return;
    }
    setSavingSecret(true);
    const { data, error } = await supabase.functions.invoke(
      "save-google-business-profile-platform-secret",
      { body: { clientSecret: value } },
    );
    setSavingSecret(false);
    if (error || data?.error) {
      toast.error("Client Secret 儲存失敗：" + (data?.error ?? error?.message));
      return;
    }
    setSecretInput("");
    setSecretConfigured(true);
    toast.success("Client Secret 已安全儲存");
    void load();
  };

  const copyRedirect = async () => {
    await navigator.clipboard.writeText(REDIRECT_URI);
    setCopied(true);
    toast.success("已複製 Redirect URI");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return null;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Google Business Profile 平台串接</h1>
        <p className="text-sm text-muted-foreground">
          全平台共用一組 Google OAuth App。設定完成後，各館管理者即可自行連結自己的 Google 商家帳號，不需再填任何 ID。
        </p>
      </header>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Google Cloud 專案</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="pf-project-id">Google Cloud Project ID</Label>
            <Input
              id="pf-project-id"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="例：renke-google-reviews"
              className="h-11 font-mono text-base"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-project-number">Google Cloud Project Number</Label>
            <Input
              id="pf-project-number"
              value={projectNumber}
              onChange={(e) => setProjectNumber(e.target.value)}
              placeholder="例：123456789012"
              className="h-11 font-mono text-base"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-client-id">OAuth Client ID</Label>
            <Input
              id="pf-client-id"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="例：1234567890-xxxx.apps.googleusercontent.com"
              className="h-11 font-mono text-base"
            />
          </div>
          <div className="space-y-2">
            <Label>Business Profile API Access 狀態</Label>
            <Select value={apiStatus} onValueChange={setApiStatus}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(API_STATUS_LABEL).map((k) => (
                  <SelectItem key={k} value={k}>
                    {API_STATUS_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "儲存中…" : "儲存平台設定"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="h-4 w-4" />
            OAuth Client Secret
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">目前狀態</span>
            {secretConfigured ? (
              <Badge className="gap-1">
                <ShieldCheck className="h-3 w-3" /> 🔒 Client Secret 已設定
              </Badge>
            ) : (
              <Badge variant="outline">尚未設定</Badge>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[260px] flex-1 space-y-2">
              <Label htmlFor="pf-secret">
                {secretConfigured ? "更新 Client Secret" : "設定 Client Secret"}
              </Label>
              <Input
                id="pf-secret"
                type="password"
                autoComplete="new-password"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                placeholder="GOCSPX-…"
                className="h-11 font-mono text-base"
              />
            </div>
            <Button onClick={handleSaveSecret} disabled={savingSecret || !secretInput.trim()}>
              {savingSecret ? "儲存中…" : secretConfigured ? "更新 Secret" : "設定 Secret"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Secret 只會送往後端並加密保存，永遠不會顯示、也不會回傳前端。若外洩請至 Google Cloud 重新產生後於此更新。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">OAuth Redirect URI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            請把下列網址原封不動填入 Google Cloud OAuth Client 的「已授權的重新導向 URI」。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input readOnly value={REDIRECT_URI} className="h-11 min-w-[260px] flex-1 font-mono text-sm" />
            <Button type="button" variant="outline" onClick={copyRedirect} className="gap-2">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              複製
            </Button>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <a href="/help/google-business-profile-api" target="_blank" rel="noopener noreferrer">
              查看申請教學
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
