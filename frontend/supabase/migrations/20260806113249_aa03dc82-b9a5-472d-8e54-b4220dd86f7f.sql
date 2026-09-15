ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS show_room_facilities_whole boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_room_facilities_single boolean NOT NULL DEFAULT true;