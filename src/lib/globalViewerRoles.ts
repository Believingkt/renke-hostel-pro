/**
 * 全域（不綁館別）唯讀查詢角色。
 *
 * 這些角色在 user_roles 中的 accommodation_id 為 null，因此不會出現在
 * AccommodationContext 的館別白名單裡。為了讓他們能在 /{alias}/admin 路徑
 * 逐館查看業主月結報表，需要：
 * 1. AccommodationContext 將所有啟用中民宿併入 userAccommodations
 * 2. useStaffPermissions 對指定模組給 readonly
 * 3. 後端 RLS 對應表補 SELECT policy
 */
export const GLOBAL_VIEWER_ROLES = ["finance", "super_admin", "am", "am_manager"] as const;

/** 全域唯讀角色可檢視（唯讀）的後台模組 */
export const GLOBAL_VIEWER_MODULES = ["owner_settlement"] as const;

/** AccommodationContext 併入全域民宿時標記的角色名稱 */
export const GLOBAL_VIEWER_ROLE_TAG = "global_viewer";
