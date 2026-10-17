-- rollback：20261018090002_auto_template_price_fallback.sql
-- 把 packages_auto_template_on_insert() 還原為 20261018090001 的版本（以下函式本體逐字取自 20261018090001）
-- 已用新版規則建立的專案屬於正常資料，不改動
BEGIN;

CREATE OR REPLACE FUNCTION public.packages_auto_template_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tiers jsonb := COALESCE(NEW.tier_prices, '{}'::jsonb);
  v_base integer := round(COALESCE(NEW.original_price, NEW.sale_price))::integer;
  v_wd integer;
  v_fs integer;
  v_we integer;
  v_has_tiers boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.accommodation_info_flags f
    WHERE f.accommodation_id = NEW.accommodation_id AND f.auto_template_enabled
  ) THEN
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.pricing_templates WHERE default_package_id = NEW.id) THEN
    RETURN NULL;
  END IF;

  v_has_tiers := jsonb_typeof(v_tiers) = 'object' AND v_tiers ? 'weekday';
  IF v_has_tiers THEN
    v_wd := round(COALESCE((v_tiers #>> '{weekday,original}')::numeric, (v_tiers #>> '{weekday,sale}')::numeric))::integer;
    v_fs := round(COALESCE((v_tiers #>> '{friday_sunday,original}')::numeric, (v_tiers #>> '{friday_sunday,sale}')::numeric))::integer;
    v_we := round(COALESCE((v_tiers #>> '{weekend,original}')::numeric, (v_tiers #>> '{weekend,sale}')::numeric))::integer;
  ELSE
    v_wd := v_base;
    v_fs := v_base;
    v_we := v_base;
  END IF;

  INSERT INTO public.pricing_templates (
    accommodation_id, template_name, room_type_id, room_type_ids, default_package_id,
    weekday_price, weekday_enabled, peak_price, peak_enabled, weekend_price, weekend_enabled,
    price, display_order
  ) VALUES (
    NEW.accommodation_id, NEW.name, NEW.primary_room_type_id,
    CASE WHEN NEW.primary_room_type_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[NEW.primary_room_type_id] END,
    NEW.id,
    v_wd, true,
    v_fs, CASE WHEN v_has_tiers THEN v_tiers ? 'friday_sunday' ELSE true END,
    v_we, CASE WHEN v_has_tiers THEN v_tiers ? 'weekend' ELSE true END,
    v_wd, NEW.display_order
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.packages_auto_template_on_insert() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF md5(pg_get_functiondef('public.packages_auto_template_on_insert()'::regprocedure)) <> 'abc30714c0f7ffdaf4a4fbd58d2f2f56' THEN
    RAISE EXCEPTION 'ROLLBACK 驗證失敗：函式內容與 20261018090001 版本不同';
  END IF;
END $$;

COMMIT;
