import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, LogIn, Eye, EyeOff, Mail } from "lucide-react";
import lokezeLogo from "@/assets/lokeze-logo-auth.png";
import { pmsHref, LAST_PROPERTY_ALIAS_KEY, PMS_ORIGIN, BOOKING_ORIGIN } from "@/lib/appMode";
import { parseFunctionInvokeError } from "@/utils/parseFunctionError";
import { SEOHead } from "@/components/SEOHead";

// 與 index.html 同一張社群分享縮圖（絕對網址，跨網域共用）
const OG_IMAGE_URL = `${BOOKING_ORIGIN}/og-image-1200x630.png`;

const REQUEST_TIMEOUT_MS = 15000;

const ADMIN_ROLES = ["hotel_admin", "super_admin", "staff"];

/** 只記 Email（絕不記密碼），開頁預填 */
const LAST_EMAIL_KEY = "pms_last_login_email";

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

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export default function PmsLogin() {
  const [email, setEmail] = useState(() => readLocal(LAST_EMAIL_KEY) ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  /** session 恢復中：不顯示登入表單，避免已登入者看到閃一下的登入頁 */
  const [bootstrapping, setBootstrapping] = useState(true);
  /** 多館且沒有記住上次館別時，顯示選館畫面 */
  const resolvingRef = useRef(false);

  useEffect(() => {
    document.title = "人客多 PMS 民宿後台";
  }, []);

  const enterProperty = useCallback((option: PropertyOption) => {
    try {
      localStorage.setItem("lastSelectedAccommodation", option.id);
      localStorage.setItem(LAST_PROPERTY_ALIAS_KEY, option.short_url_alias);
    } catch {
      /* ignore */
    }
    // 用整頁導向，確保後台版面在載入時就讀得到最新 session
    window.location.assign(pmsHref(`/${option.short_url_alias}/admin`));
  }, []);

  /** 查詢此帳號可進入的民宿清單（沒有任何權限時回傳 null） */
  const loadProperties = useCallback(async (userId: string): Promise<PropertyOption[] | null> => {
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
          .filter((r) => !!r.accommodation_id && ADMIN_ROLES.includes(r.role as string))
          .map((r) => r.accommodation_id as string)
      )
    );

    if (!isGlobalSuperAdmin && allowedIds.length === 0) return null;

    let query = supabase
      .from("accommodation_info")
      .select("id, name, short_url_alias, created_at, is_active")
      .eq("is_active", true)
      .order("created_at", { ascending: true, nullsFirst: true })
      .order("name", { ascending: true });
    if (!isGlobalSuperAdmin) query = query.in("id", allowedIds);

    const { data: accData, error: accError } = await withTimeout(query);
    if (accError) throw accError;

    const options: PropertyOption[] = (accData ?? [])
      .filter((a) => !!a.short_url_alias)
      .map((a) => ({
        id: a.id as string,
        name: (a.name as string) ?? "",
        short_url_alias: a.short_url_alias as string,
      }));

    return options.length > 0 ? options : null;
  }, []);

  /**
   * 已有 session → 依權限自動導向。
   * 1 館直接進；多館先看上次記住的館別；沒記過才顯示選館畫面。
   */
  const routeWithSession = useCallback(
    async (userId: string) => {
      if (resolvingRef.current) return;
      resolvingRef.current = true;
      try {
        const options = await loadProperties(userId);
        if (!options) {
          // 0 權限帳號防呆（允許的兩處 signOut 之一）
          await supabase.auth.signOut();
          toast.error("此帳號尚未設定任何民宿權限，請聯絡總部");
          setPropertyChoices(null);
          setBootstrapping(false);
          return;
        }

        const lastAlias = readLocal(LAST_PROPERTY_ALIAS_KEY);
        const remembered = options.find((o) => o.short_url_alias === lastAlias);
        // 一律自動進入：優先上次使用館別，否則進第一間（之後可於後台頂部切換）
        enterProperty(remembered ?? options[0]);
        return;

      } catch (error) {
        // 網路/暫時性錯誤：不登出，顯示登入頁讓使用者自行重試
        console.error("[PmsLogin] resolve properties failed:", error);
        toast.error("讀取民宿資料失敗，請稍後再試");
        setBootstrapping(false);
      } finally {
        resolvingRef.current = false;
      }
    },
    [enterProperty, loadProperties]
  );

  // 開頁先等 supabase-js 從 localStorage 恢復 session
  useEffect(() => {
    let cancelled = false;

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session?.user?.id) {
        void routeWithSession(session.user.id);
      } else {
        setBootstrapping(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if ((event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") && session?.user?.id) {
        void routeWithSession(session.user.id);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [routeWithSession]);

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

      try {
        localStorage.setItem(LAST_EMAIL_KEY, email.trim());
      } catch {
        /* ignore */
      }

      toast.success("登入成功！");
      await routeWithSession(userId);
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
      const { data, error } = await withTimeout(
        supabase.functions.invoke("send-password-reset", {
          body: { email: forgotEmail.trim() },
        })
      );
      if (error) {
        const parsed = await parseFunctionInvokeError(error);
        throw new Error(parsed.message);
      }
      if (data?.error) throw new Error(data.error);
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

  const seo = (
    <SEOHead
      title="人客多 PMS 民宿後台"
      description="人客多民宿管理系統後台登入。"
      url={`${PMS_ORIGIN}/login`}
      image={OG_IMAGE_URL}
      keywords={["民宿後台", "PMS", "訂房管理"]}
    />
  );

  // session 恢復中／自動導向中
  if (bootstrapping) {
    return (
      <>
        {seo}
        <div className="admin-theme min-h-screen flex items-center justify-center bg-background p-4">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">載入中…</p>
          </div>
        </div>
      </>
    );
  }

  return (

    <>
    {seo}
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
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
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
            <form onSubmit={handleLogin} className="space-y-4" method="post" action="#">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  name="username"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
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
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
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
    </>

  );
}
