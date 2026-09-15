-- 創建價格模板表
CREATE TABLE IF NOT EXISTS public.pricing_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  description TEXT,
  weekday_price INTEGER NOT NULL,
  weekend_price INTEGER NOT NULL,
  weekday_2_meals_price INTEGER,
  weekday_3_meals_price INTEGER,
  weekend_2_meals_price INTEGER,
  weekend_3_meals_price INTEGER,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 創建索引
CREATE INDEX idx_pricing_templates_accommodation ON public.pricing_templates(accommodation_id);

-- 啟用 RLS
ALTER TABLE public.pricing_templates ENABLE ROW LEVEL SECURITY;

-- RLS 政策：公開讀取
CREATE POLICY "Public can view pricing templates"
  ON public.pricing_templates
  FOR SELECT
  USING (true);

-- RLS 政策：只有管理員可以新增
CREATE POLICY "Only admins can insert pricing templates"
  ON public.pricing_templates
  FOR INSERT
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin') 
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin')
  );

-- RLS 政策：只有管理員可以更新
CREATE POLICY "Only admins can update pricing templates"
  ON public.pricing_templates
  FOR UPDATE
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin') 
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin')
  );

-- RLS 政策：只有管理員可以刪除
CREATE POLICY "Only admins can delete pricing templates"
  ON public.pricing_templates
  FOR DELETE
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin') 
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin')
  );

-- 創建更新 updated_at 的觸發器
CREATE TRIGGER update_pricing_templates_updated_at_trigger
  BEFORE UPDATE ON public.pricing_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();