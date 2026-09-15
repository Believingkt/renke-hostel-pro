import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { isHQDomain as checkHQDomain, isHQAllowedPath } from "@/lib/route-matcher";

/**
 * 偵測是否為 HQ 專屬網域 (hq.lakeze.com)
 * 若是，自動重導向至 /hq 路由
 */
export function useHQDomainRedirect() {
  const [isHQDomain, setIsHQDomain] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    setIsHQDomain(checkHQDomain(window.location.hostname));
    setIsChecking(false);
  }, []);

  return { isHQDomain, isChecking };
}

/**
 * HQ 網域重導向元件
 * 放置於 App 頂層，在 HQ 網域時自動導向 /hq
 *
 * 規則來源：src/lib/route-matcher.ts（與其他守衛共用）
 */
export function HQDomainRedirect({ children }: { children: ReactNode }) {
  const { isHQDomain, isChecking } = useHQDomainRedirect();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isChecking) return;
    if (!isHQDomain) return;

    // 不在允許的 HQ 路徑 → 重導向至 /hq（保留查詢參數）
    if (!isHQAllowedPath(location.pathname)) {
      navigate(`/hq${location.search}`, { replace: true });
    }
  }, [isHQDomain, isChecking, location.pathname, location.search, navigate]);

  return <>{children}</>;
}
