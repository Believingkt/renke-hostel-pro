REVOKE EXECUTE ON FUNCTION public.list_kol_rate_audit_logs(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_kol_rate_audit_logs(uuid, integer) TO authenticated;