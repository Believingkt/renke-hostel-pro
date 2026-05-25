
-- 1. Add addon fee percentage to split_rules
ALTER TABLE public.split_rules
  ADD COLUMN IF NOT EXISTS addon_fee_percentage numeric(5,2) NOT NULL DEFAULT 0;

-- 2. Create addon_sales table
CREATE TABLE IF NOT EXISTS public.addon_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  sale_date date NOT NULL,
  item_name text NOT NULL,
  category text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price integer NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total_amount integer NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  notes text,
  related_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_addon_sales_acc_date
  ON public.addon_sales(accommodation_id, sale_date DESC);

ALTER TABLE public.addon_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view addon sales of their accommodation"
  ON public.addon_sales FOR SELECT
  USING (public.user_has_access_to_accommodation(auth.uid(), accommodation_id));

CREATE POLICY "Members can insert addon sales for their accommodation"
  ON public.addon_sales FOR INSERT
  WITH CHECK (public.user_has_access_to_accommodation(auth.uid(), accommodation_id));

CREATE POLICY "Members can update addon sales of their accommodation"
  ON public.addon_sales FOR UPDATE
  USING (public.user_has_access_to_accommodation(auth.uid(), accommodation_id))
  WITH CHECK (public.user_has_access_to_accommodation(auth.uid(), accommodation_id));

CREATE POLICY "Members can delete addon sales of their accommodation"
  ON public.addon_sales FOR DELETE
  USING (public.user_has_access_to_accommodation(auth.uid(), accommodation_id));

CREATE TRIGGER update_addon_sales_updated_at
  BEFORE UPDATE ON public.addon_sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
