ALTER TABLE public.course_profit_months
  ADD COLUMN payout_month date NOT NULL,
  ADD CONSTRAINT course_profit_months_payout_month_first_day CHECK (EXTRACT(DAY FROM payout_month) = 1);

ALTER TABLE public.course_profit_payouts
  ADD COLUMN payout_month date NOT NULL;

CREATE INDEX IF NOT EXISTS idx_course_profit_payouts_payout_month ON public.course_profit_payouts (payout_month);
CREATE INDEX IF NOT EXISTS idx_course_profit_months_payout_month ON public.course_profit_months (payout_month);

-- 期別是否已發放
CREATE OR REPLACE FUNCTION public.course_profit_payout_period_locked(_payout_month date)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.commission_payout_marks m
    JOIN public.course_profit_payouts p ON p.id = m.source_id
    WHERE m.source_table = 'course_profit_payouts'
      AND m.payout_status = 'paid'
      AND p.payout_month = _payout_month
  );
$$;

-- 重算：以發放期別取分潤 % 版本，金額 = 該資料月盈餘 × %
CREATE OR REPLACE FUNCTION public.recalc_course_profit_payouts(_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_surplus numeric;
  v_payout date;
BEGIN
  SELECT surplus_amount, payout_month INTO v_surplus, v_payout
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

  WITH current_rates AS (
    SELECT DISTINCT ON (r.user_id) r.user_id, r.percent
    FROM public.course_profit_share_rates r
    WHERE r.effective_from <= v_payout
    ORDER BY r.user_id, r.effective_from DESC
  ),
  eligible AS (
    SELECT user_id, percent FROM current_rates WHERE percent > 0
  )
  INSERT INTO public.course_profit_payouts (month, payout_month, user_id, percent_snapshot, surplus_snapshot, amount)
  SELECT _month, v_payout, e.user_id, e.percent, v_surplus, round(v_surplus * e.percent / 100.0)
  FROM eligible e
  ON CONFLICT (month, user_id) DO UPDATE
    SET percent_snapshot = EXCLUDED.percent_snapshot,
        surplus_snapshot = EXCLUDED.surplus_snapshot,
        payout_month = EXCLUDED.payout_month,
        amount = EXCLUDED.amount,
        updated_at = now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.commission_payout_marks m
      WHERE m.source_table = 'course_profit_payouts'
        AND m.source_id = public.course_profit_payouts.id
        AND m.payout_status = 'paid'
    );

  DELETE FROM public.course_profit_payouts p
  WHERE p.month = _month
    AND NOT EXISTS (
      SELECT 1 FROM (
        SELECT DISTINCT ON (r.user_id) r.user_id, r.percent
        FROM public.course_profit_share_rates r
        WHERE r.effective_from <= v_payout
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

-- 盈餘列異動守則
CREATE OR REPLACE FUNCTION public.fn_course_profit_months_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.course_profit_month_locked(OLD.month) THEN
      RAISE EXCEPTION '該期課程分潤已發放，無法刪除';
    END IF;
    PERFORM public.recalc_course_profit_payouts(OLD.month);
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF public.course_profit_payout_period_locked(NEW.payout_month) THEN
      RAISE EXCEPTION '該發放期別已發放，無法再新增盈餘月份';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF public.course_profit_month_locked(OLD.month)
       AND (NEW.surplus_amount IS DISTINCT FROM OLD.surplus_amount
            OR NEW.month IS DISTINCT FROM OLD.month
            OR NEW.payout_month IS DISTINCT FROM OLD.payout_month) THEN
      RAISE EXCEPTION '該期課程分潤已發放，金額與期別不可再修改';
    END IF;
    IF NEW.payout_month IS DISTINCT FROM OLD.payout_month
       AND public.course_profit_payout_period_locked(NEW.payout_month) THEN
      RAISE EXCEPTION '目標發放期別已發放，無法改掛';
    END IF;
  END IF;

  PERFORM public.recalc_course_profit_payouts(NEW.month);
  IF TG_OP = 'UPDATE' AND NEW.month IS DISTINCT FROM OLD.month THEN
    PERFORM public.recalc_course_profit_payouts(OLD.month);
  END IF;
  RETURN NEW;
END;
$$;

-- 分潤 % 版本異動 → 重算所有「發放期別 >= 生效日」的盈餘列
CREATE OR REPLACE FUNCTION public.fn_course_profit_rates_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from date := COALESCE(NEW.effective_from, OLD.effective_from);
  m record;
BEGIN
  FOR m IN
    SELECT month FROM public.course_profit_months WHERE payout_month >= v_from
  LOOP
    PERFORM public.recalc_course_profit_payouts(m.month);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;