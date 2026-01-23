-- Remove unused percentage columns from split_rules
ALTER TABLE split_rules DROP COLUMN IF EXISTS hq_percentage;
ALTER TABLE split_rules DROP COLUMN IF EXISTS accommodation_percentage;

-- Remove unused percentage columns from split_records
ALTER TABLE split_records DROP COLUMN IF EXISTS hq_percentage;
ALTER TABLE split_records DROP COLUMN IF EXISTS accommodation_percentage;