CREATE OR REPLACE FUNCTION public.kol_profiles_normalize_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_parent_acc uuid;
  v_parent RECORD;
  v_is_insert boolean := (TG_OP = 'INSERT');
  v_raw_name text;
BEGIN
  -- 基本正規化
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

  -- companion_cid 已停用：一律清空，改以 primary_profile_id 為唯一真理
  NEW.companion_cid := NULL;

  -- 主檔關聯（同住合拍）規則
  IF NEW.primary_profile_id IS NOT NULL THEN
    IF NEW.primary_profile_id = NEW.id THEN
      RAISE EXCEPTION '不可將自己設為主檔';
    END IF;

    SELECT k.id, k.name, k.primary_profile_id, k.accommodation_id, k.check_in_date
      INTO v_parent
    FROM public.kol_profiles k
    WHERE k.id = NEW.primary_profile_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION '指定的主檔不存在';
    END IF;

    IF v_parent.primary_profile_id IS NOT NULL THEN
      RAISE EXCEPTION '主檔「%」本身已掛在其他主檔底下，不可形成鏈狀關係', coalesce(v_parent.name, '-');
    END IF;

    IF v_parent.accommodation_id IS NOT NULL AND NEW.accommodation_id IS NOT NULL
       AND v_parent.accommodation_id <> NEW.accommodation_id THEN
      RAISE EXCEPTION '主檔「%」的館別與本筆不同，同住合拍必須同館', coalesce(v_parent.name, '-');
    END IF;

    IF v_parent.check_in_date IS NOT NULL AND NEW.check_in_date IS NOT NULL
       AND v_parent.check_in_date <> NEW.check_in_date THEN
      RAISE EXCEPTION '主檔「%」的入住日 (%) 與本筆 (%) 不同', coalesce(v_parent.name, '-'), v_parent.check_in_date, NEW.check_in_date;
    END IF;

    -- 附屬記錄：不重複計分
    NEW.kpi_qualified := false;
    NEW.inventory_count := 0;
  ELSIF NOT v_is_insert
        AND OLD.primary_profile_id IS NOT NULL
        AND NEW.kpi_qualified IS NOT DISTINCT FROM OLD.kpi_qualified THEN
    -- 解除主檔關聯時，若呼叫端沒有指定 KPI 值，自動恢復計分資格
    NEW.kpi_qualified := true;
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

-- 既有資料修正：掛在主檔底下者一律不計 KPI
UPDATE public.kol_profiles
SET kpi_qualified = false
WHERE primary_profile_id IS NOT NULL AND kpi_qualified IS DISTINCT FROM false;