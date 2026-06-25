ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS import_project text;
CREATE INDEX IF NOT EXISTS idx_orders_import_project ON public.orders(import_project) WHERE import_project IS NOT NULL;