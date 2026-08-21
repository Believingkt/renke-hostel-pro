-- A) 強化 kol_profiles 寫入前的後端校驗
CREATE OR REPLACE FUNCTION public.kol_profiles_normalize_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_acc uuid;
  v_comp RECORD;
  v_other text;
BEGIN
  -- 基本正規化
  NEW.name := nullif(btrim(coalesce(NEW.name, '')), '');
  NEW.ig_handle := nullif(btrim(coalesce(NEW.ig_handle, '')), '');
  NEW.cid_code := nullif(upper(btrim(coalesce(NEW.cid_code, ''))), '');
  NEW.order_number := nullif(upper(btrim(coalesce(NEW.order_number, ''))), '');

  IF NEW.name IS NULL THEN
    RAISE EXCEPTION 'KOL 名稱不可為空白';
  END IF;
  IF NEW.ig_handle IS NULL THEN
    RAISE EXCEPTION 'IG 帳號不可為空白';
  END IF;
  IF NEW.check_in_date IS NOT NULL AND NEW.check_out_date IS NOT NULL
     AND NEW.check_out_date <= NEW.check_in_date THEN
    RAISE EXCEPTION '退房日 (%) 必須晚於入住日 (%)', NEW.check_out_date, NEW.check_in_date;
  END IF;
  IF NEW.follower_count IS NOT NULL AND NEW.follower_count < 0 THEN
    RAISE EXCEPTION '粉絲數不可為負數';
  END IF;

  -- companion_cid 正規化
  IF NEW.companion_cid IS NOT NULL THEN
    NEW.companion_cid := nullif(upper(btrim(NEW.companion_cid)), '');
  END IF;

  IF NEW.companion_cid IS NOT NULL
     AND NEW.cid_code IS NOT NULL
     AND NEW.companion_cid = NEW.cid_code THEN
    RAISE EXCEPTION '同住夥伴不可設為自己的折扣碼 (%)', NEW.companion_cid;
  END IF;

  -- 同行者不獨立計分潤 / KPI / 庫存
  IF NEW.companion_cid IS NOT NULL THEN
    NEW.kpi_qualified := false;
    NEW.inventory_count := 0;

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

  -- 館別一致性：venue 的母館必須等於 accommodation_id，不一致直接擋下
  IF NEW.venue_id IS NOT NULL THEN
    SELECT accommodation_id INTO v_parent_acc FROM public.kol_venues WHERE id = NEW.venue_id;
    IF v_parent_acc IS NOT NULL THEN
      IF NEW.accommodation_id IS NULL THEN
        NEW.accommodation_id := v_parent_acc;
      ELSIF NEW.accommodation_id <> v_parent_acc THEN
        RAISE EXCEPTION '館別欄位不一致：所選場域所屬母館為 %，但 accommodation_id 為 %', v_parent_acc, NEW.accommodation_id;
      END IF;
    END IF;
  END IF;

  -- 訂單編號不可被兩筆邀約重複綁定
  IF NEW.order_number IS NOT NULL THEN
    SELECT k.name INTO v_other
    FROM public.kol_profiles k
    WHERE upper(btrim(coalesce(k.order_number, ''))) = NEW.order_number
      AND k.id <> NEW.id
    LIMIT 1;
    IF v_other IS NOT NULL THEN
      RAISE EXCEPTION '訂單「%」已被邀約紀錄「%」綁定，不可重複綁定', NEW.order_number, v_other;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- B) 邀約驗證失敗 / 阻擋審計紀錄
CREATE TABLE IF NOT EXISTS public.kol_invite_validation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  profile_id uuid,
  accommodation_id uuid,
  outcome text NOT NULL,
  rules text[] NOT NULL DEFAULT '{}',
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.kol_invite_validation_logs TO authenticated;
GRANT ALL ON public.kol_invite_validation_logs TO service_role;

ALTER TABLE public.kol_invite_validation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insert own validation logs"
ON public.kol_invite_validation_logs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "view own or admin validation logs"
ON public.kol_invite_validation_logs FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin_or_super());

CREATE INDEX IF NOT EXISTS kol_invite_validation_logs_created_idx
  ON public.kol_invite_validation_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS kol_invite_validation_logs_user_idx
  ON public.kol_invite_validation_logs (user_id, created_at DESC);