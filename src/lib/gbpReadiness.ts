/**
 * PER-ACCOMMODATION Google Business Profile 前端 readiness 判斷。
 *
 * 明確區分兩種概念：
 *  - OAUTH_TECHNICALLY_READY：真正能開始 OAuth 的技術條件
 *    （oauth_client_id + client_secret_configured + application_status APPROVED）
 *  - FORM_COMPLETE：產品面希望館主把 Project ID / Project Number 也填完整
 *
 * 這裡不讀任何 global / platform 設定。
 */

export interface GbpCredentialSettings {
  project_id?: string | null;
  project_number?: string | null;
  oauth_client_id?: string | null;
  client_secret_configured?: boolean | null;
  application_status?: string | null;
  connection_status?: string | null;
}

const nonEmpty = (v?: string | null) => typeof v === "string" && v.trim() !== "";

/** 技術上可否開始 OAuth（不含 Project ID / Number）。 */
export function isAccommodationGoogleOAuthReady(s: GbpCredentialSettings): boolean {
  return (
    nonEmpty(s.oauth_client_id) &&
    s.client_secret_configured === true &&
    s.application_status === "APPROVED"
  );
}

/** 產品面表單完整度（含館主自己的 Google Cloud 專案資訊）。 */
export function isAccommodationGbpFormComplete(s: GbpCredentialSettings): boolean {
  return (
    nonEmpty(s.project_id) &&
    nonEmpty(s.project_number) &&
    isAccommodationGoogleOAuthReady(s)
  );
}

/** 尚未達成 readiness 時，給館主的具體缺項說明。 */
export function gbpReadinessHints(s: GbpCredentialSettings): string[] {
  const hints: string[] = [];
  if (!nonEmpty(s.oauth_client_id)) hints.push("請填寫本館的 OAuth Client ID");
  if (s.client_secret_configured !== true) hints.push("請設定本館的 OAuth Client Secret");
  if (s.application_status !== "APPROVED") {
    hints.push("請於申請狀態選擇「已核准」（Google 核准後才可授權）");
  }
  if (!nonEmpty(s.project_id)) hints.push("請填寫 Google Cloud Project ID");
  if (!nonEmpty(s.project_number)) hints.push("請填寫 Google Cloud Project Number");
  return hints;
}
