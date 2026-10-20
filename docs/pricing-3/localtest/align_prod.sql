-- 本機測試庫對齊正式庫：update_order_fields_v1 內容（指紋 b14b83bd…）與權限字串
\set ON_ERROR_STOP 1
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec_dmafqwfynatdvnaeovhz') THEN
    CREATE ROLE sandbox_exec_dmafqwfynatdvnaeovhz NOLOGIN;
  END IF;
END $$;
\i /app/supabase/migrations/20260911073711_510e975d-a193-43a5-9d1b-1a91949f6309.sql
DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.update_order_fields_v1(uuid, jsonb, text, text)'::regprocedure);
  EXECUTE replace(v_def, '''owner_direct'',', '');
END $$;
REVOKE ALL ON FUNCTION public.update_order_fields_v1(uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated, service_role, sandbox_exec_dmafqwfynatdvnaeovhz;
GRANT EXECUTE ON FUNCTION public.update_order_fields_v1(uuid, jsonb, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_order_fields_v1(uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_fields_v1(uuid, jsonb, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_order_fields_v1(uuid, jsonb, text, text) TO sandbox_exec_dmafqwfynatdvnaeovhz;
SELECT '對齊後指紋＝正式庫：' || (md5(prosrc) = 'b14b83bd8b814638184cc15d6ef084d9') || '；權限＝正式庫：' || (array_to_string(proacl, ',') = 'postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_dmafqwfynatdvnaeovhz=X/postgres') || '（' || array_to_string(proacl, ',') || '）'
FROM pg_proc WHERE oid = 'public.update_order_fields_v1(uuid, jsonb, text, text)'::regprocedure;
