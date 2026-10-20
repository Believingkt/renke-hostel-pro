-- 還原 20261027090000：移除 pricing_template_id 白名單與館別檢查，函式其餘內容不變
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
  v_new := replace(replace(v_def, c_check || c_anchor, c_anchor), c_list_new, c_list_old);
  IF v_new LIKE '%pricing_template_id%' THEN
    RAISE EXCEPTION 'ROLLBACK 失敗：函式內容不符預期，未還原';
  END IF;
  EXECUTE v_new;
END $$;

COMMIT;
