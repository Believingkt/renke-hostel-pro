CREATE OR REPLACE FUNCTION public.log_order_deposit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_email text;
BEGIN
  IF COALESCE(NEW.deposit_required_amount, 0) IS DISTINCT FROM COALESCE(OLD.deposit_required_amount, 0) THEN
    v_changes := v_changes || jsonb_build_object('deposit_required_amount',
      jsonb_build_object('from', OLD.deposit_required_amount, 'to', NEW.deposit_required_amount));
  END IF;
  IF NEW.deposit_method IS DISTINCT FROM OLD.deposit_method THEN
    v_changes := v_changes || jsonb_build_object('deposit_method',
      jsonb_build_object('from', OLD.deposit_method, 'to', NEW.deposit_method));
  END IF;
  IF NEW.deposit_status IS DISTINCT FROM OLD.deposit_status THEN
    v_changes := v_changes || jsonb_build_object('deposit_status',
      jsonb_build_object('from', OLD.deposit_status, 'to', NEW.deposit_status));
  END IF;
  IF NEW.deposit_charged_amount IS DISTINCT FROM OLD.deposit_charged_amount THEN
    v_changes := v_changes || jsonb_build_object('deposit_charged_amount',
      jsonb_build_object('from', OLD.deposit_charged_amount, 'to', NEW.deposit_charged_amount));
  END IF;
  IF NEW.deposit_refunded_amount IS DISTINCT FROM OLD.deposit_refunded_amount THEN
    v_changes := v_changes || jsonb_build_object('deposit_refunded_amount',
      jsonb_build_object('from', OLD.deposit_refunded_amount, 'to', NEW.deposit_refunded_amount));
  END IF;

  IF v_changes = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.audit_logs (
    accommodation_id, user_id, user_email, action_type, action_category,
    entity_type, entity_id, entity_name, details
  ) VALUES (
    NEW.accommodation_id, auth.uid(), v_email, 'deposit_change', 'order',
    'order_deposit', NEW.id::text, NEW.order_number, v_changes
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_order_deposit_change ON public.orders;
CREATE TRIGGER trg_log_order_deposit_change
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.log_order_deposit_change();