-- 1) Add owlting_aliases column
ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS owlting_aliases TEXT[] NOT NULL DEFAULT '{}'::text[];

-- 2) Normalization helper (trim, lower, equate 渡假/度假, normalize full-width)
CREATE OR REPLACE FUNCTION public.normalize_owlting_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_name IS NULL THEN NULL
    ELSE
      -- collapse all whitespace, lowercase, equate variant chars
      regexp_replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  lower(trim(p_name)),
                  '渡假', '度假'
                ),
                '　', ''   -- full-width space
              ),
              '（', '('
            ),
            '）', ')'
          ),
          ' ', ''
        ),
        '\s+', '', 'g'
      )
  END;
$$;

-- 3) Upgrade resolver trigger function
CREATE OR REPLACE FUNCTION public.resolve_owlting_staging_accommodation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_target text;
BEGIN
  IF NEW.accommodation_id IS NOT NULL OR NEW.accommodation_name IS NULL THEN
    RETURN NEW;
  END IF;

  v_target := public.normalize_owlting_name(NEW.accommodation_name);
  IF v_target IS NULL OR v_target = '' THEN
    RETURN NEW;
  END IF;

  -- 1) exact match on normalized name OR any alias
  SELECT a.id INTO v_id
  FROM public.accommodation_info a
  WHERE public.normalize_owlting_name(a.name) = v_target
     OR EXISTS (
       SELECT 1 FROM unnest(COALESCE(a.owlting_aliases, '{}'::text[])) AS al
       WHERE public.normalize_owlting_name(al) = v_target
     )
  LIMIT 1;

  -- 2) bidirectional contains on name OR any alias
  IF v_id IS NULL THEN
    SELECT a.id INTO v_id
    FROM public.accommodation_info a
    WHERE public.normalize_owlting_name(a.name) LIKE '%' || v_target || '%'
       OR v_target LIKE '%' || public.normalize_owlting_name(a.name) || '%'
       OR EXISTS (
         SELECT 1 FROM unnest(COALESCE(a.owlting_aliases, '{}'::text[])) AS al
         WHERE public.normalize_owlting_name(al) LIKE '%' || v_target || '%'
            OR v_target LIKE '%' || public.normalize_owlting_name(al) || '%'
       )
    LIMIT 1;
  END IF;

  NEW.accommodation_id := v_id;
  RETURN NEW;
END;
$$;