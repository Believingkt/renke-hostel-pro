CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_super_admin boolean := false;
BEGIN
  -- service_role / 無 auth context 放行
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_caller AND role = 'super_admin'::app_role
  ) INTO v_is_super_admin;

  -- (a) 任何人不得替自己新增/修改角色，但 super_admin 例外
  --     （super_admin 已具最高權限，允許自掛 hotel_admin/staff 以方便操作切換）
  IF NEW.user_id = v_caller AND NOT v_is_super_admin THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Cannot grant a role to yourself';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Cannot modify your own role';
    END IF;
  END IF;

  -- (b) 任何人都不能把自己升級為 super_admin（即使本身已是 super_admin 也禁止重複新增同身份就好）
  IF NEW.user_id = v_caller AND NEW.role = 'super_admin'::app_role THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Cannot grant super_admin role to yourself';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM 'super_admin'::app_role THEN
      RAISE EXCEPTION 'Cannot elevate your own role to super_admin';
    END IF;
  END IF;

  -- (c) 只有 super_admin 能建立或修改成 super_admin 角色
  IF NEW.role = 'super_admin'::app_role AND NOT v_is_super_admin THEN
    RAISE EXCEPTION 'Only super_admin can grant super_admin role';
  END IF;

  RETURN NEW;
END;
$function$;