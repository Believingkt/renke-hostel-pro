import { useEffect, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const BOOKING_DOMAINS = ["booking.lakeze.com", "www.booking.lakeze.com"];

// 永不重導向的路徑（HQ 認證、密碼變更等系統路徑）
// 即使在 booking.lakeze.com 網域下也應允許訪問
const ALWAYS_ALLOWED_PATHS = [
  "/hq",
  "/hq-auth",
  "/headquarters",
  "/auth",
  "/reset-password",
  "/change-password",
];

// 第一層路徑為已知保留字時，視為非 alias 路徑
const RESERVED_FIRST_SEGMENTS = new Set([
  "booking",
  "book",
  "member",
  "order-search",
  "order-payment",
  "payment",
  "payment-result",
  "linepay",
  "public-payment",
  "ai-booking",
  "auth",
  "hq",
  "hq-auth",
  "headquarters",
  "admin",
  "pay",
  "profile",
  "reset-password",
  "change-password",
  "kol-api-docs",
  "points-api-docs",
  "og-preview",
  "payment-test",
  "__cb",
]);

/**
 * 偵測是否為 booking.lakeze.com 網域
 * 若是且在根路徑，自動重導向至 /booking
 * 第一層路徑若為 alias（如 /traveldays、/traveldays/admin），則允許通過。
 */
export function BookingDomainRedirect({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const hostname = window.location.hostname.toLowerCase();
    if (!BOOKING_DOMAINS.includes(hostname)) return;

    // 條件判斷 1：系統保留路徑（HQ、auth 等）絕不重導向
    const isAlwaysAllowed = ALWAYS_ALLOWED_PATHS.some(
      (p) => location.pathname === p || location.pathname.startsWith(`${p}/`)
    );
    if (isAlwaysAllowed) return;

    const segments = location.pathname.split("/").filter(Boolean);
    if (segments.length > 0 && !RESERVED_FIRST_SEGMENTS.has(segments[0])) {
      // 視為 alias 路徑，交給 AliasResolver 處理
      return;
    }

    const allowedPrefixes = [
      "/booking",
      "/book",
      "/member",
      "/order-search",
      "/order-payment",
      "/payment",
      "/linepay",
      "/public-payment",
      "/ai-booking",
    ];

    const isAllowed = allowedPrefixes.some((p) => location.pathname.startsWith(p));

    if (!isAllowed) {
      navigate(`/booking${location.search}`, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  return <>{children}</>;
}
