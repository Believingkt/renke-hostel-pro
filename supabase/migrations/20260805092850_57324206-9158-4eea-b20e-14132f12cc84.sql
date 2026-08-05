ALTER TABLE public.teamcommission_bonus_rate_settings
  DROP CONSTRAINT teamcommission_bonus_rate_settings_bonus_type_check;

ALTER TABLE public.teamcommission_bonus_rate_settings
  ADD CONSTRAINT teamcommission_bonus_rate_settings_bonus_type_check
  CHECK (bonus_type = ANY (ARRAY[
    'am_performance'::text,
    'closer_performance'::text,
    'am_manager'::text,
    'closer_manager'::text,
    'kol_commission'::text,
    'kol_monthly'::text,
    'venue_closing'::text,
    'am_venue_bonus'::text
  ]));