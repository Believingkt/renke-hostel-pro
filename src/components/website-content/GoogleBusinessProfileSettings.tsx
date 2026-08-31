import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExternalLink, ShieldCheck, Info, Lock, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useStaffPermissions } from "@/hooks/use-staff-permissions";
import { cn } from "@/lib/utils";

/**
 * OAuth PHASE 2 Preparation UI（NO OAUTH YET）。
 *
 * 本元件僅呈現「設定 / 狀態 / 進度」，不執行任何：
 *   - Google OAuth authorize / token exchange
 *   - refresh token 取得或保存
 *   - Business Profile API / Reviews API 呼叫
 *
 * DEVELOPER NOTE — Secret Architecture（Phase 2 才實作）：
 *   OAuth Client Secret 與 Refresh Token 必須存放於 server-side secret storage
 *   （Edge Function runtime secrets / vault），
 *   絕對不得放在：public table、frontend state、localStorage、sessionStorage、source code。
 *   實作前需另行進行 Security Design Audit。
 *   本 Phase 不建立任何 secret storage，資料表亦不得新增
 *   client_secret / access_token / refresh_token / authorization_code 欄位。
 *
 * SCHEMA NOTE：
 *   project_number 欄位尚未存在（migration proposal 待核准），本頁暫以唯讀 placeholder 呈現。
 *   authorized_google_email / authorized_at 亦僅為 proposal，應由真實 OAuth response 產生。
 */

export type BusinessProfileConnectionStatus =
  | "NOT_CONFIGURED"
  | "APPLICATION_PENDING"
  | "READY_FOR_OAUTH"
  | "CONNECTED"
  | "TOKEN_EXPIRED"
  | "ERROR";

export type BusinessProfileApplicationStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";

const STATUS_LABEL: Record<BusinessProfileConnectionStatus, string> = {
  NOT_CONFIGURED: "未設定",
  APPLICATION_PENDING: "申請審核中",
  READY_FOR_OAUTH: "待授權",
  CONNECTED: "已連線",
  TOKEN_EXPIRED: "授權失效",
  ERROR: "連線異常",
};

const APPLICATION_STATUS_LABEL: Record<BusinessProfileApplicationStatus, string> = {
  NOT_STARTED: "未申請",
  PENDING: "審核中",
  APPROVED: "已核准",
  REJECTED: "被拒絕",
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

const STEPS = [
  { no: 1, label: "Google Cloud 設定" },
  { no: 2, label: "API 申請" },
  { no: 3, label: "OAuth 串接" },
  { no: 4, label: "Google 商家綁定" },
];

const isConnectionStatus = (v: unknown): v is BusinessProfileConnectionStatus =>
  typeof v === "string" && v in STATUS_LABEL;

const isApplicationStatus = (v: unknown): v is BusinessProfileApplicationStatus =>
  typeof v === "string" && v in APPLICATION_STATUS_LABEL;

const StepBadge = ({
  current,
  no,
  label,
}: {
  current: number;
  no: number;
  label: string;
}) => {
  const done = no < current;
  const active = no === current;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap",
        active
          ? "border-primary bg-primary/10 font-semibold text-primary"
          : done
            ? "border-primary/25 bg-card text-foreground"
            : "border-border/60 bg-card text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums",
          done || active ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {done ? <Check className="h-3 w-3" /> : `0${no}`}
      </span>
      {label}
    </div>
  );
};

const ReadonlyRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
    <span className="font-medium">{label}</span>
    <span className="text-muted-foreground">{value}</span>
  </div>
);

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
  const [applicationStatus, setApplicationStatus] =
    useState<BusinessProfileApplicationStatus>("NOT_STARTED");
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
      isConnectionStatus(data?.connection_status) ? data.connection_status : "NOT_CONFIGURED"
    );
    setApplicationStatus(
      isApplicationStatus(data?.application_status) ? data.application_status : "NOT_STARTED"
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
          application_status: applicationStatus,
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

  // 純顯示用的步驟推算（不會自動改寫 connection_status）
  const currentStep =
    applicationStatus !== "APPROVED"
      ? projectId && clientId
        ? 2
        : 1
      : status === "CONNECTED"
        ? 4
        : 3;

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
              查看申請教學
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* 進度 Stepper */}
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="flex min-w-max items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s.no} className="flex items-center gap-2">
                <StepBadge current={currentStep} no={s.no} label={s.label} />
                {i < STEPS.length - 1 && (
                  <span aria-hidden className="h-px w-4 shrink-0 bg-border" />
                )}
              </div>
            ))}
          </div>
        </div>

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
            <span className="font-medium">Business Profile 連線狀態</span>
            <Badge variant="outline">{STATUS_LABEL[status]}</Badge>
            <span className="text-xs text-muted-foreground">
              本階段僅顯示狀態，不會自動變更。
            </span>
          </div>
        </div>

        {/* STEP 1 */}
        <section className="space-y-4">
          <div className="text-sm font-semibold">STEP 1｜Google Cloud 設定</div>
          <p className="text-xs text-muted-foreground">
            Google 審核完成後，請準備：① Project ID ② Project Number ③ OAuth Client ID。
          </p>
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
              <Label htmlFor="bp-project-number">Google Cloud Project Number</Label>
              <Input
                id="bp-project-number"
                disabled
                value=""
                placeholder="欄位待 migration 核准後開放"
                className="h-11 text-base font-mono"
              />
              <p className="text-xs text-muted-foreground">
                目前資料表尚無 project_number 欄位，已提出 migration proposal，核准後開放填寫。
              </p>
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
              <Label className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                OAuth Client Secret
              </Label>
              <div className="flex h-11 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                🔒 尚未設定
              </div>
              <p className="text-xs text-muted-foreground">
                Client Secret 屬於敏感憑證，將透過後端安全儲存，不會保存在一般設定資料表，也不會於設定頁顯示。
                請保留在 Google Cloud，不要貼入普通設定欄位。
              </p>
            </div>
          </div>
        </section>

        {/* STEP 2 */}
        <section className="space-y-3">
          <div className="text-sm font-semibold">STEP 2｜Business Profile API Access 申請</div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>API Access 狀態</Label>
              <Select
                value={applicationStatus}
                onValueChange={(v) =>
                  setApplicationStatus(v as BusinessProfileApplicationStatus)
                }
                disabled={readOnly}
              >
                <SelectTrigger className="h-11 w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(APPLICATION_STATUS_LABEL) as BusinessProfileApplicationStatus[]
                  ).map((k) => (
                    <SelectItem key={k} value={k}>
                      {APPLICATION_STATUS_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button asChild variant="outline" className="gap-2">
              <a
                href="/help/google-business-profile-api"
                target="_blank"
                rel="noopener noreferrer"
              >
                查看申請教學
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </section>

        {/* STEP 3 */}
        <section className="space-y-3">
          <div className="text-sm font-semibold">STEP 3｜OAuth 串接</div>
          <div className="rounded-lg border p-3 text-sm space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium">OAuth Redirect URI</div>
              <Badge variant="outline">NOT_READY</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                readOnly
                disabled
                value=""
                placeholder="OAuth Backend 尚未建立（未來由系統自動產生）"
                className="h-10 flex-1 min-w-[240px] font-mono text-sm"
              />
              <Button type="button" variant="outline" size="sm" disabled className="gap-2">
                <Copy className="h-3.5 w-3.5" />
                複製
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Redirect URI 不開放手動填寫，Phase 2 backend 建立後由系統產生正式 callback URL。
            </p>
          </div>

          <div className="rounded-lg border p-3 text-sm space-y-2">
            <div className="font-medium flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Google 商家帳號授權
            </div>
            <div className="text-muted-foreground">尚未授權</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" disabled>
                連結 Google 商家帳號
              </Button>
              <span className="text-xs text-muted-foreground">OAuth 功能尚未啟用</span>
            </div>
            <p className="text-xs text-muted-foreground">
              授權憑證（Refresh Token）未來僅會保存在後端，不會出現在此頁面。
            </p>
          </div>
        </section>

        {/* STEP 4 */}
        <section className="space-y-3">
          <div className="text-sm font-semibold">STEP 4｜Google 商家綁定</div>
          <div className="grid gap-4 sm:grid-cols-2">
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
              <p className="text-xs text-muted-foreground">
                未來由 Google 授權後自動取得（下拉選單，僅一個時自動選取），不需人工填寫。
              </p>
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
              <p className="text-xs text-muted-foreground">
                未來改為「Google 授權後選擇商家」（顯示商家名稱與地址），底層自動保存 Location ID。
              </p>
            </div>
          </div>
        </section>

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

        {/* OAuth 後未來狀態 preview（唯讀 placeholder） */}
        <div className="space-y-2">
          <div className="text-sm font-semibold">OAuth 狀態（Phase 2 後啟用）</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <ReadonlyRow label="授權 Google 帳號" value="尚未授權" />
            <ReadonlyRow label="Google Business Account" value="尚未取得" />
            <ReadonlyRow label="Google 商家 Location" value="尚未綁定" />
            <ReadonlyRow label="OAuth 狀態" value="尚未建立" />
            <ReadonlyRow label="最近授權時間" value="—" />
            <ReadonlyRow label="最近 Token Refresh" value="—" />
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

        {/* 未來同步設定 preview（disabled） */}
        <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold">Business Profile 評論同步（預覽）</div>
            <Badge variant="outline">尚未啟用</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>每次同步評論數量</Label>
              <Select value="50" disabled>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20 則</SelectItem>
                  <SelectItem value="50">50 則</SelectItem>
                  <SelectItem value="all">全部可取得評論</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>同步排序策略</Label>
              <Select value="latest" disabled>
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="latest">最新優先</SelectItem>
                  <SelectItem value="rating">高星優先</SelectItem>
                  <SelectItem value="rating_latest">高星＋最新</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            此為「候選池同步策略」，不是只抓五星；Reviews API 取得資料後才在本地篩選／排序。
          </p>
          <p className="text-xs text-muted-foreground">
            Business Profile 啟用後候選評論池可達 20～50+ 則；前台顯示則沿用現有的「前台顯示則數」設定，兩者互相獨立。
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
