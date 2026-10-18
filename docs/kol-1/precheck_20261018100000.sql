-- precheck（唯讀）：20261018100000_kol_profiles_update_allow_scout.sql
-- 預期：只有 1 列 kol_profiles_update，qual 含 created_by = auth.uid()、不含 scout_id，with_check 為 NULL
SELECT policyname, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'kol_profiles' AND cmd IN ('UPDATE', 'ALL');

-- 受影響的紀錄數（邀約人 ≠ 填寫人，目前邀約人改了會「假成功」）
SELECT count(*) AS n_scout_not_creator
FROM public.kol_profiles
WHERE is_error = false AND scout_id IS NOT NULL AND created_by IS DISTINCT FROM scout_id;
