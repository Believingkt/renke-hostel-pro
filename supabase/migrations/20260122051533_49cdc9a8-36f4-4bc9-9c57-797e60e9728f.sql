-- Add about section visibility control column
ALTER TABLE public.accommodation_info 
ADD COLUMN show_about_section boolean NOT NULL DEFAULT true;