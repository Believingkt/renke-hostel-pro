-- 折扣碼三態判斷 evaluate_discount_code（applied／not_applicable／invalid），以及使用次數只計「折扣 > 0」並限定館別。
-- 既有 validate_discount_code 不修改；本函式先判斷碼本身是否成立，再交給它判斷適用條件。
-- 對外最小揭露：invalid 一律同一訊息（不分不存在／停用／非本館／過期／未生效）；not_applicable 只回適用名稱與是否未設定範圍。
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

DO $$
BEGIN
  IF to_regprocedure('public.evaluate_discount_code(text, uuid, integer, uuid, date, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：evaluate_discount_code 已存在（是否重複套用？）';
  END IF;
  IF to_regprocedure('public.validate_discount_code(text, uuid, integer, uuid, date, uuid)') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：找不到 validate_discount_code';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sync_discount_used_count_trigger' AND tgrelid = 'public.orders'::regclass) THEN
    RAISE EXCEPTION 'PRECHECK 失敗：找不到 sync_discount_used_count_trigger';
  END IF;
END $$;

CREATE FUNCTION public.evaluate_discount_code(
  p_code text,
  p_accommodation_id uuid,
  p_order_amount integer DEFAULT 0,
  p_room_type_id uuid DEFAULT NULL,
  p_check_in_date date DEFAULT NULL,
  p_pricing_template_id uuid DEFAULT NULL
)
RETURNS TABLE(status text, discount_type text, discount_value integer, message text, applicable_names text[], scope_empty boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_code text := upper(btrim(COALESCE(p_code, '')));
  v_dc record;
  v_res record;
  v_mode text;
  v_names text[];
  v_empty boolean := false;
BEGIN
  SELECT dc.id, dc.valid_from, dc.valid_until, dc.applicable_pricing_template_ids, dc.applicable_room_types
    INTO v_dc
  FROM public.discount_codes dc
  WHERE dc.code = v_code AND dc.accommodation_id = p_accommodation_id AND dc.is_active = true;
  IF v_code = '' OR NOT FOUND THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::text, NULL::integer, '折扣碼無效'::text, NULL::text[], false;
    RETURN;
  END IF;
  IF v_dc.valid_until IS NOT NULL AND v_dc.valid_until < now() THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::text, NULL::integer, '折扣碼無效'::text, NULL::text[], false;
    RETURN;
  END IF;
  IF v_dc.valid_from IS NOT NULL AND v_dc.valid_from > now() THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::text, NULL::integer, '折扣碼無效'::text, NULL::text[], false;
    RETURN;
  END IF;

  SELECT * INTO v_res FROM public.validate_discount_code(v_code, p_accommodation_id, p_order_amount, p_room_type_id, p_check_in_date, p_pricing_template_id) LIMIT 1;
  IF COALESCE(v_res.is_valid, false) THEN
    RETURN QUERY SELECT 'applied'::text, v_res.discount_type, v_res.discount_value, v_res.message, NULL::text[], false;
    RETURN;
  END IF;

  SELECT COALESCE(ai.discount_scope_mode, 'pricing_template') INTO v_mode FROM public.accommodation_info ai WHERE ai.id = p_accommodation_id;
  IF COALESCE(v_mode, 'pricing_template') = 'pricing_template' THEN
    v_empty := COALESCE(jsonb_array_length(v_dc.applicable_pricing_template_ids), 0) = 0;
    SELECT array_agg(pt.template_name ORDER BY pt.template_name) INTO v_names
    FROM public.pricing_templates pt
    WHERE pt.accommodation_id = p_accommodation_id AND COALESCE(v_dc.applicable_pricing_template_ids, '[]'::jsonb) @> to_jsonb(pt.id::text);
  ELSE
    SELECT array_agg(rt.name ORDER BY rt.name) INTO v_names
    FROM public.room_types rt
    WHERE rt.accommodation_id = p_accommodation_id AND COALESCE(v_dc.applicable_room_types, '[]'::jsonb) @> to_jsonb(rt.id::text);
  END IF;
  RETURN QUERY SELECT 'not_applicable'::text, NULL::text, NULL::integer, NULL::text, v_names, v_empty;
END;
$function$;

REVOKE ALL ON FUNCTION public.evaluate_discount_code(text, uuid, integer, uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.evaluate_discount_code(text, uuid, integer, uuid, date, uuid) TO anon, authenticated, service_role;

-- 使用次數：只計未取消且折扣 > 0 的訂單；以「館別＋碼」比對；折扣金額變動也重算
CREATE OR REPLACE FUNCTION public.sync_discount_code_used_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pairs uuid[] := '{}';
  v_codes text[] := '{}';
  i integer;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.discount_code IS NOT NULL THEN
    v_pairs := v_pairs || OLD.accommodation_id;
    v_codes := v_codes || OLD.discount_code;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.discount_code IS NOT NULL THEN
    v_pairs := v_pairs || NEW.accommodation_id;
    v_codes := v_codes || NEW.discount_code;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.discount_code IS NOT DISTINCT FROM NEW.discount_code
     AND OLD.accommodation_id IS NOT DISTINCT FROM NEW.accommodation_id
     AND OLD.order_status IS NOT DISTINCT FROM NEW.order_status
     AND OLD.discount_amount IS NOT DISTINCT FROM NEW.discount_amount THEN
    RETURN NEW;
  END IF;
  FOR i IN 1 .. COALESCE(array_length(v_codes, 1), 0) LOOP
    UPDATE public.discount_codes dc
    SET used_count = (
      SELECT COUNT(*) FROM public.orders o
      WHERE o.accommodation_id = v_pairs[i]
        AND o.discount_code = v_codes[i]
        AND o.order_status != 'cancelled'
        AND COALESCE(o.discount_amount, 0) > 0
    )
    WHERE dc.accommodation_id = v_pairs[i] AND dc.code = v_codes[i];
  END LOOP;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
