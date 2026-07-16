
ALTER TABLE public.line_push_targets
  ADD COLUMN IF NOT EXISTS custom_venue_ids uuid[] NOT NULL DEFAULT '{}';

-- Backfill from custom_venue_names via kol_venues.name lookup
UPDATE public.line_push_targets t
SET custom_venue_ids = COALESCE(sub.ids, '{}'::uuid[])
FROM (
  SELECT t2.id AS row_id,
         array_agg(DISTINCT v.id) FILTER (WHERE v.id IS NOT NULL) AS ids
  FROM public.line_push_targets t2
  LEFT JOIN public.kol_venues v ON v.name = ANY(t2.custom_venue_names)
  WHERE t2.custom_venue_names IS NOT NULL
    AND array_length(t2.custom_venue_names, 1) > 0
  GROUP BY t2.id
) sub
WHERE t.id = sub.row_id;

COMMENT ON COLUMN public.line_push_targets.custom_venue_names IS 'DEPRECATED: 請改用 custom_venue_ids（uuid[] 對應 kol_venues.id）。保留為過渡期 fallback。';
COMMENT ON COLUMN public.line_push_targets.custom_venue_ids IS '自訂館別 kol_venues.id 陣列，取代 custom_venue_names。';
