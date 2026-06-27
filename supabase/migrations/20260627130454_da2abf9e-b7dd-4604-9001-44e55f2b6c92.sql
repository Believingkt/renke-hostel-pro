
CREATE OR REPLACE FUNCTION public.get_franchise_external_member_ids()
RETURNS TABLE(profile_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT sales_member_id
  FROM franchise_external_orders
  WHERE sales_member_id IS NOT NULL
$$;
GRANT EXECUTE ON FUNCTION public.get_franchise_external_member_ids() TO authenticated;
