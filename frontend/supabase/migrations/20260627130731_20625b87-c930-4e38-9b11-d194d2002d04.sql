CREATE OR REPLACE FUNCTION public.get_franchise_external_member_ids()
RETURNS TABLE(profile_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT member_id AS profile_id
  FROM (
    SELECT sales_member_id AS member_id
    FROM public.franchise_external_orders
    WHERE sales_member_id IS NOT NULL

    UNION

    SELECT co_sales_member_id AS member_id
    FROM public.franchise_external_orders
    WHERE co_sales_member_id IS NOT NULL

    UNION

    SELECT co_sales_member_id2 AS member_id
    FROM public.franchise_external_orders
    WHERE co_sales_member_id2 IS NOT NULL
  ) external_members
  WHERE member_id IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION public.get_franchise_external_member_ids() TO authenticated;