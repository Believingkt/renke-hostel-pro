-- Add deposit columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS deposit_required_amount integer NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS deposit_method text,
  ADD COLUMN IF NOT EXISTS deposit_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS deposit_charged_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_refunded_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_charged_at timestamptz,
  ADD COLUMN IF NOT EXISTS deposit_refunded_at timestamptz;

COMMENT ON COLUMN public.orders.deposit_method IS 'cash | card | NULL (未選)';
COMMENT ON COLUMN public.orders.deposit_status IS 'pending | card_bound | charged | partially_refunded | refunded | failed | cash';

-- Card tokens table (long-lived TapPay tokens)
CREATE TABLE IF NOT EXISTS public.deposit_card_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  accommodation_id uuid NOT NULL,
  card_key text NOT NULL,
  card_token text NOT NULL,
  card_last_four text,
  card_type text,
  card_expiry text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deposit_card_tokens_order ON public.deposit_card_tokens(order_id);
CREATE INDEX IF NOT EXISTS idx_deposit_card_tokens_active ON public.deposit_card_tokens(is_active) WHERE is_active = true;

ALTER TABLE public.deposit_card_tokens ENABLE ROW LEVEL SECURITY;

-- Only admins can view; tokens never exposed to public
CREATE POLICY "Admins can view deposit card tokens"
ON public.deposit_card_tokens FOR SELECT
TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- Inserts/updates only via service role (Edge Function). No public insert/update/delete policies.

-- Charges / refunds log
CREATE TABLE IF NOT EXISTS public.deposit_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  accommodation_id uuid NOT NULL,
  card_token_id uuid REFERENCES public.deposit_card_tokens(id) ON DELETE SET NULL,
  action text NOT NULL,            -- 'charge' | 'refund'
  amount integer NOT NULL,
  status text NOT NULL,            -- 'success' | 'failed'
  trigger_source text NOT NULL,    -- 'manual' | 'scheduled'
  rec_trade_id text,
  error_message text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deposit_charges_order ON public.deposit_charges(order_id);
CREATE INDEX IF NOT EXISTS idx_deposit_charges_acc ON public.deposit_charges(accommodation_id);

ALTER TABLE public.deposit_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view deposit charges"
ON public.deposit_charges FOR SELECT
TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

-- updated_at trigger for tokens
CREATE TRIGGER update_deposit_card_tokens_updated_at
BEFORE UPDATE ON public.deposit_card_tokens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();