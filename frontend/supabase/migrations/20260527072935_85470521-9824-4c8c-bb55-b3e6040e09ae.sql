
CREATE OR REPLACE FUNCTION public.check_kol_inventory(
  p_venue_name text,
  p_check_in_date date
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setting public.kol_venue_settings%ROWTYPE;
  v_weekday integer;
  v_is_special boolean;
  v_limit integer;
  v_allowed_weekdays integer[];
  v_usage integer;
  v_success integer;
  v_group_monthly_success integer;
BEGIN
  SELECT * INTO v_setting FROM public.kol_venue_settings
  WHERE venue_name = p_venue_name AND is_active = true LIMIT 1;
  IF NOT FOUND THEN RETURN '⚠️ 缺設定'; END IF;

  v_is_special := (
    v_setting.special_start IS NOT NULL AND v_setting.special_end IS NOT NULL
    AND p_check_in_date BETWEEN v_setting.special_start AND v_setting.special_end
  );

  v_limit := CASE WHEN v_is_special AND v_setting.special_limit IS NOT NULL
    THEN v_setting.special_limit ELSE v_setting.daily_limit END;
  v_allowed_weekdays := CASE WHEN v_is_special AND v_setting.special_weekdays IS NOT NULL
    THEN v_setting.special_weekdays ELSE v_setting.allowed_weekdays END;

  v_weekday := EXTRACT(DOW FROM p_check_in_date)::integer + 1;
  IF NOT (v_weekday = ANY(v_allowed_weekdays)) THEN RETURN '💰 需付費'; END IF;

  IF v_setting.calc_type = '每日' THEN
    SELECT COUNT(*) INTO v_usage FROM public.kol_profiles
    WHERE venue_name = p_venue_name AND check_in_date = p_check_in_date AND is_error = false;
    SELECT COUNT(*) INTO v_success FROM public.kol_profiles
    WHERE venue_name = p_venue_name AND check_in_date = p_check_in_date
      AND booking_status = 'booked' AND is_error = false;
  ELSE
    SELECT COUNT(*) INTO v_usage FROM public.kol_profiles
    WHERE venue_name = p_venue_name
      AND DATE_TRUNC('week', check_in_date) = DATE_TRUNC('week', p_check_in_date)
      AND is_error = false;
    SELECT COUNT(*) INTO v_success FROM public.kol_profiles
    WHERE venue_name = p_venue_name
      AND DATE_TRUNC('week', check_in_date) = DATE_TRUNC('week', p_check_in_date)
      AND booking_status = 'booked' AND is_error = false;
  END IF;

  IF v_setting.monthly_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_group_monthly_success FROM public.kol_profiles kp
    JOIN public.kol_venue_settings kvs ON kvs.venue_name = kp.venue_name
    WHERE kvs.group_name = v_setting.group_name
      AND DATE_TRUNC('month', kp.check_in_date) = DATE_TRUNC('month', p_check_in_date)
      AND kp.booking_status = 'booked' AND kp.is_error = false;

    IF v_group_monthly_success >= v_setting.monthly_limit THEN RETURN '🈵 月已滿'; END IF;
    IF v_group_monthly_success = v_setting.monthly_limit - 1 THEN RETURN '❗月 最後一個'; END IF;
    IF v_group_monthly_success = v_setting.monthly_limit - 2 THEN RETURN '🗓️月 剩兩個'; END IF;
  END IF;

  IF v_success >= v_limit THEN RETURN '🈵 已滿'; END IF;
  IF v_usage >= v_limit THEN
    RETURN CASE v_setting.calc_type WHEN '每日' THEN '當日⛔ 不可訂' ELSE '當週⛔ 不可訂' END;
  END IF;
  IF v_success = v_limit - 1 THEN RETURN '❗ 最後一間'; END IF;
  IF v_usage >= v_limit - 1 THEN RETURN '🔥 熱門'; END IF;
  RETURN '✔️ 可訂';
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_kol_inventory(text, date) TO authenticated;
