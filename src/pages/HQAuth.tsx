import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, LogIn, Eye, EyeOff, Mail } from "lucide-react";
import lokezeLogo from "@/assets/lokeze-logo-auth.png";

const HQ_REMEMBER_EMAIL_KEY = "hq_remember_email";

export default function HQAuth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");

  // Load remembered email on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem(HQ_REMEMBER_EMAIL_KEY);
    if (savedEmail) {
      setLoginEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        // Check if user is super_admin (in any accommodation)
        const { data: userRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("role", "super_admin")
          .limit(1)
          .maybeSingle();

        if (userRole) {
          navigate("/hq");
        } else {
          toast.error("您沒有總部後台的存取權限");
          await supabase.auth.signOut();
        }
      }
    });

    // Check for existing session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data: userRoles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("role", "super_admin")
          .limit(1);

        if (userRoles && userRoles.length > 0) {
          navigate("/headquarters");
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast.error("帳號或密碼錯誤");
        } else {
          toast.error(error.message);
        }
        return;
      }

      // Check if user is super_admin (in any accommodation)
      if (data.user) {
        const { data: userRoles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .eq("role", "super_admin")
          .limit(1);

        if (!userRoles || userRoles.length === 0) {
          toast.error("您沒有總部後台的存取權限");
          await supabase.auth.signOut();
          return;
        }

        // Handle remember me
        if (rememberMe) {
          localStorage.setItem(HQ_REMEMBER_EMAIL_KEY, loginEmail);
        } else {
          localStorage.removeItem(HQ_REMEMBER_EMAIL_KEY);
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3">
          <div className="flex flex-col items-center space-y-2">
            <img src={lokezeLogo} alt="Lokeze" className="h-12 object-contain" />
            <p className="text-lg font-medium text-muted-foreground">總部管理系統</p>
          </div>
          {isForgotPasswordMode ? (
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
                請登入總部管理帳號
              </CardDescription>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isForgotPasswordMode ? (
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
