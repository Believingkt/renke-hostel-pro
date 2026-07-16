-- ============================================================
-- RLS 驗證：kol_reciprocal_monthly_quotas
-- 確認 scout_manager 可 SELECT/INSERT/UPDATE/DELETE
-- 且 hotel_admin 仍能存取自己 accommodation 的資料
--
-- 用法： psql -f scripts/verify-kol-reciprocal-quota-rls.sql
-- 說明： 透過 SET LOCAL role authenticated + request.jwt.claims
--        模擬指定使用者，讓 auth.uid() 回傳目標 user_id，
--        RLS 政策才會真正被套用（superuser 會 bypass RLS）。
-- ============================================================

\set SCOUT_MANAGER_UID '66b7a62a-e994-4c71-b86d-78a9ba8881ec'
\set HOTEL_ADMIN_UID  'b472ef53-b395-4d72-b5a0-ea8ed2642d47'
\set HOTEL_ADMIN_ACC  '4ee31aca-5641-4d05-80e2-1c67626be83d'

\echo '============================================================'
\echo '[Case 1] scout_manager — SELECT'
\echo '============================================================'
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"66b7a62a-e994-4c71-b86d-78a9ba8881ec","role":"authenticated"}';
SELECT count(*) AS scout_manager_visible_rows FROM public.kol_reciprocal_monthly_quotas;
ROLLBACK;

\echo '============================================================'
\echo '[Case 2] scout_manager — INSERT / UPDATE / DELETE'
\echo '============================================================'
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"66b7a62a-e994-4c71-b86d-78a9ba8881ec","role":"authenticated"}';

WITH ins AS (
  INSERT INTO public.kol_reciprocal_monthly_quotas
    (accommodation_id, package_id, year_month, quota)
  SELECT
    :'HOTEL_ADMIN_ACC'::uuid,
    (SELECT id FROM public.accommodation_packages
      WHERE accommodation_id = :'HOTEL_ADMIN_ACC'::uuid
      LIMIT 1),
    '2099-01',
    9
  RETURNING id
)
SELECT 'INSERT ok, id=' || id AS result FROM ins;

UPDATE public.kol_reciprocal_monthly_quotas
   SET quota = 8
 WHERE year_month = '2099-01'
 RETURNING 'UPDATE ok, quota=' || quota AS result;

DELETE FROM public.kol_reciprocal_monthly_quotas
 WHERE year_month = '2099-01'
 RETURNING 'DELETE ok, id=' || id AS result;

ROLLBACK; -- 不留測試資料

\echo '============================================================'
\echo '[Case 3] hotel_admin — SELECT (自己 accommodation)'
\echo '============================================================'
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"b472ef53-b395-4d72-b5a0-ea8ed2642d47","role":"authenticated"}';
SELECT count(*) AS hotel_admin_visible_rows FROM public.kol_reciprocal_monthly_quotas;
ROLLBACK;

\echo '============================================================'
\echo '[Case 4] hotel_admin — INSERT / UPDATE / DELETE (自家)'
\echo '============================================================'
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"b472ef53-b395-4d72-b5a0-ea8ed2642d47","role":"authenticated"}';

WITH ins AS (
  INSERT INTO public.kol_reciprocal_monthly_quotas
    (accommodation_id, package_id, year_month, quota)
  SELECT
    :'HOTEL_ADMIN_ACC'::uuid,
    (SELECT id FROM public.accommodation_packages
      WHERE accommodation_id = :'HOTEL_ADMIN_ACC'::uuid
      LIMIT 1),
    '2099-02',
    5
  RETURNING id
)
SELECT 'INSERT ok, id=' || id AS result FROM ins;

UPDATE public.kol_reciprocal_monthly_quotas
   SET quota = 6
 WHERE year_month = '2099-02'
 RETURNING 'UPDATE ok, quota=' || quota AS result;

DELETE FROM public.kol_reciprocal_monthly_quotas
 WHERE year_month = '2099-02'
 RETURNING 'DELETE ok, id=' || id AS result;

ROLLBACK;

\echo '============================================================'
\echo '[Case 5] 匿名 (anon) — SELECT 應該被擋'
\echo '============================================================'
BEGIN;
SET LOCAL role anon;
SELECT count(*) AS anon_visible_rows FROM public.kol_reciprocal_monthly_quotas;
ROLLBACK;

\echo '============================================================'
\echo 'RLS 驗證結束'
\echo '============================================================'
