-- 由 build_base.py 產生；scratch 專用，勿套用到任何正式資料庫
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
CREATE TYPE public.app_role AS ENUM ('super_admin','hotel_admin','staff','admin','am','am_manager','closer','closer_manager','finance','franchise','franchise_external','franchise_internal','franchise_manager','kol','owner','scout','scout_manager','starlink','venue_manager','video');
CREATE TYPE public.module_permission_level AS ENUM ('hidden','readonly','editable');
CREATE TABLE public.accommodation_info (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE public.team_member_profiles (user_id uuid PRIMARY KEY);
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, accommodation_id uuid, role public.app_role NOT NULL);
CREATE TABLE public.staff_module_permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, accommodation_id uuid NOT NULL, module_key text NOT NULL, permission_level public.module_permission_level NOT NULL DEFAULT 'readonly', UNIQUE (user_id, accommodation_id, module_key));
CREATE TABLE public.accommodation_info_flags (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE, has_franchise BOOLEAN DEFAULT false, has_starlink BOOLEAN DEFAULT false, updated_by UUID REFERENCES public.team_member_profiles(user_id), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(accommodation_id));
ALTER TABLE public.accommodation_info_flags ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.accommodation_packages (id uuid PRIMARY KEY, accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id), numeric_code int, name text NOT NULL, enabled boolean NOT NULL DEFAULT true, sale_price NUMERIC(10,2) NOT NULL, original_price NUMERIC(10,2), tier_prices jsonb NOT NULL DEFAULT '{}'::jsonb, applicable_tiers TEXT[] NOT NULL DEFAULT ARRAY['weekday','friday_sunday','weekend']::text[], guest_count int, room_type_ids uuid[], excluded_date_ranges jsonb NOT NULL DEFAULT '[]'::jsonb, display_order int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.pricing_templates (id uuid PRIMARY KEY, accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id), template_name text NOT NULL, numeric_code int, price integer, weekday_price integer, peak_price integer, weekend_price integer, weekday_enabled boolean NOT NULL DEFAULT true, peak_enabled boolean NOT NULL DEFAULT true, weekend_enabled boolean NOT NULL DEFAULT true, default_package_id uuid REFERENCES public.accommodation_packages(id) ON DELETE SET NULL, available_rooms integer NOT NULL DEFAULT 1, season_segments jsonb NOT NULL DEFAULT '[]'::jsonb, room_overrides jsonb NOT NULL DEFAULT '[]'::jsonb, room_type_ids uuid[], created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.package_date_prices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id uuid NOT NULL, package_id uuid NOT NULL, date date NOT NULL, sale_price numeric, original_price numeric, is_available boolean, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.room_inventory_pricing (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_type_id uuid NOT NULL, date date NOT NULL, price numeric, available_rooms int, is_available boolean, pricing_template_id uuid, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
-- user_has_role：擷取自 supabase/migrations/20260124090703_a7e1150d-7dc2-41bb-b25b-2c122091e615.sql
CREATE OR REPLACE FUNCTION public.user_has_role(
  _user_id uuid,
  _accommodation_id uuid,
  _role public.app_role
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Require authenticated caller
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- Only super_admin may query another user's roles
  IF _user_id IS DISTINCT FROM auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_roles me
      WHERE me.user_id = auth.uid()
        AND me.role = 'super_admin'::public.app_role
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND accommodation_id = _accommodation_id
        AND role = _role
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = 'super_admin'::public.app_role
    )
  );
END;
$$;
-- user_has_access_to_accommodation：擷取自 supabase/migrations/20260124090703_a7e1150d-7dc2-41bb-b25b-2c122091e615.sql
CREATE OR REPLACE FUNCTION public.user_has_access_to_accommodation(
  _user_id uuid,
  _accommodation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF _user_id IS DISTINCT FROM auth.uid() THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_roles me
      WHERE me.user_id = auth.uid()
        AND me.role = 'super_admin'::public.app_role
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND accommodation_id = _accommodation_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = 'super_admin'::public.app_role
    )
  );
END;
$$;
-- user_has_team_role：擷取自 supabase/migrations/20260815185207_cb70fea9-f801-4449-ab3d-18dd3f3b3d7a.sql
CREATE OR REPLACE FUNCTION public.user_has_team_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND accommodation_id IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'::app_role
  );
