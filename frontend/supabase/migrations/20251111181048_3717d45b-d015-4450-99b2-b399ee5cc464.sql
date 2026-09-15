-- 修復函數的 search_path 安全問題

-- 重新創建 generate_order_number 函數並設定 search_path
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_order_number text;
  date_prefix text;
  sequence_num integer;
BEGIN
  -- 使用日期作為前綴 (例如: 20250111)
  date_prefix := to_char(CURRENT_DATE, 'YYYYMMDD');
  
  -- 查找今天已有的最大序號
  SELECT COALESCE(MAX(CAST(substring(order_number from 9) AS integer)), 0) + 1
  INTO sequence_num
  FROM public.orders
  WHERE order_number LIKE date_prefix || '%';
  
  -- 生成新的訂單編號 (例如: 20250111001)
  new_order_number := date_prefix || LPAD(sequence_num::text, 3, '0');
  
  RETURN new_order_number;
END;
$$;

-- 重新創建 set_order_number 函數並設定 search_path
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := public.generate_order_number();
  END IF;
  RETURN NEW;
END;
$$;