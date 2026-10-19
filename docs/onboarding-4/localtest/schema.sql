-- 最小 schema：只含上架精靈函式用到的資料表與函式（欄位依正式庫型別）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated, anon;
CREATE TYPE public.app_role AS ENUM ('super_admin','hotel_admin','staff','admin');
CREATE TABLE public.accommodation_info (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, address text, phone text,
  short_url_alias text, description text, is_active boolean NOT NULL DEFAULT false, first_activated_at timestamptz);
CREATE TABLE public.accommodation_info_flags (accommodation_id uuid PRIMARY KEY, new_price_ui_enabled boolean DEFAULT false,
  auto_template_enabled boolean DEFAULT false, price_sync_mode text);
CREATE TABLE public.accommodation_onboarding_steps (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id uuid NOT NULL, step_key text NOT NULL,
  status text, submitted_at timestamptz, submitted_by uuid, returned_at timestamptz, returned_by uuid, return_reason text,
  updated_at timestamptz DEFAULT now(), UNIQUE (accommodation_id, step_key));
CREATE TABLE public.user_roles (user_id uuid NOT NULL, accommodation_id uuid, role app_role NOT NULL);
CREATE TABLE public.room_types (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id uuid, name text, capacity integer,
  base_price integer, room_count integer, display_order integer, owlting_sync_active boolean DEFAULT true, updated_at timestamptz);
CREATE TABLE public.accommodation_packages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id uuid, name text, enabled boolean DEFAULT true,
  tier_prices jsonb, primary_room_type_id uuid, guest_count integer, display_order integer);
CREATE TABLE public.pricing_templates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id uuid, template_name text, room_type_id uuid, default_package_id uuid);
CREATE TABLE public.room_inventory_pricing (room_type_id uuid, date date, price integer, available_rooms integer, is_available boolean, pricing_template_id uuid);
CREATE TABLE public.package_date_prices (package_id uuid, date date, sale_price numeric, original_price numeric, is_available boolean);
CREATE TABLE public.accommodation_owlting_config (accommodation_id uuid, sync_enabled boolean);
CREATE TABLE public.accommodation_hotelnabe_config (accommodation_id uuid, sync_enabled boolean);
CREATE TABLE public.owlting_room_type_groups (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id uuid);
CREATE TABLE public.owlting_room_type_group_members (group_id uuid, room_type_id uuid, rate_plan_template_id uuid);
CREATE FUNCTION public.is_super_admin(user_uuid uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = user_uuid AND role = 'super_admin') $$;
CREATE FUNCTION public.is_hotel_admin_of(_acc uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND accommodation_id = _acc AND role = 'hotel_admin') $$;
CREATE FUNCTION public.packages_auto_template_on_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
-- 090000 版本的開賣守門（120002 會取代）
CREATE FUNCTION public.accommodation_info_guard_is_active() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) AND NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'only_super_admin_can_change_is_active' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_accommodation_info_guard_is_active BEFORE INSERT OR UPDATE ON public.accommodation_info
  FOR EACH ROW EXECUTE FUNCTION public.accommodation_info_guard_is_active();
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
