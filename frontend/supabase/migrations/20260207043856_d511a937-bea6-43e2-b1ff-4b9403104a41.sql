-- 建立訂房須知動態區塊資料表
CREATE TABLE public.booking_info_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  section_title text NOT NULL,
  section_subtitle text,
  section_content text,
  display_order integer NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 啟用 RLS
ALTER TABLE public.booking_info_sections ENABLE ROW LEVEL SECURITY;

-- RLS 政策：公開可讀
CREATE POLICY "Public can view booking info sections"
ON public.booking_info_sections
FOR SELECT
USING (is_enabled = true);

-- RLS 政策：管理員可管理
CREATE POLICY "Admins can manage booking info sections"
ON public.booking_info_sections
FOR ALL
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR 
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
)
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR 
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- 建立索引
CREATE INDEX idx_booking_info_sections_accommodation ON public.booking_info_sections(accommodation_id);
CREATE INDEX idx_booking_info_sections_order ON public.booking_info_sections(accommodation_id, display_order);

-- 建立更新時間觸發器
CREATE TRIGGER update_booking_info_sections_updated_at
  BEFORE UPDATE ON public.booking_info_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();