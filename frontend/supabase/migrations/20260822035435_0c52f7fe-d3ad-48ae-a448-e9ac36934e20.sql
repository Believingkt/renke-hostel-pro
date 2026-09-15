ALTER TABLE public.group_buy_campaigns
  ADD COLUMN IF NOT EXISTS cover_focus_x numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS cover_focus_y numeric NOT NULL DEFAULT 50;