DELETE FROM public.scout_team_targets
WHERE id NOT IN (
  SELECT DISTINCT ON (year, month, venue_name) id
  FROM public.scout_team_targets
  ORDER BY year, month, venue_name, created_at DESC
);