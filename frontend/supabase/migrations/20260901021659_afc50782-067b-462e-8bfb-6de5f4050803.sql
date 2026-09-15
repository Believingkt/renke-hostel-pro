-- ============ 課程分潤（Course Profit Share）：完全獨立的獎金線 ============

-- 1) 每月課程盈餘
CREATE TABLE public.course_profit_months (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL UNIQUE,
  surplus_amount numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid,
  created_by_email text,
  updated_by uuid,
  updated_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_profit_months TO authenticated;
GRANT ALL ON public.course_profit_months TO service_role;
ALTER TABLE public.course_profit_months ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course months read" ON public.course_profit_months
  FOR SELECT TO authenticated
  USING (public.is_team_salary_manager() OR public.user_has_team_role(auth.uid(), 'finance'::app_role));
CREATE POLICY "course months insert" ON public.course_profit_months
  FOR INSERT TO authenticated WITH CHECK (public.is_team_salary_manager());
CREATE POLICY "course months update" ON public.course_profit_months
  FOR UPDATE TO authenticated
  USING (public.is_team_salary_manager()) WITH CHECK (public.is_team_salary_manager());
CREATE POLICY "course months delete" ON public.course_profit_months
  FOR DELETE TO authenticated USING (public.is_team_salary_manager());

-- 2) 分潤 % 版本（append-only，比照成員底薪）
CREATE TABLE public.course_profit_share_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  percent numeric NOT NULL DEFAULT 0,
  effective_from date NOT NULL DEFAULT (date_trunc('month', (now() AT TIME ZONE 'Asia/Taipei')))::date,
  note text,
  created_by uuid,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, effective_from)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_profit_share_rates TO authenticated;
GRANT ALL ON public.course_profit_share_rates TO service_role;
ALTER TABLE public.course_profit_share_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course rates read" ON public.course_profit_share_rates
  FOR SELECT TO authenticated
  USING (
    public.is_team_salary_manager()
    OR public.user_has_team_role(auth.uid(), 'finance'::app_role)
    OR user_id = auth.uid()
  );
CREATE POLICY "course rates insert" ON public.course_profit_share_rates
  FOR INSERT TO authenticated WITH CHECK (public.is_team_salary_manager());
CREATE POLICY "course rates delete future" ON public.course_profit_share_rates
  FOR DELETE TO authenticated
  USING (
    public.is_team_salary_manager()
    AND effective_from > ((now() AT TIME ZONE 'Asia/Taipei')::date)
  );

-- 3) 每月每人分潤結果（由 trigger 自動維護）
CREATE TABLE public.course_profit_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL,
  user_id uuid NOT NULL,
  percent_snapshot numeric NOT NULL DEFAULT 0,
  surplus_snapshot numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (month, user_id)
);

GRANT SELECT ON public.course_profit_payouts TO authenticated;
GRANT ALL ON public.course_profit_payouts TO service_role;
ALTER TABLE public.course_profit_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course payouts read" ON public.course_profit_payouts
  FOR SELECT TO authenticated
  USING (
    public.is_team_salary_manager()
    OR public.user_has_team_role(auth.uid(), 'finance'::app_role)
    OR user_id = auth.uid()
  );

CREATE INDEX idx_course_profit_payouts_month ON public.course_profit_payouts (month);
CREATE INDEX idx_course_profit_payouts_user ON public.course_profit_payouts (user_id);

-- ============ 自動結算 ============

-- 某月是否已發放（發放管理 Tab 以 commission_payout_marks 標記）
CREATE OR REPLACE FUNCTION public.course_profit_month_locked(_month date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.commission_payout_marks m
    JOIN public.course_profit_payouts p ON p.id = m.source_id
    WHERE m.source_table = 'course_profit_payouts'
      AND m.payout_status = 'paid'
      AND p.month = _month
  );
$$;

