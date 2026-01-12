-- Create reviews table for storing guest reviews
CREATE TABLE public.reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  accommodation_id UUID NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  reviewer_name TEXT NOT NULL,
  review_date TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Public can read published reviews
CREATE POLICY "Anyone can view published reviews"
  ON public.reviews
  FOR SELECT
  USING (is_published = true);

-- Authenticated users with accommodation access can manage reviews
CREATE POLICY "Users can manage reviews for their accommodations"
  ON public.reviews
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.accommodation_id = reviews.accommodation_id
    )
  );

-- Create trigger for updated_at
CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to auto-generate reviews for new accommodations
CREATE OR REPLACE FUNCTION public.auto_generate_reviews()
RETURNS TRIGGER AS $$
DECLARE
  review_templates JSONB := '[
    {"name": "林志偉", "date": "2025年1月", "rating": 5, "comment": "新年來住了三天兩夜，房間非常寬敞舒適，和式風格讓人身心放鬆。老闆娘準備的早餐超豐盛，每天都不一樣！窗外就是山景，早晨醒來心情超好。"},
    {"name": "許雅琳", "date": "2024年12月", "rating": 5, "comment": "帶父母來過聖誕節，他們非常喜歡這裡的氛圍。房間乾淨整潔，設備齊全，溫泉浴池超讚！服務人員細心親切，還幫忙推薦附近景點，下次一定再來！"},
    {"name": "陳柏翰", "date": "2024年12月", "rating": 4, "comment": "第一次來宜蘭就選對了民宿！環境清幽，遠離城市喧囂，很適合放空充電。晚上泡個舒服的澡，睡眠品質超好，隔天精神飽滿。大推！"},
    {"name": "張家瑜", "date": "2024年11月", "rating": 5, "comment": "和閨蜜們的輕旅行選這裡太對了！四人房空間很大，拍照超美。周邊很安靜，還可以看到星星。老闆非常熱情，還送我們當地的小點心，滿滿的人情味！"}
  ]'::JSONB;
  review JSONB;
  i INTEGER := 1;
BEGIN
  FOR review IN SELECT * FROM jsonb_array_elements(review_templates)
  LOOP
    INSERT INTO public.reviews (
      accommodation_id,
      reviewer_name,
      review_date,
      rating,
      comment,
      display_order
    ) VALUES (
      NEW.id,
      review->>'name',
      review->>'date',
      (review->>'rating')::INTEGER,
      review->>'comment',
      i
    );
    i := i + 1;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-generate reviews when new accommodation is created
CREATE TRIGGER auto_generate_reviews_trigger
  AFTER INSERT ON public.accommodation_info
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_reviews();