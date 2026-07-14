import { useState, useEffect } from "react";
import lokezeLogo2 from "@/assets/lakeze-portal-logo.png";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { LINE_CHANNEL_ID, FACEBOOK_APP_ID } from "@/config/oauth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Mail, Lock, User, Phone, Loader2, ArrowLeft, CheckCircle, MapPin, Globe, Users, Copy, AlertCircle } from "lucide-react";
import { getPasswordIssues } from "@/utils/passwordPolicy";
import { useLoginThrottle } from "@/hooks/use-login-throttle";
import { detectInAppBrowser, inAppBrowserLabel, shouldBlockOAuthInApp } from "@/utils/inAppBrowser";
import { reportFrontendError } from "@/utils/errorReporter";

type ViewMode = "auth" | "forgot-password" | "signup-success";

// Always use the canonical production origin for OAuth redirect URIs so that
// the resulting Supabase session lands on booking.lakeze.com (not on preview
// domains or www variants where the session cookie would end up orphaned).
const PROD_ORIGIN = "https://booking.lakeze.com";
const OAUTH_LAUNCH_TIMEOUT_MS = 15000;

function logLoginAttempt(
  phase: "attempt" | "success" | "failure",
  provider: string,
  extra: Record<string, unknown> = {},
) {
  const payload = {
    phase,
    provider,
    ua: typeof navigator !== "undefined" ? navigator.userAgent.substring(0, 200) : "",
    href: typeof window !== "undefined" ? window.location.href : "",
    ...extra,
  };
  console.log(`[MemberAuth] login ${phase}`, payload);
  if (phase === "failure") {
    void reportFrontendError({
      category: "auth_login",
      step: `${provider}_${phase}`,
      errorMessage: String(extra.error || `${provider} login failed`),
      context: payload,
    });
  }
}

