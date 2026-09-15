-- 創建加購方案設定表
CREATE TABLE IF NOT EXISTS public.addon_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id UUID NOT NULL,
  addon_type TEXT NOT NULL, -- 'pet' 或 'meal'
  enabled BOOLEAN DEFAULT true,
  price_per_unit INTEGER NOT NULL,
  min_quantity INTEGER DEFAULT 0,
  max_quantity INTEGER NOT NULL,
  weekday_min_quantity INTEGER, -- 僅餐食方案使用
  weekend_min_quantity INTEGER, -- 僅餐食方案使用
  unit_label TEXT NOT NULL, -- 單位說明，如 "隻/晚" 或 "人/日"
  description TEXT,
  detailed_description TEXT, -- 詳細說明內容
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(accommodation_id, addon_type)
);

-- 啟用 RLS
ALTER TABLE public.addon_settings ENABLE ROW LEVEL SECURITY;

-- 公開可以查看加購方案設定
CREATE POLICY "Public can view addon settings"
ON public.addon_settings
FOR SELECT
USING (true);

-- 只有管理員可以更新加購方案設定
CREATE POLICY "Only admins can update addon settings"
ON public.addon_settings
FOR UPDATE
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR 
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- 只有管理員可以新增加購方案設定
CREATE POLICY "Only admins can insert addon settings"
ON public.addon_settings
FOR INSERT
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR 
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- 只有管理員可以刪除加購方案設定
CREATE POLICY "Only admins can delete addon settings"
ON public.addon_settings
FOR DELETE
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR 
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- 創建更新時間觸發器
CREATE TRIGGER update_addon_settings_updated_at
  BEFORE UPDATE ON public.addon_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();