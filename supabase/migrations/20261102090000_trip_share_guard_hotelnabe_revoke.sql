-- 20261102090000：ensure_trip_share_slug 加「呼叫者必須是行程擁有者」檢查＋收回 PUBLIC/anon；_hotelnabe_enqueue_days 收回 authenticated
-- ensure_trip_share_slug：以資料庫現行定義為基礎（指紋須為 6743b0826daf26406875603a277a41d4），只在第一個 BEGIN 後插入 TRIP_OWNER_GUARD_V1 段，其餘不改
-- _hotelnabe_enqueue_days：不改內容（指紋須為 8e9c59faaf944996252177d8a0071ab6）；三支呼叫它的觸發器函式皆為 SECURITY DEFINER，收回 authenticated 不影響存檔
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $mig$
DECLARE
  c_guard CONSTANT text := E'\n  -- TRIP_OWNER_GUARD_V1 BEGIN\n  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.trips t WHERE t.id = p_trip_id AND t.owner_id = auth.uid()) THEN\n    RAISE EXCEPTION ''只有行程擁有者可以產生分享連結'' USING ERRCODE = ''42501'';\n  END IF;\n  -- TRIP_OWNER_GUARD_V1 END';
  v_oid oid := to_regprocedure('public.ensure_trip_share_slug(uuid)');
  v_hn oid := to_regprocedure('public._hotelnabe_enqueue_days(uuid, uuid, date, date, public.hotelnabe_ari_push_reason)');
  v_src text;
  v_new text;
  v_bad text;
BEGIN
  IF v_oid IS NULL OR v_hn IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：ensure_trip_share_slug(uuid) 或 _hotelnabe_enqueue_days 不存在';
  END IF;
  SELECT replace(p.prosrc, E'\r', '') INTO v_src FROM pg_proc p WHERE p.oid = v_oid;
  IF md5(v_src) <> '6743b0826daf26406875603a277a41d4' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：ensure_trip_share_slug 指紋 % 與正式庫套用前 6743b0826daf26406875603a277a41d4 不同', md5(v_src);
  END IF;
  IF (length(v_src) - length(replace(v_src, E'\nBEGIN\n', ''))) / length(E'\nBEGIN\n') <> 1 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：ensure_trip_share_slug 的 BEGIN 錨點不是剛好 1 個';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.oid = v_oid AND p.prosecdef AND l.lanname = 'plpgsql' AND p.prorettype = 'text'::regtype AND p.proconfig = ARRAY['search_path=public']) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：ensure_trip_share_slug 屬性（DEFINER／plpgsql／RETURNS text／search_path=public）與預期不同';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'trips' AND column_name = 'owner_id' AND data_type = 'uuid') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：public.trips.owner_id (uuid) 不存在';
  END IF;
  IF (SELECT md5(replace(p.prosrc, E'\r', '')) FROM pg_proc p WHERE p.oid = v_hn) <> '8e9c59faaf944996252177d8a0071ab6' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：_hotelnabe_enqueue_days 指紋與正式庫 8e9c59faaf944996252177d8a0071ab6 不同';
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_bad FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.oid <> v_hn AND NOT p.prosecdef AND p.prosrc ~ '\m_hotelnabe_enqueue_days\M';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：有 SECURITY INVOKER 函式呼叫 _hotelnabe_enqueue_days：%', v_bad;
  END IF;

  v_new := replace(v_src, E'\nBEGIN\n', E'\nBEGIN' || c_guard || E'\n');
  EXECUTE format('CREATE OR REPLACE FUNCTION public.ensure_trip_share_slug(p_trip_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO %L AS %L', 'public', v_new);
END
$mig$;

REVOKE EXECUTE ON FUNCTION public.ensure_trip_share_slug(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_trip_share_slug(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public._hotelnabe_enqueue_days(uuid, uuid, date, date, public.hotelnabe_ari_push_reason) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._hotelnabe_enqueue_days(uuid, uuid, date, date, public.hotelnabe_ari_push_reason) TO service_role;

DO $post$
DECLARE
  v_src text;
  v_bad text;
BEGIN
  SELECT replace(p.prosrc, E'\r', '') INTO v_src FROM pg_proc p WHERE p.oid = 'public.ensure_trip_share_slug(uuid)'::regprocedure;
  IF md5(regexp_replace(v_src, E'\n  -- TRIP_OWNER_GUARD_V1 BEGIN.*-- TRIP_OWNER_GUARD_V1 END', '')) <> '6743b0826daf26406875603a277a41d4' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：去掉檢查段後指紋不等於 6743b0826daf26406875603a277a41d4';
  END IF;
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_bad FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef AND p.proname <> '_hotelnabe_enqueue_days' AND p.prosrc ~ '\m_hotelnabe_enqueue_days\M'
    AND NOT has_function_privilege(p.proowner, 'public._hotelnabe_enqueue_days(uuid, uuid, date, date, public.hotelnabe_ari_push_reason)'::regprocedure, 'EXECUTE');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：觸發器函式擁有者無法執行 _hotelnabe_enqueue_days：%', v_bad;
  END IF;
  IF has_function_privilege('anon', 'public.ensure_trip_share_slug(uuid)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.ensure_trip_share_slug(uuid)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._hotelnabe_enqueue_days(uuid, uuid, date, date, public.hotelnabe_ari_push_reason)'::regprocedure, 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public._hotelnabe_enqueue_days(uuid, uuid, date, date, public.hotelnabe_ari_push_reason)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：授權未如預期';
  END IF;
END
$post$;

COMMIT;
