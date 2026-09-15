CREATE OR REPLACE FUNCTION public.recalc_course_profit_payouts(_month date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  WITH current_rates AS (
    SELECT DISTINCT ON (r.user_id) r.user_id, r.percent
    FROM public.course_profit_share_rates r
    WHERE r.effective_from <= _month
    ORDER BY r.user_id, r.effective_from DESC
  ),
  eligible AS (
    SELECT user_id, percent FROM current_rates WHERE percent > 0
  )
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
    );

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
$function$;