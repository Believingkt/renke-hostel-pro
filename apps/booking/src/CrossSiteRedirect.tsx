import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { HQ_DOMAINS, isHQAllowedPath, matchesAnyPrefix } from "@lakeze/shared/lib/route-matcher";
import { pmsHref, resolveAppMode } from "@lakeze/shared/lib/appMode";

const HQ_ORIGIN = `https://${HQ_DOMAINS[0]}`;
// 拆站後不再由訂房前台服務的 PMS 專屬路徑（/admin、/team 已由 PmsDomainGuard 處理）
const PMS_ONLY_PATHS = ["/login", "/auth", "/change-password", "/team-auth"] as const;

/** 訂房前台（booking.lakeze.com）收到其他站的路徑時，跨站轉址到對應網域；開發／預覽網域不介入 */
export function CrossSiteRedirect({ children }: { children: ReactNode }) {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (resolveAppMode() !== "frontend") return;
    const rest = `${pathname}${search}${hash}`;
    if (isHQAllowedPath(pathname)) {
      window.location.replace(`${HQ_ORIGIN}${rest}`);
      return;
    }
    if (matchesAnyPrefix(pathname, PMS_ONLY_PATHS)) {
      window.location.replace(pmsHref(rest));
    }
  }, [pathname, search, hash]);

  return <>{children}</>;
}
