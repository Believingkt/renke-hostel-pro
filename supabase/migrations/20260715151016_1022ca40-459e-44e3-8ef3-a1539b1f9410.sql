
-- 一、新增 kol_venue_monthly_limits 表
CREATE TABLE public.kol_venue_monthly_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.kol_venues(id) ON DELETE CASCADE,
  year_month text NOT NULL CHECK (year_month ~ '^\d{4}-\d{2}$'),
  monthly_limit integer NOT NULL,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, year_month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kol_venue_monthly_limits TO authenticated;
GRANT ALL ON public.kol_venue_monthly_limits TO service_role;

ALTER TABLE public.kol_venue_monthly_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kvml_select_authenticated"
  ON public.kol_venue_monthly_limits FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "kvml_insert_managers"
  ON public.kol_venue_monthly_limits FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_has_team_role(auth.uid(), 'hotel_admin')
    OR public.user_has_team_role(auth.uid(), 'super_admin')
    OR public.user_has_team_role(auth.uid(), 'scout_manager')
  );

CREATE POLICY "kvml_update_managers"
  ON public.kol_venue_monthly_limits FOR UPDATE
  TO authenticated
  USING (
    public.user_has_team_role(auth.uid(), 'hotel_admin')
    OR public.user_has_team_role(auth.uid(), 'super_admin')
    OR public.user_has_team_role(auth.uid(), 'scout_manager')
  )
  WITH CHECK (
    public.user_has_team_role(auth.uid(), 'hotel_admin')
    OR public.user_has_team_role(auth.uid(), 'super_admin')
    OR public.user_has_team_role(auth.uid(), 'scout_manager')
  );

CREATE POLICY "kvml_delete_managers"
  ON public.kol_venue_monthly_limits FOR DELETE
  TO authenticated
  USING (
    public.user_has_team_role(auth.uid(), 'hotel_admin')
    OR public.user_has_team_role(auth.uid(), 'super_admin')
    OR public.user_has_team_role(auth.uid(), 'scout_manager')
  );

CREATE TRIGGER trg_kvml_updated_at
  BEFORE UPDATE ON public.kol_venue_monthly_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 二、新版 check_kol_inventory（venue_id 版本）
CREATE OR REPLACE FUNCTION public.check_kol_inventory(p_venue_id uuid, p_check_in_date date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_setting public.kol_venue_settings%ROWTYPE;
  v_weekday integer;
  v_is_special boolean;
  v_limit integer;
  v_allowed_weekdays integer[];
  v_usage integer;
  v_success integer;
  v_group_monthly_success integer;
  v_month_override public.kol_venue_monthly_limits%ROWTYPE;
  v_effective_monthly_limit integer;
  v_use_override boolean := false;
BEGIN
  SELECT * INTO v_setting FROM public.kol_venue_settings
  WHERE venue_id = p_venue_id AND is_active = true LIMIT 1;
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
    WHERE venue_id = p_venue_id AND check_in_date = p_check_in_date AND is_error = false;
    SELECT COUNT(*) INTO v_success FROM public.kol_profiles
    WHERE venue_id = p_venue_id AND check_in_date = p_check_in_date
      AND booking_status = '成功訂房' AND is_error = false;
  ELSE
    SELECT COUNT(*) INTO v_usage FROM public.kol_profiles
    WHERE venue_id = p_venue_id
      AND DATE_TRUNC('week', check_in_date) = DATE_TRUNC('week', p_check_in_date)
      AND is_error = false;
    SELECT COUNT(*) INTO v_success FROM public.kol_profiles
    WHERE venue_id = p_venue_id
      AND DATE_TRUNC('week', check_in_date) = DATE_TRUNC('week', p_check_in_date)
      AND booking_status = '成功訂房' AND is_error = false;
  END IF;

  -- 兩層 fallback：先看該場域是否有當月覆寫，否則用設定的 monthly_limit
  SELECT * INTO v_month_override FROM public.kol_venue_monthly_limits
  WHERE venue_id = p_venue_id
    AND year_month = TO_CHAR(p_check_in_date, 'YYYY-MM')
  LIMIT 1;

  IF FOUND THEN
    v_use_override := true;
    v_effective_monthly_limit := v_month_override.monthly_limit;
    IF v_effective_monthly_limit = 0 THEN
      RETURN '🈵 月已滿';
    END IF;
  ELSE
    v_effective_monthly_limit := v_setting.monthly_limit;
  END IF;

  IF v_effective_monthly_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_group_monthly_success FROM public.kol_profiles kp
    JOIN public.kol_venue_settings kvs ON kvs.venue_id = kp.venue_id
    WHERE kvs.group_name = v_setting.group_name
      AND DATE_TRUNC('month', kp.check_in_date) = DATE_TRUNC('month', p_check_in_date)
      AND kp.booking_status = '成功訂房' AND kp.is_error = false;

    IF v_group_monthly_success >= v_effective_monthly_limit THEN RETURN '🈵 月已滿'; END IF;
    IF v_group_monthly_success = v_effective_monthly_limit - 1 THEN RETURN '❗月 最後一個'; END IF;
    IF v_group_monthly_success = v_effective_monthly_limit - 2 THEN RETURN '🗓️月 剩兩個'; END IF;
  END IF;

  IF v_success >= v_limit THEN RETURN '🈵 已滿'; END IF;
  IF v_usage >= v_limit THEN
    RETURN CASE v_setting.calc_type WHEN '每日' THEN '當日⛔ 不可訂' ELSE '當週⛔ 不可訂' END;
  END IF;
  IF v_success = v_limit - 1 THEN RETURN '❗ 最後一間'; END IF;
  IF v_usage >= v_limit - 1 THEN RETURN '🔥 熱門'; END IF;
  RETURN '✔️ 可訂';
END;
$function$;

-- 舊版函數改為 delegate 到新版
CREATE OR REPLACE FUNCTION public.check_kol_inventory(p_venue_name text, p_check_in_date date)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_venue_id uuid;
BEGIN
  SELECT id INTO v_venue_id FROM public.kol_venues WHERE name = p_venue_name LIMIT 1;
  IF v_venue_id IS NULL THEN RETURN '⚠️ 缺設定'; END IF;
  RETURN public.check_kol_inventory(v_venue_id, p_check_in_date);
END;
$function$;

COMMENT ON FUNCTION public.check_kol_inventory(text, date)
IS '過渡期保留，待前端全數改用 venue_id 版本後移除';
