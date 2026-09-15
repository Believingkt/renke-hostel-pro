-- Update the create_split_record_on_order function to auto-create a default 5% fee rule if none exists
CREATE OR REPLACE FUNCTION public.create_split_record_on_order()
RETURNS TRIGGER AS $$
DECLARE
  v_rule public.split_rules;
  v_hq_amount INTEGER;
  v_acc_amount INTEGER;
  v_fee_percentage NUMERIC;
  v_new_rule_id UUID;
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

      -- If no rule exists, create a default 5% fee rule
      IF v_rule.id IS NULL THEN
        INSERT INTO public.split_rules (
          accommodation_id,
          transaction_fee_percentage,
          effective_from,
          description
        ) VALUES (
          NEW.accommodation_id,
          5.00,
          CURRENT_DATE,
          '系統自動建立的預設手續費規則'
        )
        RETURNING * INTO v_rule;
      END IF;

      -- Get transaction fee percentage (default to 5 if not set)
      v_fee_percentage := COALESCE(v_rule.transaction_fee_percentage, 5);
      
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;