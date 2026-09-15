-- 拆帳規則表
CREATE TABLE public.split_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  hq_percentage NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  accommodation_percentage NUMERIC(5,2) NOT NULL DEFAULT 90.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_percentages CHECK (hq_percentage + accommodation_percentage = 100),
  CONSTRAINT valid_date_range CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- 拆帳記錄表
CREATE TABLE public.split_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  split_rule_id UUID REFERENCES public.split_rules(id),
  order_amount INTEGER NOT NULL,
  hq_amount INTEGER NOT NULL,
  accommodation_amount INTEGER NOT NULL,
  hq_percentage NUMERIC(5,2) NOT NULL,
  accommodation_percentage NUMERIC(5,2) NOT NULL,
  settlement_status TEXT NOT NULL DEFAULT 'pending',
  settlement_date TIMESTAMP WITH TIME ZONE,
  settlement_note TEXT,
  settled_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.split_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_records ENABLE ROW LEVEL SECURITY;

-- Split rules policies
CREATE POLICY "Super admins can manage all split rules"
  ON public.split_rules FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Hotel admins can view their split rules"
  ON public.split_rules FOR SELECT
  USING (user_has_access_to_accommodation(auth.uid(), accommodation_id));

-- Split records policies
CREATE POLICY "Super admins can manage all split records"
  ON public.split_records FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'));

CREATE POLICY "Hotel admins can view their split records"
  ON public.split_records FOR SELECT
  USING (user_has_access_to_accommodation(auth.uid(), accommodation_id));

-- Indexes
CREATE INDEX idx_split_rules_accommodation ON public.split_rules(accommodation_id);
CREATE INDEX idx_split_rules_active ON public.split_rules(is_active, effective_from, effective_to);
CREATE INDEX idx_split_records_order ON public.split_records(order_id);
CREATE INDEX idx_split_records_accommodation ON public.split_records(accommodation_id);
CREATE INDEX idx_split_records_settlement ON public.split_records(settlement_status, created_at);

-- Trigger for updated_at
CREATE TRIGGER update_split_rules_updated_at
  BEFORE UPDATE ON public.split_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_split_records_updated_at
  BEFORE UPDATE ON public.split_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to auto-create split record when order is confirmed
CREATE OR REPLACE FUNCTION public.create_split_record_on_order()
RETURNS TRIGGER AS $$
DECLARE
  v_rule public.split_rules;
  v_hq_amount INTEGER;
  v_acc_amount INTEGER;
BEGIN
  -- Only create split record when order status changes to confirmed or checked_out
  IF (TG_OP = 'UPDATE' AND NEW.order_status IN ('confirmed', 'checked_out') AND OLD.order_status != NEW.order_status) THEN
    -- Check if split record already exists
    IF NOT EXISTS (SELECT 1 FROM public.split_records WHERE order_id = NEW.id) THEN
      -- Get active split rule
      SELECT * INTO v_rule
      FROM public.split_rules
      WHERE accommodation_id = NEW.accommodation_id
        AND is_active = true
        AND effective_from <= CURRENT_DATE
        AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
      ORDER BY effective_from DESC
      LIMIT 1;

      IF v_rule.id IS NOT NULL THEN
        -- Calculate amounts
        v_hq_amount := ROUND((NEW.final_price * v_rule.hq_percentage / 100)::numeric);
        v_acc_amount := NEW.final_price - v_hq_amount;

        -- Insert split record
        INSERT INTO public.split_records (
          order_id,
          accommodation_id,
          split_rule_id,
          order_amount,
          hq_amount,
          accommodation_amount,
          hq_percentage,
          accommodation_percentage
        ) VALUES (
          NEW.id,
          NEW.accommodation_id,
          v_rule.id,
          NEW.final_price,
          v_hq_amount,
          v_acc_amount,
          v_rule.hq_percentage,
          v_rule.accommodation_percentage
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on orders table
CREATE TRIGGER create_split_record_trigger
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.create_split_record_on_order();