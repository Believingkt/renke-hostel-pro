import { useEffect, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  isAlwaysAllowedPath,
  isBookingAllowedPath,
  isBookingDomain,
  isReservedFirstSegment,
} from "@/lib/route-matcher";
import { PMS_RESET_PASSWORD_URL } from "@/lib/appMode";

/**
 * 判斷目前網址是否為「後台密碼重設」落點：
 * - /reset-password 路徑（舊信件或 Site URL fallback）
 * - 任何帶 type=recovery / access_token 的 hash 或 query（Supabase 原生 recovery）
 * 會員端 /member/* 一律排除，行為不受影響。
 */
function isAdminRecoveryLanding(pathname: string): boolean {
  if (pathname.startsWith("/member")) return false;
  if (pathname === "/reset-password" || pathname.startsWith("/reset-password/")) {
    return true;
  }
  const hash = window.location.hash || "";
  const search = window.location.search || "";
  const blob = `${hash}${search}`;
  return blob.includes("type=recovery");
}

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

    // 安全網：舊信件／fallback 落在前台網域的後台密碼重設連結
    // → 導回 PMS，完整保留 query 與 hash（token 在 hash 裡）
    if (isAdminRecoveryLanding(location.pathname)) {
      const search = window.location.search || "";
      const hash = window.location.hash || "";
      window.location.replace(`${PMS_RESET_PASSWORD_URL}${search}${hash}`);
      return;
    }

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