-- 依當月盈餘 × 當月適用 % 重算該月所有列（已發放的列不改寫）
CREATE OR REPLACE FUNCTION public.recalc_course_profit_payouts(_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_surplus numeric;
BEGIN
  SELECT surplus_amount INTO v_surplus
  FROM public.course_profit_months WHERE month = _month;

  IF v_surplus IS NULL THEN
    DELETE FROM public.course_profit_payouts p
    WHERE p.month = _month
      AND NOT EXISTS (
        SELECT 1 FROM public.commission_payout_marks m
        WHERE m.source_table = 'course_profit_payouts'
          AND m.source_id = p.id
          AND m.payout_status = 'paid'
      );
    RETURN;
  END IF;

  -- 當月適用 %：每位成員 effective_from <= 該月 1 日 的最新一筆
  WITH current_rates AS (
    SELECT DISTINCT ON (r.user_id) r.user_id, r.percent
    FROM public.course_profit_share_rates r
    WHERE r.effective_from <= _month
    ORDER BY r.user_id, r.effective_from DESC
  ),
  eligible AS (
    SELECT user_id, percent FROM current_rates WHERE percent > 0
  ),
  upserted AS (
    INSERT INTO public.course_profit_payouts (month, user_id, percent_snapshot, surplus_snapshot, amount)
    SELECT _month, e.user_id, e.percent, v_surplus, round(v_surplus * e.percent / 100.0)
    FROM eligible e
    ON CONFLICT (month, user_id) DO UPDATE
      SET percent_snapshot = EXCLUDED.percent_snapshot,
          surplus_snapshot = EXCLUDED.surplus_snapshot,
          amount = EXCLUDED.amount,
          updated_at = now()
      WHERE NOT EXISTS (
        SELECT 1 FROM public.commission_payout_marks m
        WHERE m.source_table = 'course_profit_payouts'
          AND m.source_id = public.course_profit_payouts.id
          AND m.payout_status = 'paid'
      )
    RETURNING user_id
  )
  SELECT 1 FROM upserted LIMIT 1;

  -- 已不再參與（% = 0 或版本移除）且尚未發放者移除
  DELETE FROM public.course_profit_payouts p
  WHERE p.month = _month
    AND NOT EXISTS (
      SELECT 1 FROM (
        SELECT DISTINCT ON (r.user_id) r.user_id, r.percent
        FROM public.course_profit_share_rates r
        WHERE r.effective_from <= _month
        ORDER BY r.user_id, r.effective_from DESC
      ) cr
      WHERE cr.user_id = p.user_id AND cr.percent > 0
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.commission_payout_marks m
      WHERE m.source_table = 'course_profit_payouts'
        AND m.source_id = p.id
        AND m.payout_status = 'paid'
    );
END;
$$;

-- 盈餘異動：已發放月份禁止修改；否則自動重算
CREATE OR REPLACE FUNCTION public.fn_course_profit_months_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.course_profit_month_locked(OLD.month) THEN
      RAISE EXCEPTION '該月課程分潤已發放，無法刪除';
    END IF;
    PERFORM public.recalc_course_profit_payouts(OLD.month);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF public.course_profit_month_locked(OLD.month)
       AND (NEW.surplus_amount IS DISTINCT FROM OLD.surplus_amount
            OR NEW.month IS DISTINCT FROM OLD.month) THEN
      RAISE EXCEPTION '該月課程分潤已發放，盈餘金額不可再修改';
    END IF;
  END IF;

  PERFORM public.recalc_course_profit_payouts(NEW.month);
  IF TG_OP = 'UPDATE' AND NEW.month IS DISTINCT FROM OLD.month THEN
    PERFORM public.recalc_course_profit_payouts(OLD.month);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER course_profit_months_sync
AFTER INSERT OR UPDATE OR DELETE ON public.course_profit_months
FOR EACH ROW EXECUTE FUNCTION public.fn_course_profit_months_sync();

CREATE OR REPLACE FUNCTION public.fn_course_profit_months_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER course_profit_months_touch
BEFORE UPDATE ON public.course_profit_months
FOR EACH ROW EXECUTE FUNCTION public.fn_course_profit_months_touch();

-- % 版本異動：重算生效日之後（含）的所有已填月份
CREATE OR REPLACE FUNCTION public.fn_course_profit_rates_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date := COALESCE(NEW.effective_from, OLD.effective_from);
  m record;
BEGIN
  FOR m IN
    SELECT month FROM public.course_profit_months WHERE month >= v_from
  LOOP
    PERFORM public.recalc_course_profit_payouts(m.month);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER course_profit_rates_sync
AFTER INSERT OR UPDATE OR DELETE ON public.course_profit_share_rates
FOR EACH ROW EXECUTE FUNCTION public.fn_course_profit_rates_sync();