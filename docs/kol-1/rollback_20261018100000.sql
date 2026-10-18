-- rollback：20261018100000_kol_profiles_update_allow_scout.sql
-- 還原為 20260529155215 版本（只允許填寫人與管理角色）
BEGIN;
DROP POLICY IF EXISTS kol_profiles_update ON public.kol_profiles;
CREATE POLICY kol_profiles_update ON public.kol_profiles
FOR UPDATE
USING (
  (created_by = auth.uid())
  OR user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  OR user_has_team_role(auth.uid(), 'venue_manager'::app_role)
  OR user_has_team_role(auth.uid(), 'hotel_admin'::app_role)
);
DO $$
BEGIN
  IF (SELECT qual FROM pg_policies WHERE tablename = 'kol_profiles' AND policyname = 'kol_profiles_update') LIKE '%scout_id%' THEN
    RAISE EXCEPTION 'ROLLBACK 驗證失敗：policy 仍含 scout_id';
  END IF;
END $$;
COMMIT;
