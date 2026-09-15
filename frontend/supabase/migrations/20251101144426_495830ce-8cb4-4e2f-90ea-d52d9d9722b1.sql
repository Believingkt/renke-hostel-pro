-- Add new columns to room_types table
ALTER TABLE public.room_types 
ADD COLUMN IF NOT EXISTS room_count integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS weekday_price integer,
ADD COLUMN IF NOT EXISTS weekend_price integer;

-- Update existing records to use base_price as weekday_price if not set
UPDATE public.room_types 
SET weekday_price = base_price 
WHERE weekday_price IS NULL;

UPDATE public.room_types 
SET weekend_price = base_price 
WHERE weekend_price IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.room_types.room_count IS '此房型的房間數量';
COMMENT ON COLUMN public.room_types.weekday_price IS '平日價格（週日至週四）';
COMMENT ON COLUMN public.room_types.weekend_price IS '假日價格（週五、週六及國定假日）';