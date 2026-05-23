CREATE TABLE public.franchise_external_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_name text NOT NULL DEFAULT '森山第一期',
  signed_at date,
  sales_name text,
  sales_email text,
  sales_phone text,
  member_number text,
  customer_name text NOT NULL,
  customer_phone text,
  unit_count integer DEFAULT 1,
  plan_price integer NOT NULL DEFAULT 100000,
  total_amount integer GENERATED ALWAYS AS (unit_count * plan_price) STORED,
  payment_at date,
  contract_progress text DEFAULT '進行中',
  tax_id text,
  invoice_progress text,
  invoice_number text,
  invoice_carrier boolean DEFAULT true,
  invoice_address text,
  sales_bonus integer,
  co_sales_name text,
  co_sales_bonus integer,
  co_sales_name2 text,
  co_sales_bonus2 integer,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.franchise_external_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin can all" ON public.franchise_external_orders
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin'::app_role, 'super_admin'::app_role)
        AND accommodation_id IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin'::app_role, 'super_admin'::app_role)
        AND accommodation_id IS NULL
    )
  );

CREATE TRIGGER trg_franchise_external_orders_updated_at
  BEFORE UPDATE ON public.franchise_external_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();