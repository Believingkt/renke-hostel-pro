-- 將價格模板中的 weekday_price 和 weekend_price 改為可選
ALTER TABLE pricing_templates 
  ALTER COLUMN weekday_price DROP NOT NULL,
  ALTER COLUMN weekend_price DROP NOT NULL;