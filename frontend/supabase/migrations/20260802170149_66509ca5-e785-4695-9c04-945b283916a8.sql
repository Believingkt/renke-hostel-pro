-- 1) 外部單：人工調整標記
ALTER TABLE public.franchise_external_orders
  ADD COLUMN IF NOT EXISTS is_manual_adjusted boolean NOT NULL DEFAULT false;

-- 2) 內部單：嚴格重算 trigger
CREATE OR REPLACE FUNCTION public.fn_franchise_orders_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate record;
  v_downline integer;
  v_leader uuid;
  v_order_date date;
  v_commission numeric;
  v_leader_rate numeric;
  v_company_rate numeric;
BEGIN
  -- 無銷售人 → 無法判定階梯，保留既有值（保護歷史匯入資料）
  IF NEW.sold_by IS NULL THEN
    RETURN NEW;
  END IF;

  v_order_date := COALESCE(NEW.sold_at, (now() AT TIME ZONE 'Asia/Taipei')::date);

  -- 版本選取：effective_from <= 訂單日期的最新一筆；若訂單早於所有版本，退回最早一筆
  SELECT * INTO v_rate
  FROM public.franchise_commission_settings
  WHERE type = 'internal' AND effective_from <= v_order_date
  ORDER BY effective_from DESC
  LIMIT 1;

  IF v_rate IS NULL THEN
    SELECT * INTO v_rate
    FROM public.franchise_commission_settings
    WHERE type = 'internal'
    ORDER BY effective_from ASC
    LIMIT 1;
  END IF;

  SELECT count(*) INTO v_downline
  FROM public.franchise_team_settings f
  WHERE f.direct_leader_id = NEW.sold_by;

  SELECT f.direct_leader_id INTO v_leader
  FROM public.franchise_team_settings f
  JOIN public.team_member_profiles p ON p.id = f.member_id
  WHERE p.user_id = NEW.sold_by
  LIMIT 1;

  -- 自己不能當自己的隊長
  IF v_leader = NEW.sold_by THEN
    v_leader := NULL;
  END IF;

  v_commission := CASE
    WHEN v_downline >= 2 THEN COALESCE(v_rate.tier2_rate, 0.13)
    WHEN v_downline = 1 THEN COALESCE(v_rate.tier1_rate, 0.11)
    ELSE COALESCE(v_rate.base_rate, 0.10)
  END;
  v_leader_rate := CASE WHEN v_leader IS NOT NULL THEN COALESCE(v_rate.leader_override_rate, 0.035) ELSE 0 END;
  v_company_rate := COALESCE(v_rate.company_rate, 0);
  -- 獨立池模型：公司提撥目前停用，維持既有前端行為
  v_company_rate := 0;

  NEW.team_leader := v_leader;
  NEW.commission_rate := v_commission;
  NEW.leader_rate := v_leader_rate;
  NEW.company_rate := v_company_rate;
  NEW.commission_amount := round(COALESCE(NEW.plan_price, 0) * v_commission);
  NEW.leader_amount := round(COALESCE(NEW.plan_price, 0) * v_leader_rate);
  NEW.company_amount := round(COALESCE(NEW.plan_price, 0) * v_company_rate);
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_franchise_orders_recalc ON public.franchise_orders;
CREATE TRIGGER trg_franchise_orders_recalc
BEFORE INSERT OR UPDATE ON public.franchise_orders
FOR EACH ROW EXECUTE FUNCTION public.fn_franchise_orders_recalc();

-- 3) 外部單：軟校驗 trigger
CREATE OR REPLACE FUNCTION public.fn_franchise_external_orders_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate record;
  v_order_date date;
  v_total numeric;
  v_sum numeric;
  v_cap_rate numeric;
  v_cap numeric;
  v_sug_sales numeric;
  v_sug_co1 numeric;
  v_sug_co2 numeric;
