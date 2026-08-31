import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExternalLink, Link2, Lock, RefreshCw, ShieldCheck, Unlink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";

/**
 * 民宿端 Google Business Profile 設定。
 *
 * 架構（PER-ACCOMMODATION / BYO Google Cloud Project）：每一館自行建立 Google Cloud 專案、
 * 申請 Business Profile API、建立 OAuth Client，並在此填入 Project ID / Project Number /
 * OAuth Client ID。Client Secret 與 Refresh Token 僅存後端 Vault，永不顯示。
 *
 * P5：OAuth runtime 已全面改為館別憑證，Connect 正式啟用；readiness 完全依本館設定判斷，
 * 不讀任何平台共用設定。
 */

/** P5：per-accommodation OAuth runtime 已就緒。真正能否 Connect 仍依本館憑證完整度判斷。 */
const OAUTH_RUNTIME_READY = true;

/** 所有館共用的 OAuth callback（各館把它加入自己的 OAuth Client 授權重新導向 URI）。 */
const REDIRECT_URI =
  "https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/google-business-profile-oauth-callback";


const APPLICATION_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "尚未申請",
  PENDING: "審核中",
  APPROVED: "已核准",
  REJECTED: "未通過",
};

/** 空字串一律存成 null；Project Number 保持 TEXT，不做任何數字轉換 */
const trimOrNull = (v: string) => {
  const t = v.trim();
  return t === "" ? null : t;
};


export type BusinessProfileConnectionStatus =
  | "NOT_CONFIGURED"
  | "APPLICATION_PENDING"
  | "READY_FOR_OAUTH"
  | "CONNECTED"
  | "TOKEN_EXPIRED"
  | "ERROR";

const STATUS_LABEL: Record<BusinessProfileConnectionStatus, string> = {
  NOT_CONFIGURED: "未連線",
  APPLICATION_PENDING: "申請審核中",
  READY_FOR_OAUTH: "已授權，待選擇商家",
  CONNECTED: "已連線",
  TOKEN_EXPIRED: "授權已失效",
  ERROR: "連線異常",
};

interface GoogleAccount {
  name: string;
  accountName?: string;
  type?: string;
  role?: string;
  verificationState?: string;
}

interface GoogleLocation {
  name: string;
  title?: string;
  address?: string | null;
}

interface Props {
  accommodationId: string;
  onConnectionChange?: () => void;
}

