-- ============================================================
-- KOL 正式邀約：被指派的邀約人（scout_id）可以修改自己的邀約紀錄
--   kol_profiles_update 原本只允許 created_by（填寫人）與管理角色；
--   前端早已讓邀約人看到「編輯」，但資料庫只更新 0 筆、畫面卻顯示成功。
--   本 migration 在 USING 條件加上 scout_id = auth.uid()，其餘角色條件不變。
--   沒有 WITH CHECK → 新資料列也須符合 USING：邀約人不能把 scout_id 改成別人後存檔（主管可以）。
-- precheck：docs/kol-1/precheck_20261018100000.sql
-- postcheck：docs/kol-1/postcheck_20261018100000.sql
-- rollback：docs/kol-1/rollback_20261018100000.sql
-- ============================================================

-- ============================= PRECHECK =============================
DO $$
DECLARE
  v_qual text;
  v_check text;
BEGIN
  SELECT qual, with_check INTO v_qual, v_check
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'kol_profiles' AND policyname = 'kol_profiles_update' AND cmd = 'UPDATE';
  IF v_qual IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：kol_profiles_update（UPDATE）不存在';
  END IF;
  IF v_qual NOT LIKE '%created_by = auth.uid()%' OR v_qual LIKE '%scout_id%' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：kol_profiles_update 內容與 20260529155215 版本不同：%', v_qual;
  END IF;
  IF v_check IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：kol_profiles_update 已有 WITH CHECK：%', v_check;
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'kol_profiles' AND cmd IN ('UPDATE', 'ALL')) <> 1 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：kol_profiles 有其他 UPDATE／ALL policy，請先檢查';
  END IF;
END $$;

-- ============================= CHANGE =============================
DROP POLICY kol_profiles_update ON public.kol_profiles;
CREATE POLICY kol_profiles_update ON public.kol_profiles
FOR UPDATE
USING (
  (created_by = auth.uid())
  OR (scout_id = auth.uid())
  OR user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  OR user_has_team_role(auth.uid(), 'venue_manager'::app_role)
  OR user_has_team_role(auth.uid(), 'hotel_admin'::app_role)
);

-- ============================= POSTCHECK =============================
DO $$
DECLARE
  v_qual text;
BEGIN
  SELECT qual INTO v_qual FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'kol_profiles' AND policyname = 'kol_profiles_update' AND cmd = 'UPDATE';
  IF v_qual IS NULL OR v_qual NOT LIKE '%scout_id = auth.uid()%' OR v_qual NOT LIKE '%created_by = auth.uid()%'
     OR v_qual NOT LIKE '%scout_manager%' OR v_qual NOT LIKE '%hotel_admin%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：kol_profiles_update 內容不符：%', v_qual;
  END IF;
END $$;
