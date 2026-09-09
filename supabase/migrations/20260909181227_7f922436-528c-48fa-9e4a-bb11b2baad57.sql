DO $mig$
DECLARE
  v_def text;
  v_new text;
  v_marker text;
  v_block text;
BEGIN
  -- ===== 折扣 =====
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='update_paid_order_discount_v2';
  IF v_def IS NULL THEN RAISE EXCEPTION 'discount fn not found'; END IF;
  IF v_def LIKE '%set_order_change_context%' THEN RAISE EXCEPTION 'discount fn already patched'; END IF;
  v_marker := E'  PERFORM set_config(''app.paid_discount_settlement'', v_settle, true);\n';
  IF (length(v_def) - length(replace(v_def, v_marker, ''))) / length(v_marker) <> 1 THEN
    RAISE EXCEPTION 'discount marker not unique';
  END IF;
  v_block := v_marker ||
    E'\n  -- V5.5C 批次四：標記變更來源／原因／操作者，供 zzz_order_change_log trigger 記錄\n' ||
    E'  PERFORM public.set_order_change_context(\n' ||
    E'    ''paid_discount_edit'',\n    v_reason,\n' ||
    E'    ''已結清折扣修改（'' || v_mode || ''／'' || v_settle || ''）'',\n    ''user'');\n';
  v_new := replace(v_def, v_marker, v_block);
  EXECUTE v_new;

  -- ===== 加購 =====
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='update_paid_order_addons_v3';
  IF v_def IS NULL THEN RAISE EXCEPTION 'addons fn not found'; END IF;
  IF v_def LIKE '%set_order_change_context%' THEN RAISE EXCEPTION 'addons fn already patched'; END IF;
  v_marker := E'    PERFORM set_config(''app.paid_addon_reduce_ack'', ''on'', true);\n  END IF;\n';
  IF (length(v_def) - length(replace(v_def, v_marker, ''))) / length(v_marker) <> 1 THEN
    RAISE EXCEPTION 'addons marker not unique';
  END IF;
  v_block := v_marker ||
    E'\n  -- V5.5C 批次四：標記變更來源／原因／操作者\n' ||
    E'  PERFORM public.set_order_change_context(\n' ||
    E'    ''paid_addon_edit'',\n    v_reason,\n' ||
    E'    ''已付款加購修改（'' || v_settle || ''）'',\n    ''user'');\n';
  v_new := replace(v_def, v_marker, v_block);
  EXECUTE v_new;

  -- ===== postcheck（同一交易內驗證） =====
  PERFORM 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('update_paid_order_discount_v2','update_paid_order_addons_v3')
     AND pg_get_functiondef(p.oid) LIKE '%set_order_change_context%'
   HAVING count(*) = 2;
  IF NOT FOUND THEN RAISE EXCEPTION 'postcheck failed: context call missing'; END IF;

  PERFORM 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('update_paid_order_discount_v2','update_paid_order_addons_v3')
     AND pg_get_functiondef(p.oid) LIKE '%INSERT INTO public.audit_logs%'
   HAVING count(*) = 2;
  IF NOT FOUND THEN RAISE EXCEPTION 'postcheck failed: audit_logs insert lost'; END IF;

  PERFORM 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('update_paid_order_discount_v2','update_paid_order_addons_v3')
     AND p.prosecdef = false
   HAVING count(*) = 2;
  IF NOT FOUND THEN RAISE EXCEPTION 'postcheck failed: security mode changed'; END IF;
END
$mig$;