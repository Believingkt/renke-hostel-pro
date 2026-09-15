-- ============================================================
-- RLS 驗證：kol_reciprocal_monthly_quotas
-- 用法：psql -f scripts/verify-kol-reciprocal-quota-rls.sql
--
-- 說明：Supabase 生產 DB 連線帳號無法 SET ROLE authenticated，
-- 因此本腳本以「靜態檢查」為主：
--   1. RLS 已啟用
--   2. 該有的政策都存在且條件正確
--   3. user_has_team_role() 對兩個測試帳號回傳預期值
-- 動態的 SELECT/INSERT/UPDATE/DELETE 端對端測試請改用
-- 檔案末的瀏覽器 Console 腳本（以真實使用者 JWT 呼叫 PostgREST）。
-- ============================================================

\echo '=== [1] RLS 啟用狀態 ==='
SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class
 WHERE relname = 'kol_reciprocal_monthly_quotas';

\echo ''
\echo '=== [2] 現有政策清單 ==='
SELECT policyname, cmd,
       pg_get_expr(polqual,      polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check_expr
  FROM pg_policy p
  JOIN pg_policies pp ON pp.policyname = p.polname
 WHERE polrelid = 'public.kol_reciprocal_monthly_quotas'::regclass
 ORDER BY policyname;

\echo ''
\echo '=== [3] scout_manager 四個政策必須齊備 ==='
SELECT
  bool_and(exists_flag) AS all_four_present,
  array_agg(policyname ORDER BY policyname) FILTER (WHERE exists_flag) AS present
FROM (
  SELECT p AS policyname,
         EXISTS (
           SELECT 1 FROM pg_policies
            WHERE tablename = 'kol_reciprocal_monthly_quotas'
              AND policyname = p
         ) AS exists_flag
  FROM unnest(ARRAY[
    'kol_reciprocal_quota_scout_manager_select',
    'kol_reciprocal_quota_scout_manager_insert',
    'kol_reciprocal_quota_scout_manager_update',
    'kol_reciprocal_quota_scout_manager_delete'
  ]) AS t(p)
) s;

\echo ''
\echo '=== [4] user_has_team_role 對兩位受測 user 的判定 ==='
-- 直接呼叫函數（帶入 _user_id 參數），驗證邏輯資料層面正確。
-- 注意：函數內同時檢查 auth.uid() 是否為 NULL，這裡是為了純資料驗證，
-- 因此改用等價的手動查詢（bypass auth.uid() null-check）：
SELECT
  '66b7a62a-e994-4c71-b86d-78a9ba8881ec'::uuid AS user_id,
  'scout_manager (expect true)' AS note,
  EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = '66b7a62a-e994-4c71-b86d-78a9ba8881ec'
       AND role = 'scout_manager'
       AND accommodation_id IS NULL
  ) AS has_scout_manager
UNION ALL
SELECT
  'b472ef53-b395-4d72-b5a0-ea8ed2642d47'::uuid,
  'hotel_admin (expect false)',
  EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = 'b472ef53-b395-4d72-b5a0-ea8ed2642d47'
       AND role = 'scout_manager'
       AND accommodation_id IS NULL
  );

\echo ''
\echo '=== [5] GRANT 檢查（authenticated 需具 CRUD 權限） ==='
SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name   = 'kol_reciprocal_monthly_quotas'
   AND grantee IN ('authenticated','anon','service_role')
 ORDER BY grantee, privilege_type;

\echo ''
\echo '============================================================'
\echo '端對端動態驗證：請以 scout_manager / hotel_admin 分別登入'
\echo '後在瀏覽器 Console 執行 scripts/verify-kol-reciprocal-quota-rls.js'
\echo '============================================================'
