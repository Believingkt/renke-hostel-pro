CREATE INDEX IF NOT EXISTS idx_order_meta_display_currency_order
  ON public.order_meta (display_currency, order_id)
  WHERE display_currency IS NOT NULL AND display_currency <> 'TWD';