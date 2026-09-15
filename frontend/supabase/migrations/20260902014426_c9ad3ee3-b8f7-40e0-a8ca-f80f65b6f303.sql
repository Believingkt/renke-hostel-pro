ALTER TABLE public.group_buy_campaigns
ADD COLUMN IF NOT EXISTS show_line_inquiry_button boolean NOT NULL DEFAULT true;