ALTER TABLE public.order_meta
ADD COLUMN IF NOT EXISTS franchise_project text,
ADD COLUMN IF NOT EXISTS member_number text;