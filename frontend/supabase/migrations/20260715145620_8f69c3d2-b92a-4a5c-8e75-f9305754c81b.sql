
-- 1. Add venue_id columns
ALTER TABLE public.kol_profiles
  ADD COLUMN venue_id uuid REFERENCES public.kol_venues(id) ON DELETE SET NULL;
ALTER TABLE public.kol_venue_settings
  ADD COLUMN venue_id uuid REFERENCES public.kol_venues(id) ON DELETE SET NULL;
ALTER TABLE public.kol_venue_link_rules
  ADD COLUMN venue_id uuid REFERENCES public.kol_venues(id) ON DELETE SET NULL;
ALTER TABLE public.scout_team_targets
  ADD COLUMN venue_id uuid REFERENCES public.kol_venues(id) ON DELETE SET NULL;
ALTER TABLE public.scout_fulltime_targets
  ADD COLUMN venue_id uuid REFERENCES public.kol_venues(id) ON DELETE SET NULL;

-- 2. Swap UNIQUE constraints
ALTER TABLE public.kol_venue_link_rules
  DROP CONSTRAINT kol_venue_link_rules_venue_name_key;
ALTER TABLE public.kol_venue_link_rules
  ADD CONSTRAINT kol_venue_link_rules_venue_id_key UNIQUE (venue_id);

ALTER TABLE public.scout_fulltime_targets
  DROP CONSTRAINT scout_fulltime_targets_year_month_venue_name_key;
ALTER TABLE public.scout_fulltime_targets
  ADD CONSTRAINT scout_fulltime_targets_year_month_venue_id_key UNIQUE (year, month, venue_id);

-- 3. Deprecation comments on legacy venue_name columns
COMMENT ON COLUMN public.kol_profiles.venue_name IS '已棄用，僅供歷史查證，禁止讀寫，所有新邏輯使用 venue_id';
COMMENT ON COLUMN public.kol_venue_settings.venue_name IS '已棄用，僅供歷史查證，禁止讀寫，所有新邏輯使用 venue_id';
COMMENT ON COLUMN public.kol_venue_link_rules.venue_name IS '已棄用，僅供歷史查證，禁止讀寫，所有新邏輯使用 venue_id';
COMMENT ON COLUMN public.scout_team_targets.venue_name IS '已棄用，僅供歷史查證，禁止讀寫，所有新邏輯使用 venue_id';
COMMENT ON COLUMN public.scout_fulltime_targets.venue_name IS '已棄用，僅供歷史查證，禁止讀寫，所有新邏輯使用 venue_id';
