CREATE TABLE public.payment_audit_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  charge_id UUID NOT NULL REFERENCES public.deposit_charges(id) ON DELETE CASCADE,
  order_id UUID,
  order_number TEXT,
  accommodation_id UUID,
  rec_trade_id TEXT,
  charge_action TEXT,
  resolution_action TEXT NOT NULL,
  final_status TEXT,
  recorded_amount NUMERIC,
  verified_amount NUMERIC,
  tappay_amount NUMERIC,
  amount_matches BOOLEAN,
  before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT,
  operator_id UUID,
  operator_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_audit_actions TO authenticated;
GRANT ALL ON public.payment_audit_actions TO service_role;

ALTER TABLE public.payment_audit_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_audit_actions_select_admin"
ON public.payment_audit_actions
FOR SELECT
TO authenticated
USING (
  public.user_has_role(auth.uid(), NULL::uuid, 'super_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'finance'::app_role)
);

CREATE INDEX idx_payment_audit_actions_charge ON public.payment_audit_actions(charge_id);
CREATE INDEX idx_payment_audit_actions_created ON public.payment_audit_actions(created_at DESC);
CREATE INDEX idx_payment_audit_actions_accommodation ON public.payment_audit_actions(accommodation_id);