-- 移除訂單「業主自帶客」開關（orders.owner_direct），免抽成一律改由業主月結設定的 exempt_order_sources 判斷。
-- 作法：以正式庫現有函式定義為基礎做最小修補（避免覆蓋正式庫可能存在的較新版本），任何一步不符預期就中止整個 migration。

-- 1) 預檢：除下列已知函式外，不得有其他函式引用 owner_direct
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosrc ~ '\mowner_direct\M'
    AND p.proname NOT IN ('create_commission_record', 'update_order_fields_v1', 'log_order_change');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：仍有函式引用 owner_direct：%', v_bad;
  END IF;
END $$;

-- 2) 備份（資料修正 SQL 已建立時沿用，不覆蓋）
CREATE TABLE IF NOT EXISTS public.owner_direct_backup_20260601 AS
SELECT o.id AS order_id, o.accommodation_id, o.order_number, o.owner_direct, o.order_source, now() AS backed_up_at
FROM public.orders o
WHERE o.owner_direct = true;

ALTER TABLE public.owner_direct_backup_20260601 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.owner_direct_backup_20260601 FROM anon, authenticated;

-- 3) create_commission_record()：拿掉 owner_direct 判斷區塊
DO $$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.create_commission_record()'::regprocedure);
  v_new := regexp_replace(
    v_def,
    '\n[ \t]*(--[^\n]*\n[ \t]*)?IF COALESCE\(NEW\.owner_direct, false\) = true THEN\s*DELETE FROM public\.commission_records WHERE order_id = NEW\.id;\s*RETURN NEW;\s*END IF;[ \t]*\n',
    E'\n'
  );
  IF v_new = v_def OR v_new ~ '\mowner_direct\M' THEN
    RAISE EXCEPTION 'create_commission_record 修補失敗：找不到預期的 owner_direct 區塊';
  END IF;
  EXECUTE v_new;
END $$;

-- 4) update_order_fields_v1：白名單移除 owner_direct
DO $$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.update_order_fields_v1(uuid, jsonb, text, text)'::regprocedure);
  v_new := replace(v_def, '''owner_direct'',', '');
  IF v_new = v_def OR v_new ~ '\mowner_direct\M' THEN
    RAISE EXCEPTION 'update_order_fields_v1 修補失敗：白名單格式不符預期';
  END IF;
  EXECUTE v_new;
END $$;

-- 5) log_order_change()：稽核欄位清單移除 owner_direct
DO $$
DECLARE v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.log_order_change()'::regprocedure);
  v_new := replace(v_def, '''owner_direct'',', '');
  IF v_new ~ '\mowner_direct\M' THEN
    RAISE EXCEPTION 'log_order_change 修補失敗：欄位清單格式不符預期';
  END IF;
  IF v_new <> v_def THEN
    EXECUTE v_new;
  END IF;
END $$;

-- 6) 分潤觸發器：觸發條件移除 owner_direct
DROP TRIGGER IF EXISTS create_commission_on_order_updated ON public.orders;
CREATE TRIGGER create_commission_on_order_updated
AFTER UPDATE ON public.orders
FOR EACH ROW
WHEN (
  old.discount_code IS DISTINCT FROM new.discount_code
  OR old.discount_amount IS DISTINCT FROM new.discount_amount
  OR old.final_price IS DISTINCT FROM new.final_price
  OR old.total_price IS DISTINCT FROM new.total_price
  OR old.custom_addon_details IS DISTINCT FROM new.custom_addon_details
  OR old.order_source IS DISTINCT FROM new.order_source
  OR old.currency_at_booking IS DISTINCT FROM new.currency_at_booking
  OR old.order_status IS DISTINCT FROM new.order_status
  OR old.accommodation_id IS DISTINCT FROM new.accommodation_id
  OR old.order_date IS DISTINCT FROM new.order_date
)
EXECUTE FUNCTION public.create_commission_record();

-- 7) 刪除欄位（不加 CASCADE：若仍有 view／trigger 依賴會直接失敗並整筆回滾）
ALTER TABLE public.orders DROP COLUMN owner_direct;
