-- 本機最小 schema（只含本 migration 會碰到的表／FK／既有觸發器；FK 行為依 repo migration）
DO $r$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $r$;
CREATE TABLE public.accommodation_info (id uuid PRIMARY KEY, name text);
CREATE TABLE public.accommodation_info_flags (accommodation_id uuid PRIMARY KEY, auto_template_enabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.room_types (id uuid PRIMARY KEY, accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE CASCADE, name text NOT NULL);
CREATE TABLE public.room_photos (id serial PRIMARY KEY, room_type_id uuid REFERENCES public.room_types(id) ON DELETE CASCADE);
CREATE TABLE public.pricing_templates (
  id uuid PRIMARY KEY, accommodation_id uuid NOT NULL, template_name text NOT NULL,
  room_type_id uuid REFERENCES public.room_types(id) ON DELETE SET NULL,
  room_type_ids uuid[] NOT NULL DEFAULT '{}'::uuid[], default_package_id uuid, updated_at timestamptz DEFAULT now());
CREATE TABLE public.accommodation_packages (
  id uuid PRIMARY KEY, accommodation_id uuid NOT NULL, name text NOT NULL,
  primary_room_type_id uuid REFERENCES public.room_types(id) ON DELETE SET NULL,
  room_type_ids uuid[], enabled boolean DEFAULT true);

-- 既有：方案主房型改變 → 同步自動專案（20261018090001）
CREATE FUNCTION public.packages_auto_template_on_primary_room() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.accommodation_info_flags f WHERE f.accommodation_id = NEW.accommodation_id AND f.auto_template_enabled) THEN RETURN NULL; END IF;
  UPDATE public.pricing_templates t
  SET room_type_id = NEW.primary_room_type_id,
      room_type_ids = CASE WHEN NEW.primary_room_type_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[NEW.primary_room_type_id] END,
      updated_at = now()
  WHERE t.default_package_id = NEW.id AND t.accommodation_id = NEW.accommodation_id
    AND (t.room_type_id IS NULL OR t.room_type_id = OLD.primary_room_type_id);
  RETURN NULL;
END $$;
CREATE TRIGGER trg_packages_auto_template_room AFTER UPDATE OF primary_room_type_id ON public.accommodation_packages
  FOR EACH ROW WHEN (OLD.primary_room_type_id IS DISTINCT FROM NEW.primary_room_type_id)
  EXECUTE FUNCTION public.packages_auto_template_on_primary_room();
