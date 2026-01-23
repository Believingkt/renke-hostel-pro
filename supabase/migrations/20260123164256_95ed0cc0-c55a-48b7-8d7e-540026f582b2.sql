-- 新增獨立的 SEO 標題和描述欄位
ALTER TABLE public.accommodation_info 
ADD COLUMN seo_title TEXT,
ADD COLUMN seo_description TEXT;

-- 將現有的 og_title 和 og_description 值複製到新欄位作為初始值
UPDATE public.accommodation_info 
SET seo_title = og_title, 
    seo_description = og_description 
WHERE og_title IS NOT NULL OR og_description IS NOT NULL;