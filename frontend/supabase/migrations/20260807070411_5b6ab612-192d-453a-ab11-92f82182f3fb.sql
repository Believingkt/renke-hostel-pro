ALTER TABLE public.accommodation_info ADD COLUMN IF NOT EXISTS partnership_start_date date;

COMMENT ON COLUMN public.accommodation_info.partnership_start_date IS '館別正式合作生效日；未設定者不計入任何團隊獎金採計';

UPDATE public.accommodation_info a
SET partnership_start_date = sub.min_eff
FROM (
  SELECT accommodation_id, MIN(effective_from) AS min_eff
  FROM public.teamcommission_venue_closing_assignments
  GROUP BY accommodation_id
) sub
WHERE a.id = sub.accommodation_id
  AND a.partnership_start_date IS NULL;