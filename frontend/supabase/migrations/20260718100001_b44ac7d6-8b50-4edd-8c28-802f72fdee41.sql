-- Phase 1 for OwlTing auto-pending order creation
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_pii_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_created_from_email_id uuid REFERENCES public.owlting_email_orders_raw(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_pii_pending
  ON public.orders (is_pii_pending, created_at)
  WHERE is_pii_pending = true;

ALTER TABLE public.owlting_email_parsed_staging
  ADD COLUMN IF NOT EXISTS auto_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_create_error text;

CREATE INDEX IF NOT EXISTS idx_owlting_staging_auto_order
  ON public.owlting_email_parsed_staging (auto_order_id)
  WHERE auto_order_id IS NOT NULL;