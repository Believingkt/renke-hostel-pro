CREATE TABLE public.pending_paid_order_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  rec_trade_id text UNIQUE,
  expected_amount integer NOT NULL CHECK (expected_amount > 0),
  order_payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending_3ds' CHECK (status IN ('pending_3ds','payment_succeeded','order_created','payment_failed','refunded','manual_review')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
GRANT ALL ON public.pending_paid_order_drafts TO service_role;
ALTER TABLE public.pending_paid_order_drafts ENABLE ROW LEVEL SECURITY;
CREATE INDEX pending_paid_order_drafts_rec_trade_idx ON public.pending_paid_order_drafts(rec_trade_id);
CREATE INDEX pending_paid_order_drafts_status_expiry_idx ON public.pending_paid_order_drafts(status, expires_at);
CREATE OR REPLACE FUNCTION public.set_pending_paid_order_drafts_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER set_pending_paid_order_drafts_updated_at
BEFORE UPDATE ON public.pending_paid_order_drafts
FOR EACH ROW EXECUTE FUNCTION public.set_pending_paid_order_drafts_updated_at();