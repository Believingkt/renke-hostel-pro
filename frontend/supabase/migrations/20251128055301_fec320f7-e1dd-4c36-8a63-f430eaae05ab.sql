-- 創建價格模板套用記錄表
CREATE TABLE public.pricing_template_applications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL,
  accommodation_id UUID NOT NULL,
  applied_by UUID,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  selected_days JSONB NOT NULL DEFAULT '[]'::jsonb,
  room_type_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  price_type TEXT NOT NULL CHECK (price_type IN ('2meals', '3meals')),
  available_rooms INTEGER NOT NULL,
  affected_dates_count INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 添加外鍵約束
ALTER TABLE public.pricing_template_applications
  ADD CONSTRAINT pricing_template_applications_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES public.pricing_templates(id) ON DELETE CASCADE;

ALTER TABLE public.pricing_template_applications
  ADD CONSTRAINT pricing_template_applications_accommodation_id_fkey
  FOREIGN KEY (accommodation_id) REFERENCES public.accommodation_info(id) ON DELETE CASCADE;

-- 創建索引以提升查詢效能
CREATE INDEX idx_pricing_template_applications_template_id 
  ON public.pricing_template_applications(template_id);

CREATE INDEX idx_pricing_template_applications_accommodation_id 
  ON public.pricing_template_applications(accommodation_id);

CREATE INDEX idx_pricing_template_applications_applied_at 
  ON public.pricing_template_applications(applied_at DESC);

-- 啟用 RLS
ALTER TABLE public.pricing_template_applications ENABLE ROW LEVEL SECURITY;

-- RLS 政策：只有管理員可以查看套用記錄
CREATE POLICY "Only admins can view template applications"
  ON public.pricing_template_applications
  FOR SELECT
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) 
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );

-- RLS 政策：只有管理員可以插入套用記錄
CREATE POLICY "Only admins can insert template applications"
  ON public.pricing_template_applications
  FOR INSERT
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) 
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );

-- RLS 政策：只有管理員可以刪除套用記錄
CREATE POLICY "Only admins can delete template applications"
  ON public.pricing_template_applications
  FOR DELETE
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) 
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  );

-- 添加註解
COMMENT ON TABLE public.pricing_template_applications IS '價格模板套用記錄表，記錄每次套用價格模板的詳細資訊';
COMMENT ON COLUMN public.pricing_template_applications.template_id IS '套用的價格模板 ID';
COMMENT ON COLUMN public.pricing_template_applications.applied_by IS '套用操作的用戶 ID';
COMMENT ON COLUMN public.pricing_template_applications.selected_days IS '選擇的星期（0-6）';
COMMENT ON COLUMN public.pricing_template_applications.room_type_ids IS '套用到的房型 ID 列表';
COMMENT ON COLUMN public.pricing_template_applications.price_type IS '套用的價格類型（2meals 或 3meals）';
COMMENT ON COLUMN public.pricing_template_applications.affected_dates_count IS '受影響的日期數量';