export const GoogleBusinessProfileSettings = ({
  accommodationId,
  onConnectionChange,
}: Props) => {
  const { canEdit, canView, isStrictAdmin } = useStaffPermissions();
  const readOnly = !canEdit("website_content");
  const visible = canView("website_content");
  /** 憑證 metadata 僅 super_admin / 本館 hotel_admin 可見可編輯（與 DB trigger 同步） */
  const canManageCredentials = !!isStrictAdmin;

  
  const [status, setStatus] = useState<BusinessProfileConnectionStatus>("NOT_CONFIGURED");
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [locationTitle, setLocationTitle] = useState<string | null>(null);
  const [syncTarget, setSyncTarget] = useState<"20" | "50" | "ALL">("50");
  const [reviewSource, setReviewSource] = useState<"PLACES" | "BUSINESS_PROFILE">("PLACES");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [candidateCount, setCandidateCount] = useState(0);

  // 館別憑證 metadata
  const [projectId, setProjectId] = useState("");
  const [projectNumber, setProjectNumber] = useState("");
  const [oauthClientId, setOauthClientId] = useState("");
  const [savedClientId, setSavedClientId] = useState<string | null>(null);
  const [applicationStatus, setApplicationStatus] = useState("NOT_STARTED");
  const [secretConfigured, setSecretConfigured] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  const [savingSecret, setSavingSecret] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);


  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [locations, setLocations] = useState<GoogleLocation[]>([]);
  const [pickedAccount, setPickedAccount] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const handledCallback = useRef(false);

  const load = useCallback(async () => {
    if (!accommodationId) return;
    // 只讀本館設定；不查詢任何平台/全域 Google 設定。
    const { data } = await supabase
      .from("accommodation_google_business_profile")
      .select(
        "connection_status, oauth_connected_at, selected_account_name, selected_location_name, selected_location_title, sync_target, review_source, last_business_profile_sync_at, candidate_review_count, project_id, project_number, oauth_client_id, application_status, client_secret_configured",
      )
      .eq("accommodation_id", accommodationId)
      .maybeSingle();

    setStatus((data?.connection_status as BusinessProfileConnectionStatus) ?? "NOT_CONFIGURED");
    setConnectedAt(data?.oauth_connected_at ?? null);
    setSelectedAccount(data?.selected_account_name ?? null);
    setSelectedLocation(data?.selected_location_name ?? null);
    setLocationTitle(data?.selected_location_title ?? null);
    setSyncTarget(((data?.sync_target as "20" | "50" | "ALL") ?? "50"));
    setReviewSource(((data?.review_source as "PLACES" | "BUSINESS_PROFILE") ?? "PLACES"));
    setLastSyncAt(data?.last_business_profile_sync_at ?? null);
    setCandidateCount(data?.candidate_review_count ?? 0);
    setProjectId(data?.project_id ?? "");
    setProjectNumber(data?.project_number ?? "");
    setOauthClientId(data?.oauth_client_id ?? "");
    setSavedClientId(data?.oauth_client_id ?? null);
    setApplicationStatus(data?.application_status ?? "NOT_STARTED");
    setSecretConfigured(!!data?.client_secret_configured);


    setLoaded(true);
  }, [accommodationId]);


  useEffect(() => {
    void load();
  }, [load]);

  const fetchAccounts = useCallback(async () => {
    setBusy("accounts");
    const { data, error } = await supabase.functions.invoke(
      "google-business-profile-list-accounts",
      { body: { accommodationId } },
    );
    setBusy(null);
    if (error || data?.error) {
      toast.error("讀取 Google 商家帳號失敗：" + (data?.error ?? error?.message));
      return;
    }
    const list: GoogleAccount[] = data?.accounts ?? [];
    setAccounts(list);
    if (list.length === 1) setPickedAccount(list[0].name);
  }, [accommodationId]);

  // OAuth 回跳處理
  useEffect(() => {
    if (!loaded || handledCallback.current) return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get("gbp_oauth");
    if (!result) return;
    handledCallback.current = true;
    params.delete("gbp_oauth");
    const q = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (q ? `?${q}` : ""));
    if (result === "success") {
      toast.success("Google 授權成功，請選擇要綁定的商家");
      void fetchAccounts();
    } else if (result === "denied") {
      toast.error("已取消 Google 授權");
    } else {
      toast.error("Google 授權失敗，請重新嘗試");
    }
  }, [loaded, fetchAccounts]);

  const handleConnect = async () => {
    setBusy("connect");
    const { data, error } = await supabase.functions.invoke(
      "google-business-profile-oauth-start",
      {
        body: {
          accommodationId,
          returnUrl: window.location.origin + window.location.pathname,
        },
      },
    );
    setBusy(null);
    if (error || data?.error) {
      const code = data?.error ?? error?.message;
      toast.error(
        code === "GBP_PLATFORM_NOT_CONFIGURED"
          ? "平台 Google API 尚未完成設定，請聯絡總部管理者"
          : "無法開始授權：" + code,
      );
      return;
    }
    window.location.href = data.authorizationUrl;
  };

  const handlePickAccount = async (accountName: string) => {
    setPickedAccount(accountName);
    setLocations([]);
    setBusy("locations");
    const { data, error } = await supabase.functions.invoke(
      "google-business-profile-list-locations",
      { body: { accommodationId, accountResourceName: accountName } },
    );
    setBusy(null);
    if (error || data?.error) {
      toast.error("讀取商家清單失敗：" + (data?.error ?? error?.message));
      return;
    }
    setLocations(data?.locations ?? []);
  };

  const handlePickLocation = async (locationName: string) => {
    setBusy("select");
    const { data, error } = await supabase.functions.invoke(
      "google-business-profile-select-location",
      {
        body: {
          accommodationId,
          accountResourceName: pickedAccount,
          locationResourceName: locationName,
        },
      },
    );
    setBusy(null);
    if (error || data?.error) {
      toast.error("綁定商家失敗：" + (data?.error ?? error?.message));
      return;
    }
    toast.success("已完成商家綁定");
    setAccounts([]);
    setLocations([]);
    await load();
    onConnectionChange?.();
  };

  const handleSync = async () => {
    setBusy("sync");
    const { data, error } = await supabase.functions.invoke(
      "fetch-google-business-profile-reviews",
      { body: { accommodationId } },
    );
    setBusy(null);
    if (error || data?.error) {
      toast.error("同步失敗：" + (data?.error ?? error?.message));
      return;
    }
    toast.success(
      `已同步 ${data.synced} 則評論，候選池共 ${data.candidateCount} 則` +
        (data.partial ? "（已達安全上限，為部分同步）" : ""),
    );
    await load();
    onConnectionChange?.();
  };

  const handleDisconnect = async () => {
    setConfirmDisconnect(false);
    setBusy("disconnect");
    const { data, error } = await supabase.functions.invoke(
      "google-business-profile-disconnect",
      { body: { accommodationId } },
    );
    setBusy(null);
    if (error || data?.error) {
      toast.error("解除連線失敗：" + (data?.error ?? error?.message));
      return;
    }
    toast.success("已解除 Google 商家連線，前台現有評論不會被刪除");
    await load();
    onConnectionChange?.();
  };

  const persist = async (patch: Record<string, unknown>) => {
    const { data, error } = await supabase
      .from("accommodation_google_business_profile")
      .upsert(
        { accommodation_id: accommodationId, ...patch },
        { onConflict: "accommodation_id" },
      )
      // 必須取回實際寫入的 row，避免 RLS / filter 造成 0-row 卻顯示成功
      .select("accommodation_id");
    if (error) {
      toast.error("儲存失敗：" + error.message);
      return false;
    }
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    const affected = rows.filter(
      (r) => (r as { accommodation_id?: string } | null)?.accommodation_id === accommodationId,
    );
    if (affected.length !== 1) {
      toast.error("儲存失敗：沒有任何資料被更新（可能沒有權限）");
      return false;
    }
    return true;
  };

  /** 儲存本館 Google Cloud 憑證 metadata（不含 Client Secret） */
  const handleSaveCredentials = async () => {
    setSavingCredentials(true);
    const clientIdChanged = trimOrNull(oauthClientId) !== (savedClientId || null);
    const ok = await persist({
      project_id: trimOrNull(projectId),
      project_number: trimOrNull(projectNumber),
      oauth_client_id: trimOrNull(oauthClientId),
      application_status: applicationStatus,
    });
    setSavingCredentials(false);
    if (!ok) return;
    toast.success("已儲存本館 Google Cloud 設定");
    if (clientIdChanged && secretConfigured) {
      toast.warning("OAuth Client ID 已變更，Client Secret 已失效，請重新輸入對應的新 Secret。");
    }
    await load();
  };

  /**
   * Client Secret 只送往 Edge Function → Vault，永不寫入前端可讀欄位。
   * 成功後立即清空輸入框，畫面只顯示鎖頭狀態。
   */
  const handleSaveSecret = async () => {
    const value = secretInput;
    if (value.trim().length < 8) {
      toast.error("請輸入有效的 Client Secret");
      return;
    }
    if (!trimOrNull(oauthClientId) || trimOrNull(oauthClientId) !== (savedClientId || null)) {
      toast.error("請先儲存本館 OAuth Client ID，再設定 Client Secret。");
      return;
    }
    setSavingSecret(true);
    const { data, error } = await supabase.functions.invoke(
      "save-google-business-profile-accommodation-secret",
      { body: { accommodation_id: accommodationId, client_secret: value } },
    );
    setSavingSecret(false);
    if (error || data?.error || data?.configured !== true) {
      toast.error("Client Secret 儲存失敗：" + (data?.error ?? error?.message ?? "unknown"));
      return;
    }
    setSecretInput("");
    setSecretConfigured(true);
    toast.success("Client Secret 已安全儲存（僅後端保存，永不顯示）");
    await load();
  };



  if (!visible || !loaded) return null;

  const connected = status === "CONNECTED" && !!selectedLocation;
  const awaitingSelection = !!connectedAt && !connected;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-1.5 rounded-full bg-primary" />
            <div>
              <CardTitle className="text-xl">Google Business Profile</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                連結自己的 Google 商家帳號後，可同步 20～50 則以上評論，自行挑選前台精選。
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <a href="/help/google-business-profile-api" target="_blank" rel="noopener noreferrer">
              使用教學
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <span className="font-medium">連線狀態</span>
          <Badge variant={connected ? "default" : "outline"}>{STATUS_LABEL[status]}</Badge>
          {connected && locationTitle && (
            <span className="text-muted-foreground">商家：{locationTitle}</span>
          )}
          {connected && (
            <span className="text-muted-foreground">
              · 候選評論 {candidateCount} 則
              {lastSyncAt && `，最後同步 ${new Date(lastSyncAt).toLocaleString("zh-TW")}`}
            </span>
          )}
        </div>

        {/* 本館 Google Cloud 憑證（每館自帶專案；平台不提供共用憑證） */}
        {canManageCredentials ? (
          <section className="space-y-4 rounded-lg border p-4">
            <div className="space-y-1">
              <h3 className="text-base font-semibold">本館 Google Cloud 設定</h3>
              <p className="text-sm text-muted-foreground">
                每一館需自行建立 Google Cloud 專案、申請 Business Profile API 並建立 OAuth Client。
                人客多僅提供串接工具，不提供共用憑證。
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="gbp-project-id">Google Cloud Project ID</Label>
                <Input
                  id="gbp-project-id"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  disabled={readOnly}
                  placeholder="例：my-hotel-gbp"
                  className="h-11 font-mono text-base"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gbp-project-number">Google Cloud Project Number</Label>
                <Input
                  id="gbp-project-number"
                  value={projectNumber}
                  onChange={(e) => setProjectNumber(e.target.value)}
                  disabled={readOnly}
                  placeholder="例：0123456789012"
                  className="h-11 font-mono text-base"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="gbp-client-id">OAuth Client ID</Label>
                <Input
                  id="gbp-client-id"
                  value={oauthClientId}
                  onChange={(e) => setOauthClientId(e.target.value)}
                  disabled={readOnly}
                  placeholder="例：1234567890-xxxx.apps.googleusercontent.com"
                  className="h-11 font-mono text-base"
                />
              </div>
              <div className="space-y-2">
                <Label>Business Profile API 審核狀態</Label>
                <Select
                  value={applicationStatus}
                  onValueChange={setApplicationStatus}
                  disabled={readOnly}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(APPLICATION_STATUS_LABEL).map((k) => (
                      <SelectItem key={k} value={k}>
                        {APPLICATION_STATUS_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>OAuth Client Secret 狀態</Label>
                <div className="flex h-11 items-center gap-2 rounded-md border bg-muted/30 px-3 text-sm">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  {secretConfigured ? (
                    <span>🔒 已設定（僅後端保存，永不顯示）</span>
                  ) : (
                    <span className="text-muted-foreground">尚未設定</span>
                  )}
                </div>
              </div>
            </div>

            <Button onClick={handleSaveCredentials} disabled={readOnly || savingCredentials}>
              {savingCredentials ? "儲存中…" : "儲存本館設定"}
            </Button>

            {/* Client Secret：只送後端寫入 Vault，永不回讀 */}
            <div className="space-y-3 rounded-md border border-dashed p-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[240px] flex-1 space-y-2">
                  <Label htmlFor="gbp-client-secret">
                    {secretConfigured ? "更新 OAuth Client Secret" : "設定 OAuth Client Secret"}
                  </Label>
                  <Input
                    id="gbp-client-secret"
                    type="password"
                    autoComplete="new-password"
                    value={secretInput}
                    onChange={(e) => setSecretInput(e.target.value)}
                    disabled={readOnly}
                    placeholder="GOCSPX-…"
                    className="h-11 font-mono text-base"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={handleSaveSecret}
                  disabled={readOnly || savingSecret || !secretInput.trim()}
                >
                  {savingSecret ? "儲存中…" : secretConfigured ? "更新 Secret" : "設定 Secret"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Secret 只會送往後端並加密保存於保險庫，永遠不會顯示或回傳前端。
                更換 OAuth Client ID 後，舊 Secret 會自動失效，需重新輸入。
              </p>
            </div>

          </section>
        ) : (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            Google Cloud 憑證僅限館主管理者設定，如需修改請聯絡您的管理者。
          </div>
        )}

        {canManageCredentials && (
          <section className="space-y-2 rounded-lg border p-4">
            <h3 className="text-base font-semibold">Authorized Redirect URI</h3>
            <p className="text-sm text-muted-foreground">
              各館的 Google Cloud 專案與 OAuth Client 皆為獨立，但因為都是串回人客多系統，
              請把下列網址原封不動加入貴館 OAuth Web Client 的「已授權的重新導向 URI」。
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                readOnly
                value={REDIRECT_URI}
                className="h-11 min-w-[240px] flex-1 font-mono text-sm"
              />
              <Button type="button" variant="outline" className="gap-2" onClick={copyRedirect}>
                {copiedRedirect ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                複製 Redirect URI
              </Button>
            </div>
          </section>
        )}

        {canManageCredentials && !connected && !oauthReady && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <div className="font-medium">尚未可進行 Google 授權，請先完成本館設定：</div>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
              {readinessHints.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
        )}

        {canManageCredentials && clientIdChangedNeedsSecret && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            OAuth Client ID 已變更，請重新設定 Client Secret。
            {!!connectedAt && "完成新 Client Secret 設定後，請重新授權 Google 商家。"}
          </div>
        )}

        {status === "TOKEN_EXPIRED" && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            Google 授權已失效，請重新授權 Google 商家。重新授權即可恢復同步，不需要重新填寫
            Account ID 或 Location ID。
            {!canManageCredentials && "（重新授權需由館主管理者操作）"}
          </div>
        )}

        {status === "NOT_CONFIGURED" && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            尚未連結 Google 商家帳號。完成本館 Google Cloud 設定與 API 申請後即可自行授權，現有前台評論不受影響。
          </div>
        )}

        {/* 連線動作：OAuth 憑證管理僅限館主管理者 */}

        <div className="flex flex-wrap items-center gap-2">
          {!connected ? (
            canManageCredentials && (
            <Button
              onClick={handleConnect}
              disabled={readOnly || !OAUTH_RUNTIME_READY || !oauthReady || busy === "connect"}
              className="gap-2"
            >


              {status === "TOKEN_EXPIRED" ? (
                <ShieldCheck className="h-4 w-4" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              {busy === "connect"
                ? "準備中…"
                : status === "TOKEN_EXPIRED"
                  ? "重新授權 Google 商家"
                  : "連結 Google 商家帳號"}
            </Button>
          ) : (
            <>
              <Button onClick={handleSync} disabled={readOnly || busy === "sync"} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`} />
                {busy === "sync" ? "同步中…" : "同步評論"}
              </Button>
              <Button variant="outline" onClick={handleConnect} disabled={readOnly} className="gap-2">
                <ShieldCheck className="h-4 w-4" />
                重新授權
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirmDisconnect(true)}
                disabled={readOnly || busy === "disconnect"}
                className="gap-2"
              >
                <Unlink className="h-4 w-4" />
                解除連線
              </Button>
            </>
          )}
          {readOnly && (
            <span className="text-xs text-muted-foreground">唯讀權限僅能查看連線狀態。</span>
          )}
        </div>

        {/* 授權後：選擇 Account / Location */}
        {awaitingSelection && !readOnly && (
          <div className="space-y-4 rounded-lg border p-4">
            <div className="text-sm font-semibold">選擇要綁定的 Google 商家</div>
            {accounts.length === 0 ? (
              <Button variant="outline" onClick={fetchAccounts} disabled={busy === "accounts"}>
                {busy === "accounts" ? "讀取中…" : "讀取我的 Google 商家帳號"}
              </Button>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Google Business Account</Label>
                  <Select value={pickedAccount} onValueChange={handlePickAccount}>
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="選擇帳號" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.name} value={a.name}>
                          {a.accountName || a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>選擇商家</Label>
                  <Select
                    disabled={locations.length === 0 || busy === "select"}
                    onValueChange={handlePickLocation}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue
                        placeholder={busy === "locations" ? "讀取中…" : "選擇商家據點"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => (
                        <SelectItem key={l.name} value={l.name}>
                          {l.title || l.name}
                          {l.address ? `／${l.address}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 同步設定 */}
        {connected && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>同步數量</Label>
              <Select
                value={syncTarget}
                disabled={readOnly}
                onValueChange={async (v) => {
                  const next = v as "20" | "50" | "ALL";
                  const prev = syncTarget;
                  setSyncTarget(next);
                  const ok = await persist({ sync_target: next });
                  if (!ok) setSyncTarget(prev);
                }}

              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">最新 20 則</SelectItem>
                  <SelectItem value="50">最新 50 則</SelectItem>
                  <SelectItem value="ALL">全部（有安全上限）</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                同步數量與前台顯示數量互相獨立，同步只會更新候選池。
              </p>
            </div>

            <div className="space-y-2">
              <Label>評論同步來源</Label>
              <RadioGroup
                value={reviewSource}
                onValueChange={async (v) => {
                  const next = v as "PLACES" | "BUSINESS_PROFILE";
                  const prev = reviewSource;
                  setReviewSource(next);
                  const ok = await persist({ review_source: next });
                  if (!ok) {
                    setReviewSource(prev);
                    return;
                  }
                  toast.success("已更新同步來源（前台精選不受影響）");
                  onConnectionChange?.();
                }}

                className="space-y-1"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="PLACES" id="src-places" disabled={readOnly} />
                  <Label htmlFor="src-places" className="font-normal">
                    Google Places（最多 5 則）
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem
                    value="BUSINESS_PROFILE"
                    id="src-gbp"
                    disabled={readOnly || !connected}
                  />
                  <Label htmlFor="src-gbp" className="font-normal">
                    Google Business Profile
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定解除 Google 商家連線？</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <p>解除 Google Business Profile 連線後：</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  <li>將停止新的 Business Profile 評論同步</li>
                  <li>現有候選評論不會被刪除</li>
                  <li>已套用至網站的評論不會消失</li>
                  <li>可隨時重新連線</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDisconnect}>確定解除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
