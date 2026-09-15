-- Add booking info section visibility control column
ALTER TABLE public.accommodation_info 
ADD COLUMN show_booking_info_section boolean NOT NULL DEFAULT true;