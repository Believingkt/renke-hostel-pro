-- Add meal plan pricing columns to room_types table
ALTER TABLE public.room_types
ADD COLUMN weekday_2_meals_price integer,
ADD COLUMN weekday_3_meals_price integer,
ADD COLUMN weekend_2_meals_price integer,
ADD COLUMN weekend_3_meals_price integer;

COMMENT ON COLUMN public.room_types.weekday_2_meals_price IS '平日一泊二食價格';
COMMENT ON COLUMN public.room_types.weekday_3_meals_price IS '平日一泊三食價格';
COMMENT ON COLUMN public.room_types.weekend_2_meals_price IS '假日一泊二食價格';
COMMENT ON COLUMN public.room_types.weekend_3_meals_price IS '假日一泊三食價格';