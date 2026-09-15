CREATE OR REPLACE FUNCTION public.get_all_order_sources()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(s ORDER BY s), ARRAY[]::text[])
  FROM (
    SELECT DISTINCT o.order_source AS s
    FROM public.orders o
    WHERE o.order_source IS NOT NULL
      AND btrim(o.order_source) <> ''
  ) t;
$$;

REVOKE ALL ON FUNCTION public.get_all_order_sources() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_order_sources() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_order_sources() TO service_role;