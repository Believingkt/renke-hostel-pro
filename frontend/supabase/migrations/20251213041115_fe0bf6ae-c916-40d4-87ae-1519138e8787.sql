-- Add order_source column to orders table
ALTER TABLE public.orders 
ADD COLUMN order_source text NOT NULL DEFAULT 'website';

-- Add comment for documentation
COMMENT ON COLUMN public.orders.order_source IS 'Source of the order: website (frontend booking) or manual (backend creation)';

-- Update existing orders to have website as default (they were likely created before this field existed)
UPDATE public.orders SET order_source = 'website' WHERE order_source IS NULL;