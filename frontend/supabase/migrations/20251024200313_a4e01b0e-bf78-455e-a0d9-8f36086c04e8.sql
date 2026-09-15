-- 創建交通與地圖資訊表
CREATE TABLE IF NOT EXISTS public.location_info (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID,
  location_description TEXT,
  driving_info TEXT,
  public_transport_info TEXT,
  airport_pickup_info TEXT,
  nearby_attractions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 啟用 RLS
ALTER TABLE public.location_info ENABLE ROW LEVEL SECURITY;

-- 允許公開查看
CREATE POLICY "Public can view location info"
ON public.location_info
FOR SELECT
USING (true);

-- 允許已認證用戶更新
CREATE POLICY "Authenticated users can update location info"
ON public.location_info
FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- 允許已認證用戶插入
CREATE POLICY "Authenticated users can insert location info"
ON public.location_info
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- 創建更新時間觸發器
CREATE TRIGGER update_location_info_updated_at
BEFORE UPDATE ON public.location_info
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();