-- Phase 3C-1 DRAFT — NOT APPLIED（未來 STEP 4 才可執行）
-- 前置條件：narrow RPC 已上線 且 PricingTemplateManager 已改走 RPC 並 Publish。
-- 若先套用本檔，PricingTemplateManager 的 direct order_rooms UPDATE 會立即失效。
--
-- 目標：移除 order_rooms 三條 broad Staff WRITE policies
--       （user_has_access_to_accommodation → readonly bypass 根因），
--       改為 orders module-aware。
-- 不動：SELECT policy、既有 Admin UPDATE / DELETE policy。

-- ---------------------------------------------------------------
-- 1) DROP broad Staff write policies
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can insert order rooms" ON public.order_rooms;
DROP POLICY IF EXISTS "Staff can update order rooms" ON public.order_rooms;
DROP POLICY IF EXISTS "Staff can delete order rooms" ON public.order_rooms;

-- ---------------------------------------------------------------
-- 2) Admin INSERT（GAP：production 目前「沒有」Admin INSERT policy，
--    hotel_admin / super_admin 的 INSERT 能力其實是靠 broad Staff policy。
--    因此 DROP 後必須補回，否則 Admin 建單會壞。）
-- ---------------------------------------------------------------
CREATE POLICY "Admins can insert order rooms"
ON public.order_rooms
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_rooms.order_id
      AND (
        public.user_has_role(auth.uid(), o.accommodation_id, 'super_admin'::app_role)
        OR public.user_has_role(auth.uid(), o.accommodation_id, 'hotel_admin'::app_role)
      )
  )
);

-- ---------------------------------------------------------------
-- 3) Staff（orders = editable）INSERT / UPDATE / DELETE
--    order_rooms 無 accommodation_id → 一律 JOIN orders 取 scope。
--    UPDATE 的 USING 與 WITH CHECK 完全同 scope，
--    以阻擋把 order_id 改到其他館別的 order。
-- ---------------------------------------------------------------
CREATE POLICY "Staff orders editors can insert order rooms"
ON public.order_rooms
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_rooms.order_id
      AND public.staff_can_edit_module(o.accommodation_id, 'orders')
  )
);

CREATE POLICY "Staff orders editors can update order rooms"
ON public.order_rooms
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_rooms.order_id
      AND public.staff_can_edit_module(o.accommodation_id, 'orders')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_rooms.order_id
      AND public.staff_can_edit_module(o.accommodation_id, 'orders')
  )
);

CREATE POLICY "Staff orders editors can delete order rooms"
ON public.order_rooms
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_rooms.order_id
      AND public.staff_can_edit_module(o.accommodation_id, 'orders')
  )
);

-- 明確不做：
--   * 任何 "OR staff_can_edit_module(..., 'room_price')"（room_price 走 narrow RPC）
--   * 任何 room_price INSERT / DELETE
--   * SELECT policy 變更
--   * 既有 Admin UPDATE / DELETE policy 變更
