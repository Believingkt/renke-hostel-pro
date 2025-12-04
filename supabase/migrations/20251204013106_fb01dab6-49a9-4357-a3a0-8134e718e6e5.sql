-- Add meal_plans JSONB column for multiple meal plan entries
ALTER TABLE public.pricing_templates
ADD COLUMN IF NOT EXISTS meal_plans jsonb DEFAULT '[]'::jsonb;