ALTER TABLE public.group_buy_campaigns
  ADD COLUMN IF NOT EXISTS cover_focus_x_mobile numeric,
  ADD COLUMN IF NOT EXISTS cover_focus_y_mobile numeric,
  ADD COLUMN IF NOT EXISTS cover_zoom numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cover_zoom_mobile numeric;