const MemberAuth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/member/profile";
  const [loading, setLoading] = useState(false);
  const [fbLoading, setFbLoading] = useState(false);
  const [lineLoading, setLineLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("auth");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupGender, setSignupGender] = useState("");
  const [signupNationality, setSignupNationality] = useState("");
  const [signupAddress, setSignupAddress] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  // Email OTP fallback (works even when social login is broken)
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);

  // In-app browser guidance dialog
  const [guide, setGuide] = useState<{ target: "line" | "facebook"; current: "line" | "facebook" | "instagram" } | null>(null);

  // URL-level error message (from callback redirects like ?error=line_login_failed)
  const urlError = searchParams.get("error");
  const urlReason = searchParams.get("reason");

  useEffect(() => {
    if (!urlError) return;
    const map: Record<string, string> = {
      line_login_failed: "LINE 登入失敗，請重試",
      facebook_login_failed: "Facebook 登入失敗，請重試",
    };
    toast.error(map[urlError] || "登入失敗，請重試");
    logLoginAttempt("failure", urlError, { reason: urlReason });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlError]);

  const throttle = useLoginThrottle(`member:${loginEmail.toLowerCase().trim()}`);


  // 監聯 auth 狀態，已登入且有會員資料時自動跳轉
  useEffect(() => {
    const checkExisting = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: member } = await supabase
          .from("platform_members")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle();
        if (member) {
          navigate(redirectTo, { replace: true });
        }
      }
    };
    checkExisting();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (throttle.isLocked) {
      toast.error(`登入嘗試次數過多，請於 ${throttle.remainingSeconds} 秒後再試`);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });
      if (error) throw error;

      throttle.recordSuccess();
      await ensureMemberProfile();
      toast.success("登入成功");
      navigate(redirectTo);
    } catch (error: any) {
      const result = throttle.recordFailure();
      if (error.message?.includes("Email not confirmed")) {
        toast.error("Email 尚未驗證，請先查收驗證信件");
      } else if (error.message?.includes("Invalid login")) {
        if (result.locked) {
          toast.error("登入嘗試次數過多，已暫時鎖定 5 分鐘");
        } else {
          const left = 5 - result.attempts;
          toast.error(`Email 或密碼錯誤${left > 0 ? `（剩餘 ${left} 次嘗試）` : ""}`);
        }
      } else {
        toast.error(error.message || "登入失敗");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupName.trim()) {
      toast.error("請輸入姓名");
      return;
    }
    if (!signupEmail.trim()) {
      toast.error("請輸入 Email");
      return;
    }
    if (!signupPhone.trim()) {
      toast.error("請輸入手機號碼");
      return;
    }
    if (signupPassword !== signupConfirmPassword) {
      toast.error("密碼不一致");
      return;
    }
    
    const issues = getPasswordIssues(signupPassword, { email: signupEmail });
    if (issues.length > 0) {
      toast.error(issues[0]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: {
          data: { name: signupName, phone: signupPhone, gender: signupGender || null, nationality: signupNationality || null, address: signupAddress || null },
          emailRedirectTo: window.location.origin + "/member/profile",
        },
      });
      if (error) throw error;

      // Send branded welcome email via Resend
      try {
        await supabase.functions.invoke("send-resend-email", {
          body: {
            templateType: "signup",
            recipientEmail: signupEmail,
            templateData: {
              confirmationUrl: window.location.origin + "/member/profile",
            },
          },
        });
      } catch (emailErr) {
        console.error("Welcome email send error (non-blocking):", emailErr);
      }

      // Auto-confirm is enabled, so create profile and redirect
      if (data.user) {
        await ensureMemberProfile();
        toast.success("註冊成功！歡迎加入人客多");
        navigate(redirectTo);
      } else {
        setViewMode("signup-success");
      }
    } catch (error: any) {
      if (error.message?.includes("already registered")) {
        toast.error("此 Email 已註冊，請直接登入");
      } else {
        toast.error(error.message || "註冊失敗");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Use Supabase to generate reset link, then send branded email via Resend
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/member/reset-password`,
      });
      if (error) throw error;

      // Send branded reset email via Resend (non-blocking)
      try {
        await supabase.functions.invoke("send-resend-email", {
          body: {
            templateType: "recovery",
            recipientEmail: forgotEmail,
            templateData: {
              confirmationUrl: `${window.location.origin}/member/reset-password`,
            },
          },
        });
      } catch (emailErr) {
        console.error("Resend recovery email error (non-blocking):", emailErr);
      }

      setForgotSent(true);
    } catch (error: any) {
      toast.error(error.message || "發送重設信件失敗");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthLogin = async (provider: "google" | "apple") => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      
      await ensureMemberProfile();
      toast.success(`${provider === "google" ? "Google" : "Apple"} 登入成功`);
      navigate(redirectTo);
    } catch (error: any) {
      toast.error(error.message || `${provider === "google" ? "Google" : "Apple"} 登入失敗`);
      setLoading(false);
    }
  };

  // ----- Facebook Login (Custom OAuth — same architecture as LINE) -----
  const handleFacebookLogin = () => {
    if (fbLoading || lineLoading || loading) return;

    // In-app browser guardrail: cross-provider is blocked (e.g. FB login inside
    // LINE's in-app browser routinely fails silently).
    const current = detectInAppBrowser();
    if (shouldBlockOAuthInApp("facebook", current) && current) {
      setGuide({ target: "facebook", current });
      logLoginAttempt("failure", "facebook", { blocked_in_app: current });
      return;
    }

    logLoginAttempt("attempt", "facebook");
    setFbLoading(true);
    try {

      const appId = FACEBOOK_APP_ID;
      const state = crypto.randomUUID();
      const redirectUri = `${PROD_ORIGIN}/member/auth/facebook-callback`;

      localStorage.setItem("fb_oauth_state", state);
      localStorage.setItem("fb_oauth_redirect_uri", redirectUri);
      localStorage.setItem("fb_oauth_ts", String(Date.now()));

      const authorizeUrl = new URL("https://www.facebook.com/v18.0/dialog/oauth");
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set("client_id", appId);
      authorizeUrl.searchParams.set("redirect_uri", redirectUri);
      authorizeUrl.searchParams.set("state", state);
      authorizeUrl.searchParams.set("scope", "public_profile,email");

      // 15s timeout — if redirect hasn't happened by then, recover button.
      window.setTimeout(() => {
        toast.error("登入啟動失敗，請檢查網路後重試", {
          action: { label: "重試", onClick: () => handleFacebookLogin() },
        });
        logLoginAttempt("failure", "facebook", { error: "launch_timeout" });
        setFbLoading(false);
      }, OAUTH_LAUNCH_TIMEOUT_MS);

      redirected = true;
      window.location.href = authorizeUrl.toString();

    } catch (error: any) {
      const msg = error?.message || "登入啟動失敗，請檢查網路後重試";
      toast.error(msg, {
        action: { label: "重試", onClick: () => handleFacebookLogin() },
      });
      logLoginAttempt("failure", "facebook", { error: msg });
      setFbLoading(false);
    }
  };

  // ----- LINE Login v2.1 (OIDC) — manual authorize redirect -----
  const handleLineLogin = () => {
    if (fbLoading || lineLoading || loading) return;

    const current = detectInAppBrowser();
    if (shouldBlockOAuthInApp("line", current) && current) {
      setGuide({ target: "line", current });
      logLoginAttempt("failure", "line", { blocked_in_app: current });
      return;
    }

    logLoginAttempt("attempt", "line");
    setLineLoading(true);
    try {
      const channelId = LINE_CHANNEL_ID;
      const state = crypto.randomUUID();
      const nonce = crypto.randomUUID();
      const redirectUri = `${PROD_ORIGIN}/member/auth/line-callback`;

      localStorage.setItem("line_oauth_state", state);
      localStorage.setItem("line_oauth_nonce", nonce);
      localStorage.setItem("line_oauth_redirect_uri", redirectUri);
      localStorage.setItem("line_oauth_ts", String(Date.now()));

      const authorizeUrl = new URL("https://access.line.me/oauth2/v2.1/authorize");
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set("client_id", channelId);
      authorizeUrl.searchParams.set("redirect_uri", redirectUri);
      authorizeUrl.searchParams.set("state", state);
      authorizeUrl.searchParams.set("scope", "openid profile email");
      authorizeUrl.searchParams.set("nonce", nonce);

      window.setTimeout(() => {
        toast.error("登入啟動失敗，請檢查網路後重試", {
          action: { label: "重試", onClick: () => handleLineLogin() },
        });
        logLoginAttempt("failure", "line", { error: "launch_timeout" });
        setLineLoading(false);
      }, OAUTH_LAUNCH_TIMEOUT_MS);

      window.location.href = authorizeUrl.toString();
    } catch (error: any) {
      const msg = error?.message || "登入啟動失敗，請檢查網路後重試";
      toast.error(msg, {
        action: { label: "重試", onClick: () => handleLineLogin() },
      });
      logLoginAttempt("failure", "line", { error: msg });
      setLineLoading(false);
    }
  };

  // ----- Email OTP fallback (6-digit code) -----
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpEmail.trim()) {
      toast.error("請輸入 Email");
      return;
    }
    logLoginAttempt("attempt", "email_otp");
    setOtpLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: otpEmail.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${PROD_ORIGIN}/member/profile`,
        },
      });
      if (error) throw error;
      setOtpSent(true);
      toast.success("驗證碼已寄出，請至信箱查收");
    } catch (error: any) {
      const msg = error?.message || "驗證碼寄送失敗，請重試";
      toast.error(msg);
      logLoginAttempt("failure", "email_otp", { step: "send", error: msg });
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim() || otpCode.trim().length < 6) {
      toast.error("請輸入 6 碼驗證碼");
      return;
    }
    setOtpLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: otpEmail.trim(),
        token: otpCode.trim(),
        type: "email",
      });
      if (error) throw error;
      await ensureMemberProfile();
      logLoginAttempt("success", "email_otp");
      toast.success("登入成功");
      navigate(redirectTo);
    } catch (error: any) {
      const msg = error?.message || "驗證碼錯誤或已過期";
      toast.error(msg);
      logLoginAttempt("failure", "email_otp", { step: "verify", error: msg });
    } finally {
      setOtpLoading(false);
    }
  };


  const ensureMemberProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existing } = await supabase
      .from("platform_members")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      await supabase.from("platform_members").insert({
        user_id: user.id,
        name: user.user_metadata?.name || user.email?.split("@")[0] || "",
        email: user.email || "",
        phone: user.user_metadata?.phone || null,
        avatar_url: user.user_metadata?.avatar_url || null,
        gender: user.user_metadata?.gender || null,
        nationality: user.user_metadata?.nationality || null,
        address: user.user_metadata?.address || null,
      } as any);
    }
  };

  // 註冊成功畫面
  if (viewMode === "signup-success") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card>
            <CardContent className="py-10 text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: "hsl(24, 100%, 95%)" }}>
                <Mail className="h-8 w-8" style={{ color: "hsl(24, 100%, 50%)" }} />
              </div>
              <h2 className="text-xl font-bold">驗證信已送出</h2>
              <p className="text-muted-foreground text-sm">
                我們已將驗證信寄至 <strong>{signupEmail}</strong><br />
                請點擊信件中的連結完成註冊
              </p>
              <div className="text-xs text-muted-foreground space-y-1 pt-2">
                <p>• 請檢查垃圾郵件資料夾</p>
                <p>• 驗證連結 24 小時內有效</p>
                <p>• 驗證完成後即可登入會員中心</p>
              </div>
              <Button
                variant="outline"
                onClick={() => { setViewMode("auth"); }}
                className="mt-4"
              >
                返回登入
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // 忘記密碼畫面
  if (viewMode === "forgot-password") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img src={lokezeLogo2} alt="Lokeze 人客多" className="h-36 mx-auto" />
            <p className="text-muted-foreground mt-2">忘記密碼</p>
          </div>
          <Card className="border-[hsl(24,100%,50%)]/30">
            <CardHeader>
              <CardTitle>重設密碼</CardTitle>
              <CardDescription>
                {forgotSent ? "重設信件已送出" : "請輸入您註冊時使用的 Email"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {forgotSent ? (
                <div className="text-center space-y-4">
                  <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: "hsl(24, 100%, 95%)" }}>
                    <CheckCircle className="h-8 w-8" style={{ color: "hsl(24, 100%, 50%)" }} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    重設密碼信已寄至 <strong>{forgotEmail}</strong><br />
                    請點擊信件中的連結重設密碼
                  </p>
                  <Button variant="outline" onClick={() => { setViewMode("auth"); setForgotSent(false); setForgotEmail(""); }}>
                    返回登入
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="your@email.com"
                        className="!pl-10 focus-visible:ring-[hsl(24,100%,50%)]"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-[hsl(24,100%,50%)] hover:bg-[hsl(24,100%,45%)] text-white"
                    disabled={loading}
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    發送重設信件
                  </Button>
                  <Button variant="ghost" className="w-full" onClick={() => setViewMode("auth")}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    返回登入
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={lokezeLogo2} alt="Lokeze 人客多" className="h-36 mx-auto" />
          <p className="text-muted-foreground -mt-10">訂房平台會員中心</p>
        </div>

        <Card className="border-[hsl(24,100%,50%)]/30">
          <CardHeader>
            <CardTitle>會員登入 / 註冊</CardTitle>
            <CardDescription>登入即可享受紅利點數與優惠券</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Apple & Google OAuth - hidden for now
            <Button
              variant="outline"
              className="w-full mb-2 border-[hsl(24,100%,50%)]/40 hover:bg-[hsl(24,100%,50%)]/10"
              onClick={() => handleOAuthLogin("apple")}
              disabled={loading}
            >
              <svg className="w-10 h-10 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              使用 Apple 帳號登入
            </Button>

            <Button
              variant="outline"
              className="w-full mb-4 border-[hsl(24,100%,50%)]/40 hover:bg-[hsl(24,100%,50%)]/10"
              onClick={() => handleOAuthLogin("google")}
              disabled={loading}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              使用 Google 帳號登入
            </Button>

            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">或使用 Email</span>
              </div>
            </div>
            */}

            {/* Preview-only quick test login */}
            {(() => {
              const h = typeof window !== "undefined" ? window.location.hostname : "";
              const isPreview =
                h === "localhost" ||
                h === "127.0.0.1" ||
                h.includes("lovableproject.com") ||
                h.includes("lovable.app");
              if (!isPreview) return null;
              const handleTestLogin = async () => {
                try {
                  let email = localStorage.getItem("preview_test_email") || "";
                  let password = localStorage.getItem("preview_test_password") || "";
                  if (!email || !password) {
                    const inputEmail = window.prompt("輸入測試會員 Email：", email);
                    if (!inputEmail) return;
                    const inputPassword = window.prompt("輸入測試會員密碼：", password);
                    if (!inputPassword) return;
                    email = inputEmail.trim();
                    password = inputPassword;
                    localStorage.setItem("preview_test_email", email);
                    localStorage.setItem("preview_test_password", password);
                  }
                  setLoading(true);
                  const { error } = await supabase.auth.signInWithPassword({ email, password });
                  if (error) {
                    toast.error(`測試登入失敗：${error.message}`);
                    localStorage.removeItem("preview_test_password");
                    return;
                  }
                  toast.success("測試登入成功");
                  navigate("/member/orders", { replace: true });
                } finally {
                  setLoading(false);
                }
              };
              const handleClearTestCreds = () => {
                localStorage.removeItem("preview_test_email");
                localStorage.removeItem("preview_test_password");
                toast.success("已清除測試帳號設定");
              };
              return (
                <div className="mb-4 p-3 rounded-md border border-dashed border-violet-400 bg-violet-50">
                  <p className="text-xs text-violet-700 mb-2 font-medium">🧪 預覽環境測試登入</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
                      size="sm"
                      onClick={handleTestLogin}
                      disabled={loading}
                    >
                      使用測試帳號登入 → /member/orders
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={handleClearTestCreds}>
                      重設
                    </Button>
                  </div>
                </div>
              );
            })()}

            {/* Social login buttons */}
            <Button
              variant="outline"
              className="w-full mb-2 border-[hsl(24,100%,50%)]/40 text-foreground hover:bg-[hsl(24,100%,50%)]/10 hover:text-foreground"
              onClick={handleFacebookLogin}
              disabled={loading || fbLoading || lineLoading}
            >
              {fbLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  正在前往 Facebook...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="#1877F2">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  使用 Facebook 登入
                </>
              )}
            </Button>

            <Button
              variant="outline"
              className="w-full mb-4 border-[hsl(24,100%,50%)]/40 text-foreground hover:bg-[hsl(24,100%,50%)]/10 hover:text-foreground"
              onClick={handleLineLogin}
              disabled={loading || fbLoading || lineLoading}
            >
              {lineLoading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  正在前往 LINE...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="#06C755">
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                  </svg>
                  使用 LINE 登入
                </>
              )}
            </Button>

            {/* Email OTP fallback — always available so guests can log in even
                when social login is temporarily broken. */}
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 text-muted-foreground">或使用 Email 驗證碼</span>
              </div>
            </div>

            {!otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-2">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    className="!pl-10 focus-visible:ring-[hsl(24,100%,50%)]"
                    value={otpEmail}
                    onChange={(e) => setOtpEmail(e.target.value)}
                    required
                    disabled={otpLoading}
                    autoComplete="email"
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full border-[hsl(24,100%,50%)]/40 text-foreground hover:bg-[hsl(24,100%,50%)]/10 hover:text-foreground"
                  disabled={otpLoading || loading || fbLoading || lineLoading}
                >
                  {otpLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      寄送中…
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      寄送 Email 驗證碼
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  驗證碼已寄至 <strong>{otpEmail}</strong>
                </p>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="6 碼驗證碼"
                  className="text-center tracking-widest focus-visible:ring-[hsl(24,100%,50%)]"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  required
                  disabled={otpLoading}
                  autoComplete="one-time-code"
                />
                <Button
                  type="submit"
                  className="w-full bg-[hsl(24,100%,50%)] hover:bg-[hsl(24,100%,45%)] text-white"
                  disabled={otpLoading}
                >
                  {otpLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      驗證中…
                    </>
                  ) : (
                    "確認登入"
                  )}
                </Button>
                <button
                  type="button"
                  className="w-full text-xs text-muted-foreground hover:underline"
                  onClick={() => { setOtpSent(false); setOtpCode(""); }}
                  disabled={otpLoading}
                >
                  重新寄送 / 更改 Email
                </button>
              </form>
            )}

          </CardContent>
        </Card>


        <p className="text-center text-sm text-muted-foreground mt-4">
          <a href="/booking" className="hover:underline" style={{ color: "hsl(24, 100%, 50%)" }}>
            ← 返回訂房入口
          </a>
        </p>
      </div>

      {/* In-app browser guidance dialog */}
      <Dialog open={!!guide} onOpenChange={(o) => !o && setGuide(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-[hsl(24,100%,50%)]" />
              請切換到系統瀏覽器
            </DialogTitle>
            <DialogDescription className="pt-2 text-sm leading-relaxed">
              您目前在 {inAppBrowserLabel(guide?.current ?? null)} 內建瀏覽器中，
              無法使用 {guide?.target === "line" ? "LINE" : "Facebook"} 登入。
              <br /><br />
              請點擊右上角選單 → 選擇「以其他瀏覽器開啟」（或「用 Safari／Chrome 開啟」），
              再回到此頁面登入。
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  toast.success("網址已複製");
                } catch {
                  toast.error("複製失敗，請手動複製網址");
                }
              }}
            >
              <Copy className="w-4 h-4 mr-2" />
              複製此頁網址
            </Button>
          </div>
          <DialogFooter className="mt-2">
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setGuide(null)}
            >
              我知道了
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};


export default MemberAuth;
