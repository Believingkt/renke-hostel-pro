DO $mig$
DECLARE
  v_src text; v_new_src text; v_old_block text; v_new_block text;
  v_decl_old text; v_decl_new text; v_secdef boolean;
BEGIN
  SELECT pg_get_functiondef(p.oid), p.prosecdef INTO v_src, v_secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='update_paid_order_discount_v2';

  -- PRECHECK
  IF md5(v_src) <> '3278e8fa46b48789e9f0484d045c9740' OR length(v_src) <> 11655 THEN
    RAISE EXCEPTION 'PRECHECK FAILED: unexpected baseline len=% md5=%', length(v_src), md5(v_src);
  END IF;
  IF v_secdef THEN
    RAISE EXCEPTION 'PRECHECK FAILED: expected SECURITY INVOKER';
  END IF;
  RAISE NOTICE 'PRECHECK OK: len=% md5=% prosecdef=%', length(v_src), md5(v_src), v_secdef;

  v_decl_old := '  v_risk_kind text := ''none'';';
  v_decl_new := v_decl_old || E'\n  v_scope_mode text;\n  v_dc_tpls jsonb;\n  v_scope_ids uuid[];\n  v_allow text[];\n  v_hit int := 0;\n  v_full_coverage boolean := false;';

  v_old_block :=
'    IF COALESCE(array_length(v_template_ids, 1), 0) > 1 THEN
      RAISE EXCEPTION ''此訂單包含多個房價方案，無法自動判斷折扣碼適用範圍，請改填手動折扣金額'' USING ERRCODE = ''22023'';
    END IF;
    IF COALESCE(array_length(v_room_type_ids, 1), 0) > 1 THEN
      RAISE EXCEPTION ''此訂單包含多個房型，無法自動判斷折扣碼適用範圍，請改填手動折扣金額'' USING ERRCODE = ''22023'';
    END IF;

    v_template_id := CASE WHEN COALESCE(array_length(v_template_ids, 1), 0) = 1 THEN v_template_ids[1] END;
    v_room_type_id := COALESCE(
      CASE WHEN COALESCE(array_length(v_room_type_ids, 1), 0) = 1 THEN v_room_type_ids[1] END,
      o.room_type_id
    );';

  v_new_block :=
'    IF COALESCE(array_length(v_template_ids, 1), 0) > 1
       OR COALESCE(array_length(v_room_type_ids, 1), 0) > 1 THEN
      SELECT COALESCE(ai.discount_scope_mode, ''pricing_template'') INTO v_scope_mode
      FROM public.accommodation_info ai WHERE ai.id = o.accommodation_id;

      IF v_scope_mode IS DISTINCT FROM ''pricing_template'' THEN
        IF COALESCE(array_length(v_template_ids, 1), 0) > 1 THEN
          RAISE EXCEPTION ''此訂單包含多個房價方案，無法自動判斷折扣碼適用範圍，請改填手動折扣金額'' USING ERRCODE = ''22023'';
        END IF;
        RAISE EXCEPTION ''此訂單包含多個房型，無法自動判斷折扣碼適用範圍，請改填手動折扣金額'' USING ERRCODE = ''22023'';
      END IF;

      v_scope_ids := COALESCE(v_template_ids, ''{}'');

      IF cardinality(v_scope_ids) = 0 THEN
        IF COALESCE(array_length(v_template_ids, 1), 0) > 1 THEN
          RAISE EXCEPTION ''此訂單包含多個房價方案，無法自動判斷折扣碼適用範圍，請改填手動折扣金額'' USING ERRCODE = ''22023'';
        END IF;
        RAISE EXCEPTION ''此訂單包含多個房型，無法自動判斷折扣碼適用範圍，請改填手動折扣金額'' USING ERRCODE = ''22023'';
      END IF;

      SELECT dc.applicable_pricing_template_ids INTO v_dc_tpls
      FROM public.discount_codes dc
      WHERE dc.accommodation_id = o.accommodation_id AND upper(dc.code) = upper(v_code);

      v_allow := COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_dc_tpls, ''[]''::jsonb))), ''{}'');
      SELECT count(*) INTO v_hit FROM unnest(v_scope_ids) x WHERE x::text = ANY (v_allow);

      IF v_hit = 0 THEN
        RAISE EXCEPTION ''此折扣碼不適用於本訂單的任何房價方案，請確認是否用錯折扣碼，或改用手動折扣金額'' USING ERRCODE = ''22023'';
      ELSIF v_hit < cardinality(v_scope_ids) THEN
        RAISE EXCEPTION ''此折扣碼只適用於本訂單的部分房價方案，系統無法自動分攤，請改填手動折扣金額'' USING ERRCODE = ''22023'';
      END IF;

      v_template_id := v_scope_ids[1];
      v_room_type_id := COALESCE(v_room_type_ids[1], o.room_type_id);
      v_full_coverage := true;
    END IF;

    IF NOT v_full_coverage THEN
      v_template_id := CASE WHEN COALESCE(array_length(v_template_ids, 1), 0) = 1 THEN v_template_ids[1] END;
      v_room_type_id := COALESCE(
        CASE WHEN COALESCE(array_length(v_room_type_ids, 1), 0) = 1 THEN v_room_type_ids[1] END,
        o.room_type_id
      );
    END IF;';

  IF position(v_old_block in v_src) = 0 OR position(v_decl_old in v_src) = 0 THEN
    RAISE EXCEPTION 'PATCH ANCHOR NOT FOUND';
  END IF;

  v_new_src := replace(replace(v_src, v_decl_old, v_decl_new), v_old_block, v_new_block);
  EXECUTE v_new_src;

  -- POSTCHECK
  SELECT pg_get_functiondef(p.oid), p.prosecdef INTO v_src, v_secdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='update_paid_order_discount_v2';

  IF v_secdef THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: prosecdef changed to true';
  END IF;
  IF md5(v_src) <> '205ce832aa0a966945e8274b622b52de' OR length(v_src) <> 13318 THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: unexpected patched len=% md5=%', length(v_src), md5(v_src);
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='update_paid_order_discount_v2'
      AND (has_function_privilege('public', p.oid, 'EXECUTE'))
  ) THEN
    RAISE NOTICE 'NOTE: PUBLIC execute present (unchanged, SECURITY INVOKER + RLS enforced)';
  END IF;
  RAISE NOTICE 'POSTCHECK OK: len=% md5=% prosecdef=%', length(v_src), md5(v_src), v_secdef;
END
$mig$;