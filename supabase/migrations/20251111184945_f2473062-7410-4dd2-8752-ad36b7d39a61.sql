-- 移除只允許管理員新增訂單的限制，改為允許公開新增
DROP POLICY IF EXISTS "Only admins can insert orders" ON public.orders;

-- 建立新的政策：允許任何人新增訂單（前台訂房需要）
CREATE POLICY "Anyone can insert orders"
ON public.orders
FOR INSERT
WITH CHECK (true);

-- 保持其他操作（更新、刪除）只能由管理員執行
-- 這些政策已經存在，不需要修改