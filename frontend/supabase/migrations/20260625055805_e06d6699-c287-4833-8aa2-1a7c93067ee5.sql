ALTER TABLE public.closer_commission_adjustments
  DROP CONSTRAINT IF EXISTS closer_commission_adjustments_adjustment_type_check;

ALTER TABLE public.closer_commission_adjustments
  ADD CONSTRAINT closer_commission_adjustments_adjustment_type_check
  CHECK (adjustment_type IN ('amount_change', 'cancellation', 'reactivation', '補發', '扣回'));

ALTER TABLE public.closer_commission_adjustments
  ADD CONSTRAINT closer_commission_adjustments_unique_per_month
  UNIQUE (order_id, adjustment_month, adjustment_type);