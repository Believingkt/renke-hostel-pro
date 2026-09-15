ALTER TABLE public.kol_profiles
ADD COLUMN IF NOT EXISTS primary_link_exception boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.kol_profiles.primary_link_exception IS
  '同館主檔與附屬入住日相差超過 31 天時，需由使用者明確確認的特例附屬標記';

-- 還原 2026-08-26 前一版一次性清理拆開的 10 筆跨館關係：
-- 每個受影響的跨館合約群組，以最早建立的一筆還原為主檔，其餘還原為附屬。
ALTER TABLE public.kol_profiles DISABLE TRIGGER trg_kol_profiles_normalize;

WITH affected_groups AS (
  SELECT contract_group_id
  FROM public.kol_profiles
  WHERE contract_group_id IS NOT NULL
    AND primary_profile_id IS NULL
  GROUP BY contract_group_id
  HAVING count(*) > 1
     AND count(DISTINCT accommodation_id) > 1
), ranked AS (
  SELECT k.id,
         k.contract_group_id,
         first_value(k.id) OVER (
           PARTITION BY k.contract_group_id
           ORDER BY k.created_at, k.id
         ) AS parent_id,
         row_number() OVER (
           PARTITION BY k.contract_group_id
           ORDER BY k.created_at, k.id
         ) AS rn
  FROM public.kol_profiles k
  JOIN affected_groups g ON g.contract_group_id = k.contract_group_id
)
UPDATE public.kol_profiles child
SET primary_profile_id = ranked.parent_id,
    kpi_qualified = false,
    inventory_count = 0
FROM ranked
WHERE child.id = ranked.id
  AND ranked.rn > 1;

ALTER TABLE public.kol_profiles ENABLE TRIGGER trg_kol_profiles_normalize;

CREATE OR REPLACE FUNCTION public.kol_profiles_normalize_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent_acc uuid;
  v_parent RECORD;
  v_is_insert boolean := (TG_OP = 'INSERT');
  v_raw_name text;
  v_diff int;
  v_legacy_cross_accommodation boolean := false;
BEGIN
  v_raw_name := nullif(btrim(coalesce(NEW.name, '')), '');
  NEW.name := public.normalize_kol_name(v_raw_name);
  NEW.name_normalized := public.kol_name_key(v_raw_name);
  IF v_raw_name IS NOT NULL AND (v_is_insert OR NEW.name IS DISTINCT FROM OLD.name) THEN
    NEW.name_original := v_raw_name;
  END IF;

  NEW.ig_handle := nullif(btrim(coalesce(NEW.ig_handle, '')), '');
  NEW.cid_code := nullif(upper(btrim(coalesce(NEW.cid_code, ''))), '');
  NEW.order_number := nullif(btrim(coalesce(NEW.order_number, '')), '');

  IF NEW.name IS NULL AND (v_is_insert OR NEW.name IS DISTINCT FROM OLD.name) THEN
    RAISE EXCEPTION 'KOL 名稱不可為空白';
  END IF;
  IF NEW.ig_handle IS NULL AND (v_is_insert OR NEW.ig_handle IS DISTINCT FROM OLD.ig_handle) THEN
    RAISE EXCEPTION 'IG 帳號不可為空白';
  END IF;

  IF NEW.check_in_date IS NOT NULL AND NEW.check_out_date IS NOT NULL
     AND NEW.check_out_date <= NEW.check_in_date THEN
    RAISE EXCEPTION '退房日 (%) 必須晚於入住日 (%)', NEW.check_out_date, NEW.check_in_date;
  END IF;
  IF NEW.follower_count IS NOT NULL AND NEW.follower_count < 0 THEN
    RAISE EXCEPTION '粉絲數不可為負數';
  END IF;

  NEW.companion_cid := NULL;

  IF NEW.primary_profile_id IS NOT NULL THEN
    IF NEW.primary_profile_id = NEW.id THEN
      RAISE EXCEPTION '不可將自己設為主檔';
    END IF;

    SELECT k.id, k.name, k.primary_profile_id, k.accommodation_id, k.check_in_date,
           k.cid_code, k.contract_group_id
      INTO v_parent
    FROM public.kol_profiles k
    WHERE k.id = NEW.primary_profile_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION '指定的主檔不存在';
    END IF;

    IF v_parent.primary_profile_id IS NOT NULL THEN
      RAISE EXCEPTION '主檔「%」本身已掛在其他主檔底下，不可形成鏈狀關係', coalesce(v_parent.name, '-');
    END IF;

    IF NOT v_is_insert AND OLD.primary_profile_id = NEW.primary_profile_id THEN
      SELECT p.accommodation_id IS DISTINCT FROM OLD.accommodation_id
        INTO v_legacy_cross_accommodation
      FROM public.kol_profiles p
      WHERE p.id = OLD.primary_profile_id;
    END IF;

    IF v_parent.accommodation_id IS NULL OR NEW.accommodation_id IS NULL
       OR v_parent.accommodation_id <> NEW.accommodation_id THEN
      IF NOT v_legacy_cross_accommodation THEN
        RAISE EXCEPTION '主檔「%」與本筆不同館別。不可新建跨館附屬；跨館合作請各自建立主要記錄，再用合約歸戶合併', coalesce(v_parent.name, '-');
      END IF;
    ELSE
      IF v_parent.check_in_date IS NULL OR NEW.check_in_date IS NULL THEN
        RAISE EXCEPTION '主檔與附屬記錄都必須填寫入住日，且日期需在 31 天內';
      END IF;

      v_diff := abs(v_parent.check_in_date - NEW.check_in_date);
      IF v_diff > 31 AND NOT coalesce(NEW.primary_link_exception, false) THEN
        RAISE EXCEPTION '主檔「%」的入住日 (%) 與本筆 (%) 相差 % 天，超過 1 個月。若確為特例，請勾選「特例附屬」後再儲存',
          coalesce(v_parent.name, '-'), v_parent.check_in_date, NEW.check_in_date, v_diff;
      END IF;

      IF v_diff <= 31 THEN
        NEW.primary_link_exception := false;
      END IF;
    END IF;

    NEW.kpi_qualified := false;
    NEW.inventory_count := 0;
  ELSE
    NEW.primary_link_exception := false;
    IF NOT v_is_insert
       AND OLD.primary_profile_id IS NOT NULL
       AND NEW.kpi_qualified IS NOT DISTINCT FROM OLD.kpi_qualified THEN
      NEW.kpi_qualified := true;
    END IF;
  END IF;

  IF NEW.venue_id IS NOT NULL THEN
    SELECT accommodation_id INTO v_parent_acc FROM public.kol_venues WHERE id = NEW.venue_id;
    IF v_parent_acc IS NOT NULL THEN
      IF NEW.accommodation_id IS NULL THEN
        NEW.accommodation_id := v_parent_acc;
      ELSIF NEW.accommodation_id <> v_parent_acc THEN
        IF v_is_insert
           OR NEW.venue_id IS DISTINCT FROM OLD.venue_id
           OR NEW.accommodation_id IS DISTINCT FROM OLD.accommodation_id THEN
          RAISE EXCEPTION '館別欄位不一致：所選場域所屬母館為 %，但 accommodation_id 為 %', v_parent_acc, NEW.accommodation_id;
        ELSE
          NEW.accommodation_id := v_parent_acc;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.kol_profiles_normalize_before_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kol_profiles_normalize_before_write() FROM anon;
REVOKE ALL ON FUNCTION public.kol_profiles_normalize_before_write() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.kol_profiles_normalize_before_write() TO service_role;