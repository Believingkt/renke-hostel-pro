/**
 * 通知事件的角色對象（單一真相來源）。
 * hooks 與「通知事件類型」設定面板共用，避免兩邊各寫一份而走鐘。
 */

/** KOL 進度類通知（上片、CID 等）的對象 */
export const KOL_NOTIFY_ROLES = ["super_admin", "admin", "scout_manager", "scout"];

/** 待勾選累積資格：只有主管層需要 */
export const KOL_QUALIFICATION_ROLES = ["super_admin", "admin", "scout_manager"];

/** 增值服務抽成設定待審查 */
export const COMMISSION_REVIEW_ROLES = ["super_admin", "admin"];
