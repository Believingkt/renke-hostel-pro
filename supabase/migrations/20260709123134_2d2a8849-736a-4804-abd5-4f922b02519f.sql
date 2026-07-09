
ALTER TABLE public.bonus_multiplier_settings ADD COLUMN IF NOT EXISTS start_month text;
ALTER TABLE public.bonus_multiplier_settings ADD COLUMN IF NOT EXISTS end_month text;

UPDATE public.bonus_multiplier_settings
SET start_month = COALESCE(start_month, to_char(start_date, 'YYYY-MM')),
    end_month   = COALESCE(end_month,   to_char(end_date,   'YYYY-MM'))
WHERE start_month IS NULL OR end_month IS NULL;

ALTER TABLE public.bonus_multiplier_settings ALTER COLUMN start_month SET NOT NULL;
ALTER TABLE public.bonus_multiplier_settings ALTER COLUMN end_month SET NOT NULL;

ALTER TABLE public.bonus_multiplier_settings DROP COLUMN IF EXISTS start_date;
ALTER TABLE public.bonus_multiplier_settings DROP COLUMN IF EXISTS end_date;
ALTER TABLE public.bonus_multiplier_settings DROP COLUMN IF EXISTS is_active;
