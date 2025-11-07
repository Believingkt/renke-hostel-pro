-- Add other_notes column to booking_settings table
ALTER TABLE public.booking_settings
ADD COLUMN other_notes TEXT;