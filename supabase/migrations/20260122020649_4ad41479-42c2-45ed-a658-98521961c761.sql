-- 新增控制旅客評價區塊顯示的欄位
ALTER TABLE public.accommodation_info 
ADD COLUMN show_reviews_section boolean NOT NULL DEFAULT true;