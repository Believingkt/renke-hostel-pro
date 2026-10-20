-- 20261102100000 rollback：恢復正式庫套用前授權（連 aclitem 順序一併還原）
-- 5 支原狀皆為 {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres,sandbox_exec_dmafqwfynatdvnaeovhz=X/postgres}（無 PUBLIC，不加回）
-- 作法：先清掉 anon／authenticated／service_role／sandbox_exec_* 四個對象，再依原順序一次授回，使 proacl 文字與原狀完全相同；postgres（擁有者）不動
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

REVOKE EXECUTE ON FUNCTION public.gbp_vault_get(text) FROM anon, authenticated, service_role, sandbox_exec_dmafqwfynatdvnaeovhz;
REVOKE EXECUTE ON FUNCTION public.gbp_vault_set(text, text) FROM anon, authenticated, service_role, sandbox_exec_dmafqwfynatdvnaeovhz;
REVOKE EXECUTE ON FUNCTION public.get_rpc_contract(text[]) FROM anon, authenticated, service_role, sandbox_exec_dmafqwfynatdvnaeovhz;
REVOKE EXECUTE ON FUNCTION public.claim_hotelnabe_ari_push_batch(integer) FROM anon, authenticated, service_role, sandbox_exec_dmafqwfynatdvnaeovhz;
REVOKE EXECUTE ON FUNCTION public.get_ai_ops_metrics(uuid, integer) FROM anon, authenticated, service_role, sandbox_exec_dmafqwfynatdvnaeovhz;

GRANT EXECUTE ON FUNCTION public.gbp_vault_get(text) TO anon, authenticated, service_role, sandbox_exec_dmafqwfynatdvnaeovhz;
GRANT EXECUTE ON FUNCTION public.gbp_vault_set(text, text) TO anon, authenticated, service_role, sandbox_exec_dmafqwfynatdvnaeovhz;
GRANT EXECUTE ON FUNCTION public.get_rpc_contract(text[]) TO anon, authenticated, service_role, sandbox_exec_dmafqwfynatdvnaeovhz;
GRANT EXECUTE ON FUNCTION public.claim_hotelnabe_ari_push_batch(integer) TO anon, authenticated, service_role, sandbox_exec_dmafqwfynatdvnaeovhz;
GRANT EXECUTE ON FUNCTION public.get_ai_ops_metrics(uuid, integer) TO anon, authenticated, service_role, sandbox_exec_dmafqwfynatdvnaeovhz;

COMMIT;
