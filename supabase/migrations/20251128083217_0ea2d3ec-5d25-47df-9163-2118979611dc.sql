-- Add holiday_type column to public_holidays table to distinguish between regular holidays, compensatory days off, and work-on-weekend days
ALTER TABLE public.public_holidays 
ADD COLUMN holiday_type text NOT NULL DEFAULT 'holiday' CHECK (holiday_type IN ('holiday', 'compensatory_day_off', 'work_on_weekend'));

COMMENT ON COLUMN public.public_holidays.holiday_type IS 'Type of holiday: holiday (假日), compensatory_day_off (補休), work_on_weekend (補班)';
