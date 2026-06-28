
CREATE TABLE public.discount_code_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_code_id uuid,
  accommodation_id uuid NOT NULL,
  code text,
  name text,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by uuid,
  changed_by_email text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dcaudit_accommodation_changed ON public.discount_code_audit_log (accommodation_id, changed_at DESC);
CREATE INDEX idx_dcaudit_code_changed ON public.discount_code_audit_log (discount_code_id, changed_at DESC);

GRANT SELECT ON public.discount_code_audit_log TO authenticated;
GRANT ALL ON public.discount_code_audit_log TO service_role;

ALTER TABLE public.discount_code_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Discount code editors can view audit log"
ON public.discount_code_audit_log
FOR SELECT
TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR staff_can_edit_module(accommodation_id, 'discount_codes'::text)
);

CREATE OR REPLACE FUNCTION public.log_discount_code_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_changes jsonb := '{}'::jsonb;
  v_fields text[] := ARRAY[
    'name','code','discount_type','discount_value','usage_limit',
    'valid_from','valid_until','is_active','min_order_amount',
    'applicable_room_types','applicable_date_from','applicable_date_to',
    'display_order','commission_rate'
  ];
  f text;
  old_v jsonb;
  new_v jsonb;
BEGIN
  BEGIN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    FOREACH f IN ARRAY v_fields LOOP
      new_v := to_jsonb(NEW) -> f;
      IF new_v IS NOT NULL AND new_v <> 'null'::jsonb THEN
        v_changes := v_changes || jsonb_build_object(f, jsonb_build_object('old', NULL, 'new', new_v));
      END IF;
    END LOOP;
    INSERT INTO public.discount_code_audit_log
      (discount_code_id, accommodation_id, code, name, action, changes, changed_by, changed_by_email)
    VALUES (NEW.id, NEW.accommodation_id, NEW.code, NEW.name, 'INSERT', v_changes, v_uid, v_email);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    FOREACH f IN ARRAY v_fields LOOP
      old_v := to_jsonb(OLD) -> f;
      new_v := to_jsonb(NEW) -> f;
      IF old_v IS DISTINCT FROM new_v THEN
        v_changes := v_changes || jsonb_build_object(f, jsonb_build_object('old', old_v, 'new', new_v));
      END IF;
    END LOOP;
    -- skip pure no-op (e.g. used_count or updated_at-only changes)
    IF v_changes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.discount_code_audit_log
      (discount_code_id, accommodation_id, code, name, action, changes, changed_by, changed_by_email)
    VALUES (NEW.id, NEW.accommodation_id, NEW.code, NEW.name, 'UPDATE', v_changes, v_uid, v_email);
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    FOREACH f IN ARRAY v_fields LOOP
      old_v := to_jsonb(OLD) -> f;
      IF old_v IS NOT NULL AND old_v <> 'null'::jsonb THEN
        v_changes := v_changes || jsonb_build_object(f, jsonb_build_object('old', old_v, 'new', NULL));
      END IF;
    END LOOP;
    INSERT INTO public.discount_code_audit_log
      (discount_code_id, accommodation_id, code, name, action, changes, changed_by, changed_by_email)
    VALUES (OLD.id, OLD.accommodation_id, OLD.code, OLD.name, 'DELETE', v_changes, v_uid, v_email);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_discount_code_change ON public.discount_codes;
CREATE TRIGGER trg_log_discount_code_change
AFTER INSERT OR UPDATE OR DELETE ON public.discount_codes
FOR EACH ROW EXECUTE FUNCTION public.log_discount_code_change();
