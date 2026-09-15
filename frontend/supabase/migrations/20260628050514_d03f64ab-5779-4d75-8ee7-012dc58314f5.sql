
ALTER TABLE public.room_inventory_pricing ADD COLUMN IF NOT EXISTS last_change_source text;
ALTER TABLE public.room_inventory_audit_log ADD COLUMN IF NOT EXISTS change_source text;

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
  v_source text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_room_type := OLD.room_type_id;
    v_source := OLD.last_change_source;
  ELSE
    v_room_type := NEW.room_type_id;
    v_source := NEW.last_change_source;
  END IF;

  SELECT accommodation_id INTO v_acc FROM room_types WHERE id = v_room_type;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.available_rooms IS NOT DISTINCT FROM NEW.available_rooms
       AND OLD.price IS NOT DISTINCT FROM NEW.price
       AND OLD.is_available IS NOT DISTINCT FROM NEW.is_available THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.room_inventory_audit_log (
      room_inventory_id, accommodation_id, room_type_id, pricing_template_id, date, action,
      old_available_rooms, new_available_rooms, old_price, new_price,
      old_is_available, new_is_available, changed_by, changed_by_email, change_source
    ) VALUES (
      NEW.id, v_acc, NEW.room_type_id, NEW.pricing_template_id, NEW.date, 'UPDATE',
      OLD.available_rooms, NEW.available_rooms, OLD.price, NEW.price,
      OLD.is_available, NEW.is_available, v_uid, v_email, v_source
    );
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.room_inventory_audit_log (
      room_inventory_id, accommodation_id, room_type_id, pricing_template_id, date, action,
      new_available_rooms, new_price, new_is_available, changed_by, changed_by_email, change_source
    ) VALUES (
      NEW.id, v_acc, NEW.room_type_id, NEW.pricing_template_id, NEW.date, 'INSERT',
      NEW.available_rooms, NEW.price, NEW.is_available, v_uid, v_email, v_source
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.room_inventory_audit_log (
      room_inventory_id, accommodation_id, room_type_id, pricing_template_id, date, action,
      old_available_rooms, old_price, old_is_available, changed_by, changed_by_email, change_source
    ) VALUES (
      OLD.id, v_acc, OLD.room_type_id, OLD.pricing_template_id, OLD.date, 'DELETE',
      OLD.available_rooms, OLD.price, OLD.is_available, v_uid, v_email, v_source
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
