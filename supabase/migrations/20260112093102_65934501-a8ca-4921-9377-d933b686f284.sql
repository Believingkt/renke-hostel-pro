-- Update function to generate randomized reviews for new accommodations
CREATE OR REPLACE FUNCTION public.auto_generate_reviews()
RETURNS TRIGGER AS $$
DECLARE
  -- 姓氏池
  surnames TEXT[] := ARRAY['王', '李', '張', '劉', '陳', '楊', '黃', '趙', '周', '吳', '徐', '孫', '馬', '朱', '胡', '郭', '何', '林', '羅', '高', '許', '謝', '蔡', '曾', '賴', '葉', '鄭', '廖', '簡', '邱'];
  -- 名字池
  first_names TEXT[] := ARRAY['志偉', '雅婷', '柏翰', '家瑜', '俊傑', '怡君', '建宏', '淑芬', '冠宇', '雅惠', '宗翰', '佳蓉', '承恩', '詩涵', '宏達', '美玲', '品睿', '婉婷', '智勇', '雅文', '明哲', '靜怡', '子軒', '宜蓁', '育誠', '思穎', '彥廷', '欣怡', '政憲', '佩珊'];
  -- 評論內容池
  comments TEXT[] := ARRAY[
    '新年來住了三天兩夜，房間非常寬敞舒適，風格讓人身心放鬆。老闆娘準備的早餐超豐盛，每天都不一樣！窗外就是山景，早晨醒來心情超好。',
    '帶父母來過節，他們非常喜歡這裡的氛圍。房間乾淨整潔，設備齊全，浴室超讚！服務人員細心親切，還幫忙推薦附近景點，下次一定再來！',
    '第一次來就選對了民宿！環境清幽，遠離城市喧囂，很適合放空充電。晚上泡個舒服的澡，睡眠品質超好，隔天精神飽滿。大推！',
    '和朋友們的輕旅行選這裡太對了！房間空間很大，拍照超美。周邊很安靜，還可以看到星星。老闆非常熱情，還送我們當地的小點心，滿滿的人情味！',
    '整體住宿體驗非常棒！房間設計很有特色，融合了傳統與現代。早餐豐盛美味，附近的景點也很多。會再來！',
    '環境非常優美，房間乾淨舒適，服務人員態度親切，山景令人驚艷，是放鬆身心的好地方！強烈推薦給想要遠離都市的朋友！',
    '完美的假期！員工服務超讚，房間設施齊全，view超美。晚上聽著蟲鳴鳥叫入睡，隔天被陽光叫醒，很久沒有這麼放鬆了。',
    '帶小孩來玩非常適合！空間大、環境安全，老闆還準備了小點心給小朋友。大人小孩都玩得很開心，全家都說下次還要再來！',
    '慶生之旅選這裡超值得！老闆還特別準備了小驚喜，讓整個旅程更加難忘。房間舒適溫馨，早餐也很豐盛，CP值爆表！',
    '情侶約會首選！氣氛浪漫，環境優美，非常適合想要享受兩人世界的情侶。夜晚還能看到滿天星星，超級浪漫！',
    '商務出差也很推薦！房間隔音好，網路穩定，工作效率很高。晚上還能好好放鬆，比住一般飯店舒服多了。',
    '週末小旅行的最佳選擇！距離市區不遠但環境清幽，很適合短暫逃離城市喧囂。下次有機會一定再來！'
  ];
  -- 月份
  months TEXT[] := ARRAY['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
  
  selected_names TEXT[] := '{}';
  selected_comments TEXT[] := '{}';
  random_name TEXT;
  random_comment TEXT;
  random_month TEXT;
  random_year TEXT;
  rating INTEGER;
  i INTEGER;
  idx INTEGER;
BEGIN
  -- 隨機選取 4 個不重複的名字
  WHILE array_length(selected_names, 1) IS NULL OR array_length(selected_names, 1) < 4 LOOP
    random_name := surnames[1 + floor(random() * array_length(surnames, 1))::int] || 
                   first_names[1 + floor(random() * array_length(first_names, 1))::int];
    IF NOT random_name = ANY(selected_names) THEN
      selected_names := array_append(selected_names, random_name);
    END IF;
  END LOOP;
  
  -- 隨機選取 4 個不重複的評論
  WHILE array_length(selected_comments, 1) IS NULL OR array_length(selected_comments, 1) < 4 LOOP
    idx := 1 + floor(random() * array_length(comments, 1))::int;
    random_comment := comments[idx];
    IF NOT random_comment = ANY(selected_comments) THEN
      selected_comments := array_append(selected_comments, random_comment);
    END IF;
  END LOOP;
  
  -- 插入 4 則評價
  FOR i IN 1..4 LOOP
    -- 隨機日期（過去 6 個月內）
    random_month := months[1 + floor(random() * 6)::int]; -- 近 6 個月
    random_year := CASE 
      WHEN random_month IN ('1月', '2月', '3月', '4月', '5月', '6月') THEN '2025年'
      ELSE '2024年'
    END;
    
    -- 第 3 個評價給 4 星，其他給 5 星
    rating := CASE WHEN i = 3 THEN 4 ELSE 5 END;
    
    INSERT INTO public.reviews (
      accommodation_id,
      reviewer_name,
      review_date,
      rating,
      comment,
      display_order
    ) VALUES (
      NEW.id,
      selected_names[i],
      random_year || random_month,
      rating,
      selected_comments[i],
      i
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;