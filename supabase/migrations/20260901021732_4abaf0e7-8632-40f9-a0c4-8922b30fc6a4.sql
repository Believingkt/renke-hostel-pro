REVOKE EXECUTE ON FUNCTION public.recalc_course_profit_payouts(date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.course_profit_month_locked(date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_course_profit_months_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_course_profit_rates_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_course_profit_months_touch() FROM PUBLIC, anon, authenticated;