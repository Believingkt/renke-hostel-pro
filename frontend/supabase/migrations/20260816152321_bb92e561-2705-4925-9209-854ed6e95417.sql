CREATE OR REPLACE FUNCTION public.list_kol_quota_audit_logs(
  _accommodation_id uuid,
  _limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  user_email text,
  action_type text,
  entity_name text,
  details jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin','scout_manager')
    )
    OR public.user_has_access_to_accommodation(auth.uid(), _accommodation_id)
    OR public.am_manages_accommodation(auth.uid(), _accommodation_id)
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT al.id, al.created_at, al.user_email, al.action_type, al.entity_name, al.details
    FROM public.audit_logs al
   WHERE al.entity_type = 'kol_reciprocal_quota'
     AND (al.details ->> 'accommodation_id') = _accommodation_id::text
   ORDER BY al.created_at DESC
   LIMIT LEAST(COALESCE(_limit, 100), 500);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_kol_quota_audit_logs(uuid, integer) TO authenticated;