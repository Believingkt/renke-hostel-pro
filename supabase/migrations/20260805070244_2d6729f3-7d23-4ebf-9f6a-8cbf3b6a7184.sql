CREATE OR REPLACE FUNCTION public.get_order_source_owners()
RETURNS TABLE(source text, accommodation_names text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH used AS (
    SELECT DISTINCT btrim(o.order_source) AS s, o.accommodation_id
    FROM public.orders o
    WHERE o.order_source IS NOT NULL AND btrim(o.order_source) <> ''
    UNION
    SELECT DISTINCT btrim(a.name) AS s, a.accommodation_id
    FROM public.accommodation_order_sources a
    WHERE a.name IS NOT NULL AND btrim(a.name) <> ''
  )
  SELECT u.s AS source,
         COALESCE(array_agg(DISTINCT COALESCE(i.name, '未知館別')), ARRAY[]::text[]) AS accommodation_names
  FROM used u
  LEFT JOIN public.accommodation_info i ON i.id = u.accommodation_id
  GROUP BY u.s
$$;

GRANT EXECUTE ON FUNCTION public.get_order_source_owners() TO authenticated;