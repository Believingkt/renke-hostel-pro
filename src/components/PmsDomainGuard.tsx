import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, MoveRight } from "lucide-react";
import {
  bookingHref,
  isAdminPath,
  isPmsAllowedPath,
  normalizePmsPath,
  pmsHref,
  resolveAppMode,
} from "@/lib/appMode";

/**
 * 網域模式守衛
 *
 * - PMS 模式（pms.lakeze.com）：僅服務 /login、/{slug}/admin/* 等後台路徑；
 *   其餘前台路徑（訂房頁、/member/*、/pay）→ 導向 booking.lakeze.com 對應路徑。
 * - 前台模式（booking.lakeze.com）：訪問 /{slug}/admin 及子路由時，
 *   未登入 → 轉址 pms.lakeze.com/login?code={slug}；
 *   已登入 → 顯示「後台已搬家」卡片。
 * - neutral（開發／預覽網域未指定 ?mode=）：完全不介入。
 */
export function PmsDomainGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const mode = resolveAppMode();
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  const onAdminPath = isAdminPath(location.pathname);
  const legacyAdminOnFrontend = mode === "frontend" && onAdminPath;


  // 只有需要判斷「舊網域後台」時才查 session
  useEffect(() => {
    if (!legacyAdminOnFrontend) {
      setHasSession(null);
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setHasSession(!!session);
    });
    return () => {
      cancelled = true;
    };
  }, [legacyAdminOnFrontend]);

  // PMS 模式路徑處理
  useEffect(() => {
    if (mode !== "pms") return;
    if (location.pathname === "/" || location.pathname === "") {
      navigate("/login", { replace: true });
      return;
    }
    // 舊的 /{alias}/auth 或 /auth 一律導向統一登入頁
    if (normalizePmsPath(location.pathname) === "/auth") {
      navigate("/login", { replace: true });
      return;
    }
    if (!isPmsAllowedPath(location.pathname)) {
      window.location.replace(bookingHref(`${location.pathname}${location.search}`));
    }
  }, [mode, location.pathname, location.search, navigate]);

  // 前台模式：未登入者直接轉去 PMS 登入頁
  useEffect(() => {
    if (!legacyAdminOnFrontend) return;
    if (hasSession !== false) return;
    window.location.replace(pmsHref("/login"));
  }, [legacyAdminOnFrontend, hasSession]);


  if (mode === "pms" && location.pathname !== "/" && !isPmsAllowedPath(location.pathname)) {
    return null;
  }

  if (legacyAdminOnFrontend) {
    if (hasSession === null || hasSession === false) return null;
    return (
      <div className="admin-theme min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <MoveRight className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle className="text-lg">後台已搬家至 pms.lakeze.com</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              民宿後台入口已統一到新網域，請於新網址重新登入後繼續操作。
            </p>
            <Button
              className="w-full"
              onClick={() => {
                window.location.href = pmsHref("/login");
              }}
            >

              <ExternalLink className="mr-2 h-4 w-4" />
              前往 pms.lakeze.com 登入
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
