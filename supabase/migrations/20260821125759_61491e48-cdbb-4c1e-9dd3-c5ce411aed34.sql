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
  v_same_contract boolean;
  v_diff int;
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

    v_same_contract := (
      (NEW.cid_code IS NOT NULL AND v_parent.cid_code IS NOT NULL AND NEW.cid_code = v_parent.cid_code)
      OR (NEW.contract_group_id IS NOT NULL AND NEW.contract_group_id = v_parent.contract_group_id)
    );

    IF NOT v_same_contract
       AND v_parent.accommodation_id IS NOT NULL AND NEW.accommodation_id IS NOT NULL
       AND v_parent.accommodation_id <> NEW.accommodation_id THEN
      RAISE EXCEPTION '主檔「%」的館別與本筆不同，且折扣碼也不同，無法歸為同一份合約。請確認館別，或改填相同折扣碼（CID）後再設定主檔', coalesce(v_parent.name, '-');
    END IF;

    IF v_parent.check_in_date IS NOT NULL AND NEW.check_in_date IS NOT NULL THEN
      v_diff := abs(v_parent.check_in_date - NEW.check_in_date);
      IF v_same_contract THEN
        IF v_diff > 365 THEN
          RAISE EXCEPTION '主檔「%」的入住日 (%) 與本筆 (%) 相差 % 天，已超過同一份合約的上限（365 天）。請確認是否為不同年度的合作案；若是，請改為各自獨立的主檔，不要設為附屬',
            coalesce(v_parent.name, '-'), v_parent.check_in_date, NEW.check_in_date, v_diff;
        END IF;
      ELSIF v_diff > 3 THEN
        RAISE EXCEPTION '主檔「%」的入住日 (%) 與本筆 (%) 相差 % 天，且兩筆折扣碼不同。請改填與主檔相同的折扣碼（CID），或改為獨立主檔',
          coalesce(v_parent.name, '-'), v_parent.check_in_date, NEW.check_in_date, v_diff;
      END IF;
    END IF;

    NEW.kpi_qualified := false;
    NEW.inventory_count := 0;
  ELSIF NOT v_is_insert
        AND OLD.primary_profile_id IS NOT NULL
        AND NEW.kpi_qualified IS NOT DISTINCT FROM OLD.kpi_qualified THEN
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