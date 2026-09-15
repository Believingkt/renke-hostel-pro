-- 移除 customers 和 orders 表的公開讀取政策

-- 明確刪除 customers 表的公開讀取政策
DROP POLICY IF EXISTS "Public can view customers" ON public.customers;

-- 明確刪除 orders 表的公開讀取政策
DROP POLICY IF EXISTS "Public can view orders" ON public.orders;
DROP POLICY IF EXISTS "Anyone can insert orders" ON public.orders;

-- 為 orders 表添加更安全的政策
-- 允許未認證用戶新增訂單(前台訂房需要)
CREATE POLICY "Public can insert orders"
ON public.orders
FOR INSERT
TO public
WITH CHECK (true);

-- 確保認證用戶可以查看他們有權限的住宿的訂單
-- 這個政策應該已經存在,但我們確保它是正確的
DROP POLICY IF EXISTS "Staff can view orders in their accommodation" ON public.orders;

CREATE POLICY "Staff can view orders in their accommodation"
ON public.orders
FOR SELECT
TO authenticated
USING (
  public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
);