BEGIN
  v_order_date := COALESCE(NEW.signed_at, (now() AT TIME ZONE 'Asia/Taipei')::date);
  v_total := COALESCE(NEW.unit_count, 0) * COALESCE(NEW.plan_price, 0);

  SELECT * INTO v_rate
  FROM public.franchise_commission_settings
  WHERE type = 'external'
    AND (project_name = NEW.project_name OR project_name IS NULL)
    AND effective_from <= v_order_date
  ORDER BY (project_name = NEW.project_name) DESC, effective_from DESC
  LIMIT 1;

  IF v_rate IS NULL THEN
    SELECT * INTO v_rate
    FROM public.franchise_commission_settings
    WHERE type = 'external'
    ORDER BY effective_from ASC
    LIMIT 1;
  END IF;

  v_cap_rate := COALESCE(v_rate.sales_rate, 0.20);
  v_cap := v_total * v_cap_rate;
  v_sum := COALESCE(NEW.sales_bonus, 0) + COALESCE(NEW.co_sales_bonus, 0) + COALESCE(NEW.co_sales_bonus2, 0);

  IF v_total > 0 AND v_sum > v_cap THEN
    RAISE EXCEPTION 'FRANCHISE_BONUS_OVER_CAP: 協銷分潤總額 % 超過上限 %（訂單總額 % × %）',
      v_sum, round(v_cap), v_total, v_cap_rate
      USING ERRCODE = 'check_violation';
  END IF;

  v_sug_sales := round(v_total * COALESCE(v_rate.sales_rate, 0.20));
  v_sug_co1 := CASE WHEN COALESCE(btrim(NEW.co_sales_name), '') <> ''
    THEN round(v_total * COALESCE(v_rate.co_sales1_rate, 0.10)) ELSE 0 END;
  v_sug_co2 := CASE WHEN COALESCE(btrim(NEW.co_sales_name2), '') <> ''
    THEN round(v_total * COALESCE(v_rate.co_sales2_rate, 0.15)) ELSE 0 END;

  NEW.is_manual_adjusted := (
    COALESCE(NEW.sales_bonus, 0) <> v_sug_sales
    OR COALESCE(NEW.co_sales_bonus, 0) <> v_sug_co1
    OR COALESCE(NEW.co_sales_bonus2, 0) <> v_sug_co2
  );
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_franchise_external_orders_validate ON public.franchise_external_orders;
CREATE TRIGGER trg_franchise_external_orders_validate
BEFORE INSERT OR UPDATE ON public.franchise_external_orders
FOR EACH ROW EXECUTE FUNCTION public.fn_franchise_external_orders_validate();

-- 4) Audit log trigger（兩張表共用）
CREATE OR REPLACE FUNCTION public.fn_franchise_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_old jsonb;
  v_new jsonb;
  k text;
  v_user uuid;
BEGIN
  v_user := COALESCE(auth.uid(), NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid);
  v_new := to_jsonb(NEW);

  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      IF k IN ('updated_at') THEN CONTINUE; END IF;
      IF v_new -> k IS DISTINCT FROM v_old -> k THEN
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_object('old', v_old -> k, 'new', v_new -> k));
      END IF;
    END LOOP;
    IF v_changes = '{}'::jsonb THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (user_id, action_type, action_category, entity_type, entity_id, entity_name, details)
  VALUES (
    v_user,
    CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'update' END,
    'system',
    TG_TABLE_NAME,
    NEW.id::text,
    COALESCE(v_new ->> 'customer_name', NEW.id::text),
    jsonb_build_object(
      'source', 'db_trigger',
      'op', TG_OP,
      'changes', CASE WHEN TG_OP = 'INSERT' THEN v_new ELSE v_changes END
    )
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_franchise_orders_audit ON public.franchise_orders;
CREATE TRIGGER trg_franchise_orders_audit
AFTER INSERT OR UPDATE ON public.franchise_orders
FOR EACH ROW EXECUTE FUNCTION public.fn_franchise_audit_log();

DROP TRIGGER IF EXISTS trg_franchise_external_orders_audit ON public.franchise_external_orders;
CREATE TRIGGER trg_franchise_external_orders_audit
AFTER INSERT OR UPDATE ON public.franchise_external_orders
FOR EACH ROW EXECUTE FUNCTION public.fn_franchise_audit_log();