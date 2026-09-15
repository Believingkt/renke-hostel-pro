ALTER TABLE public.kol_profiles ADD COLUMN IF NOT EXISTS contract_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_kol_profiles_contract_group_id
  ON public.kol_profiles (contract_group_id) WHERE contract_group_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.kol_profiles_assign_contract_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff date := date '2026-08-01';
  v_period date;
  v_cid text;
  v_existing uuid;
BEGIN
  IF NEW.contract_group_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_period := COALESCE(NEW.kpi_month, NEW.check_in_date);
  IF v_period IS NULL OR v_period < v_cutoff THEN
    RETURN NEW;
  END IF;

  v_cid := upper(btrim(COALESCE(NEW.cid_code, '')));
  IF v_cid <> '' THEN
    SELECT p.contract_group_id INTO v_existing
    FROM public.kol_profiles p
    WHERE p.id <> NEW.id
      AND p.contract_group_id IS NOT NULL
      AND COALESCE(p.is_error, false) = false
      AND upper(btrim(COALESCE(p.cid_code, ''))) = v_cid
      AND COALESCE(p.kpi_month, p.check_in_date) = v_period
      AND COALESCE(p.venue_id, p.accommodation_id) IS NOT DISTINCT FROM COALESCE(NEW.venue_id, NEW.accommodation_id)
    ORDER BY p.created_at
    LIMIT 1;
  END IF;

  NEW.contract_group_id := COALESCE(v_existing, gen_random_uuid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kol_profiles_assign_contract_group ON public.kol_profiles;
CREATE TRIGGER trg_kol_profiles_assign_contract_group
BEFORE INSERT OR UPDATE OF cid_code, kpi_month, check_in_date, venue_id, accommodation_id, contract_group_id
ON public.kol_profiles
FOR EACH ROW
EXECUTE FUNCTION public.kol_profiles_assign_contract_group();

-- 回填：僅 2026-08-01 起的合作月份（暫停既有驗證觸發器，避免歷史資料阻擋回填）
ALTER TABLE public.kol_profiles DISABLE TRIGGER trg_kol_profiles_normalize;
ALTER TABLE public.kol_profiles DISABLE TRIGGER trg_kol_profiles_assign_contract_group;

WITH target AS (
  SELECT id,
         upper(btrim(COALESCE(cid_code, ''))) AS cid,
         COALESCE(kpi_month, check_in_date) AS period,
         COALESCE(venue_id, accommodation_id) AS place
  FROM public.kol_profiles
  WHERE contract_group_id IS NULL
    AND COALESCE(kpi_month, check_in_date) >= date '2026-08-01'
), keys AS (
  SELECT cid, period, place, gen_random_uuid() AS gid
  FROM target
  WHERE cid <> ''
  GROUP BY cid, period, place
)
UPDATE public.kol_profiles k
SET contract_group_id = COALESCE(ky.gid, gen_random_uuid())
FROM target t
LEFT JOIN keys ky
  ON ky.cid = t.cid AND ky.period = t.period AND ky.place IS NOT DISTINCT FROM t.place
WHERE k.id = t.id;

ALTER TABLE public.kol_profiles ENABLE TRIGGER trg_kol_profiles_normalize;
ALTER TABLE public.kol_profiles ENABLE TRIGGER trg_kol_profiles_assign_contract_group;