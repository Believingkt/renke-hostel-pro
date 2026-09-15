-- 在 accommodation_info 表中新增輪播圖全局設定欄位
ALTER TABLE public.accommodation_info
ADD COLUMN IF NOT EXISTS hero_overlay_opacity INTEGER DEFAULT 40,
ADD COLUMN IF NOT EXISTS hero_autoplay_delay INTEGER DEFAULT 8;

COMMENT ON COLUMN public.accommodation_info.hero_overlay_opacity IS '輪播圖背景遮罩透明度 (0-100)';
COMMENT ON COLUMN public.accommodation_info.hero_autoplay_delay IS '輪播圖自動播放延遲秒數';