-- Add location section visibility control column
ALTER TABLE public.accommodation_info 
ADD COLUMN show_location_section boolean NOT NULL DEFAULT true;