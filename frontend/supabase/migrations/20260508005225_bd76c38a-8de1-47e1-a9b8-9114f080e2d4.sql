
-- 1. Sequences for numeric codes (start at 1001)
CREATE SEQUENCE IF NOT EXISTS public.room_type_numeric_code_seq START WITH 1001 INCREMENT BY 1 MINVALUE 1001;
CREATE SEQUENCE IF NOT EXISTS public.pricing_template_numeric_code_seq START WITH 1001 INCREMENT BY 1 MINVALUE 1001;

-- 2. Add numeric_code columns
ALTER TABLE public.room_types
  ADD COLUMN IF NOT EXISTS numeric_code BIGINT UNIQUE;

ALTER TABLE public.pricing_templates
  ADD COLUMN IF NOT EXISTS numeric_code BIGINT UNIQUE;

-- 3. Backfill existing rows in created_at order
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.room_types WHERE numeric_code IS NULL ORDER BY created_at, id LOOP
    UPDATE public.room_types SET numeric_code = nextval('public.room_type_numeric_code_seq') WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id FROM public.pricing_templates WHERE numeric_code IS NULL ORDER BY created_at, id LOOP
    UPDATE public.pricing_templates SET numeric_code = nextval('public.pricing_template_numeric_code_seq') WHERE id = r.id;
  END LOOP;
END $$;

-- 4. Triggers to auto-assign numeric_code on insert
CREATE OR REPLACE FUNCTION public.assign_room_type_numeric_code()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.numeric_code IS NULL THEN
    NEW.numeric_code := nextval('public.room_type_numeric_code_seq');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_room_type_numeric_code ON public.room_types;
CREATE TRIGGER trg_assign_room_type_numeric_code
  BEFORE INSERT ON public.room_types
  FOR EACH ROW EXECUTE FUNCTION public.assign_room_type_numeric_code();

CREATE OR REPLACE FUNCTION public.assign_pricing_template_numeric_code()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.numeric_code IS NULL THEN
    NEW.numeric_code := nextval('public.pricing_template_numeric_code_seq');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_pricing_template_numeric_code ON public.pricing_templates;
CREATE TRIGGER trg_assign_pricing_template_numeric_code
  BEFORE INSERT ON public.pricing_templates
  FOR EACH ROW EXECUTE FUNCTION public.assign_pricing_template_numeric_code();

-- 5. OwlTing service account (single shared credential, not per-property)
CREATE TABLE IF NOT EXISTS public.owlting_service_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL, -- PasswordText (HTTPS only). Stored plain to allow comparison; replace with hash if compliance requires.
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.owlting_service_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages owlting service accounts"
  ON public.owlting_service_accounts
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_owlting_service_accounts_updated_at
  BEFORE UPDATE ON public.owlting_service_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. RPC for edge function: verify service account credentials (bypasses RLS)
CREATE OR REPLACE FUNCTION public.verify_owlting_service_account(p_username TEXT, p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match BOOLEAN := false;
BEGIN
  SELECT true INTO v_match
  FROM public.owlting_service_accounts
  WHERE username = p_username
    AND password = p_password
    AND is_active = true
  LIMIT 1;

  IF v_match THEN
    UPDATE public.owlting_service_accounts
       SET last_used_at = now()
     WHERE username = p_username;
  END IF;

  RETURN COALESCE(v_match, false);
END $$;

-- 7. RPC for resolving codes by accommodation
CREATE OR REPLACE FUNCTION public.resolve_room_type_by_numeric_code(p_accommodation_id UUID, p_code BIGINT)
RETURNS TABLE(id UUID, name TEXT, base_price INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name, base_price FROM public.room_types
  WHERE accommodation_id = p_accommodation_id AND numeric_code = p_code LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.resolve_pricing_template_by_numeric_code(p_accommodation_id UUID, p_code BIGINT)
RETURNS TABLE(id UUID, template_name TEXT, room_type_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, template_name, room_type_id FROM public.pricing_templates
  WHERE accommodation_id = p_accommodation_id AND numeric_code = p_code LIMIT 1;
$$;
