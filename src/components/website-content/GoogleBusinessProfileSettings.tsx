import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ExternalLink, ShieldCheck, Info, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";

/**
 * PHASE 1：Google Business Profile API 串接「準備設定」UI。
 * 僅呈現非敏感欄位與進度狀態，不呼叫任何 Google API、不儲存任何 Secret / Token。
 * 目前欄位為本機暫存（尚未建立資料表，等 schema 確認後才接續）。
 */

export type BusinessProfileConnectionStatus =
  | "NOT_CONFIGURED"
  | "APPLICATION_PENDING"
  | "READY_FOR_OAUTH"
  | "CONNECTED"
  | "TOKEN_EXPIRED"
  | "ERROR";

const STATUS_LABEL: Record<BusinessProfileConnectionStatus, string> = {
  NOT_CONFIGURED: "未設定",
  APPLICATION_PENDING: "申請審核中",
  READY_FOR_OAUTH: "待授權",
  CONNECTED: "已連線",
  TOKEN_EXPIRED: "授權失效",
  ERROR: "連線異常",
};

const CHECKLIST_ITEMS = [
  "Google Cloud Project 已建立",
  "已取得 Project Number",
  "Business Profile API Access 已送審",
  "Google 已核准 API Access",
  "OAuth Client ID 已建立",
  "Google 商家帳號已授權",
  "Business Account 已綁定",
  "Business Location 已綁定",
];

const FUTURE_CAPABILITIES = [
  "同步 20～50+ 則評論",
  "星等篩選",
  "搜尋評論",
  "從大量評論中挑選前台精選",
  "不再受 Places API 5 則限制",
];

