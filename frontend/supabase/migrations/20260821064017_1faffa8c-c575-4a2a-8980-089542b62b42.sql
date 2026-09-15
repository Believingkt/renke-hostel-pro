-- 1) 清理既有違規資料
UPDATE public.kol_profiles
SET companion_cid = NULL
WHERE companion_cid IS NOT NULL
  AND cid_code IS NOT NULL
  AND upper(trim(companion_cid)) = upper(trim(cid_code));

UPDATE public.kol_profiles
SET companion_cid = upper(trim(companion_cid))
WHERE companion_cid IS NOT NULL AND companion_cid <> upper(trim(companion_cid));

UPDATE public.kol_profiles
SET kpi_qualified = false, inventory_count = 0
WHERE companion_cid IS NOT NULL AND companion_cid <> ''
  AND (kpi_qualified IS TRUE OR coalesce(inventory_count, 0) <> 0);

-- 2) 同住夥伴 / 館別一致性 trigger
CREATE OR REPLACE FUNCTION public.kol_profiles_normalize_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_acc uuid;
BEGIN
  -- companion_cid 正規化
  IF NEW.companion_cid IS NOT NULL THEN
    NEW.companion_cid := nullif(upper(trim(NEW.companion_cid)), '');
  END IF;

  -- 不可指向自己
  IF NEW.companion_cid IS NOT NULL
     AND NEW.cid_code IS NOT NULL
     AND NEW.companion_cid = upper(trim(NEW.cid_code)) THEN
    RAISE EXCEPTION '同住夥伴不可設為自己的折扣碼 (%)', NEW.companion_cid;
  END IF;

  -- 同行者不獨立計分潤 / KPI / 庫存
  IF NEW.companion_cid IS NOT NULL THEN
    NEW.kpi_qualified := false;
    NEW.inventory_count := 0;
  END IF;

  -- 館別一致性：以 venue 的母館為準
  IF NEW.venue_id IS NOT NULL THEN
    SELECT accommodation_id INTO v_parent_acc FROM public.kol_venues WHERE id = NEW.venue_id;
    IF v_parent_acc IS NOT NULL AND NEW.accommodation_id IS DISTINCT FROM v_parent_acc THEN
      NEW.accommodation_id := v_parent_acc;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kol_profiles_normalize ON public.kol_profiles;
CREATE TRIGGER trg_kol_profiles_normalize
BEFORE INSERT OR UPDATE ON public.kol_profiles
FOR EACH ROW EXECUTE FUNCTION public.kol_profiles_normalize_before_write();

-- 3) 折扣碼唯一索引（碼 + 館別）
CREATE UNIQUE INDEX IF NOT EXISTS discount_codes_code_acc_uidx
  ON public.discount_codes (upper(trim(code)), accommodation_id);

CREATE UNIQUE INDEX IF NOT EXISTS scout_discount_codes_code_acc_uidx
  ON public.scout_discount_codes (upper(trim(discount_code)), accommodation_id);

-- 4) 衝突檢查函式
CREATE OR REPLACE FUNCTION public.check_discount_code_conflict(
  _code text,
  _accommodation_id uuid DEFAULT NULL,
  _exclude_profile_id uuid DEFAULT NULL
)
RETURNS TABLE (
  source text,
  severity text,
  code text,
  accommodation_id uuid,
  accommodation_name text,
  owner_name text,
  detail jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n text := upper(trim(coalesce(_code, '')));
BEGIN
  IF n = '' THEN RETURN; END IF;

  -- PMS 折扣碼
  RETURN QUERY
  SELECT 'discount_codes'::text,
         CASE WHEN _accommodation_id IS NOT NULL AND dc.accommodation_id = _accommodation_id
              THEN 'info' ELSE 'warning' END,
         dc.code,
         dc.accommodation_id,
         ai.name,
         dc.name,
         jsonb_build_object('is_active', dc.is_active, 'commission_rate', dc.commission_rate)
  FROM public.discount_codes dc
  LEFT JOIN public.accommodation_info ai ON ai.id = dc.accommodation_id
  WHERE upper(trim(dc.code)) = n;

  -- 星探專屬碼
  RETURN QUERY
  SELECT 'scout_discount_codes'::text,
         'block'::text,
         sdc.discount_code,
         sdc.accommodation_id,
         ai.name,
         p.full_name,
         jsonb_build_object('is_active', sdc.is_active, 'commission_type', sdc.commission_type)
  FROM public.scout_discount_codes sdc
  LEFT JOIN public.accommodation_info ai ON ai.id = sdc.accommodation_id
  LEFT JOIN public.profiles p ON p.id = sdc.scout_id
  WHERE upper(trim(sdc.discount_code)) = n;

  -- KOL 檔案（同碼異名 / 大小寫變體）
  RETURN QUERY
  SELECT 'kol_profiles'::text,
         CASE WHEN upper(trim(k.cid_code)) = n AND k.cid_code <> _code THEN 'warning'
              WHEN _accommodation_id IS NOT NULL AND k.accommodation_id = _accommodation_id THEN 'block'
              ELSE 'warning' END,
         k.cid_code,
         k.accommodation_id,
         ai.name,
         k.name,
         jsonb_build_object(
           'profile_id', k.id,
           'check_in_date', k.check_in_date,
           'companion_cid', k.companion_cid,
           'ig_handle', k.ig_handle
         )
  FROM public.kol_profiles k
  LEFT JOIN public.accommodation_info ai ON ai.id = k.accommodation_id
  WHERE upper(trim(coalesce(k.cid_code, ''))) = n
    AND (_exclude_profile_id IS NULL OR k.id <> _exclude_profile_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_discount_code_conflict(text, uuid, uuid) TO authenticated;