END;
$function$;
-- user_has_any_team_role：擷取自 supabase/migrations/20260805160957_f9358352-0c96-4025-921f-534bf9c5f32d.sql
CREATE OR REPLACE FUNCTION public.user_has_any_team_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND accommodation_id IS NULL
      AND role IN (
        'super_admin'::app_role,
        'admin'::app_role,
        'scout'::app_role,
        'scout_manager'::app_role,
        'closer'::app_role,
        'closer_manager'::app_role,
        'video'::app_role,
        'franchise'::app_role,
        'franchise_internal'::app_role,
        'franchise_external'::app_role,
        'franchise_manager'::app_role,
        'starlink'::app_role,
        'finance'::app_role,
        'am'::app_role,
        'owner'::app_role,
        'venue_manager'::app_role
      )
  );
$$;
-- get_staff_module_permission：擷取自 supabase/migrations/20260720084254_59a701f0-c87a-451e-aeb5-f589b0047b14.sql
CREATE OR REPLACE FUNCTION public.get_staff_module_permission(
  _user_id uuid,
  _accommodation_id uuid,
  _module_key text
)
RETURNS public.module_permission_level
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level public.module_permission_level;
  v_has_admin boolean := false;
  v_has_staff boolean := false;
BEGIN
  IF _user_id IS NULL OR _accommodation_id IS NULL OR _module_key IS NULL THEN
    RETURN 'hidden'::public.module_permission_level;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'::public.app_role
  ) OR EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND accommodation_id = _accommodation_id
      AND role IN ('hotel_admin'::public.app_role, 'super_admin'::public.app_role)
  ) INTO v_has_admin;

  IF v_has_admin THEN
    RETURN 'editable'::public.module_permission_level;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND accommodation_id = _accommodation_id
      AND role = 'staff'::public.app_role
  ) INTO v_has_staff;

  IF NOT v_has_staff THEN
    RETURN 'hidden'::public.module_permission_level;
  END IF;

  SELECT permission_level
    INTO v_level
  FROM public.staff_module_permissions
  WHERE user_id = _user_id
    AND accommodation_id = _accommodation_id
    AND module_key = _module_key;

  IF v_level IS NOT NULL THEN
    RETURN v_level;
  END IF;

  RETURN CASE _module_key
    WHEN 'orders'           THEN 'editable'
    WHEN 'kol_quota'        THEN 'hidden'
    WHEN 'reception'        THEN 'editable'
    WHEN 'room_price'       THEN 'editable'
    WHEN 'customers'        THEN 'editable'
    WHEN 'analytics'        THEN 'readonly'
    WHEN 'discount_codes'   THEN 'readonly'
    WHEN 'settlement'       THEN 'readonly'
    WHEN 'owner_settlement' THEN 'hidden'
    WHEN 'addon_center'     THEN 'editable'
    WHEN 'website_content'  THEN 'hidden'
    WHEN 'pricing'          THEN 'hidden'
    WHEN 'channel_manager'  THEN 'hidden'
    WHEN 'ai_training'      THEN 'hidden'
    WHEN 'accounts'         THEN 'hidden'
    ELSE 'hidden'
  END::public.module_permission_level;
