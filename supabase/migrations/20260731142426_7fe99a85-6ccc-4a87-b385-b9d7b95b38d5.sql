CREATE OR REPLACE FUNCTION public.is_sales_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('scout','scout_manager','closer','admin','super_admin')
  )
$$;

DROP POLICY IF EXISTS "Sales roles can view discount codes" ON public.discount_codes;
CREATE POLICY "Sales roles can view discount codes"
ON public.discount_codes
FOR SELECT
TO authenticated
USING (public.is_sales_role(auth.uid()));