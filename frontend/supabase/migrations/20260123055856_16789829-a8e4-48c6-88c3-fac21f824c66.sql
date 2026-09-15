-- Add homepage sections order column to store the display order of homepage sections
-- Uses JSONB array to store section keys in order, e.g. ["about", "rooms", "facilities", "gallery", "location", "booking_info", "reviews", "faq"]
ALTER TABLE public.accommodation_info 
ADD COLUMN homepage_sections_order jsonb DEFAULT '["about", "rooms", "facilities", "gallery", "location", "booking_info", "reviews", "faq"]'::jsonb;