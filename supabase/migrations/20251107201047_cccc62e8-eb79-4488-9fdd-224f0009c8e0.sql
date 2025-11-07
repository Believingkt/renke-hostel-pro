-- Add category field to room_amenities to support categorized facilities per room
ALTER TABLE public.room_amenities
ADD COLUMN IF NOT EXISTS category TEXT;