-- 創建特色說明主表
CREATE TABLE IF NOT EXISTS public.about_section (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  section_title TEXT NOT NULL DEFAULT '自然中的秘境 X 宿泊空間',
  section_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 創建特色區塊表
CREATE TABLE IF NOT EXISTS public.about_features (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon_type TEXT NOT NULL DEFAULT 'lucide',
  icon_name TEXT NOT NULL,
  icon_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 為 about_section 啟用 RLS
ALTER TABLE public.about_section ENABLE ROW LEVEL SECURITY;

-- 為 about_features 啟用 RLS
ALTER TABLE public.about_features ENABLE ROW LEVEL SECURITY;

-- about_section 的 RLS 策略
CREATE POLICY "Allow public read access to about_section"
ON public.about_section FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow authenticated users to insert their own about_section"
ON public.about_section FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update their own about_section"
ON public.about_section FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete their own about_section"
ON public.about_section FOR DELETE
TO authenticated
USING (true);

-- about_features 的 RLS 策略
CREATE POLICY "Allow public read access to about_features"
ON public.about_features FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow authenticated users to insert their own about_features"
ON public.about_features FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update their own about_features"
ON public.about_features FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete their own about_features"
ON public.about_features FOR DELETE
TO authenticated
USING (true);

-- 添加更新時間戳觸發器
CREATE TRIGGER update_about_section_updated_at
BEFORE UPDATE ON public.about_section
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_about_features_updated_at
BEFORE UPDATE ON public.about_features
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();