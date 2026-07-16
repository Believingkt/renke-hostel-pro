CREATE OR REPLACE FUNCTION public.update_kol_quota_config(
  p_accommodation_id uuid,
  p_mode text,
  p_tracked_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_mode NOT IN ('shared','per_package') THEN
    RAISE EXCEPTION 'Invalid mode: %', p_mode;
  END IF;

  -- 允許：super_admin / scout_manager（team-level, accommodation_id IS NULL）
  --       或該民宿的 hotel_admin
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = auth.uid()
         AND role = 'super_admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = auth.uid()
         AND role = 'scout_manager'
         AND accommodation_id IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = auth.uid()
         AND role = 'hotel_admin'
         AND accommodation_id = p_accommodation_id
    )
  ) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.accommodation_info
     SET kol_quota_mode = p_mode,
         kol_quota_tracked_package_ids = COALESCE(p_tracked_ids, ARRAY[]::uuid[])
   WHERE id = p_accommodation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_kol_quota_config(uuid, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_kol_quota_config(uuid, text, uuid[]) TO authenticated;