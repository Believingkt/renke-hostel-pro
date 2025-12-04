-- Add project settings fields to pricing_templates table
ALTER TABLE public.pricing_templates
ADD COLUMN IF NOT EXISTS project_name text,
ADD COLUMN IF NOT EXISTS project_description text;