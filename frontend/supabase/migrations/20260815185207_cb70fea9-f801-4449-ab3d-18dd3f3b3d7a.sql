-- 1) 讓 team role 判斷可被快取
CREATE OR REPLACE FUNCTION public.user_has_team_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND accommodation_id IS NULL
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'::app_role
  );
END;
$function$;

-- 2) user_roles 查詢索引
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON public.user_roles (user_id, role);

-- 3) 目前登入者可存取的館別清單（一次算完，供 RLS 以 InitPlan 快取）
CREATE OR REPLACE FUNCTION public.current_user_accommodation_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles me
      WHERE me.user_id = auth.uid() AND me.role = 'super_admin'::app_role
    )
    THEN NULL::uuid
    ELSE NULL::uuid
  END
  WHERE false
  UNION ALL
  SELECT a.id
  FROM public.accommodation_info a
  WHERE EXISTS (
    SELECT 1 FROM public.user_roles me
    WHERE me.user_id = auth.uid() AND me.role = 'super_admin'::app_role
  )
  UNION ALL
  SELECT ur.accommodation_id
  FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
    AND ur.accommodation_id IS NOT NULL;
$function$;

REVOKE EXECUTE ON FUNCTION public.current_user_accommodation_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_user_accommodation_ids() TO authenticated, service_role;

-- 4) orders：合併 SELECT 政策為單一快速政策（權限範圍不變）
DROP POLICY IF EXISTS "Staff can view orders in their accommodation" ON public.orders;
DROP POLICY IF EXISTS "finance can view orders" ON public.orders;
DROP POLICY IF EXISTS "Scout can view orders with discount code" ON public.orders;
DROP POLICY IF EXISTS "Members can view their own orders" ON public.orders;

CREATE POLICY "Orders visible to staff finance scout and owning member"
ON public.orders
FOR SELECT
TO authenticated
USING (
  accommodation_id IN (SELECT public.current_user_accommodation_ids())
  OR (SELECT public.user_has_team_role(auth.uid(), 'finance'::app_role))
  OR (discount_code IS NOT NULL AND (SELECT public.user_has_any_team_role(auth.uid())))
  OR (member_id IS NOT NULL AND member_id IN (
        SELECT pm.id FROM public.platform_members pm WHERE pm.user_id = auth.uid()
      ))
);

-- 5) order_rooms：合併 SELECT 政策
DROP POLICY IF EXISTS "Staff can view order rooms" ON public.order_rooms;
DROP POLICY IF EXISTS "finance can view order_rooms" ON public.order_rooms;

CREATE POLICY "Order rooms visible to staff and finance"
ON public.order_rooms
FOR SELECT
TO authenticated
USING (
  (SELECT public.user_has_team_role(auth.uid(), 'finance'::app_role))
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_rooms.order_id
      AND o.accommodation_id IN (SELECT public.current_user_accommodation_ids())
  )
);