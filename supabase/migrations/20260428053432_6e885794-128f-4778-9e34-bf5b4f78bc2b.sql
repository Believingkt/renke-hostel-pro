-- 1) 移除 (accommodation_id, holiday_date) 重複紀錄，保留最早建立的一筆
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY accommodation_id, holiday_date
           ORDER BY
             -- 優先保留 work_on_weekend (補班) 與 compensatory_day_off (補休)，再保留 holiday
             CASE holiday_type
               WHEN 'work_on_weekend' THEN 0
               WHEN 'compensatory_day_off' THEN 1
               ELSE 2
             END,
             created_at ASC,
             id ASC
         ) AS rn
  FROM public.public_holidays
)
DELETE FROM public.public_holidays p
USING ranked r
WHERE p.id = r.id AND r.rn > 1;

-- 2) 加上唯一約束，避免未來再寫入重複
ALTER TABLE public.public_holidays
  ADD CONSTRAINT public_holidays_accommodation_date_unique
  UNIQUE (accommodation_id, holiday_date);

-- 3) 加上 holiday_name 不可為空白的約束
ALTER TABLE public.public_holidays
  ADD CONSTRAINT public_holidays_name_not_blank
  CHECK (length(btrim(holiday_name)) > 0);

-- 4) 加上日期範圍合理性約束（避免明顯錯誤年份）
ALTER TABLE public.public_holidays
  ADD CONSTRAINT public_holidays_date_range
  CHECK (holiday_date >= DATE '2000-01-01' AND holiday_date <= DATE '2100-12-31');