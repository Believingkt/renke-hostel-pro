-- 1. staging 加 accommodation_id
ALTER TABLE public.owlting_email_parsed_staging
  ADD COLUMN IF NOT EXISTS accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_owlting_staging_accommodation
  ON public.owlting_email_parsed_staging (accommodation_id);

-- 2. tokens 加 accommodation_id
ALTER TABLE public.owlting_fillup_tokens
  ADD COLUMN IF NOT EXISTS accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE SET NULL;

-- 3. trigger 嘗試從 accommodation_name 對應到 accommodation_info
CREATE OR REPLACE FUNCTION public.resolve_owlting_staging_accommodation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text;
BEGIN
  IF NEW.accommodation_id IS NOT NULL OR NEW.accommodation_name IS NULL THEN
    RETURN NEW;
  END IF;

  v_name := lower(trim(NEW.accommodation_name));

  -- 1) exact name match
  SELECT id INTO v_id FROM public.accommodation_info
   WHERE lower(name) = v_name LIMIT 1;

  -- 2) short_url_alias contains / matches
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.accommodation_info
     WHERE lower(short_url_alias) = v_name
        OR lower(name) ILIKE '%' || v_name || '%'
        OR v_name ILIKE '%' || lower(name) || '%'
     LIMIT 1;
  END IF;

  NEW.accommodation_id := v_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_owlting_staging_resolve_acc ON public.owlting_email_parsed_staging;
CREATE TRIGGER trg_owlting_staging_resolve_acc
  BEFORE INSERT ON public.owlting_email_parsed_staging
  FOR EACH ROW EXECUTE FUNCTION public.resolve_owlting_staging_accommodation();

-- 4. backfill 既有資料
UPDATE public.owlting_email_parsed_staging s
SET accommodation_id = a.id
FROM public.accommodation_info a
WHERE s.accommodation_id IS NULL
  AND s.accommodation_name IS NOT NULL
  AND (
    lower(trim(s.accommodation_name)) = lower(a.name)
    OR lower(trim(s.accommodation_name)) = lower(COALESCE(a.short_url_alias, ''))
  );