-- Update the create_split_record_on_order function to use transaction_fee_percentage instead of hq_percentage/accommodation_percentage
CREATE OR REPLACE FUNCTION public.create_split_record_on_order()
RETURNS TRIGGER AS $$
DECLARE
  v_rule public.split_rules;
  v_hq_amount INTEGER;
  v_acc_amount INTEGER;
  v_fee_percentage NUMERIC;
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
        -- Get transaction fee percentage (default to 0 if not set)
        v_fee_percentage := COALESCE(v_rule.transaction_fee_percentage, 0);
        
        -- Calculate amounts based on transaction fee
        -- hq_amount = transaction fee amount
        v_hq_amount := ROUND(NEW.final_price * v_fee_percentage / 100);
        -- accommodation_amount = order amount (before fee deduction for display purposes)
        v_acc_amount := NEW.final_price;

        -- Insert split record
        INSERT INTO public.split_records (
          order_id,
          accommodation_id,
          split_rule_id,
          order_amount,
          hq_amount,
          accommodation_amount
        ) VALUES (
          NEW.id,
          NEW.accommodation_id,
          v_rule.id,
          NEW.final_price,
          v_hq_amount,
          v_acc_amount
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Also drop the old constraint if it exists (it may have been created in old migration)
ALTER TABLE split_rules DROP CONSTRAINT IF EXISTS valid_percentages;