END;
$$;
-- staff_can_edit_module：擷取自 supabase/migrations/20260430053713_5f8be74f-c12f-4ba5-b794-41da1e51f4f3.sql
CREATE OR REPLACE FUNCTION public.staff_can_edit_module(_accommodation_id uuid, _module_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR _accommodation_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.get_staff_module_permission(auth.uid(), _accommodation_id, _module_key)
         = 'editable'::public.module_permission_level;
END;
$$;
CREATE POLICY "accommodation_flags_select" ON public.accommodation_info_flags FOR SELECT USING (public.user_has_any_team_role(auth.uid()));
CREATE POLICY "accommodation_flags_write" ON public.accommodation_info_flags FOR ALL TO authenticated USING (public.user_has_team_role(auth.uid(), 'super_admin'::app_role) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));
-- 種子：雲岫（P3 anon 快照）
INSERT INTO public.accommodation_info VALUES ('7690a606-6bac-4cd5-a3e7-2fa754b318e8','雲岫海景渡假會館'),('00000000-0000-4000-8000-0000000000b1','測試館B（no_sync）'),('00000000-0000-4000-8000-0000000000c1','測試館C（package_original）');
INSERT INTO public.accommodation_packages (id,accommodation_id,numeric_code,name,enabled,sale_price,original_price,tier_prices,applicable_tiers,guest_count,room_type_ids,excluded_date_ranges,display_order) VALUES ('4478c114-63ad-4e2d-92ca-62cdcb664cf4','7690a606-6bac-4cd5-a3e7-2fa754b318e8',1001,'6人包棟',true,8500.0,15500.0,'{}'::jsonb,ARRAY['weekday']::text[],6,ARRAY['2ab16f88-9c72-443a-9d7e-91831c618274','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de','ca578b7c-4dff-49da-b487-703cb5a94c1d','1d5b12f2-7d90-43a2-8251-8d2341b5d04a','54631347-095d-45c0-a066-e5e39211668e']::uuid[],'[]'::jsonb,1);
INSERT INTO public.accommodation_packages (id,accommodation_id,numeric_code,name,enabled,sale_price,original_price,tier_prices,applicable_tiers,guest_count,room_type_ids,excluded_date_ranges,display_order) VALUES ('c4a76622-8c5a-4f8c-9d27-249f37baeb83','7690a606-6bac-4cd5-a3e7-2fa754b318e8',1002,'海景四人房',true,3600.0,6900.0,'{"weekend": {"sale": 5800, "original": 9700}, "friday_sunday": {"sale": 4000, "original": 8000}}'::jsonb,ARRAY['weekday','friday_sunday','weekend']::text[],4,ARRAY['01e27ccc-81fe-4135-aaad-fa100fcc6495']::uuid[],'[]'::jsonb,7);
INSERT INTO public.accommodation_packages (id,accommodation_id,numeric_code,name,enabled,sale_price,original_price,tier_prices,applicable_tiers,guest_count,room_type_ids,excluded_date_ranges,display_order) VALUES ('a1950bd7-9f57-4552-b236-69b872a0cfaa','7690a606-6bac-4cd5-a3e7-2fa754b318e8',1003,'8人包棟',true,11000.0,20600.0,'{"friday_sunday": {"sale": 13000, "original": 23600}}'::jsonb,ARRAY['weekday','friday_sunday']::text[],8,ARRAY['2ab16f88-9c72-443a-9d7e-91831c618274','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de','ca578b7c-4dff-49da-b487-703cb5a94c1d','1d5b12f2-7d90-43a2-8251-8d2341b5d04a','54631347-095d-45c0-a066-e5e39211668e']::uuid[],'[]'::jsonb,2);
INSERT INTO public.accommodation_packages (id,accommodation_id,numeric_code,name,enabled,sale_price,original_price,tier_prices,applicable_tiers,guest_count,room_type_ids,excluded_date_ranges,display_order) VALUES ('b2c17a5f-a9ad-4163-b21a-bcf8131a264e','7690a606-6bac-4cd5-a3e7-2fa754b318e8',1004,'10人包棟',true,14400.0,25800.0,'{"friday_sunday": {"sale": 16000, "original": 29000}}'::jsonb,ARRAY['weekday','friday_sunday']::text[],10,ARRAY['2ab16f88-9c72-443a-9d7e-91831c618274','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de','ca578b7c-4dff-49da-b487-703cb5a94c1d','1d5b12f2-7d90-43a2-8251-8d2341b5d04a','54631347-095d-45c0-a066-e5e39211668e']::uuid[],'[]'::jsonb,3);
INSERT INTO public.accommodation_packages (id,accommodation_id,numeric_code,name,enabled,sale_price,original_price,tier_prices,applicable_tiers,guest_count,room_type_ids,excluded_date_ranges,display_order) VALUES ('0681ce82-28e8-4f56-894f-9d8931c10280','7690a606-6bac-4cd5-a3e7-2fa754b318e8',1005,'12人包棟',true,17000.0,30900.0,'{"weekend": {"sale": 23000, "original": 41200}, "friday_sunday": {"sale": 19000, "original": 34300}}'::jsonb,ARRAY['weekday','friday_sunday','weekend']::text[],12,ARRAY['2ab16f88-9c72-443a-9d7e-91831c618274','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de','ca578b7c-4dff-49da-b487-703cb5a94c1d','1d5b12f2-7d90-43a2-8251-8d2341b5d04a','54631347-095d-45c0-a066-e5e39211668e']::uuid[],'[]'::jsonb,4);
INSERT INTO public.accommodation_packages (id,accommodation_id,numeric_code,name,enabled,sale_price,original_price,tier_prices,applicable_tiers,guest_count,room_type_ids,excluded_date_ranges,display_order) VALUES ('620e7294-4a5d-418c-be11-aa29a9720102','7690a606-6bac-4cd5-a3e7-2fa754b318e8',1006,'14人包棟',true,20000.0,36000.0,'{"weekend": {"sale": 26000, "original": 48000}, "friday_sunday": {"sale": 22000, "original": 40000}}'::jsonb,ARRAY['weekday','friday_sunday','weekend']::text[],14,ARRAY['2ab16f88-9c72-443a-9d7e-91831c618274','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de','ca578b7c-4dff-49da-b487-703cb5a94c1d','1d5b12f2-7d90-43a2-8251-8d2341b5d04a','54631347-095d-45c0-a066-e5e39211668e']::uuid[],'[]'::jsonb,5);
INSERT INTO public.accommodation_packages (id,accommodation_id,numeric_code,name,enabled,sale_price,original_price,tier_prices,applicable_tiers,guest_count,room_type_ids,excluded_date_ranges,display_order) VALUES ('7579717e-f664-4ef4-9b2d-90aa274c6912','7690a606-6bac-4cd5-a3e7-2fa754b318e8',1007,'16人包棟',true,23000.0,41000.0,'{"weekend": {"sale": 29000, "original": 54800}, "friday_sunday": {"sale": 25000, "original": 45000}}'::jsonb,ARRAY['weekday','friday_sunday','weekend']::text[],16,ARRAY['54631347-095d-45c0-a066-e5e39211668e']::uuid[],'[]'::jsonb,6);
INSERT INTO public.pricing_templates (id,accommodation_id,template_name,numeric_code,price,weekday_price,peak_price,weekend_price,weekday_enabled,peak_enabled,weekend_enabled,default_package_id,available_rooms,season_segments,room_overrides,room_type_ids) VALUES ('7577b6f2-dc13-401d-8811-fb1f009e3e89','7690a606-6bac-4cd5-a3e7-2fa754b318e8','10人包棟',1030,25800,25800,NULL,NULL,true,false,false,'b2c17a5f-a9ad-4163-b21a-bcf8131a264e',1,'[]'::jsonb,'[]'::jsonb,ARRAY['2ab16f88-9c72-443a-9d7e-91831c618274','54631347-095d-45c0-a066-e5e39211668e','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de','ca578b7c-4dff-49da-b487-703cb5a94c1d','1d5b12f2-7d90-43a2-8251-8d2341b5d04a']::uuid[]);
INSERT INTO public.pricing_templates (id,accommodation_id,template_name,numeric_code,price,weekday_price,peak_price,weekend_price,weekday_enabled,peak_enabled,weekend_enabled,default_package_id,available_rooms,season_segments,room_overrides,room_type_ids) VALUES ('64343ffa-709b-46ed-a639-5937a566fae4','7690a606-6bac-4cd5-a3e7-2fa754b318e8','12人包棟',1031,30900,30900,34300,41200,true,true,true,'0681ce82-28e8-4f56-894f-9d8931c10280',1,'[]'::jsonb,'[]'::jsonb,ARRAY['2ab16f88-9c72-443a-9d7e-91831c618274','54631347-095d-45c0-a066-e5e39211668e','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de','ca578b7c-4dff-49da-b487-703cb5a94c1d','1d5b12f2-7d90-43a2-8251-8d2341b5d04a']::uuid[]);
INSERT INTO public.pricing_templates (id,accommodation_id,template_name,numeric_code,price,weekday_price,peak_price,weekend_price,weekday_enabled,peak_enabled,weekend_enabled,default_package_id,available_rooms,season_segments,room_overrides,room_type_ids) VALUES ('2945cc9e-a26b-407b-8772-cf79bfd79d62','7690a606-6bac-4cd5-a3e7-2fa754b318e8','14人包棟',1025,36000,36000,40000,48000,true,true,true,'620e7294-4a5d-418c-be11-aa29a9720102',1,'[]'::jsonb,'[]'::jsonb,ARRAY['54631347-095d-45c0-a066-e5e39211668e','2ab16f88-9c72-443a-9d7e-91831c618274','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de','ca578b7c-4dff-49da-b487-703cb5a94c1d','1d5b12f2-7d90-43a2-8251-8d2341b5d04a']::uuid[]);
INSERT INTO public.pricing_templates (id,accommodation_id,template_name,numeric_code,price,weekday_price,peak_price,weekend_price,weekday_enabled,peak_enabled,weekend_enabled,default_package_id,available_rooms,season_segments,room_overrides,room_type_ids) VALUES ('7c457061-aca5-48f2-bdcc-eff29f1e6422','7690a606-6bac-4cd5-a3e7-2fa754b318e8','16人包棟',1027,39000,39000,45000,54800,true,true,true,'7579717e-f664-4ef4-9b2d-90aa274c6912',1,'[]'::jsonb,'[]'::jsonb,ARRAY['2ab16f88-9c72-443a-9d7e-91831c618274','54631347-095d-45c0-a066-e5e39211668e','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de','ca578b7c-4dff-49da-b487-703cb5a94c1d','1d5b12f2-7d90-43a2-8251-8d2341b5d04a']::uuid[]);
INSERT INTO public.pricing_templates (id,accommodation_id,template_name,numeric_code,price,weekday_price,peak_price,weekend_price,weekday_enabled,peak_enabled,weekend_enabled,default_package_id,available_rooms,season_segments,room_overrides,room_type_ids) VALUES ('02f134fc-4a12-4b4f-a87e-44f13a7e3aa1','7690a606-6bac-4cd5-a3e7-2fa754b318e8','6人包棟',1028,15500,15500,NULL,NULL,true,false,false,'4478c114-63ad-4e2d-92ca-62cdcb664cf4',1,'[]'::jsonb,'[]'::jsonb,ARRAY['2ab16f88-9c72-443a-9d7e-91831c618274','54631347-095d-45c0-a066-e5e39211668e','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de','ca578b7c-4dff-49da-b487-703cb5a94c1d','1d5b12f2-7d90-43a2-8251-8d2341b5d04a']::uuid[]);
INSERT INTO public.pricing_templates (id,accommodation_id,template_name,numeric_code,price,weekday_price,peak_price,weekend_price,weekday_enabled,peak_enabled,weekend_enabled,default_package_id,available_rooms,season_segments,room_overrides,room_type_ids) VALUES ('326fc21c-982c-4511-aacb-21cc6f2d9712','7690a606-6bac-4cd5-a3e7-2fa754b318e8','8人包棟',1029,20600,20600,NULL,NULL,true,false,false,'a1950bd7-9f57-4552-b236-69b872a0cfaa',1,'[]'::jsonb,'[]'::jsonb,ARRAY['2ab16f88-9c72-443a-9d7e-91831c618274','54631347-095d-45c0-a066-e5e39211668e','a6d49a3a-0b48-4465-ba0c-d643b4f6700a','c65366d3-c1d6-4a93-b5c8-34a15c3ea8de','ca578b7c-4dff-49da-b487-703cb5a94c1d','1d5b12f2-7d90-43a2-8251-8d2341b5d04a']::uuid[]);
INSERT INTO public.pricing_templates (id,accommodation_id,template_name,numeric_code,price,weekday_price,peak_price,weekend_price,weekday_enabled,peak_enabled,weekend_enabled,default_package_id,available_rooms,season_segments,room_overrides,room_type_ids) VALUES ('c8b86fa2-9dcc-4f02-9760-c0b85ab3b172','7690a606-6bac-4cd5-a3e7-2fa754b318e8','海景四人房',1032,6900,6900,8000,9700,true,true,true,'c4a76622-8c5a-4f8c-9d27-249f37baeb83',7,'[]'::jsonb,'[]'::jsonb,ARRAY['01e27ccc-81fe-4135-aaad-fa100fcc6495']::uuid[]);
INSERT INTO public.package_date_prices (id,accommodation_id,package_id,date,sale_price,original_price,is_available) VALUES ('122d4a1b-c2f1-4d23-99c4-258e771b0608','7690a606-6bac-4cd5-a3e7-2fa754b318e8','0681ce82-28e8-4f56-894f-9d8931c10280','2026-12-31',41200.0,NULL,NULL);
INSERT INTO public.package_date_prices (id,accommodation_id,package_id,date,sale_price,original_price,is_available) VALUES ('495c9abd-e1af-4d55-99c0-8e5db8c96545','7690a606-6bac-4cd5-a3e7-2fa754b318e8','620e7294-4a5d-418c-be11-aa29a9720102','2026-12-31',48000.0,NULL,NULL);
INSERT INTO public.package_date_prices (id,accommodation_id,package_id,date,sale_price,original_price,is_available) VALUES ('d98ea74e-d34d-49a4-a8ac-e83d891c2ddc','7690a606-6bac-4cd5-a3e7-2fa754b318e8','7579717e-f664-4ef4-9b2d-90aa274c6912','2026-12-31',54800.0,NULL,NULL);
INSERT INTO public.package_date_prices (id,accommodation_id,package_id,date,sale_price,original_price,is_available) VALUES ('3b898c35-ec26-444b-bdcb-4632d1f3bb61','7690a606-6bac-4cd5-a3e7-2fa754b318e8','c4a76622-8c5a-4f8c-9d27-249f37baeb83','2026-12-31',9700.0,NULL,NULL);
-- 種子：測試館 B（no_sync，flags 列存在但 new_price_ui_enabled=true 由測試設定）與 C（package_original，一方案對應兩專案）
INSERT INTO public.accommodation_packages (id,accommodation_id,numeric_code,name,enabled,sale_price,original_price,tier_prices,applicable_tiers,guest_count) VALUES ('00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000b1',2001,'B方案',true,5000,8000,'{}'::jsonb,ARRAY['weekday'],2), ('00000000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-0000000000c1',3001,'C方案',false,6000,9000,'{}'::jsonb,ARRAY['weekday'],4);
INSERT INTO public.pricing_templates (id,accommodation_id,template_name,numeric_code,price,weekday_price,default_package_id) VALUES ('00000000-0000-4000-8000-0000000000b3','00000000-0000-4000-8000-0000000000b1','B專案',201,8000,8000,'00000000-0000-4000-8000-0000000000b2'), ('00000000-0000-4000-8000-0000000000c3','00000000-0000-4000-8000-0000000000c1','C專案1',301,9000,9000,'00000000-0000-4000-8000-0000000000c2'), ('00000000-0000-4000-8000-0000000000c4','00000000-0000-4000-8000-0000000000c1','C專案2',302,9000,9000,'00000000-0000-4000-8000-0000000000c2'), ('00000000-0000-4000-8000-0000000000c5','00000000-0000-4000-8000-0000000000c1','C無關專案',303,7777,7777,NULL);
INSERT INTO public.room_inventory_pricing (room_type_id,date,price,available_rooms,is_available) SELECT '54631347-095d-45c0-a066-e5e39211668e', d::date, 41000, 1, true FROM generate_series('2026-10-14'::date,'2027-01-11'::date,'1 day') d;
INSERT INTO public.accommodation_info_flags (accommodation_id, has_franchise) VALUES ('00000000-0000-4000-8000-0000000000b1', true);
-- 使用者：U_SUPER(super_admin)、U_HA(雲岫 hotel_admin)、U_STAFF_RO(雲岫 staff room_price=readonly)、U_OTHER(測試館B hotel_admin)
INSERT INTO public.user_roles (user_id, accommodation_id, role) VALUES ('11111111-1111-4111-8111-111111111111', NULL, 'super_admin'), ('22222222-2222-4222-8222-222222222222', '7690a606-6bac-4cd5-a3e7-2fa754b318e8', 'hotel_admin'), ('33333333-3333-4333-8333-333333333333', '7690a606-6bac-4cd5-a3e7-2fa754b318e8', 'staff'), ('44444444-4444-4444-8444-444444444444', '00000000-0000-4000-8000-0000000000b1', 'hotel_admin');
INSERT INTO public.staff_module_permissions (user_id, accommodation_id, module_key, permission_level) VALUES ('33333333-3333-4333-8333-333333333333','7690a606-6bac-4cd5-a3e7-2fa754b318e8','room_price','readonly');
