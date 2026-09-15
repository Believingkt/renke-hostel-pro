-- 安全性優化：修復關鍵資料暴露問題

-- 1. 確保 customers 表啟用 RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 移除所有現有的 customers 表政策
DROP POLICY IF EXISTS "Enable read access for all users" ON public.customers;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.customers;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.customers;

-- 創建嚴格的 customers 表 RLS 政策
-- 只有認證用戶且有該住宿權限的人才能查看客戶資料
CREATE POLICY "Staff can view customers in their accommodation"
ON public.customers
FOR SELECT
TO authenticated
USING (
  public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

-- 只有認證用戶且有該住宿權限的人才能新增客戶
CREATE POLICY "Staff can insert customers in their accommodation"
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

-- 只有認證用戶且有該住宿權限的人才能更新客戶
CREATE POLICY "Staff can update customers in their accommodation"
ON public.customers
FOR UPDATE
TO authenticated
USING (
  public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
)
WITH CHECK (
  public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

-- 只有認證用戶且有該住宿的管理員權限才能刪除客戶
CREATE POLICY "Admins can delete customers in their accommodation"
ON public.customers
FOR DELETE
TO authenticated
USING (
  public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin') OR
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin')
);

-- 2. 確保 orders 表啟用 RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 移除所有現有的 orders 表政策
DROP POLICY IF EXISTS "Enable read access for all users" ON public.orders;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.orders;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.orders;

-- 創建嚴格的 orders 表 RLS 政策
-- 只有認證用戶且有該住宿權限的人才能查看訂單
CREATE POLICY "Staff can view orders in their accommodation"
ON public.orders
FOR SELECT
TO authenticated
USING (
  public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

-- 只有認證用戶且有該住宿權限的人才能新增訂單
CREATE POLICY "Staff can insert orders in their accommodation"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

-- 只有認證用戶且有該住宿權限的人才能更新訂單
CREATE POLICY "Staff can update orders in their accommodation"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
)
WITH CHECK (
  public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

-- 只有認證用戶且有該住宿的管理員權限才能刪除訂單
CREATE POLICY "Admins can delete orders in their accommodation"
ON public.orders
FOR DELETE
TO authenticated
USING (
  public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin') OR
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin')
);

-- 3. 優化 accommodation_info 表的 RLS
-- 保持基本資訊公開可讀（前台網站需要），但限制敏感資訊
-- 現有政策允許公開讀取，這對前台是必要的
-- 但確保只有認證用戶可以修改

-- 移除可能存在的不安全政策
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.accommodation_info;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.accommodation_info;

-- 只有有該住宿管理員權限的人才能更新住宿資訊
CREATE POLICY "Admins can update accommodation info"
ON public.accommodation_info
FOR UPDATE
TO authenticated
USING (
  public.user_has_role(auth.uid(), id, 'hotel_admin') OR
  public.user_has_role(auth.uid(), id, 'super_admin')
)
WITH CHECK (
  public.user_has_role(auth.uid(), id, 'hotel_admin') OR
  public.user_has_role(auth.uid(), id, 'super_admin')
);

-- 只有超級管理員可以新增住宿
CREATE POLICY "Super admins can insert accommodation info"
ON public.accommodation_info
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
);

-- 4. 優化 profiles 表的 RLS
-- 確保用戶只能看到自己的資料或同住宿的員工資料（如果是管理員）

-- 移除可能過於寬鬆的政策
DROP POLICY IF EXISTS "Users can view profiles in their accommodation" ON public.profiles;

-- 用戶可以查看自己的資料
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- 用戶可以更新自己的資料
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- 管理員可以查看同住宿員工的資料
CREATE POLICY "Admins can view profiles in their accommodation"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.is_user_admin(auth.uid()) AND
  EXISTS (
    SELECT 1 FROM public.user_roles ur1
    INNER JOIN public.user_roles ur2 ON ur1.accommodation_id = ur2.accommodation_id
    WHERE ur1.user_id = auth.uid() 
    AND ur2.user_id = profiles.id
  )
);

-- 5. 確保其他敏感表也有 RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- notifications 政策
DROP POLICY IF EXISTS "Users can view notifications in their accommodation" ON public.notifications;

CREATE POLICY "Staff can view notifications in their accommodation"
ON public.notifications
FOR SELECT
TO authenticated
USING (
  public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

CREATE POLICY "Staff can update notifications in their accommodation"
ON public.notifications
FOR UPDATE
TO authenticated
USING (
  public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
)
WITH CHECK (
  public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
);

-- user_roles 政策
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view roles in their accommodation"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  public.can_view_user_roles(accommodation_id)
);

CREATE POLICY "Admins can manage roles in their accommodation"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin') OR
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin')
)
WITH CHECK (
  public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin') OR
  public.user_has_role(auth.uid(), accommodation_id, 'super_admin')
);