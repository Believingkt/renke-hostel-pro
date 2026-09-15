CREATE OR REPLACE FUNCTION public.kol_profiles_normalize_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_acc uuid;
  v_comp RECORD;
  v_is_insert boolean := (TG_OP = 'INSERT');
BEGIN
  -- 基本正規化
  NEW.name := nullif(btrim(coalesce(NEW.name, '')), '');
  NEW.ig_handle := nullif(btrim(coalesce(NEW.ig_handle, '')), '');
  NEW.cid_code := nullif(upper(btrim(coalesce(NEW.cid_code, ''))), '');
  NEW.order_number := nullif(btrim(coalesce(NEW.order_number, '')), '');

  -- 必填：僅在新增或該欄位被異動時檢查（舊資料留白仍可編輯其他欄位）
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

  -- companion_cid 正規化與關係檢查
  IF NEW.companion_cid IS NOT NULL THEN
    NEW.companion_cid := nullif(upper(btrim(NEW.companion_cid)), '');
  END IF;

  IF NEW.companion_cid IS NOT NULL
     AND NEW.cid_code IS NOT NULL
     AND NEW.companion_cid = NEW.cid_code THEN
    RAISE EXCEPTION '同住夥伴不可設為自己的折扣碼 (%)', NEW.companion_cid;
  END IF;

  IF NEW.companion_cid IS NOT NULL THEN
    NEW.kpi_qualified := false;
    NEW.inventory_count := 0;

    IF v_is_insert OR NEW.companion_cid IS DISTINCT FROM upper(btrim(coalesce(OLD.companion_cid, ''))) THEN
      SELECT k.id, k.name, k.companion_cid, k.accommodation_id, k.check_in_date
        INTO v_comp
      FROM public.kol_profiles k
      WHERE upper(btrim(coalesce(k.cid_code, ''))) = NEW.companion_cid
        AND k.id <> NEW.id
      LIMIT 1;

      IF FOUND THEN
        IF v_comp.companion_cid IS NOT NULL THEN
          RAISE EXCEPTION '同住夥伴「%」本身已設有同住夥伴，不可形成鏈狀關係', coalesce(v_comp.name, '-');
        END IF;
        IF v_comp.accommodation_id IS NOT NULL AND NEW.accommodation_id IS NOT NULL
           AND v_comp.accommodation_id <> NEW.accommodation_id THEN
          RAISE EXCEPTION '同住夥伴「%」的館別與本筆不同，同住必須同館', coalesce(v_comp.name, '-');
        END IF;
        IF v_comp.check_in_date IS NOT NULL AND NEW.check_in_date IS NOT NULL
           AND v_comp.check_in_date <> NEW.check_in_date THEN
          RAISE EXCEPTION '同住夥伴「%」的入住日 (%) 與本筆 (%) 不同', coalesce(v_comp.name, '-'), v_comp.check_in_date, NEW.check_in_date;
        END IF;
      END IF;
    END IF;
  END IF;

  -- 館別一致性
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
          -- 舊資料：靜默校正為場域母館
          NEW.accommodation_id := v_parent_acc;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;