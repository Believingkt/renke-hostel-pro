-- 為顧客表格增加來訪次數欄位
ALTER TABLE public.customers 
ADD COLUMN visit_count INTEGER DEFAULT 0 NOT NULL;