export const GoogleBusinessProfileSettings = ({
  accommodationId,
}: {
  accommodationId: string;
}) => {
  const { canEdit } = useStaffPermissions();
  const readOnly = !canEdit("website_content");

  const [projectId, setProjectId] = useState("");
  const [clientId, setClientId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<BusinessProfileConnectionStatus>("NOT_CONFIGURED");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!accommodationId) return;
    const { data, error } = await supabase
      .from("accommodation_google_business_profile")
      .select(
        "project_id, oauth_client_id, account_id, location_id, connection_status, application_status, checklist"
      )
      .eq("accommodation_id", accommodationId)
      .maybeSingle();

    if (error) {
      toast.error("讀取 Business Profile 設定失敗：" + error.message);
      return;
    }
    // 無資料列 = 初始空狀態，不視為錯誤
    setProjectId(data?.project_id ?? "");
    setClientId(data?.oauth_client_id ?? "");
    setAccountId(data?.account_id ?? "");
    setLocationId(data?.location_id ?? "");
    setStatus(
      (data?.connection_status as BusinessProfileConnectionStatus) ?? "NOT_CONFIGURED"
    );
    setChecked((data?.checklist as Record<string, boolean>) ?? {});
  }, [accommodationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!accommodationId || readOnly) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("accommodation_google_business_profile")
      .upsert(
        {
          accommodation_id: accommodationId,
          project_id: projectId.trim() || null,
          oauth_client_id: clientId.trim() || null,
          account_id: accountId.trim() || null,
          location_id: locationId.trim() || null,
          connection_status: status,
          checklist: checked,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "accommodation_id" }
      )
      .select("accommodation_id");

    setSaving(false);
    if (error) {
      toast.error("儲存失敗：" + error.message);
      return;
    }
    if (!data || data.length === 0) {
      toast.error("儲存失敗：沒有任何資料被寫入（權限不足）");
      return;
    }
    toast.success("已儲存 Business Profile 設定");
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-1.5 bg-primary rounded-full" />
            <div>
              <CardTitle className="text-xl">Google Business Profile API</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                串接 Google 商家帳號後，可同步 20 則以上評論供前台挑選。
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <a
              href="/help/google-business-profile-api"
              target="_blank"
              rel="noopener noreferrer"
            >
              查看申請與設定教學
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* 目前同步來源狀態 */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">目前評論來源</span>
            <Badge variant="secondary">Google Places API</Badge>
            <span className="text-muted-foreground">
              目前最多只能取得 Google 提供的 5 則代表性評論。
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Business Profile API 狀態</span>
            <Badge variant="outline">{STATUS_LABEL[status]}</Badge>
          </div>
        </div>

        {/* 非敏感設定欄位 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bp-project-id">Google Cloud Project ID</Label>
            <Input
              id="bp-project-id"
              disabled={readOnly}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="例：renke-google-reviews"
              className="h-11 text-base font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bp-client-id">OAuth Client ID</Label>
            <Input
              id="bp-client-id"
              disabled={readOnly}
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="例：1234567890-xxxx.apps.googleusercontent.com"
              className="h-11 text-base font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bp-account-id">Google Business Account ID</Label>
            <Input
              id="bp-account-id"
              disabled={readOnly}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="例：accounts/1234567890"
              className="h-11 text-base font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bp-location-id">Google Business Location ID</Label>
            <Input
              id="bp-location-id"
              disabled={readOnly}
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              placeholder="例：locations/1234567890"
              className="h-11 text-base font-mono"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={handleSave} disabled={saving || readOnly}>
            {saving ? "儲存中..." : "儲存設定"}
          </Button>
          <p className="text-xs text-muted-foreground flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            本階段僅儲存非敏感設定與申請進度，不會呼叫任何 Google API。
            {readOnly && "（目前為唯讀權限，無法儲存）"}
          </p>
        </div>

        {/* Redirect URI / Secret / 授權狀態 */}
        <div className="space-y-3">
          <div className="rounded-lg border p-3 text-sm space-y-1">
            <div className="font-medium">Redirect URI</div>
            <div className="text-muted-foreground">尚未建立 OAuth 串接</div>
          </div>
          <div className="rounded-lg border p-3 text-sm space-y-1">
            <div className="font-medium flex items-center gap-2">
              <Lock className="h-4 w-4" />
              OAuth Client Secret
            </div>
            <div className="text-muted-foreground">尚未設定</div>
            <p className="text-xs text-muted-foreground">
              基於安全性，Client Secret 將於 OAuth 串接完成後透過後端安全設定，不會顯示於此頁。
            </p>
          </div>
          <div className="rounded-lg border p-3 text-sm space-y-1">
            <div className="font-medium flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Google 帳號授權
            </div>
            <div className="text-muted-foreground">尚未授權</div>
            <p className="text-xs text-muted-foreground">
              授權憑證（Refresh Token）未來僅會保存在後端，不會出現在此頁面。
            </p>
          </div>
        </div>

        {/* 串接準備進度 */}
        <div className="space-y-3">
          <div className="text-sm font-semibold">串接準備進度</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {CHECKLIST_ITEMS.map((item) => (
              <label
                key={item}
                className="flex items-start gap-2 rounded-lg border p-3 text-sm cursor-pointer"
              >
                <Checkbox
                  disabled={readOnly}
                  checked={!!checked[item]}
                  onCheckedChange={(v) =>
                    setChecked((prev) => ({ ...prev, [item]: v === true }))
                  }
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            此進度僅為管理用記錄，勾選不會呼叫任何 Google API。
          </p>
        </div>

        {/* 未來能力 preview */}
        <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
          <div className="text-sm font-semibold">啟用後可使用</div>
          <ul className="space-y-1 text-sm">
            {FUTURE_CAPABILITIES.map((c) => (
              <li key={c} className="text-muted-foreground">
                ✓ {c}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            功能將於 Google Business Profile API 完成授權後啟用。
          </p>
        </div>

        {/* 未來模式切換 */}
        <div className="space-y-2">
          <div className="text-sm font-semibold">評論同步來源</div>
          <RadioGroup value="places" className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="places" id="src-places" />
              <Label htmlFor="src-places" className="font-normal">
                Google Places API
              </Label>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <RadioGroupItem value="business" id="src-business" disabled />
              <Label htmlFor="src-business" className="font-normal text-muted-foreground">
                Google Business Profile API
              </Label>
              <span className="text-xs text-muted-foreground">
                完成 Google 商家授權後可啟用
              </span>
            </div>
          </RadioGroup>
        </div>
      </CardContent>
    </Card>
  );
};
