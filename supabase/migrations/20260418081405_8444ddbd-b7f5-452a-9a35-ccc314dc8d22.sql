
-- =====================================================================
-- P0-3: user_roles 權限收緊
-- =====================================================================

-- 1. 移除舊的全權限 policy（讓 hotel_admin 可任意改 user_roles）
DROP POLICY IF EXISTS "Admins can manage roles in their accommodation" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;

-- 2. 確保保留的 policy 是收緊版本（已有 "Admins can ... restricted" 系列）
--    這些 policy 已將 INSERT/UPDATE/DELETE 限制為 super_admin，或限 hotel_admin 只能管自家 staff/hotel_admin
--    保留：Admins can insert roles restricted, Admins can update roles restricted, Admins can delete roles restricted
--    保留：Admins can view roles in their accommodation, Users can view own roles, Users view own roles

-- 3. 加 BEFORE UPDATE trigger：禁止任何人修改自己的 role 欄位
CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id = auth.uid() AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Cannot modify your own role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_role_change ON public.user_roles;
CREATE TRIGGER trg_prevent_self_role_change
BEFORE UPDATE OF role ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_self_role_change();

-- =====================================================================
-- P0-4: discount_codes 商業機密保護
-- =====================================================================

-- 1. 移除過於寬鬆的 SELECT policy（任何 authenticated 都能查）
--    （現有 4 個 policy 都已是 user_has_role 限制，但為防萬一檢查並加強）
--    現況已 OK，無需移除；前台改走 RPC `validate_discount_code` 已是安全的

-- 2. 建立 / 重建 公開安全視圖：只暴露公開欄位
DROP VIEW IF EXISTS public.discount_codes_safe;
CREATE VIEW public.discount_codes_safe
WITH (security_invoker = true)
AS
SELECT 
  id,
  accommodation_id,
  code,
  name,
  discount_type,
  discount_value,
  min_order_amount,
  applicable_room_types,
  applicable_date_from,
  applicable_date_to,
  valid_from,
  valid_until,
  is_active,
  display_order
FROM public.discount_codes
WHERE is_active = true;

-- 3. 不對 anon 開放（需透過 RPC）；對 authenticated 給 SELECT
GRANT SELECT ON public.discount_codes_safe TO authenticated;
REVOKE SELECT ON public.discount_codes_safe FROM anon;
