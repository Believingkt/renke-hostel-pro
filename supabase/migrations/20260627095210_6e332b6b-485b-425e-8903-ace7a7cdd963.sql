ALTER TABLE public.franchise_external_orders
  ADD COLUMN IF NOT EXISTS sales_member_id uuid REFERENCES public.team_member_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS co_sales_member_id uuid REFERENCES public.team_member_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS co_sales_member_id2 uuid REFERENCES public.team_member_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fxo_sales_member_id ON public.franchise_external_orders(sales_member_id);
CREATE INDEX IF NOT EXISTS idx_fxo_co_sales_member_id ON public.franchise_external_orders(co_sales_member_id);
CREATE INDEX IF NOT EXISTS idx_fxo_co_sales_member_id2 ON public.franchise_external_orders(co_sales_member_id2);