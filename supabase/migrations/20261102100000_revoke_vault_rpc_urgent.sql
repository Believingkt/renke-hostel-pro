-- 20261102100000 緊急：收回 vault／內部 RPC 的對外執行權限（不改任何函式內容；可重複執行）
-- gbp_vault_get、gbp_vault_set、get_rpc_contract、claim_hotelnabe_ari_push_batch：收回 PUBLIC、anon、authenticated（保留 postgres、service_role、sandbox_exec_*）
-- get_ai_ops_metrics：只收回 PUBLIC、anon（保留 authenticated；函式內 auth.uid() 為 null 時的 current_user 判斷在 DEFINER 下恆為 postgres，擋不住 anon）
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $pre$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.claim_hotelnabe_ari_push_batch(integer)', '57f53b0ba67d5f99f17a45640c11436d'),
    ('public.gbp_vault_get(text)', 'c1faaca8da4aac41a2f9792be509c8bf'),
    ('public.gbp_vault_set(text, text)', 'f574dbcf36712fb298fe180fc984d792'),
    ('public.get_ai_ops_metrics(uuid, integer)', '670f67a22d8e7140fbb14365625acb51'),
    ('public.get_rpc_contract(text[])', '442016e1eba30d3bcbb21d3608f4a3e4')) AS v(sig, fp)
  LOOP
    IF to_regprocedure(r.sig) IS NULL THEN
      RAISE EXCEPTION 'PRECHECK 失敗：函式不存在 %', r.sig;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(r.sig) AND p.prosecdef AND md5(replace(p.prosrc, E'\r', '')) = r.fp) THEN
      RAISE EXCEPTION 'PRECHECK 失敗：% 不是 SECURITY DEFINER 或指紋與正式庫 % 不同', r.sig, r.fp;
    END IF;
  END LOOP;
END
$pre$;

REVOKE EXECUTE ON FUNCTION public.gbp_vault_get(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gbp_vault_set(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_rpc_contract(text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_hotelnabe_ari_push_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ai_ops_metrics(uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.gbp_vault_get(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gbp_vault_set(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_rpc_contract(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_hotelnabe_ari_push_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_ops_metrics(uuid, integer) TO authenticated, service_role;

COMMIT;
