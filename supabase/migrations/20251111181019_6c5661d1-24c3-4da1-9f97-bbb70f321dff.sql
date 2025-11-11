-- 創建訂單表
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  accommodation_id uuid NOT NULL,
  room_type_id uuid REFERENCES public.room_types(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  
  -- 訂房資訊
  check_in_date date NOT NULL,
  check_out_date date NOT NULL,
  guest_count integer NOT NULL DEFAULT 2,
  meal_plan text CHECK (meal_plan IN ('2_meals', '3_meals')),
  
  -- 客人資訊
  guest_name text NOT NULL,
  guest_phone text NOT NULL,
  guest_email text,
  guest_address text,
  
  -- 訂單狀態
  order_status text NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled')),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'deposit_paid', 'paid', 'overdue')),
  room_assigned boolean DEFAULT false,
  
  -- 金額
  total_price integer NOT NULL,
  discount_amount integer DEFAULT 0,
  final_price integer NOT NULL,
  deposit_amount integer DEFAULT 0,
  paid_amount integer DEFAULT 0,
  
  -- 其他
  payment_method text,
  discount_code text,
  notes text,
  
  -- 時間戳記
  order_date timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 創建索引提升查詢效能
CREATE INDEX idx_orders_accommodation_id ON public.orders(accommodation_id);
CREATE INDEX idx_orders_check_in_date ON public.orders(check_in_date);
CREATE INDEX idx_orders_check_out_date ON public.orders(check_out_date);
CREATE INDEX idx_orders_order_date ON public.orders(order_date);
CREATE INDEX idx_orders_order_status ON public.orders(order_status);
CREATE INDEX idx_orders_payment_status ON public.orders(payment_status);

-- 啟用 Row Level Security
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- RLS 政策：公開可查看訂單（前台需要）
CREATE POLICY "Public can view orders"
ON public.orders
FOR SELECT
USING (true);

-- RLS 政策：只有管理員可以新增訂單
CREATE POLICY "Only admins can insert orders"
ON public.orders
FOR INSERT
WITH CHECK (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR 
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- RLS 政策：只有管理員可以更新訂單
CREATE POLICY "Only admins can update orders"
ON public.orders
FOR UPDATE
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR 
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- RLS 政策：只有管理員可以刪除訂單
CREATE POLICY "Only admins can delete orders"
ON public.orders
FOR DELETE
USING (
  user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role) OR 
  user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
);

-- 創建自動更新 updated_at 的觸發器
CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 創建自動生成訂單編號的函數
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS text
LANGUAGE plpgsql
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

-- 創建觸發器自動生成訂單編號
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := public.generate_order_number();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_order_number_trigger
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.set_order_number();