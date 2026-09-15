-- Add pet_policy column to booking_settings table
ALTER TABLE public.booking_settings
ADD COLUMN pet_policy TEXT;