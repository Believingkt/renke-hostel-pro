
ALTER TABLE public.deposit_charges
  ADD COLUMN IF NOT EXISTS needs_manual_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS bank_transaction_id text,
  ADD COLUMN IF NOT EXISTS webhook_status text,
  ADD COLUMN IF NOT EXISTS raw_response jsonb;

CREATE INDEX IF NOT EXISTS idx_deposit_charges_rec_trade ON public.deposit_charges (rec_trade_id);
CREATE INDEX IF NOT EXISTS idx_deposit_charges_review ON public.deposit_charges (needs_manual_review) WHERE needs_manual_review;
CREATE INDEX IF NOT EXISTS idx_deposit_charges_created ON public.deposit_charges (created_at DESC);

GRANT SELECT, UPDATE ON public.deposit_charges TO authenticated;
GRANT ALL ON public.deposit_charges TO service_role;

DROP POLICY IF EXISTS "Admins can update deposit charges" ON public.deposit_charges;
CREATE POLICY "Admins can update deposit charges"
ON public.deposit_charges FOR UPDATE TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR user_has_access_to_accommodation(auth.uid(), accommodation_id)
)
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

CREATE TABLE IF NOT EXISTS public.tappay_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rec_trade_id text,
  order_number text,
  bank_transaction_id text,
  event_type text NOT NULL DEFAULT 'unknown',
  status integer,
  amount integer,
  currency text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  process_error text,
  matched_order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tappay_webhook_rec_trade ON public.tappay_webhook_events (rec_trade_id);
CREATE INDEX IF NOT EXISTS idx_tappay_webhook_created ON public.tappay_webhook_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tappay_webhook_order ON public.tappay_webhook_events (matched_order_id);

GRANT SELECT ON public.tappay_webhook_events TO authenticated;
GRANT ALL ON public.tappay_webhook_events TO service_role;

ALTER TABLE public.tappay_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view tappay webhook events" ON public.tappay_webhook_events;
CREATE POLICY "Admins can view tappay webhook events"
ON public.tappay_webhook_events FOR SELECT TO authenticated
USING (
  matched_order_id IS NULL
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = tappay_webhook_events.matched_order_id
      AND (
        user_has_role(auth.uid(), o.accommodation_id, 'super_admin'::app_role)
        OR user_has_role(auth.uid(), o.accommodation_id, 'hotel_admin'::app_role)
        OR user_has_access_to_accommodation(auth.uid(), o.accommodation_id)
      )
  )
);
