import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, KeyRound, LogIn, Eye, EyeOff, Mail } from "lucide-react";
import lokezeLogo from "@/assets/lokeze-logo-auth.png";
import { getPasswordIssues } from "@/utils/passwordPolicy";
import { useLoginThrottle } from "@/hooks/use-login-throttle";

const AUTH_REMEMBER_EMAIL_KEY = "auth_remember_email";

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 若目前 URL 含 alias 前綴（如 /traveldays/auth），登入後導向同 alias 之 /admin
  const getAdminPath = () => {
    const segments = window.location.pathname.split("/").filter(Boolean);
    const RESERVED = new Set([
      "admin", "auth", "hq", "hq-auth", "headquarters", "booking", "book",
      "member", "ai-booking", "order-search", "profile", "payment-test",
      "kol-api-docs", "points-api-docs", "pay", "payment-result",
      "reset-password", "change-password", "og-preview", "__cb",
    ]);
    if (segments.length > 0 && !RESERVED.has(segments[0])) {
      return `/${segments[0]}/admin`;
    }
    return "/admin";
  };

  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isInviteMode, setIsInviteMode] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLinkExpired, setInviteLinkExpired] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const throttle = useLoginThrottle(`admin:${loginEmail.toLowerCase().trim()}`);

  const handleAuthenticatedSession = useCallback(async (session: Session, showInviteToast = false) => {
    const metadataNeedsChange = session.user.user_metadata?.force_password_change === true;

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("force_password_change")
        .eq("id", session.user.id)
        .maybeSingle();

      // Profile 表為最終判斷依據：若 profile 明確為 false，即使 metadata 為 true 也不要求改密碼
      const profileNeedsChange = profile?.force_password_change === true;
      const needsPasswordChange = profile ? profileNeedsChange : metadataNeedsChange;

      if (needsPasswordChange) {
        setInviteEmail(session.user.email || "");
        setIsInviteMode(true);

        if (showInviteToast) {
          toast.info("請設定您的登入密碼");
        }
        return;
      }

      setIsInviteMode(false);
      navigate(getAdminPath());
    } catch (error) {
      console.error("Error resolving auth destination:", error);

      if (metadataNeedsChange) {
        setInviteEmail(session.user.email || "");
        setIsInviteMode(true);
        return;
      }

      navigate(getAdminPath());
    }
  }, [navigate]);

  // Load remembered email on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem(AUTH_REMEMBER_EMAIL_KEY);
    if (savedEmail) {
      setLoginEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (error || errorDescription) {
      setInviteLinkExpired(true);
      toast.error("邀請連結已失效，請聯繫管理員重新發送邀請信");
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth state changed:", event, session?.user?.email);

      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
        void handleAuthenticatedSession(session, true);
        return;
      }

      if (event === "USER_UPDATED" && session) {
        void handleAuthenticatedSession(session);
      }
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        void handleAuthenticatedSession(session);
      }
    });

    return () => subscription.unsubscribe();
  }, [handleAuthenticatedSession, searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (throttle.isLocked) {
      toast.error(`登入嘗試次數過多，請於 ${throttle.remainingSeconds} 秒後再試`);
      return;
    }
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) {
        const result = throttle.recordFailure();
        if (error.message.includes("Invalid login credentials")) {
          if (result.locked) {
            toast.error("登入嘗試次數過多，已暫時鎖定 5 分鐘");
          } else {
            const left = 5 - result.attempts;
            toast.error(`帳號或密碼錯誤${left > 0 ? `（剩餘 ${left} 次嘗試）` : ""}`);
          }
        } else {
          toast.error(error.message);
        }
      } else {
        throttle.recordSuccess();
        if (rememberMe) {
          localStorage.setItem(AUTH_REMEMBER_EMAIL_KEY, loginEmail);
        } else {
          localStorage.removeItem(AUTH_REMEMBER_EMAIL_KEY);
        }
        toast.success("登入成功！");
      }
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.message?.includes("Failed to fetch") || error.message?.includes("NetworkError")) {
        toast.error("網路連線錯誤，請檢查您的網路連線後再試");
      } else {
        toast.error("登入失敗，請稍後再試");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!forgotPasswordEmail) {
      toast.error("請輸入電子郵件");
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-password-reset", {
        body: { 
          email: forgotPasswordEmail,
          redirectUrl: `${window.location.origin}/reset-password`
        },
      });

      if (error) {
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success("重設密碼郵件已發送，請檢查您的信箱");
      setIsForgotPasswordMode(false);
      setForgotPasswordEmail("");
    } catch (error: any) {
      console.error("Forgot password error:", error);
      toast.error(error.message || "發送失敗，請稍後再試");
    } finally {
      setIsLoading(false);
    }
  };

  // Password validation helper
  const validatePassword = (password: string): { valid: boolean; message: string } => {
    const issues = getPasswordIssues(password, { email: inviteEmail });
    if (issues.length > 0) {
      return { valid: false, message: issues[0] };
    }
    return { valid: true, message: "" };
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast.error("兩次輸入的密碼不一致");
      return;
    }

    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }

    setIsLoading(true);

    try {
      // Update password via backend function (adds server-side leaked-password check)
      const { data, error } = await supabase.functions.invoke("update-own-password", {
        body: {
          newPassword,
          clearForcePasswordChange: true,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Update profile to remove force_password_change flag
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ force_password_change: false })
          .eq('id', session.user.id);
        
        if (profileError && import.meta.env.DEV) {
          console.error("Error updating profile:", profileError);
        }
      }

      toast.success("密碼設定成功！正在登入...");
      
      // Navigate to admin after short delay
      setTimeout(() => {
        navigate(getAdminPath());
      }, 1000);
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error("Error setting password:", error);
      }
      toast.error(error.message || "密碼設定失敗，請稍後再試");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3">
          <div className="flex flex-col items-center space-y-2">
            <img src={lokezeLogo} alt="Lokeze" className="h-12 object-contain" />
            <p className="text-lg font-medium text-muted-foreground">人客多 PMS 管理系統</p>
          </div>
          {inviteLinkExpired ? (
            <div className="flex items-center justify-center gap-2 pt-2">
              <CardDescription className="text-center text-destructive">
                邀請連結已失效
              </CardDescription>
            </div>
          ) : isInviteMode ? (
            <div className="flex items-center justify-center gap-2 pt-2">
              <KeyRound className="h-5 w-5 text-auth-primary" />
              <CardDescription className="text-center">
                歡迎！請設定您的登入密碼
              </CardDescription>
            </div>
          ) : isForgotPasswordMode ? (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Mail className="h-5 w-5 text-auth-primary" />
              <CardDescription className="text-center">
                重設您的密碼
              </CardDescription>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 pt-2">
              <LogIn className="h-5 w-5 text-auth-primary" />
              <CardDescription className="text-center">
                請登入您的帳號
              </CardDescription>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {inviteLinkExpired ? (
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                您的邀請連結已過期或失效。請聯繫管理員重新發送邀請信。
              </p>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  setInviteLinkExpired(false);
                  window.history.replaceState({}, '', '/auth');
                }}
              >
                返回登入
              </Button>
            </div>
          ) : isInviteMode ? (
            <form onSubmit={handleSetPassword} className="space-y-4">
              {inviteEmail && (
                <div className="space-y-2">
                  <Label>電子郵件</Label>
                  <Input
                    type="email"
                    value={inviteEmail}
                    disabled
                    className="bg-muted"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="new-password">設定密碼</Label>
                <p className="text-xs text-muted-foreground">
                  至少 8 個字元，需包含大寫字母、小寫字母及數字（避免常見密碼）
                </p>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="至少 8 個字元"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={8}
                    className="pr-10"
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
                <Label htmlFor="confirm-password">確認密碼</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="請再次輸入密碼"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="pr-10"
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
              <Button type="submit" className="w-full bg-auth-primary hover:bg-auth-primary-hover" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                完成設定
              </Button>
            </form>
          ) : isForgotPasswordMode ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">電子郵件</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="your@email.com"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  required
                />
              </div>
              <p className="text-sm text-muted-foreground">
                輸入您的電子郵件，我們將發送重設密碼連結給您。
              </p>
              <Button type="submit" className="w-full bg-auth-primary hover:bg-auth-primary-hover" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                發送重設連結
              </Button>
              <Button 
                type="button"
                variant="ghost" 
                className="w-full"
                onClick={() => {
                  setIsForgotPasswordMode(false);
                  setForgotPasswordEmail("");
                }}
              >
                返回登入
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">電子郵件</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="your@email.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="login-password">密碼</Label>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-sm text-muted-foreground hover:text-auth-primary"
                    onClick={() => setIsForgotPasswordMode(true)}
                  >
                    忘記密碼？
                  </Button>
                </div>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showLoginPassword ? "text" : "password"}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                  >
                    {showLoginPassword ? (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked === true)}
                />
                <Label htmlFor="remember-me" className="text-sm font-normal cursor-pointer">
                  記住我
                </Label>
              </div>
              <Button type="submit" className="w-full bg-auth-primary hover:bg-auth-primary-hover" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                登入
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
