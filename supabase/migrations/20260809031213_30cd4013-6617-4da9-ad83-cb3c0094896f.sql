ALTER TABLE public.accommodation_info
ADD COLUMN IF NOT EXISTS show_on_portal boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.accommodation_info.show_on_portal IS '是否在前台（訂房入口/搜尋結果）顯示，關閉後僅供後台使用';