/**
 * 總部後台（HQ）存取角色設定 —— 單一真實來源。
 *
 * 歷史問題：總部登入頁只放行 super_admin，導致 am / am_manager 雖然
 * 在頁面層被允許（HQ_SETTINGS_ROLES），卻在登入入口就被登出。
 */

import type { Database } from "@lakeze/shared/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

/** 可看完整總部後台的角色 */
export const HQ_FULL_ACCESS_ROLES: AppRole[] = ["super_admin", "admin"];

/** 可通過總部登入頁的角色（含只能看業主月結設定者） */
export const HQ_LOGIN_ROLES: AppRole[] = [...HQ_FULL_ACCESS_ROLES, "finance", "am", "am_manager"];

/** 非完整權限者的落點：HQ 整合頁的「業主月結設定」 */
export const HQ_OWNER_SETTLEMENT_LANDING = "/hq/bonus-settings?tab=owner-settlement";

/** 可進入 AI 訓練中心與知識庫頁面的角色（與完整總部權限一致） */
export const HQ_AI_ROLES: AppRole[] = [...HQ_FULL_ACCESS_ROLES];

