-- postcheck（唯讀）：20261018100000_kol_profiles_update_allow_scout.sql
-- 預期：qual 同時含 created_by = auth.uid() 與 scout_id = auth.uid()，其餘角色條件不變
SELECT policyname, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'kol_profiles' AND cmd IN ('UPDATE', 'ALL');
