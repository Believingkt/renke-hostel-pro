-- Add display_order column to discount_codes table
ALTER TABLE public.discount_codes
ADD COLUMN display_order INTEGER DEFAULT 0;

-- Create index for better sorting performance
CREATE INDEX idx_discount_codes_display_order ON public.discount_codes(accommodation_id, display_order);

-- Update existing records to have sequential display_order
WITH numbered_codes AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY accommodation_id ORDER BY created_at) as row_num
  FROM public.discount_codes
)
UPDATE public.discount_codes
SET display_order = numbered_codes.row_num
FROM numbered_codes
WHERE public.discount_codes.id = numbered_codes.id;