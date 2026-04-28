import { useEffect, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  isAlwaysAllowedPath,
  isBookingAllowedPath,
  isBookingDomain,
  isReservedFirstSegment,
} from "@/lib/route-matcher";

/**
 * 偵測是否為 booking.lakeze.com 網域
 * 若是且在根路徑，自動重導向至 /booking
 * 第一層路徑若為 alias（如 /traveldays、/traveldays/admin），則允許通過。
 *
 * 規則來源：src/lib/route-matcher.ts（與其他守衛共用）
 */
export function BookingDomainRedirect({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isBookingDomain(window.location.hostname)) return;

    // 條件 1：系統保留路徑（HQ、auth 等）絕不重導向
    if (isAlwaysAllowedPath(location.pathname)) return;

    // 條件 2：第一層為非保留字 → 視為 alias，交給 AliasResolver 處理
    if (!isReservedFirstSegment(location.pathname) && location.pathname !== "/") {
      return;
    }

    // 條件 3：訂房入口允許的路徑前綴 → 通過
    if (isBookingAllowedPath(location.pathname)) return;

    // 否則導向 /booking
    navigate(`/booking${location.search}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  return <>{children}</>;
}
