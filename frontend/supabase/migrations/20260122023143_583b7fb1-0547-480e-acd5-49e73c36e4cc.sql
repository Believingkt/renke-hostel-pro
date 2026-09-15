-- 新增更多首頁區塊顯示控制欄位
ALTER TABLE public.accommodation_info 
ADD COLUMN show_facilities_section boolean NOT NULL DEFAULT true,
ADD COLUMN show_gallery_section boolean NOT NULL DEFAULT true,
ADD COLUMN show_faq_section boolean NOT NULL DEFAULT true;