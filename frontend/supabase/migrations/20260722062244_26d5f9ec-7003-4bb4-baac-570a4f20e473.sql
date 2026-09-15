
-- 1. Expand user_has_any_team_role to cover all back-office roles
CREATE OR REPLACE FUNCTION public.user_has_any_team_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND accommodation_id IS NULL
      AND role IN (
        'super_admin'::app_role,
        'admin'::app_role,
        'scout'::app_role,
        'scout_manager'::app_role,
        'closer'::app_role,
        'video'::app_role,
        'franchise'::app_role,
        'franchise_internal'::app_role,
        'franchise_external'::app_role,
        'franchise_manager'::app_role,
        'starlink'::app_role,
        'finance'::app_role,
        'am'::app_role,
        'owner'::app_role,
        'venue_manager'::app_role
      )
  );
$$;

-- 2. Add finance SELECT policies to tables the finance role must read
CREATE POLICY "finance can view franchise orders"
  ON public.franchise_orders FOR SELECT
  USING (public.user_has_team_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "finance can view starlink orders"
  ON public.starlink_orders FOR SELECT
  USING (public.user_has_team_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "finance can view scout monthly payouts"
  ON public.scout_monthly_payouts FOR SELECT
  USING (public.user_has_team_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "finance can view orders"
  ON public.orders FOR SELECT
  USING (public.user_has_team_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "finance can view order_meta"
  ON public.order_meta FOR SELECT
  USING (public.user_has_team_role(auth.uid(), 'finance'::app_role));

CREATE POLICY "finance can view order_rooms"
  ON public.order_rooms FOR SELECT
  USING (public.user_has_team_role(auth.uid(), 'finance'::app_role));
