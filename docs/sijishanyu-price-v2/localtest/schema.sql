-- 本機最小 schema（欄位依 types.ts＋相關 migration；只含本 migration 會碰到的觸發器）
DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $r$;
CREATE TABLE public.accommodation_info (id uuid PRIMARY KEY, name text);
CREATE TABLE public.accommodation_info_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id uuid NOT NULL UNIQUE REFERENCES public.accommodation_info(id),
  has_franchise boolean DEFAULT false, has_starlink boolean DEFAULT false, updated_by uuid, updated_at timestamptz DEFAULT now(),
  new_price_ui_enabled boolean NOT NULL DEFAULT false, new_order_dialog_enabled boolean NOT NULL DEFAULT false,
  price_sync_mode text NOT NULL DEFAULT 'no_sync' CHECK (price_sync_mode IN ('package_original', 'template_backfill', 'no_sync')),
  auto_template_enabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.room_types (id uuid PRIMARY KEY, accommodation_id uuid, name text, base_price numeric DEFAULT 0, numeric_code int);
CREATE TABLE public.accommodation_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id uuid NOT NULL, applicable_tiers text[] NOT NULL DEFAULT ARRAY['weekday','friday_sunday','weekend'],
  child_age_note text, child_age_rules_override jsonb, child_count_max int, created_at timestamptz NOT NULL DEFAULT now(), display_order int NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true, excluded_date_ranges jsonb NOT NULL DEFAULT '[]', guest_count int NOT NULL DEFAULT 2, guest_count_label text,
  guest_count_max int, included_guest_count int NOT NULL DEFAULT 2, includes jsonb NOT NULL DEFAULT '[]', name text NOT NULL, numeric_code int,
  original_price numeric, primary_room_type_id uuid REFERENCES public.room_types(id) ON DELETE SET NULL, room_allocation text,
  room_type_allocation jsonb NOT NULL DEFAULT '[]', room_type_ids uuid[], sale_price numeric NOT NULL DEFAULT 0, subtitle text,
  tags text[] NOT NULL DEFAULT '{}', tier_prices jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.pricing_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id uuid NOT NULL, available_rooms int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
  default_package_id uuid REFERENCES public.accommodation_packages(id) ON DELETE SET NULL, description text, display_order int, excluded_dates jsonb NOT NULL DEFAULT '[]',
  extra_dates jsonb NOT NULL DEFAULT '[]', is_default boolean, meal_plans jsonb, numeric_code int, peak_enabled boolean NOT NULL DEFAULT false, peak_price int,
  price int, project_description text, project_name text, room_overrides jsonb NOT NULL DEFAULT '[]', room_type_id uuid, room_type_ids uuid[] NOT NULL DEFAULT '{}',
  season_segments jsonb NOT NULL DEFAULT '[]', template_name text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), valid_from date, valid_until date,
  weekday_enabled boolean NOT NULL DEFAULT true, weekday_price int, weekend_enabled boolean NOT NULL DEFAULT true, weekend_price int);
CREATE TABLE public.discount_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id uuid, code text, is_active boolean, discount_type text, discount_value int, valid_from timestamptz DEFAULT now(), valid_until timestamptz, applicable_pricing_template_ids jsonb DEFAULT '[]', updated_at timestamptz DEFAULT now());
CREATE TABLE public.orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_number text, accommodation_id uuid, order_source text, final_price numeric, pricing_template_id uuid, package_id uuid, check_in_date date, order_status text, updated_at timestamptz DEFAULT now());
CREATE TABLE public.package_date_prices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id uuid, package_id uuid REFERENCES public.accommodation_packages(id) ON DELETE CASCADE, date date, sale_price numeric, original_price numeric, is_available boolean, source text NOT NULL DEFAULT 'manual', updated_at timestamptz DEFAULT now());
CREATE TABLE public.accommodation_owlting_config (accommodation_id uuid PRIMARY KEY, sync_enabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.accommodation_hotelnabe_config (accommodation_id uuid PRIMARY KEY, sync_enabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.accommodation_day_tier_overrides (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), accommodation_id uuid, package_id uuid, date date, tier text);

-- 既有觸發器（簡化版，行為重點相同）
CREATE FUNCTION public.assign_pkg_code() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.numeric_code IS NULL THEN SELECT COALESCE(max(numeric_code), 1000) + 1 INTO NEW.numeric_code FROM public.accommodation_packages WHERE accommodation_id = NEW.accommodation_id; END IF; RETURN NEW; END $$;
CREATE TRIGGER trg_packages_assign_numeric_code BEFORE INSERT ON public.accommodation_packages FOR EACH ROW EXECUTE FUNCTION public.assign_pkg_code();
CREATE FUNCTION public.assign_tpl_code() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.numeric_code IS NULL THEN SELECT COALESCE(max(numeric_code), 1100) + 1 INTO NEW.numeric_code FROM public.pricing_templates WHERE accommodation_id = NEW.accommodation_id; END IF; RETURN NEW; END $$;
CREATE TRIGGER trg_assign_pricing_template_numeric_code BEFORE INSERT ON public.pricing_templates FOR EACH ROW EXECUTE FUNCTION public.assign_tpl_code();
CREATE FUNCTION public.pkg_auto_tpl() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.accommodation_info_flags f WHERE f.accommodation_id = NEW.accommodation_id AND f.auto_template_enabled) THEN
    INSERT INTO public.pricing_templates (accommodation_id, template_name, default_package_id) VALUES (NEW.accommodation_id, NEW.name, NEW.id);
  END IF; RETURN NULL; END $$;
CREATE TRIGGER trg_packages_auto_template_ins AFTER INSERT ON public.accommodation_packages FOR EACH ROW EXECUTE FUNCTION public.pkg_auto_tpl();
CREATE FUNCTION public.pkg_price_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  INSERT INTO public.package_date_prices (accommodation_id, package_id, date, sale_price, source)
  SELECT NEW.accommodation_id, NEW.id, o.date, NEW.sale_price, 'day_tier' FROM public.accommodation_day_tier_overrides o
  WHERE o.accommodation_id = NEW.accommodation_id AND (o.package_id = NEW.id OR o.package_id IS NULL) AND o.date >= CURRENT_DATE; RETURN NULL; END $$;
CREATE TRIGGER trg_pricing_v2_package_price_change AFTER UPDATE OF tier_prices, original_price ON public.accommodation_packages FOR EACH ROW
  WHEN (OLD.tier_prices IS DISTINCT FROM NEW.tier_prices OR OLD.original_price IS DISTINCT FROM NEW.original_price) EXECUTE FUNCTION public.pkg_price_change();
CREATE FUNCTION public.tpl_del_sync() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  UPDATE public.discount_codes d SET applicable_pricing_template_ids = COALESCE((SELECT jsonb_agg(e) FROM jsonb_array_elements(d.applicable_pricing_template_ids) e WHERE e #>> '{}' <> OLD.id::text), '[]')
  WHERE d.applicable_pricing_template_ids @> to_jsonb(OLD.id::text); RETURN OLD; END $$;
CREATE TRIGGER trg_sync_discount_codes_on_template_delete BEFORE DELETE ON public.pricing_templates FOR EACH ROW EXECUTE FUNCTION public.tpl_del_sync();
