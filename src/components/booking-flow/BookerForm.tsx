import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, CheckCircle, Clock, ShieldCheck, User } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getOtpCooldown, markOtpSent } from "@/lib/otpThrottle";

interface GuestInfo {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  eta: string;
}

interface Props {
  loggedInMember: { id: string; name: string; email: string; phone: string } | null;
  guestInfo: GuestInfo;
  setGuestInfo: (info: GuestInfo) => void;
  errors: Record<string, string>;
  setErrors: (errors: Record<string, string>) => void;
  emailCheckStatus: "idle" | "checking" | "exists" | "new" | "registered";
  otpCode: string;
  setOtpCode: (v: string) => void;
  otpSending: boolean;
  setOtpSending: (v: boolean) => void;
  otpSent: boolean;
  setOtpSent: (v: boolean) => void;
  otpVerifying: boolean;
  otpError: string;
  setOtpError: (v: string) => void;
  handleVerifyOtp: () => void;
  registerPassword: string;
  setRegisterPassword: (v: string) => void;
  registerSubmitting: boolean;
  handleQuickRegister: (withPassword: boolean) => void;
}

export default function BookerForm(props: Props) {
  const {
    loggedInMember,
    guestInfo,
    setGuestInfo,
    errors,
    setErrors,
    emailCheckStatus,
    otpCode,
    setOtpCode,
    otpSending,
    setOtpSending,
    otpSent,
    setOtpSent,
    otpVerifying,
    otpError,
    setOtpError,
    handleVerifyOtp,

    registerPassword,
    setRegisterPassword,
    registerSubmitting,
    handleQuickRegister,
  } = props;
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      {loggedInMember ? (
        <Card className="border-2 border-green-200 bg-green-50/50">
          <CardContent className="py-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
              <p className="text-sm font-medium text-green-800">
                已登入會員：{loggedInMember.name}，訂房可累積紅利點數
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border border-orange-200 bg-orange-50/40">
          <CardContent className="py-3">
            <p className="text-sm text-orange-800">
              💡 填寫下方 Email 後可一鍵註冊或登入會員，累積紅利點數與享會員專屬優惠（選填，可直接繼續下單）
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="border-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            基本資料
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            請填寫您的基本聯絡資訊，以便我們與您確認訂房細節
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium">
              姓名 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              value={guestInfo.name}
              onChange={(e) => {
                setGuestInfo({ ...guestInfo, name: e.target.value });
                setErrors({ ...errors, name: "" });
              }}
              placeholder="請輸入您的姓名"
              className={`h-12 ${errors.name ? "border-destructive" : ""}`}
              maxLength={50}
            />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-sm font-medium">
              手機號碼 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="phone"
              type="tel"
              value={guestInfo.phone}
              onChange={(e) => {
                setGuestInfo({ ...guestInfo, phone: e.target.value });
                setErrors({ ...errors, phone: "" });
              }}
              placeholder="0912345678"
              className={`h-12 ${errors.phone ? "border-destructive" : ""}`}
              maxLength={10}
            />
            {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
              電子郵件 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              value={guestInfo.email}
              onChange={(e) => {
                setGuestInfo({ ...guestInfo, email: e.target.value });
                setErrors({ ...errors, email: "" });
              }}
              placeholder="example@email.com"
              className={`h-12 ${errors.email ? "border-destructive" : ""}`}
              maxLength={100}
            />
            {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}

            <p className="text-xs text-muted-foreground mt-1">訂單確認函將寄送至此電子郵件</p>

            {loggedInMember && (
              <div className="mt-2 flex items-center gap-2 text-sm font-medium text-emerald-700">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                <span>會員歡迎您回來！</span>
              </div>
            )}

            {!loggedInMember && emailCheckStatus === "checking" && (
              <p className="text-xs text-muted-foreground mt-1">正在檢查會員狀態...</p>
            )}

            {!loggedInMember && emailCheckStatus === "exists" && (
              <div className="mt-3 p-4 rounded-lg border-2 border-blue-200 bg-blue-50/50 space-y-3">
                <p className="text-sm font-medium text-blue-900">
                  {otpSending
                    ? "正在寄送驗證碼..."
                    : otpSent
                    ? "已寄送 6 位數驗證碼至您的信箱，請於下方輸入完成登入（10 分鐘內有效）"
                    : "此 Email 已註冊為會員"}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={otpCode}
                    onChange={(e) => {
                      setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                      if (otpError) setOtpError("");
                    }}
                    placeholder="6 位數驗證碼"
                    className={`h-11 flex-1 ${otpError ? "border-destructive" : ""}`}
                    inputMode="numeric"
                    maxLength={6}
                    aria-invalid={!!otpError}
                  />
                  <Button
                    type="button"
                    onClick={handleVerifyOtp}
                    disabled={otpVerifying || otpCode.length < 6}
                    className="h-11 sm:w-auto w-full"
                  >
                    {otpVerifying ? "驗證中..." : "驗證並登入"}
                  </Button>
                </div>

                {otpError && (
                  <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                    <AlertCircle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-medium text-destructive break-words">{otpError}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        下一步：確認信件中最新的驗證碼後再試一次，或按下方「重新寄送驗證碼」。
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10"
                    onClick={async () => {
                      const email = guestInfo.email.trim().toLowerCase();
                      const wait = getOtpCooldown(email);
                      if (wait > 0) {
                        setCooldown(wait);
                        return;
                      }
                      setOtpError("");
                      setOtpSending(true);
                      const { error } = await supabase.auth.signInWithOtp({
                        email,
                        options: { shouldCreateUser: false },
                      });
                      setOtpSending(false);
                      if (!error) {
                        markOtpSent(email);
                        setOtpSent(true);
                        setOtpCode("");
                        setCooldown(getOtpCooldown(email) || 60);
                        toast({ title: "驗證碼已重新寄出", description: "請查看信箱中最新一封驗證信" });
                      } else {
                        setOtpError(error.message || "驗證碼寄送失敗，請稍後再試。");
                      }
                    }}
                    disabled={otpSending || otpVerifying || cooldown > 0}
                  >
                    {otpSending
                      ? "寄送中..."
                      : cooldown > 0
                      ? `重新寄送（${cooldown} 秒）`
                      : "重新寄送驗證碼"}
                  </Button>
                  {cooldown > 0 && (
                    <span className="text-xs text-muted-foreground">
                      為避免重複寄送，請稍候再試
                    </span>
                  )}
                </div>

                <div className="rounded-md bg-white/70 border border-blue-100 p-3">
                  <p className="text-xs font-medium text-blue-900 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    安全提醒
                  </p>
                  <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground leading-relaxed break-words">
                    <li>• 驗證碼僅供本人使用，請勿轉發或告知任何人（包含自稱客服者）。</li>
                    <li>• 我們不會以電話或訊息向您索取驗證碼。</li>
                    <li>• 請只在本頁面輸入驗證碼，勿點擊他人提供的連結，以防釣魚網站。</li>
                  </ul>
                </div>
              </div>
            )}


            {!loggedInMember && emailCheckStatus === "new" && (
              <div className="mt-3 p-4 rounded-lg border-2 border-primary/30 bg-primary/5 space-y-3">
                <p className="text-sm font-medium">此 Email 尚未註冊，可立即成為會員享優惠</p>
                <Button
                  type="button"
                  onClick={() => handleQuickRegister(false)}
                  disabled={registerSubmitting}
                  className="w-full h-11"
                >
                  {registerSubmitting ? "註冊中..." : "🎉 一鍵註冊會員（免密碼）"}
                </Button>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">或設定登入密碼（選填）</Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      placeholder="至少 8 碼"
                      className="h-11 flex-1"
                      maxLength={64}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleQuickRegister(true)}
                      disabled={registerSubmitting || registerPassword.length < 8}
                      className="h-11"
                    >
                      註冊
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {emailCheckStatus === "registered" && !loggedInMember && (
              <div className="mt-3 p-3 rounded-lg border border-green-200 bg-green-50/60">
                <p className="text-sm text-green-800">
                  ✓ 會員已建立，驗證信已寄出。您可繼續完成訂房。
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            其他資訊
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-2">選填項目，可幫助我們提供更好的服務</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="eta" className="text-sm font-medium">
              預計抵達時間（選填）
            </Label>
            <Select
              value={guestInfo.eta || undefined}
              onValueChange={(v) => setGuestInfo({ ...guestInfo, eta: v })}
            >
              <SelectTrigger id="eta" className="h-12">
                <SelectValue placeholder="請選擇預計抵達時間" />
              </SelectTrigger>
              <SelectContent>
                {[
                  "15:00 前",
                  "15:00 - 16:00",
                  "16:00 - 17:00",
                  "17:00 - 18:00",
                  "18:00 - 19:00",
                  "19:00 - 20:00",
                  "20:00 - 21:00",
                  "21:00 後",
                  "尚未確定",
                ].map((slot) => (
                  <SelectItem key={slot} value={slot}>
                    {slot}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-medium">
              特殊需求 / 備註（選填）
            </Label>
            <Textarea
              id="notes"
              value={guestInfo.notes}
              onChange={(e) => setGuestInfo({ ...guestInfo, notes: e.target.value })}
              placeholder="如有飲食、寢具、無障礙等特殊需求，請在此說明"
              rows={5}
              maxLength={500}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">
              {guestInfo.notes.length} / 500
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
        <div className="flex gap-3">
          <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">請確保資料正確</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              我們會透過您提供的聯絡方式寄送訂單確認信，並在入住前與您聯繫確認相關細節
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
