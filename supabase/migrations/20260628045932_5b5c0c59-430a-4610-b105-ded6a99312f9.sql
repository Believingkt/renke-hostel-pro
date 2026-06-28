
CREATE TABLE public.room_inventory_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_inventory_id uuid,
  accommodation_id uuid,
  room_type_id uuid NOT NULL,
  pricing_template_id uuid,
  date date NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_available_rooms integer,
  new_available_rooms integer,
  old_price integer,
  new_price integer,
  old_is_available boolean,
  new_is_available boolean,
  changed_by uuid,
  changed_by_email text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_riaudit_room_type_date ON public.room_inventory_audit_log (room_type_id, date DESC);
CREATE INDEX idx_riaudit_accommodation_changed ON public.room_inventory_audit_log (accommodation_id, changed_at DESC);
CREATE INDEX idx_riaudit_changed_by ON public.room_inventory_audit_log (changed_by, changed_at DESC);

GRANT SELECT ON public.room_inventory_audit_log TO authenticated;
GRANT ALL ON public.room_inventory_audit_log TO service_role;

ALTER TABLE public.room_inventory_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inventory editors can view audit log"
ON public.room_inventory_audit_log
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM room_types rt
    WHERE rt.id = room_inventory_audit_log.room_type_id
      AND (
        user_has_role(auth.uid(), rt.accommodation_id, 'super_admin'::app_role)
        OR user_has_role(auth.uid(), rt.accommodation_id, 'hotel_admin'::app_role)
        OR staff_can_edit_module(rt.accommodation_id, 'room_price'::text)
      )
  )
);

CREATE OR REPLACE FUNCTION public.log_room_inventory_pricing_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_email text;
  v_acc uuid;
  v_room_type uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_room_type := OLD.room_type_id;
  ELSE
    v_room_type := NEW.room_type_id;
  END IF;

  SELECT accommodation_id INTO v_acc FROM room_types WHERE id = v_room_type;

  IF TG_OP = 'UPDATE' THEN
    -- Skip if nothing meaningful changed
    IF OLD.available_rooms IS NOT DISTINCT FROM NEW.available_rooms
       AND OLD.price IS NOT DISTINCT FROM NEW.price
       AND OLD.is_available IS NOT DISTINCT FROM NEW.is_available THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.room_inventory_audit_log (
      room_inventory_id, accommodation_id, room_type_id, pricing_template_id, date, action,
      old_available_rooms, new_available_rooms, old_price, new_price,
      old_is_available, new_is_available, changed_by, changed_by_email
    ) VALUES (
      NEW.id, v_acc, NEW.room_type_id, NEW.pricing_template_id, NEW.date, 'UPDATE',
      OLD.available_rooms, NEW.available_rooms, OLD.price, NEW.price,
      OLD.is_available, NEW.is_available, v_uid, v_email
    );
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.room_inventory_audit_log (
      room_inventory_id, accommodation_id, room_type_id, pricing_template_id, date, action,
      new_available_rooms, new_price, new_is_available, changed_by, changed_by_email
    ) VALUES (
      NEW.id, v_acc, NEW.room_type_id, NEW.pricing_template_id, NEW.date, 'INSERT',
      NEW.available_rooms, NEW.price, NEW.is_available, v_uid, v_email
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.room_inventory_audit_log (
      room_inventory_id, accommodation_id, room_type_id, pricing_template_id, date, action,
      old_available_rooms, old_price, old_is_available, changed_by, changed_by_email
    ) VALUES (
      OLD.id, v_acc, OLD.room_type_id, OLD.pricing_template_id, OLD.date, 'DELETE',
      OLD.available_rooms, OLD.price, OLD.is_available, v_uid, v_email
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_room_inventory_pricing_changes ON public.room_inventory_pricing;
CREATE TRIGGER trg_log_room_inventory_pricing_changes
AFTER INSERT OR UPDATE OR DELETE ON public.room_inventory_pricing
FOR EACH ROW EXECUTE FUNCTION public.log_room_inventory_pricing_changes();
