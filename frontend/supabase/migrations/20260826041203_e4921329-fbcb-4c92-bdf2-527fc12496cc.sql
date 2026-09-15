REVOKE ALL ON FUNCTION public.kol_profiles_sync_primary_contract_group() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kol_profiles_sync_primary_contract_group() FROM anon;
REVOKE ALL ON FUNCTION public.kol_profiles_sync_primary_contract_group() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kol_profiles_sync_primary_contract_group() TO service_role;

REVOKE ALL ON FUNCTION public.check_discount_code_conflict(text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_discount_code_conflict(text, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_discount_code_conflict(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_discount_code_conflict(text, uuid, uuid) TO service_role;