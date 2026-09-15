ALTER TABLE public.group_buy_campaign_packages
  ADD COLUMN IF NOT EXISTS show_room_type_display boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS room_type_display_text text NULL;

COMMENT ON COLUMN public.group_buy_campaign_packages.show_room_type_display IS '團購頁是否顯示「入住房型」固定文字（純顯示，客人不可選）';
COMMENT ON COLUMN public.group_buy_campaign_packages.room_type_display_text IS '團購頁「入住房型」固定顯示文字，純 display content，不參與庫存/計價/房型指派';
COMMENT ON COLUMN public.group_buy_campaign_packages.show_room_type_selector IS 'DEPRECATED：舊的房型選擇器開關，已停用，請改用 show_room_type_display';