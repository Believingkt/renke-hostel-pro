CREATE OR REPLACE FUNCTION public.list_kol_reciprocal_orders(
  _accommodation_id uuid,
  _start date,
  _end date
)
RETURNS TABLE (
  id uuid,
  order_number text,
  check_in_date date,
  check_out_date date,
  guest_name text,
  order_status text,
  package_id uuid,
  room_type_id uuid
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT o.id, o.order_number, o.check_in_date, o.check_out_date, o.guest_name,
         o.order_status, o.package_id, o.room_type_id
  FROM public.orders o
  WHERE o.accommodation_id = _accommodation_id
    AND o.order_source = 'kol'
    AND COALESCE(o.order_status, '') <> 'cancelled'
    AND o.check_in_date >= _start
    AND o.check_in_date < _end
    AND (
      public.user_has_any_team_role(auth.uid())
      OR public.user_has_access_to_accommodation(auth.uid(), _accommodation_id)
    )
  ORDER BY o.check_in_date ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_kol_reciprocal_orders(uuid, date, date) TO authenticated;