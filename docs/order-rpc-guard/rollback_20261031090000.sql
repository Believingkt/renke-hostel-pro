-- 20261031090000 rollback：移除 change_order_dates 的檢查段（還原為套用前內容），恢復兩支函式的 PUBLIC／anon 執行權限
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';
DO $rb$
DECLARE
  c_guard CONSTANT text := E'  -- ORDER_MODULE_GUARD_V1：已登入者需對該訂單館別的「訂單」模組 editable；service role（auth.uid() 為 null）照常通過\n  IF auth.uid() IS NOT NULL AND NOT public.staff_can_edit_module((SELECT o.accommodation_id FROM public.orders o WHERE o.id = _order_id), ''orders'') THEN\n    RAISE EXCEPTION ''權限不足：您對此訂單館別的「訂單」模組沒有編輯權限'' USING ERRCODE = ''42501'';\n  END IF;\n';
  v_oid oid := to_regprocedure('public.change_order_dates(uuid, date, date, text, text, text)');
  v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_oid;
  IF position(c_guard IN v_src) = 0 THEN
    RAISE NOTICE 'change_order_dates 不含檢查段，略過';
    RETURN;
  END IF;
  EXECUTE replace(pg_get_functiondef(v_oid), v_src, replace(v_src, c_guard, ''));
END
$rb$;
GRANT EXECUTE ON FUNCTION public.sync_order_rooms_v1(uuid, timestamp with time zone, jsonb) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_order_room_pricing_template(uuid) TO PUBLIC, anon;
COMMIT;
