/**
 * 發放管理｜「標記已發放」按鈕排除名單（前端層）
 *
 * 用途：某些帳號雖具備 super_admin / admin / finance 角色，
 * 但制度上不希望他們在「獎金管理 → 發放管理」按下任何標記發放按鈕。
 * 這些帳號仍可正常檢視金額、明細與已發放/待發放狀態。
 *
 * 注意：這是純前端的顯示層限制（避免誤按），並非資料庫層防護。
 * 若要真正禁止寫入，需另外收斂 commission_payout_marks /
 * scout_monthly_payouts 的 RLS 政策。
 */

const DENIED_USER_IDS = new Set<string>([
  // Berry（lodestar0115@gmail.com）
  "b472ef53-b395-4d72-b5a0-ea8ed2642d47",
]);

const DENIED_EMAILS = new Set<string>([
  "lodestar0115@gmail.com",
]);

export function isPayoutMarkDenied(
  userId?: string | null,
  email?: string | null,
): boolean {
  if (userId && DENIED_USER_IDS.has(userId)) return true;
  if (email && DENIED_EMAILS.has(email.trim().toLowerCase())) return true;
  return false;
}
