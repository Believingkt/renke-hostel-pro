/**
 * 「官網內容 → 訂房確認通知」Email 即時預覽。
 *
 * 唯讀預覽：不建立/修改訂單、不寫入 DB、不寄信、不建立 ATM 虛擬帳號、不呼叫 TapPay。
 * HTML 由正式訂房確認信的同一份 renderer（_shared/orderConfirmationEmail.ts）產生，
 * 付款摘要一律由正式 resolvePaymentSummary 計算，前端不重寫任何訂金／尾款公式。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail, RefreshCw, ChevronDown } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export interface EmailPreviewSettings {
  contactPhone: string;
  contactEmail: string;
  showSecurityDepositNotice: boolean;
  securityDepositNoticeTitle: string;
  securityDepositNotice: string;
}

const SCENARIOS: { value: string; label: string }[] = [
  { value: "A", label: "A：ATM 訂金未付款" },
  { value: "B", label: "B：ATM 訂金已付款" },
  { value: "C", label: "C：ATM 訂金部分付款" },
  { value: "D", label: "D：信用卡全額付款" },
  { value: "E", label: "E：無訂金 · 未付款" },
  { value: "LEGACY", label: "歷史訂單 fallback（訂金寫在備註）" },
];

const DEFAULT_OVERRIDES = {
  final_price: 20000,
  booking_deposit_amount: 6000,
  booking_deposit_percentage: 30,
  paid_amount: 0,
  check_in_date: "2026-10-20",
  check_out_date: "2026-10-21",
  atm_expire_at: "",
};

interface Props {
  accommodationId: string | null;
  settings: EmailPreviewSettings;
}

export function BookingConfirmationEmailPreview({ accommodationId, settings }: Props) {
  const [scenario, setScenario] = useState("A");
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showData, setShowData] = useState(false);
  const [overrides, setOverrides] = useState({ ...DEFAULT_OVERRIDES });
  const [useOverrides, setUseOverrides] = useState(false);
  const timer = useRef<number | null>(null);

  // 切換館別時回到預設預覽資料
  useEffect(() => {
    setOverrides({ ...DEFAULT_OVERRIDES });
    setUseOverrides(false);
  }, [accommodationId]);

  const payload = useMemo(
    () => ({
      accommodation_id: accommodationId,
      scenario,
      accommodation_override: {
        phone: settings.contactPhone || null,
        email: settings.contactEmail || null,
        email_show_security_deposit_notice: settings.showSecurityDepositNotice,
        email_security_deposit_notice_title: settings.securityDepositNoticeTitle || null,
        email_security_deposit_notice: settings.securityDepositNotice || null,
      },
      overrides: useOverrides
        ? {
            final_price: Number(overrides.final_price) || 0,
            booking_deposit_amount:
              overrides.booking_deposit_amount === null || overrides.booking_deposit_amount === undefined
                ? null
                : Number(overrides.booking_deposit_amount),
            booking_deposit_percentage:
              overrides.booking_deposit_percentage === null
                ? null
                : Number(overrides.booking_deposit_percentage),
            paid_amount: Number(overrides.paid_amount) || 0,
            check_in_date: overrides.check_in_date,
            check_out_date: overrides.check_out_date,
            ...(overrides.atm_expire_at
              ? { atm_expire_at: new Date(overrides.atm_expire_at).toISOString() }
              : {}),
          }
        : {},
    }),
    [accommodationId, scenario, settings, overrides, useOverrides],
  );

  const load = useCallback(async () => {
    if (!accommodationId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/preview-booking-confirmation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
        body: JSON.stringify(payload),
      });
      const text = await resp.text();
      if (!resp.ok) throw new Error(text || `HTTP ${resp.status}`);
      setHtml(text);
    } catch (e) {
      setError((e as Error).message || "預覽載入失敗");
    } finally {
      setLoading(false);
    }
  }, [accommodationId, payload]);

  // 表單修改後即時（debounce）更新預覽
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void load(), 500);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [load]);

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-1.5 bg-primary rounded-full" />
          <div className="flex-1">
            <CardTitle className="text-xl flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Email 預覽
            </CardTitle>
            <CardDescription>
              與正式訂房確認信共用同一份版型與付款摘要邏輯。此處為預覽測試資料，不會建立訂單、不會寄出信件。
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1 max-w-sm space-y-2">
            <Label>預覽情境</Label>
            <Select value={scenario} onValueChange={setScenario}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCENARIOS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            重新整理預覽
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowData((v) => !v)}
            className="sm:ml-auto"
          >
            預覽資料
            <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${showData ? "rotate-180" : ""}`} />
          </Button>
        </div>

        {showData && (
          <div className="rounded-lg border border-border p-4 space-y-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                以下欄位只影響預覽，不會存入任何設定或訂單。
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOverrides({ ...DEFAULT_OVERRIDES });
                  setUseOverrides(false);
                }}
              >
                回到情境預設
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { key: "final_price", label: "房價總額", type: "number" },
                { key: "booking_deposit_amount", label: "訂金金額", type: "number" },
                { key: "booking_deposit_percentage", label: "訂金比例 (%)", type: "number" },
                { key: "paid_amount", label: "已付金額", type: "number" },
                { key: "check_in_date", label: "入住日", type: "date" },
                { key: "check_out_date", label: "退房日", type: "date" },
                { key: "atm_expire_at", label: "ATM 到期時間", type: "datetime-local" },
              ].map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-sm">{f.label}</Label>
                  <Input
                    type={f.type}
                    value={String((overrides as Record<string, unknown>)[f.key] ?? "")}
                    onChange={(e) => {
                      setUseOverrides(true);
                      setOverrides((prev) => ({
                        ...prev,
                        [f.key]:
                          f.type === "number"
                            ? e.target.value === ""
                              ? null
                              : Number(e.target.value)
                            : e.target.value,
                      }));
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">預覽載入失敗：{error}</p>
        )}

        <div className="rounded-lg border border-border overflow-hidden bg-muted">
          <iframe
            title="booking-confirmation-email-preview"
            srcDoc={html}
            sandbox=""
            className="w-full"
            style={{ height: "1400px", border: 0, background: "#f5f5f5" }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
