-- Dedup existing rows then add unique constraint to support upsert
DELETE FROM public.scout_fulltime_targets a
USING public.scout_fulltime_targets b
WHERE a.ctid < b.ctid
  AND a.year = b.year
  AND a.month = b.month
  AND a.venue_name = b.venue_name;

ALTER TABLE public.scout_fulltime_targets
  ADD CONSTRAINT scout_fulltime_targets_year_month_venue_name_key
  UNIQUE (year, month, venue_name);