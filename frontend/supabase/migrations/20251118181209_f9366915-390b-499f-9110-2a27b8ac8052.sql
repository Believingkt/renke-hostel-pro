-- Add commission_rate column to discount_codes table
ALTER TABLE public.discount_codes
ADD COLUMN commission_rate numeric DEFAULT 0 CHECK (commission_rate >= 0 AND commission_rate <= 100);

COMMENT ON COLUMN public.discount_codes.commission_rate IS '佣金率（百分比），例如 10 表示 10%';

-- Create commission_records table to track commissions
CREATE TABLE public.commission_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  discount_code_id uuid NOT NULL REFERENCES public.discount_codes(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- Commission calculation details
  order_total numeric NOT NULL,
  discount_amount numeric NOT NULL,
  commission_rate numeric NOT NULL,
  commission_amount numeric NOT NULL,
  
  -- Settlement tracking
  settlement_status text NOT NULL DEFAULT 'pending' CHECK (settlement_status IN ('pending', 'approved', 'paid', 'cancelled')),
  settlement_date timestamp with time zone,
  payment_date timestamp with time zone,
  payment_method text,
  payment_note text,
  
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX idx_commission_records_accommodation_id ON public.commission_records(accommodation_id);
CREATE INDEX idx_commission_records_discount_code_id ON public.commission_records(discount_code_id);
CREATE INDEX idx_commission_records_order_id ON public.commission_records(order_id);
CREATE INDEX idx_commission_records_settlement_status ON public.commission_records(settlement_status);

-- Add comments
COMMENT ON TABLE public.commission_records IS '佣金記錄表，追蹤每筆訂單的佣金明細';
COMMENT ON COLUMN public.commission_records.settlement_status IS '結算狀態：pending=待結算, approved=已核准, paid=已付款, cancelled=已取消';

-- Enable RLS
ALTER TABLE public.commission_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies for commission_records
CREATE POLICY "Admins can view commission records"
  ON public.commission_records
  FOR SELECT
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
    user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );

CREATE POLICY "Admins can insert commission records"
  ON public.commission_records
  FOR INSERT
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
    user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );

CREATE POLICY "Admins can update commission records"
  ON public.commission_records
  FOR UPDATE
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
    user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );

CREATE POLICY "Admins can delete commission records"
  ON public.commission_records
  FOR DELETE
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR
    user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );

-- Create trigger for updated_at
CREATE TRIGGER update_commission_records_updated_at
  BEFORE UPDATE ON public.commission_records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to automatically create commission record when order is created or updated
CREATE OR REPLACE FUNCTION public.create_commission_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_discount_code public.discount_codes;
  v_commission_amount numeric;
BEGIN
  -- Only process if order has a discount code and is confirmed
  IF NEW.discount_code IS NOT NULL AND NEW.order_status IN ('confirmed', 'checked_in', 'checked_out') THEN
    -- Get discount code information
    SELECT * INTO v_discount_code
    FROM public.discount_codes
    WHERE code = NEW.discount_code
      AND accommodation_id = NEW.accommodation_id;
    
    -- Only create commission record if discount code has commission rate > 0
    IF v_discount_code.commission_rate > 0 THEN
      -- Calculate commission amount based on discount amount
      v_commission_amount := ROUND((NEW.discount_amount * v_discount_code.commission_rate / 100)::numeric, 0);
      
      -- Check if commission record already exists for this order
      IF NOT EXISTS (
        SELECT 1 FROM public.commission_records WHERE order_id = NEW.id
      ) THEN
        -- Insert new commission record
        INSERT INTO public.commission_records (
          accommodation_id,
          discount_code_id,
          order_id,
          order_total,
          discount_amount,
          commission_rate,
          commission_amount,
          settlement_status
        ) VALUES (
          NEW.accommodation_id,
          v_discount_code.id,
          NEW.id,
          NEW.total_price,
          NEW.discount_amount,
          v_discount_code.commission_rate,
          v_commission_amount,
          'pending'
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on orders table
CREATE TRIGGER create_commission_on_order_confirmed
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.create_commission_record();