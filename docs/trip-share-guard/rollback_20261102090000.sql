-- 20261102090000 rollback：ensure_trip_share_slug 去掉 TRIP_OWNER_GUARD_V1 段（還原為指紋 6743b0826daf26406875603a277a41d4 的內容）並補回 PUBLIC、anon；
-- _hotelnabe_enqueue_days 補回 authenticated。依正式庫套用前授權：
--   ensure_trip_share_slug {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_…=X/postgres}
--   _hotelnabe_enqueue_days {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_…=X/postgres}（原本沒有 PUBLIC、anon，不加回）
-- authenticated、service_role、sandbox_exec_… 在 migration 中未被收回，不需處理
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $rb$
DECLARE
  v_src text;
  v_old text;
BEGIN
  SELECT replace(p.prosrc, E'\r', '') INTO v_src FROM pg_proc p WHERE p.oid = 'public.ensure_trip_share_slug(uuid)'::regprocedure;
  IF position('TRIP_OWNER_GUARD_V1' IN v_src) = 0 THEN
    RAISE EXCEPTION 'ROLLBACK 中止：ensure_trip_share_slug 不含 TRIP_OWNER_GUARD_V1（尚未套用或已還原）';
  END IF;
  v_old := regexp_replace(v_src, E'\n  -- TRIP_OWNER_GUARD_V1 BEGIN.*-- TRIP_OWNER_GUARD_V1 END', '');
  IF md5(v_old) <> '6743b0826daf26406875603a277a41d4' THEN
    RAISE EXCEPTION 'ROLLBACK 中止：去掉檢查段後指紋 % 不等於 6743b0826daf26406875603a277a41d4', md5(v_old);
  END IF;
  EXECUTE format('CREATE OR REPLACE FUNCTION public.ensure_trip_share_slug(p_trip_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO %L AS %L', 'public', v_old);
END
$rb$;

GRANT EXECUTE ON FUNCTION public.ensure_trip_share_slug(uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._hotelnabe_enqueue_days(uuid, uuid, date, date, public.hotelnabe_ari_push_reason) TO authenticated;

COMMIT;
