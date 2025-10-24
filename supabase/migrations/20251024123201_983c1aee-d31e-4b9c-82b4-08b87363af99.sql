-- 旅宿基本資訊表
CREATE TABLE public.accommodation_info (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  total_rooms INTEGER,
  registration_number TEXT,
  star_rating TEXT,
  website_url TEXT,
  short_url_alias TEXT,
  description TEXT,
  check_in_notice TEXT,
  country TEXT DEFAULT '台灣',
  region_1 TEXT,
  region_2 TEXT,
  address TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 旅宿照片表
CREATE TABLE public.accommodation_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 房型資訊表
CREATE TABLE public.room_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_en TEXT,
  description TEXT,
  capacity INTEGER NOT NULL,
  size_sqm INTEGER,
  base_price INTEGER NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 房型照片表
CREATE TABLE public.room_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_type_id UUID REFERENCES public.room_types(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 房型設施表
CREATE TABLE public.room_amenities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_type_id UUID REFERENCES public.room_types(id) ON DELETE CASCADE,
  amenity_name TEXT NOT NULL,
  amenity_icon TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 旅宿設施與服務表
CREATE TABLE public.accommodation_facilities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  category TEXT NOT NULL, -- 'public', 'dining', 'safety', 'recreation'
  facility_name TEXT NOT NULL,
  is_available BOOLEAN DEFAULT false,
  pricing_type TEXT, -- 'free', 'paid', 'purchase'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 訂房設定表
CREATE TABLE public.booking_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  check_in_time TEXT DEFAULT '15:00',
  check_out_time TEXT DEFAULT '11:00',
  use_deposit BOOLEAN DEFAULT true,
  deposit_percentage INTEGER DEFAULT 30,
  cancellation_policy TEXT,
  payment_methods JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 自動更新 updated_at 的函數
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 為各表添加 updated_at 觸發器
CREATE TRIGGER update_accommodation_info_updated_at
  BEFORE UPDATE ON public.accommodation_info
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_room_types_updated_at
  BEFORE UPDATE ON public.room_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_booking_settings_updated_at
  BEFORE UPDATE ON public.booking_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 啟用 RLS（因為是公開資訊，所以設置為公開可讀）
ALTER TABLE public.accommodation_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accommodation_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_settings ENABLE ROW LEVEL SECURITY;

-- 公開可讀政策（前台訂房網站需要讀取）
CREATE POLICY "Public can view accommodation info"
  ON public.accommodation_info FOR SELECT
  USING (true);

CREATE POLICY "Public can view accommodation photos"
  ON public.accommodation_photos FOR SELECT
  USING (true);

CREATE POLICY "Public can view room types"
  ON public.room_types FOR SELECT
  USING (true);

CREATE POLICY "Public can view room photos"
  ON public.room_photos FOR SELECT
  USING (true);

CREATE POLICY "Public can view room amenities"
  ON public.room_amenities FOR SELECT
  USING (true);

CREATE POLICY "Public can view facilities"
  ON public.accommodation_facilities FOR SELECT
  USING (true);

CREATE POLICY "Public can view booking settings"
  ON public.booking_settings FOR SELECT
  USING (true);

-- 插入初始數據（森山寫造範例）
INSERT INTO public.accommodation_info (
  name,
  type,
  description,
  address,
  country,
  region_1,
  region_2,
  check_in_notice
) VALUES (
  '森山寫造',
  '民宿',
  '森山寫造位於寧靜的山區，是一處結合日式傳統美學與現代舒適的精品旅宿。在這裡，您可以遠離都市喧囂，沉浸在大自然的懷抱中，享受一段悠閒的時光。',
  '台灣南投縣信義鄉東埔村開高巷123號',
  '台灣',
  '南投縣',
  '信義鄉',
  '入住時間：15:00 之後\n退房時間：11:00 之前\n\n請出示身分證件\n禁止吸菸\n不可攜帶寵物'
);

-- 插入訂房設定
INSERT INTO public.booking_settings (
  accommodation_id,
  check_in_time,
  check_out_time,
  use_deposit,
  deposit_percentage,
  cancellation_policy,
  payment_methods
) SELECT 
  id,
  '15:00',
  '11:00',
  true,
  30,
  '入住前7天免費取消，7天內取消收取50%費用',
  '["信用卡", "現金", "線上支付"]'::jsonb
FROM public.accommodation_info
WHERE name = '森山寫造';

-- 插入範例房型
INSERT INTO public.room_types (
  accommodation_id,
  name,
  name_en,
  description,
  capacity,
  size_sqm,
  base_price,
  display_order
) SELECT 
  id,
  '豪華和室',
  'Deluxe Japanese Room',
  '融合現代設計與傳統榻榻米的寬敞房型，擁有絕美山景',
  4,
  45,
  8800,
  1
FROM public.accommodation_info
WHERE name = '森山寫造'
UNION ALL
SELECT 
  id,
  '精緻套房',
  'Superior Suite',
  '溫馨雅致的日式套房，傳統與舒適的完美結合',
  2,
  32,
  6800,
  2
FROM public.accommodation_info
WHERE name = '森山寫造'
UNION ALL
SELECT 
  id,
  '標準客房',
  'Standard Room',
  '簡約舒適的現代客房，提供您溫馨的住宿體驗',
  2,
  28,
  4800,
  3
FROM public.accommodation_info
WHERE name = '森山寫造';