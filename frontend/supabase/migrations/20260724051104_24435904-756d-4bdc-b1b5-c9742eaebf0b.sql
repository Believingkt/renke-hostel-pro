
CREATE TABLE public.order_status_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  old_value text,
  new_value text,
  sent_email_at timestamptz,
  sent_line_at timestamptz,
  sent_inapp_at timestamptz,
  last_error text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_osce_pending
  ON public.order_status_change_events (created_at)
  WHERE sent_email_at IS NULL OR sent_line_at IS NULL OR sent_inapp_at IS NULL;

CREATE INDEX idx_osce_order ON public.order_status_change_events (order_id);

GRANT SELECT, INSERT, UPDATE ON public.order_status_change_events TO authenticated;
GRANT ALL ON public.order_status_change_events TO service_role;

ALTER TABLE public.order_status_change_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages status change events"
  ON public.order_status_change_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Staff can view status change events for accessible accommodations"
  ON public.order_status_change_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_change_events.order_id
        AND public.user_has_access_to_accommodation(auth.uid(), o.accommodation_id)
    )
  );

CREATE OR REPLACE FUNCTION public.enqueue_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.member_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.payment_status IS DISTINCT FROM NEW.payment_status
     AND NEW.payment_status IN ('paid','deposit_paid','refunded') THEN
    INSERT INTO public.order_status_change_events (order_id, event_type, old_value, new_value)
    VALUES (NEW.id, 'payment_status:' || NEW.payment_status, OLD.payment_status, NEW.payment_status);
  END IF;

  IF OLD.order_status IS DISTINCT FROM NEW.order_status
     AND NEW.order_status IN ('confirmed','cancelled') THEN
    INSERT INTO public.order_status_change_events (order_id, event_type, old_value, new_value)
    VALUES (NEW.id, 'order_status:' || NEW.order_status, OLD.order_status, NEW.order_status);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_status_change_notify_trigger ON public.orders;
CREATE TRIGGER orders_status_change_notify_trigger
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_order_status_change();

CREATE OR REPLACE FUNCTION public.touch_osce_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER osce_touch_updated_at
BEFORE UPDATE ON public.order_status_change_events
FOR EACH ROW EXECUTE FUNCTION public.touch_osce_updated_at();
