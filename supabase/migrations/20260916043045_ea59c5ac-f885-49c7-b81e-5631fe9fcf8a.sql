-- 課程分潤：新增「手動輸入每人金額」模式
-- 新月份預設手動；既有月份維持原本的依比例自動，金額與名單不變。
-- 全部為新增欄位／政策，向後相容。

-- 1) 月份：分配方式
ALTER TABLE public.course_profit_months
  ADD COLUMN IF NOT EXISTS entry_mode text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'course_profit_months_entry_mode_chk'
  ) THEN
    ALTER TABLE public.course_profit_months
      ADD CONSTRAINT course_profit_months_entry_mode_chk
      CHECK (entry_mode IN ('manual', 'percent'));
  END IF;
END $$;

-- 既有月份沿用原本的自動計算，結果不變
UPDATE public.course_profit_months SET entry_mode = 'percent' WHERE entry_mode = 'manual';

COMMENT ON COLUMN public.course_profit_months.entry_mode IS 'manual = 逐人手動輸入金額（新月份預設）；percent = 依分潤 % 自動計算';

-- 2) 發放列：手動列標記與備註
ALTER TABLE public.course_profit_payouts
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 3) 權限：總部管理者可維護「手動列」
GRANT INSERT, UPDATE, DELETE ON public.course_profit_payouts TO authenticated;

DROP POLICY IF EXISTS "course payouts manual insert" ON public.course_profit_payouts;
CREATE POLICY "course payouts manual insert" ON public.course_profit_payouts
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_team_salary_manager()
    AND is_manual = true
    AND NOT public.course_profit_month_locked(month)
    AND EXISTS (
      SELECT 1 FROM public.course_profit_months m
      WHERE m.month = course_profit_payouts.month AND m.entry_mode = 'manual'
    )
  );

DROP POLICY IF EXISTS "course payouts manual update" ON public.course_profit_payouts;
CREATE POLICY "course payouts manual update" ON public.course_profit_payouts
  FOR UPDATE TO authenticated
  USING (
    public.is_team_salary_manager()
    AND is_manual = true
    AND NOT public.course_profit_month_locked(month)
  )
  WITH CHECK (
    public.is_team_salary_manager()
    AND is_manual = true
    AND NOT public.course_profit_month_locked(month)
  );

DROP POLICY IF EXISTS "course payouts manual delete" ON public.course_profit_payouts;
CREATE POLICY "course payouts manual delete" ON public.course_profit_payouts
  FOR DELETE TO authenticated
  USING (
    public.is_team_salary_manager()
    AND is_manual = true
    AND NOT public.course_profit_month_locked(month)
  );

-- 4) 自動計算在手動月份完全停用
CREATE OR REPLACE FUNCTION public.recalc_course_profit_payouts(_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_surplus numeric;
  v_payout date;
  v_mode text;
BEGIN
  SELECT surplus_amount, payout_month, entry_mode
    INTO v_surplus, v_payout, v_mode
  FROM public.course_profit_months WHERE month = _month;

  -- 手動月份：金額由人維護，計算完全不介入
  IF v_mode = 'manual' THEN
    RETURN;
  END IF;

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
        is_manual = false,
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
$function$;

REVOKE EXECUTE ON FUNCTION public.recalc_course_profit_payouts(date) FROM PUBLIC, anon, authenticated;

-- 5) % 版本異動：略過手動月份
CREATE OR REPLACE FUNCTION public.fn_course_profit_rates_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_from date := COALESCE(NEW.effective_from, OLD.effective_from);
  m record;
BEGIN
  FOR m IN
    SELECT month FROM public.course_profit_months
    WHERE payout_month >= v_from AND entry_mode = 'percent'
  LOOP
    PERFORM public.recalc_course_profit_payouts(m.month);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_course_profit_rates_sync() FROM PUBLIC, anon, authenticated;

-- 6) 月份異動：切換分配方式時清掉尚未發放的另一種來源列
CREATE OR REPLACE FUNCTION public.fn_course_profit_months_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.course_profit_month_locked(OLD.month) THEN
      RAISE EXCEPTION '該期課程分潤已發放，無法刪除';
    END IF;
    DELETE FROM public.course_profit_payouts p WHERE p.month = OLD.month;
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
            OR NEW.payout_month IS DISTINCT FROM OLD.payout_month
            OR NEW.entry_mode IS DISTINCT FROM OLD.entry_mode) THEN
      RAISE EXCEPTION '該期課程分潤已發放，金額與期別不可再修改';
    END IF;
    IF NEW.payout_month IS DISTINCT FROM OLD.payout_month
       AND public.course_profit_payout_period_locked(NEW.payout_month) THEN
      RAISE EXCEPTION '目標發放期別已發放，無法改掛';
    END IF;

    -- 切換分配方式：移除尚未發放、屬於舊方式的列
    IF NEW.entry_mode IS DISTINCT FROM OLD.entry_mode THEN
      DELETE FROM public.course_profit_payouts p
      WHERE p.month = NEW.month
        AND p.is_manual = (NEW.entry_mode = 'percent')
        AND NOT EXISTS (
          SELECT 1 FROM public.commission_payout_marks m
          WHERE m.source_table = 'course_profit_payouts'
            AND m.source_id = p.id
            AND m.payout_status = 'paid'
        );
    END IF;
  END IF;

  -- 手動列的 payout_month 跟著月份設定走
  IF TG_OP = 'UPDATE' AND NEW.payout_month IS DISTINCT FROM OLD.payout_month THEN
    UPDATE public.course_profit_payouts p
      SET payout_month = NEW.payout_month, updated_at = now()
    WHERE p.month = NEW.month
      AND p.is_manual = true
      AND NOT EXISTS (
        SELECT 1 FROM public.commission_payout_marks m
        WHERE m.source_table = 'course_profit_payouts'
          AND m.source_id = p.id
          AND m.payout_status = 'paid'
      );
  END IF;

  PERFORM public.recalc_course_profit_payouts(NEW.month);
  IF TG_OP = 'UPDATE' AND NEW.month IS DISTINCT FROM OLD.month THEN
    PERFORM public.recalc_course_profit_payouts(OLD.month);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_course_profit_months_sync() FROM PUBLIC, anon, authenticated;