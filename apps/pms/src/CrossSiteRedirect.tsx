import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { HQ_DOMAINS, isHQAllowedPath } from "@lakeze/shared/lib/route-matcher";
import { resolveAppMode } from "@lakeze/shared/lib/appMode";

const HQ_ORIGIN = `https://${HQ_DOMAINS[0]}`;

/** PMS（pms.lakeze.com）收到 HQ 路徑時直接跨站到總部後台；其餘前台路徑由 PmsDomainGuard 轉到 booking */
export function CrossSiteRedirect({ children }: { children: ReactNode }) {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (resolveAppMode() !== "pms") return;
    if (isHQAllowedPath(pathname)) {
      window.location.replace(`${HQ_ORIGIN}${pathname}${search}${hash}`);
    }
  }, [pathname, search, hash]);

  return <>{children}</>;
}
