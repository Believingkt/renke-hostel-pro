-- Add rooms section visibility control column
ALTER TABLE public.accommodation_info 
ADD COLUMN show_rooms_section boolean NOT NULL DEFAULT true;