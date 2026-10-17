-- rollback：20261018090001_auto_template_for_packages.sql
-- 移除三支 trigger（含刪除方案前的訂單／OTA 引用檢查）、三個函式與 auto_template_enabled 欄位。
-- rollback 後刪除方案回到原本行為：orders.package_id 由 FK 清成 NULL、專案由 FK 解除綁定。
-- 已自動建立的專案（pricing_templates）屬於正常資料，不刪除；先列出供人工確認。
BEGIN;

SELECT t.id, t.accommodation_id, t.template_name, t.default_package_id
FROM public.pricing_templates t
JOIN public.accommodation_info_flags f ON f.accommodation_id = t.accommodation_id
WHERE f.auto_template_enabled
ORDER BY t.accommodation_id, t.template_name;

DROP TRIGGER IF EXISTS trg_packages_auto_template_ins ON public.accommodation_packages;
DROP TRIGGER IF EXISTS trg_packages_auto_template_room ON public.accommodation_packages;
DROP TRIGGER IF EXISTS trg_packages_auto_template_del ON public.accommodation_packages;
DROP FUNCTION IF EXISTS public.packages_auto_template_on_insert();
DROP FUNCTION IF EXISTS public.packages_auto_template_on_primary_room();
DROP FUNCTION IF EXISTS public.packages_auto_template_on_delete();
ALTER TABLE public.accommodation_info_flags DROP COLUMN IF EXISTS auto_template_enabled;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.accommodation_packages'::regclass
      AND tgname IN ('trg_packages_auto_template_ins', 'trg_packages_auto_template_room', 'trg_packages_auto_template_del')
  ) OR to_regprocedure('public.packages_auto_template_on_insert()') IS NOT NULL
    OR to_regprocedure('public.packages_auto_template_on_primary_room()') IS NOT NULL
    OR to_regprocedure('public.packages_auto_template_on_delete()') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'accommodation_info_flags'
        AND column_name = 'auto_template_enabled'
    ) THEN
    RAISE EXCEPTION 'ROLLBACK 驗證失敗：仍有殘留的 trigger／函式／欄位';
  END IF;
END $$;

COMMIT;
