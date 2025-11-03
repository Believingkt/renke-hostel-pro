-- 創建顧客資料表
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id UUID REFERENCES public.accommodation_info(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  first_order_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 啟用 RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 公開可查看顧客資料（用於前台）
CREATE POLICY "Public can view customers"
ON public.customers
FOR SELECT
USING (true);

-- 有權限的用戶可以新增顧客
CREATE POLICY "Users with access can insert customers"
ON public.customers
FOR INSERT
WITH CHECK (user_has_access_to_accommodation(auth.uid(), accommodation_id));

-- 有權限的用戶可以更新顧客
CREATE POLICY "Users with access can update customers"
ON public.customers
FOR UPDATE
USING (user_has_access_to_accommodation(auth.uid(), accommodation_id))
WITH CHECK (user_has_access_to_accommodation(auth.uid(), accommodation_id));

-- 有權限的用戶可以刪除顧客
CREATE POLICY "Users with access can delete customers"
ON public.customers
FOR DELETE
USING (user_has_access_to_accommodation(auth.uid(), accommodation_id));

-- 創建更新時間戳記的觸發器
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 創建索引以提升查詢效能
CREATE INDEX idx_customers_accommodation ON public.customers(accommodation_id);
CREATE INDEX idx_customers_email ON public.customers(email);
CREATE INDEX idx_customers_phone ON public.customers(phone);