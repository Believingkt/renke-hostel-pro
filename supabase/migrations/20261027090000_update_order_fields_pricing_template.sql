-- update_order_fields_v1：白名單加入 pricing_template_id，並檢查專案屬於該訂單的館別。
-- 以現有函式定義做最小修補（只動這兩處），任何一處不符預期就中止整個 migration。
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $$
DECLARE
  v_def text;
  v_new text;
  c_list_old CONSTANT text := '''check_in_date'',''check_out_date'',''room_type_id'',''package_id'',';
  c_list_new CONSTANT text := '''check_in_date'',''check_out_date'',''room_type_id'',''package_id'',''pricing_template_id'',';
  c_anchor CONSTANT text := '  PERFORM public.set_order_change_context(p_source, p_reason, NULL, ''user'');';
  c_check CONSTANT text := E'  IF nullif(p_patch->>''pricing_template_id'', '''') IS NOT NULL AND NOT EXISTS (\n    SELECT 1 FROM public.pricing_templates t JOIN public.orders o ON o.accommodation_id = t.accommodation_id\n    WHERE o.id = p_order_id AND t.id = (p_patch->>''pricing_template_id'')::uuid\n  ) THEN\n    RAISE EXCEPTION ''PRICING_TEMPLATE_ACCOMMODATION_MISMATCH: 專案不屬於此訂單的館別 (%)'', p_patch->>''pricing_template_id'';\n  END IF;\n\n';
BEGIN
  v_def := pg_get_functiondef('public.update_order_fields_v1(uuid, jsonb, text, text)'::regprocedure);
  IF v_def LIKE '%pricing_template_id%' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：update_order_fields_v1 已含 pricing_template_id（是否重複套用？）';
  END IF;
  IF (length(v_def) - length(replace(v_def, c_list_old, ''))) / length(c_list_old) <> 1 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：白名單格式不符預期';
  END IF;
  IF (length(v_def) - length(replace(v_def, c_anchor, ''))) / length(c_anchor) <> 1 THEN
    RAISE EXCEPTION 'PRECHECK 失敗：找不到唯一的 set_order_change_context 呼叫';
  END IF;
  v_new := replace(replace(v_def, c_list_old, c_list_new), c_anchor, c_check || c_anchor);
  EXECUTE v_new;
END $$;

COMMIT;
