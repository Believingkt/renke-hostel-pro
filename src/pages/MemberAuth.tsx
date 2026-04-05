import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Mail, Lock, User, Phone, Loader2, ArrowLeft, CheckCircle } from "lucide-react";
import { getPasswordIssues } from "@/utils/passwordPolicy";

type ViewMode = "auth" | "forgot-password" | "signup-success";

const MemberAuth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/member/profile";
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("auth");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

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
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });
      if (error) throw error;
      
      await ensureMemberProfile();
      toast.success("登入成功");
      navigate(redirectTo);
    } catch (error: any) {
      if (error.message?.includes("Email not confirmed")) {
        toast.error("Email 尚未驗證，請先查收驗證信件");
      } else if (error.message?.includes("Invalid login")) {
        toast.error("Email 或密碼錯誤");
      } else {
        toast.error(error.message || "登入失敗");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const { error } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: {
          data: { name: signupName, phone: signupPhone },
          emailRedirectTo: window.location.origin + "/member/profile",
        },
      });
      if (error) throw error;
      setViewMode("signup-success");
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
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${window.location.origin}/member/reset-password`,
      });
      if (error) throw error;
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
      });
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
            <h1 className="text-3xl font-bold" style={{ color: "hsl(24, 100%, 50%)" }}>人客多</h1>
            <p className="text-muted-foreground mt-2">忘記密碼</p>
          </div>
          <Card>
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
                        className="!pl-10"
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
          <h1 className="text-3xl font-bold" style={{ color: "hsl(24, 100%, 50%)" }}>
            人客多
          </h1>
          <p className="text-muted-foreground mt-2">訂房平台會員中心</p>
        </div>

        <Card className="border-[hsl(24,100%,50%)]/30">
          <CardHeader>
            <CardTitle>會員登入 / 註冊</CardTitle>
            <CardDescription>登入即可享受紅利點數與優惠券</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full mb-2"
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
              className="w-full mb-4"
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

            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">登入</TabsTrigger>
                <TabsTrigger value="signup">註冊</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="your@email.com"
                        className="!pl-10"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password">密碼</Label>
                      <button
                        type="button"
                        className="text-xs hover:underline"
                        style={{ color: "hsl(24, 100%, 50%)" }}
                        onClick={() => setViewMode("forgot-password")}
                      >
                        忘記密碼？
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        className="!pl-10"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
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
                    登入
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">姓名</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-name"
                        placeholder="您的姓名"
                        className="!pl-10"
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="your@email.com"
                        className="!pl-10"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-phone">手機</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-phone"
                        placeholder="0912345678"
                        className="!pl-10"
                        value={signupPhone}
                        onChange={(e) => setSignupPhone(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">密碼</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="至少 8 個字元，含大小寫與數字"
                        className="!pl-10"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        required
                      />
                    </div>
                    {signupPassword && (
                      <div className="text-xs space-y-0.5 mt-1">
                        {[
                          { check: signupPassword.length >= 8, label: "至少 8 個字元" },
                          { check: /[A-Z]/.test(signupPassword), label: "含大寫字母" },
                          { check: /[a-z]/.test(signupPassword), label: "含小寫字母" },
                          { check: /[0-9]/.test(signupPassword), label: "含數字" },
                        ].map(({ check, label }) => (
                          <p key={label} className={check ? "text-[hsl(24,100%,50%)]" : "text-muted-foreground"}>
                            {check ? "✓" : "○"} {label}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm">確認密碼</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-confirm"
                        type="password"
                        placeholder="再次輸入密碼"
                        className="!pl-10"
                        value={signupConfirmPassword}
                        onChange={(e) => setSignupConfirmPassword(e.target.value)}
                        required
                      />
                    </div>
                    {signupConfirmPassword && signupPassword !== signupConfirmPassword && (
                      <p className="text-xs text-destructive">密碼不一致</p>
                    )}
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-[hsl(24,100%,50%)] hover:bg-[hsl(24,100%,45%)] text-white"
                    disabled={loading || (!!signupConfirmPassword && signupPassword !== signupConfirmPassword)}
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    註冊
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-4">
          <a href="/booking" className="hover:underline" style={{ color: "hsl(24, 100%, 50%)" }}>
            ← 返回訂房入口
          </a>
        </p>
      </div>
    </div>
  );
};

export default MemberAuth;
