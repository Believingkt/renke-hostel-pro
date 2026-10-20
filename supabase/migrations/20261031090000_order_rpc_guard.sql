-- 第二支：change_order_dates 加入「訂單」模組 editable 檢查（只插入檢查段，其餘邏輯不變）；
-- sync_order_rooms_v1、clear_order_room_pricing_template 收回 PUBLIC／anon（兩者在檢查登入前就會鎖列或讀資料，前台訪客不需要）。
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $mig$
DECLARE
  c_anchor CONSTANT text := E'\nBEGIN\n';
  c_guard CONSTANT text := E'  -- ORDER_MODULE_GUARD_V1：已登入者需對該訂單館別的「訂單」模組 editable；service role（auth.uid() 為 null）照常通過\n  IF auth.uid() IS NOT NULL AND NOT public.staff_can_edit_module((SELECT o.accommodation_id FROM public.orders o WHERE o.id = _order_id), ''orders'') THEN\n    RAISE EXCEPTION ''權限不足：您對此訂單館別的「訂單」模組沒有編輯權限'' USING ERRCODE = ''42501'';\n  END IF;\n';
  v_oid oid := to_regprocedure('public.change_order_dates(uuid, date, date, text, text, text)');
  v_src text;
  v_def text;
  v_new text;
  v_n int;
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：找不到 change_order_dates(uuid, date, date, text, text, text)';
  END IF;
  IF to_regprocedure('public.staff_can_edit_module(uuid, text)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：找不到 staff_can_edit_module(uuid, text)';
  END IF;
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = v_oid;
  IF position('ORDER_MODULE_GUARD_V1' IN v_src) > 0 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：change_order_dates 已含 ORDER_MODULE_GUARD_V1（是否重複套用？）';
  END IF;
  v_n := (length(v_src) - length(replace(v_src, c_anchor, ''))) / length(c_anchor);
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：錨點（換行 BEGIN 換行）出現 % 次，預期 1 次', v_n;
  END IF;
  v_new := replace(v_src, c_anchor, c_anchor || c_guard);
  v_def := pg_get_functiondef(v_oid);
  IF (length(v_def) - length(replace(v_def, v_src, ''))) / length(v_src) <> 1 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：函式定義中找不到唯一的函式內容';
  END IF;
  EXECUTE replace(v_def, v_src, v_new);
  IF (SELECT md5(replace(replace(prosrc, E'\r', ''), c_guard, '')) FROM pg_proc WHERE oid = v_oid) <> md5(replace(v_src, E'\r', '')) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：去掉檢查段後與原函式不一致';
  END IF;
END
$mig$;

REVOKE EXECUTE ON FUNCTION public.sync_order_rooms_v1(uuid, timestamp with time zone, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_order_rooms_v1(uuid, timestamp with time zone, jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.clear_order_room_pricing_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_order_room_pricing_template(uuid) TO authenticated, service_role;

COMMIT;
