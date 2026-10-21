-- 20261106090000 rollback：拿掉刪除房型防呆、把清理過的陣列還原成原值（會把已刪房型 id 放回去）
-- 若某列在 migration 之後又被人改過（現值 ≠ 清理後的值），整個 rollback 中止，不做任何變更
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $rb$
DECLARE
  v_changed int;
BEGIN
  IF to_regclass('public.room_type_ids_cleanup_backup_20261106') IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK 中止：備份表不存在，可能尚未套用或已 rollback';
  END IF;
  SELECT count(*) INTO v_changed
  FROM public.room_type_ids_cleanup_backup_20261106 b
  LEFT JOIN public.pricing_templates t ON b.tbl = 'pricing_templates' AND t.id = b.row_id
  LEFT JOIN public.accommodation_packages p ON b.tbl = 'accommodation_packages' AND p.id = b.row_id
  WHERE COALESCE(t.room_type_ids, p.room_type_ids) IS DISTINCT FROM b.new_room_type_ids;
  IF v_changed > 0 THEN
    RAISE EXCEPTION 'ROLLBACK 中止：有 % 筆在 migration 後被修改或刪除，請人工處理', v_changed;
  END IF;
END
$rb$;

DROP TRIGGER IF EXISTS trg_room_types_detach_from_plans ON public.room_types;
DROP FUNCTION IF EXISTS public.room_types_detach_from_plans_before_delete();

UPDATE public.pricing_templates t
SET room_type_ids = b.old_room_type_ids
FROM public.room_type_ids_cleanup_backup_20261106 b
WHERE b.tbl = 'pricing_templates' AND b.row_id = t.id;

UPDATE public.accommodation_packages p
SET room_type_ids = b.old_room_type_ids
FROM public.room_type_ids_cleanup_backup_20261106 b
WHERE b.tbl = 'accommodation_packages' AND b.row_id = p.id;

DROP TABLE public.room_type_ids_cleanup_backup_20261106;

COMMIT;

-- rollback 後驗證（唯讀）：三欄都應為 true
SELECT to_regprocedure('public.room_types_detach_from_plans_before_delete()') IS NULL AS fn_gone, to_regclass('public.room_type_ids_cleanup_backup_20261106') IS NULL AS backup_gone, NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.room_types'::regclass AND t.tgname = 'trg_room_types_detach_from_plans') AS trigger_gone;
