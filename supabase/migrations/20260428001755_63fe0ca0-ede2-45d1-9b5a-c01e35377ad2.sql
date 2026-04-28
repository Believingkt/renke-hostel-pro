-- Add a case-insensitive unique index on short_url_alias (excluding NULL/empty)
CREATE UNIQUE INDEX IF NOT EXISTS accommodation_info_short_url_alias_unique
ON public.accommodation_info (LOWER(short_url_alias))
WHERE short_url_alias IS NOT NULL AND short_url_alias <> '';