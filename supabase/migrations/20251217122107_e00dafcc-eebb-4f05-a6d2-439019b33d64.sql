-- Add is_active column to accommodation_info for disable functionality
ALTER TABLE public.accommodation_info 
ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Add comment for the column
COMMENT ON COLUMN public.accommodation_info.is_active IS 'Whether the accommodation is active (can accept bookings)';

-- Create index for faster filtering
CREATE INDEX idx_accommodation_info_is_active ON public.accommodation_info(is_active);