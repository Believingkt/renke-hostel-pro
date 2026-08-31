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
import { ExternalLink, Link2, RefreshCw, ShieldCheck, Unlink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";

/**
 * 民宿端自助 Google Business Profile 連線。
 *
 * 架構：平台共用一組 OAuth App（由總部 Super Admin 於 /hq/integrations/google-business-profile
 * 設定）。各館管理者只需按「連結 Google 商家帳號」，其餘 Account / Location 由 Google 授權後
 * 自動取得，不需人工填 ID。所有憑證（Client Secret / Refresh Token）僅存在後端 Vault。
 */

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
  const { canEdit, canView } = useStaffPermissions();
  const readOnly = !canEdit("website_content");
  const visible = canView("website_content");

  const [platformReady, setPlatformReady] = useState(false);
  const [status, setStatus] = useState<BusinessProfileConnectionStatus>("NOT_CONFIGURED");
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [locationTitle, setLocationTitle] = useState<string | null>(null);
  const [syncTarget, setSyncTarget] = useState<"20" | "50" | "ALL">("50");
  const [reviewSource, setReviewSource] = useState<"PLACES" | "BUSINESS_PROFILE">("PLACES");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [candidateCount, setCandidateCount] = useState(0);

  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [locations, setLocations] = useState<GoogleLocation[]>([]);
  const [pickedAccount, setPickedAccount] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const handledCallback = useRef(false);

  const load = useCallback(async () => {
    if (!accommodationId) return;
    const [{ data: ready }, { data }] = await Promise.all([
      supabase.rpc("gbp_platform_ready"),
      supabase
        .from("accommodation_google_business_profile")
        .select(
          "connection_status, oauth_connected_at, selected_account_name, selected_location_name, selected_location_title, sync_target, review_source, last_business_profile_sync_at, candidate_review_count",
        )
        .eq("accommodation_id", accommodationId)
        .maybeSingle(),
    ]);
    setPlatformReady(!!ready);
    setStatus((data?.connection_status as BusinessProfileConnectionStatus) ?? "NOT_CONFIGURED");
    setConnectedAt(data?.oauth_connected_at ?? null);
    setSelectedAccount(data?.selected_account_name ?? null);
    setSelectedLocation(data?.selected_location_name ?? null);
    setLocationTitle(data?.selected_location_title ?? null);
    setSyncTarget(((data?.sync_target as "20" | "50" | "ALL") ?? "50"));
    setReviewSource(((data?.review_source as "PLACES" | "BUSINESS_PROFILE") ?? "PLACES"));
    setLastSyncAt(data?.last_business_profile_sync_at ?? null);
    setCandidateCount(data?.candidate_review_count ?? 0);
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

        {!platformReady && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            平台 Google API 尚未完成設定，請聯絡總部管理者完成平台串接後再進行連線。
          </div>
        )}

        {status === "TOKEN_EXPIRED" && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            Google 授權已失效，請重新連結。
          </div>
        )}

        {/* 連線動作 */}
        <div className="flex flex-wrap items-center gap-2">
          {!connected ? (
            <Button
              onClick={handleConnect}
              disabled={readOnly || !platformReady || busy === "connect"}
              className="gap-2"
            >
              <Link2 className="h-4 w-4" />
              {busy === "connect" ? "準備中…" : "連結 Google 商家帳號"}
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
                  setReviewSource(next);
                  const ok = await persist({ review_source: next });
                  if (ok) toast.success("已更新同步來源（前台精選不受影響）");
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
            <AlertDialogDescription>
              解除後將停止 Business Profile 自動同步，現有前台評論不會被刪除，候選評論也會保留。
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
