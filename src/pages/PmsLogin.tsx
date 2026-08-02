import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, LogIn, Eye, EyeOff, Mail } from "lucide-react";
import lokezeLogo from "@/assets/lokeze-logo-auth.png";
import { PMS_RESET_PASSWORD_URL, pmsHref } from "@/lib/appMode";

const REQUEST_TIMEOUT_MS = 15000;

const ADMIN_ROLES = ["hotel_admin", "super_admin", "staff"];

interface PropertyOption {
  id: string;
  name: string;
  short_url_alias: string;
}

function withTimeout<T>(promise: PromiseLike<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("REQUEST_TIMEOUT")), ms)
    ),
  ]);
}

export default function PmsLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  useEffect(() => {
    document.title = "人客多 PMS 民宿後台";
  }, []);

  const enterProperty = (option: PropertyOption) => {
    try {
      localStorage.setItem("lastSelectedAccommodation", option.id);
      localStorage.setItem(LAST_PROPERTY_ALIAS_KEY, option.short_url_alias);
    } catch {
      /* ignore */
    }
    // 用整頁導向，確保後台版面在載入時就讀得到最新 session
    window.location.assign(pmsHref(`/${option.short_url_alias}/admin`));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (!email.trim() || !password) {
      toast.error("請輸入 Email 與密碼");
      return;
    }

    setIsLoading(true);
    try {
      const { data: signInData, error: signInError } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
      );

      if (signInError) {
        if (signInError.message?.includes("Invalid login credentials")) {
          toast.error("Email 或密碼錯誤");
        } else {
          toast.error(signInError.message || "登入失敗，請稍後再試");
        }
        return;
      }

      const userId = signInData.user?.id;
      if (!userId) {
        toast.error("登入失敗，請稍後再試");
        return;
      }

      // 沿用 /{slug}/admin 的權限判斷：user_roles
      const { data: roleRows, error: roleError } = await withTimeout(
        supabase
          .from("user_roles")
          .select("role, accommodation_id")
          .eq("user_id", userId)
          .limit(1000)
      );
      if (roleError) throw roleError;

      const rows = roleRows ?? [];
      const isGlobalSuperAdmin = rows.some(
        (r) => r.role === "super_admin" && !r.accommodation_id
      );
      const allowedIds = Array.from(
        new Set(
          rows
            .filter(
              (r) =>
                !!r.accommodation_id && ADMIN_ROLES.includes(r.role as string)
            )
            .map((r) => r.accommodation_id as string)
        )
      );

      if (!isGlobalSuperAdmin && allowedIds.length === 0) {
        await supabase.auth.signOut();
        toast.error("此帳號尚未設定任何民宿權限，請聯絡總部");
        return;
      }

      let query = supabase
        .from("accommodation_info")
        .select("id, name, short_url_alias, created_at")
        .order("created_at", { ascending: true, nullsFirst: true })
        .order("name", { ascending: true });
      if (!isGlobalSuperAdmin) query = query.in("id", allowedIds);

      const { data: accData, error: accError } = await withTimeout(query);
      if (accError) throw accError;

      const options: PropertyOption[] = (accData ?? [])
        .filter((a) => !!a.short_url_alias?.trim())
        .map((a) => ({
          id: a.id,
          name: a.name,
          short_url_alias: (a.short_url_alias as string).trim().toLowerCase(),
        }));

      if (options.length === 0) {
        await supabase.auth.signOut();
        toast.error(
          (accData?.length ?? 0) > 0
            ? "此帳號的民宿尚未設定代號，請聯絡總部"
            : "此帳號尚未設定任何民宿權限，請聯絡總部"
        );
        return;
      }

      toast.success("登入成功！");

      // 優先恢復上次切換的館別，否則進入系統最早上線的民宿
      let lastAlias: string | null = null;
      try {
        lastAlias = localStorage.getItem(LAST_PROPERTY_ALIAS_KEY);
      } catch {
        /* ignore */
      }
      const target =
        options.find((o) => o.short_url_alias === lastAlias) ?? options[0];
      enterProperty(target);
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[PmsLogin] login failed:", error);
      if (message === "REQUEST_TIMEOUT") {
        toast.error("連線逾時，請檢查網路後重試");
      } else if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
        toast.error("網路連線錯誤，請檢查您的網路連線後再試");
      } else {
        toast.error(message || "登入失敗，請稍後再試");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (!forgotEmail.trim()) {
      toast.error("請輸入電子郵件");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await withTimeout(
        supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
          redirectTo: PMS_RESET_PASSWORD_URL,
        })
      );
      if (error) throw error;
      toast.success("重設密碼郵件已發送，請檢查您的信箱");
      setIsForgotMode(false);
      setForgotEmail("");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[PmsLogin] reset password failed:", error);
      if (message === "REQUEST_TIMEOUT") {
        toast.error("連線逾時，請檢查網路後重試");
      } else {
        toast.error(message || "發送失敗，請稍後再試");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="admin-theme min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-3">
          <div className="flex flex-col items-center space-y-2">
            <img src={lokezeLogo} alt="Lokeze" className="h-12 object-contain" />
            <p className="text-lg font-medium text-muted-foreground">人客多 PMS 民宿後台</p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            {isForgotMode ? (
              <>
                <Mail className="h-5 w-5 text-auth-primary" />
                <CardDescription className="text-center">重設您的密碼</CardDescription>
              </>
            ) : (
              <>
                <LogIn className="h-5 w-5 text-auth-primary" />
                <CardDescription className="text-center">請登入您的後台帳號</CardDescription>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isForgotMode ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="forgot-email">電子郵件</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="your@email.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
              </div>
              <p className="text-sm text-muted-foreground">
                輸入您的電子郵件，我們將發送重設密碼連結給您。
              </p>
              <Button
                type="submit"
                className="w-full bg-auth-primary hover:bg-auth-primary-hover"
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                發送重設連結
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setIsForgotMode(false);
                  setForgotEmail("");
                }}
                disabled={isLoading}
              >
                返回登入
              </Button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="login-password">密碼</Label>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-xs"
                    onClick={() => {
                      setForgotEmail(email);
                      setIsForgotMode(true);
                    }}
                    disabled={isLoading}
                  >
                    忘記密碼？
                  </Button>
                </div>
                <div className="relative">
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="請輸入密碼"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-auth-primary hover:bg-auth-primary-hover"
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoading ? "登入中..." : "登入"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
