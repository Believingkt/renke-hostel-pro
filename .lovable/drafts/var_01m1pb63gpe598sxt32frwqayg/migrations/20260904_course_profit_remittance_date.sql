-- 課程分潤：每月盈餘新增「匯款日期」（從有風課程收到款項的日期），
-- 供寫入 Ragic 營收時歸納到正確的月份收入。
-- 純新增可空欄位，向後相容。

ALTER TABLE public.course_profit_months
  ADD COLUMN IF NOT EXISTS remittance_date date;

COMMENT ON COLUMN public.course_profit_months.remittance_date IS '匯款日期：從有風課程收到款項的日期，用於 Ragic 營收歸屬月份';
