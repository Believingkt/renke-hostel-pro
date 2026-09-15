CREATE OR REPLACE FUNCTION public.ensure_trip_share_slug(p_trip_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_try text;
BEGIN
  SELECT share_slug INTO v_slug FROM public.trips WHERE id = p_trip_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_slug IS NOT NULL AND length(v_slug) > 0 THEN
    RETURN v_slug;
  END IF;

  LOOP
    v_try := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.trips WHERE share_slug = v_try);
  END LOOP;

  UPDATE public.trips SET share_slug = v_try WHERE id = p_trip_id;
  RETURN v_try;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_trip_share_slug(uuid) TO anon, authenticated, service_role;

CREATE UNIQUE INDEX IF NOT EXISTS trips_share_slug_key ON public.trips (share_slug) WHERE share_slug IS NOT NULL;