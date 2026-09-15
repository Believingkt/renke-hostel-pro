-- 1. Create permission table
CREATE TABLE IF NOT EXISTS public.paid_order_discount_unlock_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  accommodation_id uuid NOT NULL,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, accommodation_id)
);

ALTER TABLE public.paid_order_discount_unlock_permissions ENABLE ROW LEVEL SECURITY;

-- Admins (super_admin / hotel_admin of the same accommodation) can manage
CREATE POLICY "Admins can view discount unlock perms"
ON public.paid_order_discount_unlock_permissions
FOR SELECT TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR user_id = auth.uid()
);

CREATE POLICY "Admins can insert discount unlock perms"
ON public.paid_order_discount_unlock_permissions
FOR INSERT TO authenticated
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

CREATE POLICY "Admins can delete discount unlock perms"
ON public.paid_order_discount_unlock_permissions
FOR DELETE TO authenticated
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
  OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- 2. Helper function: can current user unlock paid-order discount for an accommodation?
CREATE OR REPLACE FUNCTION public.can_unlock_paid_order_discount(_user_id uuid, _accommodation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- super_admin always can
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = 'super_admin'::app_role
    )
    OR EXISTS (
      SELECT 1 FROM public.paid_order_discount_unlock_permissions
      WHERE user_id = _user_id AND accommodation_id = _accommodation_id
    );
$$;

-- 3. Update trigger to allow discount edits when user has unlock permission
CREATE OR REPLACE FUNCTION public.prevent_immutable_order_fields_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  is_super_admin_user boolean := false;
  can_unlock_discount boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'::app_role
    ) INTO is_super_admin_user;

    SELECT public.can_unlock_paid_order_discount(auth.uid(), NEW.accommodation_id)
      INTO can_unlock_discount;
  END IF;

  IF NOT is_super_admin_user THEN
    IF NEW.order_number IS DISTINCT FROM OLD.order_number THEN
      RAISE EXCEPTION 'order_number is immutable and cannot be changed';
    END IF;

    IF NEW.accommodation_id IS DISTINCT FROM OLD.accommodation_id THEN
      RAISE EXCEPTION 'accommodation_id is immutable and cannot be changed';
    END IF;

    IF OLD.idempotency_key IS NOT NULL
       AND NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
      RAISE EXCEPTION 'idempotency_key cannot be changed once set';
    END IF;

    IF OLD.payment_status IN ('deposit_paid', 'fully_paid', 'paid') THEN
      IF NEW.total_price IS DISTINCT FROM OLD.total_price THEN
        RAISE EXCEPTION 'total_price cannot be changed after payment';
      END IF;
      -- discount_amount can be changed by users with unlock permission
      IF NEW.discount_amount IS DISTINCT FROM OLD.discount_amount AND NOT can_unlock_discount THEN
        RAISE EXCEPTION 'discount_amount cannot be changed after payment';
      END IF;
      IF NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount THEN
        RAISE EXCEPTION 'deposit_amount cannot be changed after payment';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;