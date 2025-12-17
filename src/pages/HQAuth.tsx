import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, LogIn, Eye, EyeOff, Mail, Building2 } from "lucide-react";
import sensanLogo from "@/assets/sensan-logo-white.png";

export default function HQAuth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        // Check if user is super_admin
        const { data: userRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("role", "super_admin")
          .single();

        if (userRole) {
          navigate("/headquarters");
        } else {
          toast.error("您沒有總部後台的存取權限");
          await supabase.auth.signOut();
        }
      }
    });

    // Check for existing session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        const { data: userRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .eq("role", "super_admin")
          .single();

        if (userRole) {
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

      // Check if user is super_admin
      if (data.user) {
        const { data: userRole } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.user.id)
          .eq("role", "super_admin")
          .single();

        if (!userRole) {
          toast.error("您沒有總部後台的存取權限");
          await supabase.auth.signOut();
          return;
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
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
      <Card className="w-full max-w-md shadow-lg border-slate-700 bg-slate-800">
        <CardHeader className="space-y-3">
          <div className="flex flex-col items-center space-y-3">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-primary" />
              <img src={sensanLogo} alt="森三" className="h-10 object-contain" />
            </div>
            <p className="text-lg font-medium text-slate-300">總部管理系統</p>
          </div>
          {isForgotPasswordMode ? (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Mail className="h-5 w-5 text-primary" />
              <CardDescription className="text-center text-slate-400">
                重設您的密碼
              </CardDescription>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 pt-2">
              <LogIn className="h-5 w-5 text-primary" />
              <CardDescription className="text-center text-slate-400">
                請登入總部管理帳號
              </CardDescription>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isForgotPasswordMode ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email" className="text-slate-200">電子郵件</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="your@email.com"
                  value={forgotPasswordEmail}
                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                  required
                  className="bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-400"
                />
              </div>
              <p className="text-sm text-slate-400">
                輸入您的電子郵件，我們將發送重設密碼連結給您。
              </p>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                發送重設連結
              </Button>
              <Button 
                type="button"
                variant="ghost" 
                className="w-full text-slate-300 hover:text-slate-100 hover:bg-slate-700"
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
                <Label htmlFor="login-email" className="text-slate-200">電子郵件</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="your@email.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  className="bg-slate-700 border-slate-600 text-slate-100 placeholder:text-slate-400"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="login-password" className="text-slate-200">密碼</Label>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-sm text-slate-400 hover:text-primary"
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
                    className="pr-10 bg-slate-700 border-slate-600 text-slate-100"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                  >
                    {showLoginPassword ? (
                      <Eye className="h-4 w-4 text-slate-400" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-slate-400" />
                    )}
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
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
