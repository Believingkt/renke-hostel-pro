ALTER TABLE public.order_meta
ADD COLUMN IF NOT EXISTS closer_assisted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS scout_commission_rate numeric DEFAULT 0.05,
ADD COLUMN IF NOT EXISTS closer_commission_rate numeric DEFAULT 0;