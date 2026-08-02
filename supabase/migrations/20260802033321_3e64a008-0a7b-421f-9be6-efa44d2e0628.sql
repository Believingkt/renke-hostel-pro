CREATE TABLE public.scout_discount_code_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  discount_code text NOT NULL,
  commission_type text NOT NULL CHECK (commission_type IN ('scout_self','partner')),
  recipient_role text NOT NULL CHECK (recipient_role IN ('scout','closer')),
  recipient_id uuid NOT NULL REFERENCES public.team_member_profiles(id) ON DELETE CASCADE,
  rate numeric NOT NULL DEFAULT 0,
  base_amount numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  year integer NOT NULL,
  month integer NOT NULL,
  period integer NOT NULL CHECK (period IN (10,25)),
  payout_status text NOT NULL DEFAULT 'pending',
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scout_discount_code_payouts_order_role_key UNIQUE (order_id, recipient_role)
);

CREATE INDEX idx_sdcp_period ON public.scout_discount_code_payouts (year, month, period);
CREATE INDEX idx_sdcp_recipient ON public.scout_discount_code_payouts (recipient_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scout_discount_code_payouts TO authenticated;
GRANT ALL ON public.scout_discount_code_payouts TO service_role;

ALTER TABLE public.scout_discount_code_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sdcp_select" ON public.scout_discount_code_payouts
FOR SELECT TO authenticated
USING (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'hotel_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'finance'::app_role)
  OR public.user_has_team_role(auth.uid(), 'scout_manager'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.team_member_profiles t
    WHERE t.id = scout_discount_code_payouts.recipient_id
      AND t.user_id = auth.uid()
  )
);

CREATE POLICY "sdcp_write" ON public.scout_discount_code_payouts
FOR ALL TO authenticated
USING (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'hotel_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'finance'::app_role)
)
WITH CHECK (
  public.user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'hotel_admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::app_role)
  OR public.user_has_team_role(auth.uid(), 'finance'::app_role)
);

CREATE TRIGGER trg_sdcp_updated_at
BEFORE UPDATE ON public.scout_discount_code_payouts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();