ALTER TABLE public.accommodation_info ADD COLUMN IF NOT EXISTS building_count integer NOT NULL DEFAULT 1;

-- Set known counts based on current data
UPDATE public.accommodation_info SET building_count = 1 WHERE name IN ('森山寫照', '哈庫納馬塔塔', '奧莉薇雅生活小酒店');
UPDATE public.accommodation_info SET building_count = 7 WHERE name = '雲岫海景度假會館';