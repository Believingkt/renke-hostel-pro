-- 1. 模組權限層級 enum
CREATE TYPE public.module_permission_level AS ENUM ('hidden', 'readonly', 'editable');

-- 2. 權限設定表
CREATE TABLE public.staff_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  accommodation_id uuid NOT NULL,
  module_key text NOT NULL,
  permission_level public.module_permission_level NOT NULL DEFAULT 'readonly',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, accommodation_id, module_key)
);

CREATE INDEX idx_staff_module_perms_lookup
  ON public.staff_module_permissions (user_id, accommodation_id);

-- 3. 啟用 RLS
ALTER TABLE public.staff_module_permissions ENABLE ROW LEVEL SECURITY;

-- 4. 自己可讀
CREATE POLICY "Staff can view own permissions"
ON public.staff_module_permissions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 5. 民宿管理員/總部管理員可讀
CREATE POLICY "Admins can view staff permissions"
ON public.staff_module_permissions
FOR SELECT
TO authenticated
USING (
  public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
);

-- 6. 民宿管理員/總部管理員可寫
CREATE POLICY "Admins can insert staff permissions"
ON public.staff_module_permissions
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
);

CREATE POLICY "Admins can update staff permissions"
ON public.staff_module_permissions
FOR UPDATE
TO authenticated
USING (
  public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
)
WITH CHECK (
  public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
);

CREATE POLICY "Admins can delete staff permissions"
ON public.staff_module_permissions
FOR DELETE
TO authenticated
USING (
  public.user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
  OR public.user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
);

-- 7. updated_at trigger
CREATE TRIGGER trg_staff_module_perms_updated_at
BEFORE UPDATE ON public.staff_module_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 8. 預設值與查詢函式
CREATE OR REPLACE FUNCTION public.get_staff_module_permission(
  _user_id uuid,
  _accommodation_id uuid,
  _module_key text
)
RETURNS public.module_permission_level
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level public.module_permission_level;
BEGIN
  -- hotel_admin / super_admin 一律可編輯
  IF public.user_has_role(_user_id, _accommodation_id, 'hotel_admin'::app_role)
     OR public.user_has_role(_user_id, _accommodation_id, 'super_admin'::app_role) THEN
    RETURN 'editable'::public.module_permission_level;
  END IF;

  -- 查詢 staff 設定
  SELECT permission_level
    INTO v_level
  FROM public.staff_module_permissions
  WHERE user_id = _user_id
    AND accommodation_id = _accommodation_id
    AND module_key = _module_key;

  IF v_level IS NOT NULL THEN
    RETURN v_level;
  END IF;

  -- 未設定 → fallback 預設
  RETURN CASE _module_key
    WHEN 'orders'           THEN 'editable'
    WHEN 'room_price'       THEN 'editable'
    WHEN 'customers'        THEN 'editable'
    WHEN 'analytics'        THEN 'readonly'
    WHEN 'discount_codes'   THEN 'readonly'
    WHEN 'settlement'       THEN 'readonly'
    WHEN 'website_content'  THEN 'hidden'
    WHEN 'pricing'          THEN 'hidden'
    WHEN 'accounts'         THEN 'hidden'
    ELSE 'hidden'
  END::public.module_permission_level;
END;
$$;