
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS gender text DEFAULT NULL;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS nationality text DEFAULT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS guest_gender text DEFAULT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS guest_nationality text DEFAULT NULL;
