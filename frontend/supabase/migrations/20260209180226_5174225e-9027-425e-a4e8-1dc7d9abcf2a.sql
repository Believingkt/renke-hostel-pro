
-- Add homepage_section_titles JSONB column to accommodation_info
-- Stores custom titles/subtitles for each homepage section
-- Format: { "about": { "title": "...", "subtitle": "..." }, "rooms": { ... }, ... }
ALTER TABLE public.accommodation_info
ADD COLUMN homepage_section_titles jsonb DEFAULT '{}'::jsonb;
