-- Add social media URL columns to accommodation_info table
ALTER TABLE public.accommodation_info 
ADD COLUMN IF NOT EXISTS threads_url text,
ADD COLUMN IF NOT EXISTS youtube_url text,
ADD COLUMN IF NOT EXISTS tiktok_url text;