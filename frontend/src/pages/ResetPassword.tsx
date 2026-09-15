import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { parseFunctionInvokeError } from "@/utils/parseFunctionError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { isPmsMode } from "@/lib/appMode";
import { Loader2, KeyRound, Eye, EyeOff, AlertCircle, CheckCircle2 } from "lucide-react";
import lokezeLogo from "@/assets/lokeze-logo-auth.png";
import { getPasswordIssues } from "@/utils/passwordPolicy";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [tokenData, setTokenData] = useState<{ user_id: string; email: string } | null>(null);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [isResending, setIsResending] = useState(false);

  const [isRecoverySession, setIsRecoverySession] = useState(false);

  useEffect(() => {
    validateToken();
  }, [token]);

  const validateToken = async () => {
    if (!token) {
      // Supabase 原生 recovery 連結：token 在 URL hash / query，SDK 會自動建立 session
      const blob = `${window.location.hash || ""}${window.location.search || ""}`;
      if (blob.includes("type=recovery") || blob.includes("access_token") || blob.includes("code=")) {
        try {
          const { data } = await supabase.auth.getSession();
          if (data.session?.user) {
            setIsRecoverySession(true);
            setIsValidToken(true);
            setTokenData({
              user_id: data.session.user.id,
              email: data.session.user.email || "",
            });
          }
        } catch (e) {
          console.error("[ResetPassword] recovery session error:", e);
        }
      }
      setIsValidating(false);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("validate-reset-token", {
        body: { token },
      });

      if (error) {
        console.error("Token validation error:", error);
        setIsValidToken(false);
      } else if (data?.valid) {
        setIsValidToken(true);
        setTokenData({ user_id: data.user_id, email: data.email });
      } else {
        console.log("Token invalid:", data?.message);
        setIsValidToken(false);
      }
    } catch (error) {
      console.error("Error validating token:", error);
      setIsValidToken(false);
    } finally {
      setIsValidating(false);
    }
  };


  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim()) {
      toast.error("請輸入電子郵件");
      return;
    }
    setIsResending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-password-reset", {
        body: { email: resendEmail.trim() },
      });
      if (error) {
        const parsed = await parseFunctionInvokeError(error);
        throw new Error(parsed.message);
      }
      if (data?.error) throw new Error(data.error);
      toast.success("重設密碼郵件已重新寄出，請檢查您的信箱");
      setResendEmail("");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "發送失敗，請稍後再試";
      toast.error(message);
    } finally {
      setIsResending(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    console.log("[ResetPassword] handleResetPassword called");

    if (newPassword !== confirmPassword) {
      const msg = "兩次輸入的密碼不一致";
      setErrorMessage(msg);
      toast.error(msg);
      console.log("[ResetPassword] Password mismatch");
      return;
    }

    const issues = getPasswordIssues(newPassword, { email: tokenData?.email });
    if (issues.length > 0) {
      setErrorMessage(issues[0]);
      toast.error(issues[0]);
      console.log("[ResetPassword] Password policy issue:", issues[0]);
      return;
    }

    if (!tokenData) {
      const msg = "無效的重設連結";
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }

    setIsLoading(true);

    try {
      if (isRecoverySession) {
        console.log("[ResetPassword] Updating password via recovery session...");
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw new Error(error.message || "重設密碼失敗");
      } else {
        console.log("[ResetPassword] Calling update-password...");
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-password`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({ token, newPassword }),
          }
        );

        const data = await response.json();
        console.log("[ResetPassword] Response:", { status: response.status, data });

        if (!response.ok || data?.error) {
          throw new Error(data?.error || "重設密碼失敗");
        }
      }


      setErrorMessage("");
      setSuccessMessage("密碼已重設成功");
      toast.success("密碼已重設成功");
      setTimeout(() => navigate(isPmsMode() ? "/login" : "/auth"), 2500);
    } catch (error: any) {
      console.error("[ResetPassword] Error:", error);
      const msg = error.message || "重設密碼失敗，請稍後再試";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return null;
  }

  if ((!token && !isRecoverySession) || !isValidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 p-4">
        <Card className="w-full max-w-md shadow-xl border-0">
          <CardHeader className="space-y-1 text-center pb-2">
            <div className="flex justify-center mb-4">
              <img src={lokezeLogo} alt="Logo" className="h-12 object-contain" />
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <CardDescription className="text-center text-destructive">
                連結無效或已過期
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              此重設密碼連結已失效，請輸入電子郵件重新取得連結。
            </p>
            <form onSubmit={handleResend} className="space-y-3">
              <div className="space-y-2 text-left">
                <Label htmlFor="resend-email">電子郵件</Label>
                <Input
                  id="resend-email"
                  type="email"
                  autoComplete="email"
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                />
              </div>
              <Button type="submit" className="w-full bg-auth-primary hover:bg-auth-primary-hover" disabled={isResending}>
                {isResending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                重新寄送重設信
              </Button>
            </form>
            <Button variant="ghost" onClick={() => navigate(isPmsMode() ? "/login" : "/auth")} className="w-full">
              返回登入頁面
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="space-y-1 text-center pb-2">
          <div className="flex justify-center mb-4">
            <img src={lokezeLogo} alt="Logo" className="h-12 object-contain" />
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <KeyRound className="h-5 w-5 text-auth-primary" />
            <CardDescription className="text-center">
              設定您的新密碼
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">電子郵件</Label>
              <Input
                id="email"
                type="email"
                value={tokenData?.email || ""}
                disabled
                className="bg-auth-primary/10 border-auth-primary/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">新密碼</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="至少 8 個字元"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  className="focus-visible:ring-auth-primary"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">確認新密碼</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="再次輸入新密碼"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="focus-visible:ring-auth-primary"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            {successMessage && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 border border-green-200 text-green-700 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}
            {errorMessage && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
            <Button type="submit" className="w-full bg-auth-primary hover:bg-auth-primary-hover" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              重設密碼
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
