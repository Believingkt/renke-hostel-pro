CREATE UNIQUE INDEX IF NOT EXISTS scout_team_targets_year_month_venue_uidx
  ON public.scout_team_targets (year, month, venue_id);