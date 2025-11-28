-- Add display_order column to pricing_templates table
ALTER TABLE public.pricing_templates
ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

-- Update existing records to have sequential display_order based on created_at
WITH numbered_templates AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY accommodation_id ORDER BY created_at DESC) as rn
  FROM public.pricing_templates
)
UPDATE public.pricing_templates pt
SET display_order = nt.rn
FROM numbered_templates nt
WHERE pt.id = nt.id AND pt.display_order = 0;