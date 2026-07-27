import { Navigate, useParams, useLocation } from "react-router-dom";

/**
 * 舊版「一般民宿訂房頁」(/booking/:accId) 已停用。
 * 一律 301-style（SPA replace）導向新版包棟訂房頁 /booking/villa/:accId，
 * 保留原本的查詢字串（日期、人數、promo 等）。
 */
export default function LegacyBookingRedirect() {
  const { accId } = useParams<{ accId: string }>();
  const location = useLocation();

  if (!accId) return <Navigate to="/booking" replace />;

  return <Navigate to={`/booking/villa/${accId}${location.search}${location.hash}`} replace />;
}
