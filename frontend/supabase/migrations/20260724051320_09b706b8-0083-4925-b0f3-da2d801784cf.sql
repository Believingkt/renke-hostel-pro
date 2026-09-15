
CREATE OR REPLACE FUNCTION public._rls_test_list_member_policies()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT jsonb_build_object(
    'rows',
    COALESCE(jsonb_agg(jsonb_build_object(
      'schemaname', schemaname,
      'tablename', tablename,
      'policyname', policyname,
      'cmd', cmd,
      'roles', roles
    )), '[]'::jsonb)
  )
  FROM pg_policies
  WHERE schemaname = 'public'
    AND cmd = 'SELECT'
    AND (policyname ILIKE '%own%' OR policyname ILIKE '%member%');
$$;

REVOKE ALL ON FUNCTION public._rls_test_list_member_policies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._rls_test_list_member_policies() TO service_role;
