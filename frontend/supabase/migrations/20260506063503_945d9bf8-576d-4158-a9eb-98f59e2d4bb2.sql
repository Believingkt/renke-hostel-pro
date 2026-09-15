ALTER TABLE public.order_rooms
ADD COLUMN room_unit_id UUID REFERENCES public.room_units(id) ON DELETE SET NULL;

CREATE INDEX idx_order_rooms_unit ON public.order_rooms(room_unit_id);

CREATE OR REPLACE FUNCTION public.validate_room_unit_no_conflict()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_conflict RECORD;
BEGIN
  IF NEW.room_unit_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, check_in_date, check_out_date, order_status
  INTO v_order
  FROM public.orders
  WHERE id = NEW.order_id;

  IF v_order.id IS NULL OR v_order.order_status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT o.order_number, o.guest_name
  INTO v_conflict
  FROM public.order_rooms orr
  JOIN public.orders o ON o.id = orr.order_id
  WHERE orr.room_unit_id = NEW.room_unit_id
    AND orr.id <> NEW.id
    AND o.order_status NOT IN ('cancelled')
    AND o.check_in_date < v_order.check_out_date
    AND o.check_out_date > v_order.check_in_date
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION '此房間單位於該日期區間已被訂單 % (%) 佔用',
      v_conflict.order_number, COALESCE(v_conflict.guest_name, '');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_room_unit_no_conflict ON public.order_rooms;
CREATE TRIGGER trg_validate_room_unit_no_conflict
BEFORE INSERT OR UPDATE OF room_unit_id ON public.order_rooms
FOR EACH ROW
EXECUTE FUNCTION public.validate_room_unit_no_conflict();