-- 1) 折扣碼新增適用房價方案
ALTER TABLE public.discount_codes
  ADD COLUMN IF NOT EXISTS applicable_pricing_template_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.discount_codes.applicable_pricing_template_ids IS 'Array of pricing_template ids this discount applies to (used when accommodation.discount_scope_mode = pricing_template)';

-- 2) 館別設定判斷模式
ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS discount_scope_mode text NOT NULL DEFAULT 'pricing_template';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accommodation_info_discount_scope_mode_check'
  ) THEN
    ALTER TABLE public.accommodation_info
      ADD CONSTRAINT accommodation_info_discount_scope_mode_check
      CHECK (discount_scope_mode IN ('room_type', 'pricing_template'));
  END IF;
END $$;

-- 舊三館維持房型判斷
UPDATE public.accommodation_info
SET discount_scope_mode = 'room_type'
WHERE name LIKE '%森山%' OR name LIKE '%雲岫%' OR name LIKE '%哈庫納%';

-- 3) 驗證函式：新增 p_pricing_template_id
CREATE OR REPLACE FUNCTION public.validate_discount_code(
  p_code text,
  p_accommodation_id uuid,
  p_order_amount integer DEFAULT 0,
  p_room_type_id uuid DEFAULT NULL::uuid,
  p_check_in_date date DEFAULT NULL::date,
  p_pricing_template_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(is_valid boolean, discount_type text, discount_value integer, message text, applicable_room_names text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_discount_type text;
  v_discount_value integer;
  v_valid_from timestamptz;
  v_valid_until timestamptz;
  v_used_count integer;
  v_usage_limit integer;
  v_min_order_amount integer;
  v_applicable_room_types jsonb;
  v_applicable_templates jsonb;
  v_applicable_date_from date;
  v_applicable_date_to date;
  v_room_names text[];
  v_scope_mode text;
BEGIN
  SELECT
    dc.id, dc.discount_type, dc.discount_value,
    dc.valid_from, dc.valid_until, dc.used_count,
    dc.usage_limit, dc.min_order_amount, dc.applicable_room_types,
    dc.applicable_pricing_template_ids,
    dc.applicable_date_from, dc.applicable_date_to
  INTO
    v_id, v_discount_type, v_discount_value,
    v_valid_from, v_valid_until, v_used_count,
    v_usage_limit, v_min_order_amount, v_applicable_room_types,
    v_applicable_templates,
    v_applicable_date_from, v_applicable_date_to
  FROM public.discount_codes dc
  WHERE dc.code = UPPER(p_code)
    AND dc.accommodation_id = p_accommodation_id
    AND dc.is_active = true;

  IF v_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼不存在或已停用'::TEXT, NULL::text[];
    RETURN;
  END IF;

  IF v_valid_until IS NOT NULL AND v_valid_until < NOW() THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼已過期'::TEXT, NULL::text[];
    RETURN;
  END IF;

  IF v_valid_from > NOW() THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼尚未生效'::TEXT, NULL::text[];
    RETURN;
  END IF;

  IF v_used_count >= v_usage_limit THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '折扣碼使用次數已達上限'::TEXT, NULL::text[];
    RETURN;
  END IF;

  IF v_min_order_amount > 0 AND p_order_amount > 0 AND p_order_amount < v_min_order_amount THEN
    RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '訂單金額未達最低消費 NT$ ' || v_min_order_amount::TEXT, NULL::text[];
    RETURN;
  END IF;

  SELECT COALESCE(ai.discount_scope_mode, 'pricing_template') INTO v_scope_mode
  FROM public.accommodation_info ai
  WHERE ai.id = p_accommodation_id;

  IF COALESCE(v_scope_mode, 'pricing_template') = 'pricing_template' THEN
    -- 房價方案模式：未勾選視為不適用
    IF v_applicable_templates IS NULL OR jsonb_array_length(v_applicable_templates) = 0 THEN
      RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '此折扣碼尚未設定適用房價方案'::TEXT, NULL::text[];
      RETURN;
    END IF;

    IF p_pricing_template_id IS NULL THEN
      SELECT array_agg(pt.template_name) INTO v_room_names
      FROM public.pricing_templates pt
      WHERE pt.id::text = ANY (SELECT jsonb_array_elements_text(v_applicable_templates));

      RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '請先選擇房價方案後再套用折扣碼'::TEXT, v_room_names;
      RETURN;
    END IF;

    IF NOT (v_applicable_templates @> to_jsonb(p_pricing_template_id::TEXT)) THEN
      SELECT array_agg(pt.template_name) INTO v_room_names
      FROM public.pricing_templates pt
      WHERE pt.id::text = ANY (SELECT jsonb_array_elements_text(v_applicable_templates));

      RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '此折扣碼不適用於所選房價方案'::TEXT, v_room_names;
      RETURN;
    END IF;
  ELSE
    -- 房型模式（森山／雲岫／哈庫納維持原邏輯）
    IF v_applicable_room_types IS NOT NULL
       AND jsonb_array_length(v_applicable_room_types) > 0
       AND p_room_type_id IS NOT NULL THEN
      IF NOT (v_applicable_room_types @> to_jsonb(p_room_type_id::TEXT)) THEN
        SELECT array_agg(name) INTO v_room_names
        FROM public.room_types
        WHERE id::text = ANY (SELECT jsonb_array_elements_text(v_applicable_room_types));

        RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '此折扣碼不適用於所選房型'::TEXT, v_room_names;
        RETURN;
      END IF;
    END IF;
  END IF;

  IF p_check_in_date IS NOT NULL THEN
    IF v_applicable_date_from IS NOT NULL AND p_check_in_date < v_applicable_date_from THEN
      RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '此折扣碼不適用於所選入住日期'::TEXT, NULL::text[];
      RETURN;
    END IF;
    IF v_applicable_date_to IS NOT NULL AND p_check_in_date > v_applicable_date_to THEN
      RETURN QUERY SELECT false, NULL::TEXT, NULL::INTEGER, '此折扣碼不適用於所選入住日期'::TEXT, NULL::text[];
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT true, v_discount_type, v_discount_value, '折扣碼有效'::TEXT, NULL::text[];
END;
$function$;

-- 舊 5 參數版本移除，避免呼叫時歧義
DROP FUNCTION IF EXISTS public.validate_discount_code(text, uuid, integer, uuid, date);
