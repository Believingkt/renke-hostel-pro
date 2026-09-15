CREATE OR REPLACE FUNCTION public.auto_link_member_to_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_phone_digits text;
BEGIN
  v_phone_digits := NULLIF(regexp_replace(COALESCE(NEW.phone, ''), '\D', '', 'g'), '');

  -- customers：需 Email 與電話「同時」相符才自動綁定
  UPDATE public.customers c
  SET member_id = NEW.id
  WHERE c.member_id IS NULL
    AND NEW.email IS NOT NULL
    AND c.email IS NOT NULL
    AND LOWER(TRIM(c.email)) = LOWER(TRIM(NEW.email))
    AND v_phone_digits IS NOT NULL
    AND NULLIF(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), '') = v_phone_digits;

  -- orders：需 Email 與電話「同時」相符才自動綁定，避免冒用他人 Email 下單導致隱私外洩
  UPDATE public.orders o
  SET member_id = NEW.id
  WHERE o.member_id IS NULL
    AND NEW.email IS NOT NULL
    AND o.guest_email IS NOT NULL
    AND LOWER(TRIM(o.guest_email)) = LOWER(TRIM(NEW.email))
    AND v_phone_digits IS NOT NULL
    AND NULLIF(regexp_replace(COALESCE(o.guest_phone, ''), '\D', '', 'g'), '') = v_phone_digits;

  RETURN NEW;
END;
$$;