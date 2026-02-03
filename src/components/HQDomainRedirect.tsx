import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";

/**
 * 偵測是否為 HQ 專屬網域 (hq.lakeze.com)
 * 若是，自動重導向至 /hq 路由
 */
export function useHQDomainRedirect() {
  const [isHQDomain, setIsHQDomain] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const hostname = window.location.hostname.toLowerCase();
    
    // 檢查是否為 HQ 專屬網域
    const isHQ = hostname === "hq.lakeze.com" || hostname === "www.hq.lakeze.com";
    
    setIsHQDomain(isHQ);
    setIsChecking(false);
  }, []);

  return { isHQDomain, isChecking };
}

/**
 * HQ 網域重導向元件
 * 放置於 App 頂層，在 HQ 網域時自動導向 /hq
 */
export function HQDomainRedirect({ children }: { children: ReactNode }) {
  const { isHQDomain, isChecking } = useHQDomainRedirect();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isChecking) return;
    
    if (isHQDomain) {
      // 允許的 HQ 相關路徑
      const allowedPaths = ["/hq", "/hq-auth", "/headquarters/change-password"];
      const isAllowedPath = allowedPaths.some(path => location.pathname.startsWith(path));
      
      // 如果不在允許的路徑，重導向至 /hq
      if (!isAllowedPath) {
        // 保留查詢參數
        const searchParams = location.search;
        navigate(`/hq${searchParams}`, { replace: true });
      }
    }
  }, [isHQDomain, isChecking, location.pathname, location.search, navigate]);

  return <>{children}</>;
}
