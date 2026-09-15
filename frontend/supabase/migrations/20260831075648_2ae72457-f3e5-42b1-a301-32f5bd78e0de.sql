ALTER TABLE public.owner_settlement_pricing_rules
  ADD COLUMN IF NOT EXISTS commission_exclusion_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS commission_exclusion_reviewed_by uuid;

CREATE OR REPLACE FUNCTION public.calc_team_commission_price(_order_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o            public.orders%ROWTYPE;
  v_taipei     date;
  v_onsite     numeric := 0;
  v_addon      numeric := 0;
  v_rule       public.owner_settlement_pricing_rules%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF o.order_source = 'group_buy' THEN RETURN 0; END IF;

  v_taipei := (o.order_date AT TIME ZONE 'Asia/Taipei')::date;

  -- 現場加購（備註）：V2 起（台北成交日 >= 2026-08-01）一律排除
  IF v_taipei IS NOT NULL AND v_taipei >= DATE '2026-08-01' THEN
    v_onsite := COALESCE(
      NULLIF((regexp_match(COALESCE(o.notes, ''),
        '【額外現場加購金額[^】]*】\s*(\d+)\s*【額外現場加購金額END】'))[1], '')::numeric, 0);
  END IF;

  IF v_taipei IS NOT NULL AND v_taipei >= DATE '2026-09-10' THEN
    -- V3：只排除該館設定為「不列入抽成」的增值服務；查無規則 → 全部列入抽成
    SELECT * INTO v_rule
    FROM public.owner_settlement_pricing_rules r
    WHERE r.accommodation_id = o.accommodation_id
      AND r.effective_from <= date_trunc('month', v_taipei)::date
    ORDER BY r.effective_from DESC, r.created_at DESC
    LIMIT 1;

    IF FOUND THEN
      SELECT COALESCE(SUM(COALESCE((elem->>'total')::numeric, 0)), 0) INTO v_addon
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(o.custom_addon_details) = 'array'
             THEN o.custom_addon_details ELSE '[]'::jsonb END
      ) AS elem
      WHERE (
        (elem->>'addon_id') IS NOT NULL
        AND (elem->>'addon_id') = ANY (COALESCE(v_rule.commission_excluded_addon_ids, ARRAY[]::text[]))
      ) OR (
        (elem->>'addon_id') IS NULL
        AND COALESCE(elem->>'addon_type', '') = ANY (COALESCE(v_rule.commission_excluded_addon_types, ARRAY[]::text[]))
      );
    ELSE
      v_addon := 0;
    END IF;
  ELSE
    -- LEGACY / V2：排除所有 custom addon
    SELECT COALESCE(SUM(COALESCE((elem->>'total')::numeric, 0)), 0) INTO v_addon
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(o.custom_addon_details) = 'array'
           THEN o.custom_addon_details ELSE '[]'::jsonb END
    ) AS elem;
  END IF;

  RETURN GREATEST(0, COALESCE(o.final_price, 0) - v_addon - v_onsite);
END;
$function$;