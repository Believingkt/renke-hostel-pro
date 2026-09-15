-- 1. 正規化函式
CREATE OR REPLACE FUNCTION public.normalize_kol_name(_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v text;
  res text := '';
  i int;
  c text;
  prev_alpha boolean := false;
  cjk text := E'\u4e00' || '-' || E'\u9fff' || E'\u3040' || '-' || E'\u30ff' || E'\uac00' || '-' || E'\ud7af';
BEGIN
  v := coalesce(_raw, '');
  IF btrim(v) = '' THEN RETURN NULL; END IF;

  -- 全形英數與全形空白 -> 半形
  v := translate(
    v,
    'ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ' ||
    'ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ' ||
    '０１２３４５６７８９' || E'\u3000',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '
  );

  v := btrim(regexp_replace(v, '\s+', ' ', 'g'));
  -- 中日韓文字相鄰的空白移除（Annie 與美食 -> Annie與美食 / 小比 簡君如 -> 小比簡君如）
  v := regexp_replace(v, '([' || cjk || '])\s+', '\1', 'g');
  v := regexp_replace(v, '\s+([' || cjk || '])', '\1', 'g');

  -- 英文字串首字大寫，其餘小寫
  FOR i IN 1..length(v) LOOP
    c := substr(v, i, 1);
    IF c ~ '[A-Za-z]' THEN
      res := res || CASE WHEN prev_alpha THEN lower(c) ELSE upper(c) END;
      prev_alpha := true;
    ELSE
      res := res || c;
      prev_alpha := false;
    END IF;
  END LOOP;

  RETURN nullif(btrim(res), '');
END;
$fn$;

CREATE OR REPLACE FUNCTION public.kol_name_key(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT nullif(lower(replace(coalesce(public.normalize_kol_name(_raw), ''), ' ', '')), '');
$fn$;

-- 2. 欄位
ALTER TABLE public.kol_profiles
  ADD COLUMN IF NOT EXISTS name_original text,
  ADD COLUMN IF NOT EXISTS name_normalized text;

CREATE INDEX IF NOT EXISTS idx_kol_profiles_name_normalized
  ON public.kol_profiles (name_normalized);

-- 3. 觸發器：於既有正規化流程中加入名稱處理
CREATE OR REPLACE FUNCTION public.kol_profiles_normalize_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_acc uuid;
  v_comp RECORD;
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
$$;
