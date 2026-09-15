import { useEffect } from "react";
import { Navigate, useParams, useLocation } from "react-router-dom";

/**
 * 舊版「一般民宿訂房頁」(/booking/:accId) 已停用。
 * 一律導向新版包棟訂房頁 /booking/villa/:accId，保留查詢字串。
 *
 * SEO：Lovable hosting 無法設定伺服器層 301，因此在轉址前同步寫入
 *   - <link rel="canonical"> 指向新網址（把權重歸戶到新頁）
 *   - <meta name="robots" content="noindex, follow">（讓舊網址退出索引，但仍傳遞連結權重）
 * Googlebot 會執行 JS 並跟隨此轉址，效果接近 301。
 */
function markLegacyUrlForSearchEngines(targetPath: string) {
  if (typeof document === "undefined") return;

  const absolute = `${window.location.origin}${targetPath}`;

  let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = absolute;

  let robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
  if (!robots) {
    robots = document.createElement("meta");
    robots.name = "robots";
    document.head.appendChild(robots);
  }
  robots.content = "noindex, follow";
}

export default function LegacyBookingRedirect() {
  const { accId } = useParams<{ accId: string }>();
  const location = useLocation();

  const target = accId
    ? `/booking/villa/${accId}${location.search}${location.hash}`
    : "/booking";

  useEffect(() => {
    markLegacyUrlForSearchEngines(accId ? `/booking/villa/${accId}` : "/booking");
  }, [accId]);

  return <Navigate to={target} replace />;
}
