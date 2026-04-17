import { useEffect, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const BOOKING_DOMAINS = ["booking.lakeze.com", "www.booking.lakeze.com"];

/**
 * 偵測是否為 booking.lakeze.com 網域
 * 若是且在根路徑，自動重導向至 /booking
 */
export function BookingDomainRedirect({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const hostname = window.location.hostname.toLowerCase();
    if (!BOOKING_DOMAINS.includes(hostname)) return;

    // 允許的路徑前綴（booking 相關 + 會員 + 付款等）
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

    const isAllowed = allowedPrefixes.some(p => location.pathname.startsWith(p));

    if (!isAllowed) {
      navigate(`/booking${location.search}`, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  return <>{children}</>;
}
