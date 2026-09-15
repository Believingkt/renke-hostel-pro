-- Remove pricing columns from room_types table
-- These will be managed exclusively through room_inventory_pricing

ALTER TABLE room_types DROP COLUMN IF EXISTS weekday_price;
ALTER TABLE room_types DROP COLUMN IF EXISTS weekend_price;
ALTER TABLE room_types DROP COLUMN IF EXISTS weekday_2_meals_price;
ALTER TABLE room_types DROP COLUMN IF EXISTS weekday_3_meals_price;
ALTER TABLE room_types DROP COLUMN IF EXISTS weekend_2_meals_price;
ALTER TABLE room_types DROP COLUMN IF EXISTS weekend_3_meals_price;