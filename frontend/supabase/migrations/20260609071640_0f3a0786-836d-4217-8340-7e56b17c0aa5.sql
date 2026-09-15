CREATE TABLE public.starlink_monthly_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scout_id uuid NOT NULL REFERENCES public.team_member_profiles(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL,
  period integer NOT NULL DEFAULT 10,
  total_orders integer NOT NULL DEFAULT 0,
  total_sales numeric NOT NULL DEFAULT 0,
  total_commission numeric NOT NULL DEFAULT 0,
  payout_status text NOT NULL DEFAULT 'pending',
  calculated_at timestamptz,
  order_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scout_id, year, month, period)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.starlink_monthly_payouts TO authenticated;
GRANT ALL ON public.starlink_monthly_payouts TO service_role;

ALTER TABLE public.starlink_monthly_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin and hotel_admin can do all"
ON public.starlink_monthly_payouts
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin'::public.app_role, 'hotel_admin'::public.app_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('super_admin'::public.app_role, 'hotel_admin'::public.app_role)
  )
);

CREATE POLICY "starlink members can read own"
ON public.starlink_monthly_payouts
FOR SELECT
TO authenticated
USING (
  scout_id IN (
    SELECT id FROM public.team_member_profiles
    WHERE user_id = auth.uid()
  )
);

CREATE TRIGGER update_starlink_monthly_payouts_updated_at
BEFORE UPDATE ON public.starlink_monthly_payouts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();