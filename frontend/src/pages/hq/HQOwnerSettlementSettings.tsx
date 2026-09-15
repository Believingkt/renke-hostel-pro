import { Navigate, useLocation } from "react-router-dom";

/**
 * 舊路徑導轉：業主月結設定已併入 /hq/bonus-settings 的「業主月結設定」Tab。
 * 保留 acc 參數，三個月後隨第三段搬遷移除。
 */
export default function HQOwnerSettlementSettings() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set("tab", "owner-settlement");
  return <Navigate to={`/hq/bonus-settings?${params.toString()}`} replace />;
}
