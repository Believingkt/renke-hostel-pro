CREATE OR REPLACE FUNCTION public.get_dates_with_active_orders(p_accommodation_id uuid, p_dates text[])
RETURNS TABLE(date_value date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT d::date
  FROM unnest(p_dates) AS d
  WHERE EXISTS (
    SELECT 1 FROM orders o
    WHERE o.accommodation_id = p_accommodation_id
      AND o.order_status <> 'cancelled'
      AND d::date >= o.check_in_date
      AND d::date < o.check_out_date
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_dates_with_active_orders(uuid, text[]) TO anon, authenticated, service_role;