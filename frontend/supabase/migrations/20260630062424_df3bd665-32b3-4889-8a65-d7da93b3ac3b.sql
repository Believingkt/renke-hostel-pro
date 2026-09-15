ALTER TABLE public.order_meta ADD COLUMN IF NOT EXISTS display_currency TEXT;
COMMENT ON COLUMN public.order_meta.display_currency IS '訂單顯示主幣別（TWD/JPY 等）；NULL = 預設 TWD。儲存值仍為 TWD，本欄位僅影響顯示。';