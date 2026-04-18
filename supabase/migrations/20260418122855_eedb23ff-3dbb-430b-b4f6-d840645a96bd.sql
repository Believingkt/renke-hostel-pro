
-- ============================================
-- Wave 6-A Part A1+A2+A3: 收緊 RLS 與防權限提升
-- ============================================

-- ---- A1-1. frontend_error_reports：限制 INSERT 必要欄位 ----
DROP POLICY IF EXISTS "Anyone can report frontend errors" ON public.frontend_error_reports;

CREATE POLICY "Public can report frontend errors with required fields"
ON public.frontend_error_reports
FOR INSERT
TO anon, authenticated
WITH CHECK (
  error_type IS NOT NULL
  AND length(error_type) BETWEEN 1 AND 100
  AND error_message IS NOT NULL
  AND length(error_message) BETWEEN 1 AND 5000
  AND (url IS NULL OR length(url) <= 2000)
  AND (user_agent IS NULL OR length(user_agent) <= 1000)
  AND alert_sent = false  -- 客戶端不得宣稱已寄送
);

-- 阻止任何人 UPDATE/DELETE（僅由 service role 後端寫入 alert_sent）
DROP POLICY IF EXISTS "No one can update frontend error reports" ON public.frontend_error_reports;
CREATE POLICY "No one can update frontend error reports"
ON public.frontend_error_reports FOR UPDATE TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "No one can delete frontend error reports" ON public.frontend_error_reports;
CREATE POLICY "No one can delete frontend error reports"
ON public.frontend_error_reports FOR DELETE TO anon, authenticated USING (false);


-- ---- A1-2. error_logs：限制 INSERT 必要欄位、禁止竄改 ----
DROP POLICY IF EXISTS "Anyone can insert error logs" ON public.error_logs;

CREATE POLICY "Public can insert error logs with required fields"
ON public.error_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (
  source IS NOT NULL
  AND source IN ('frontend','backend')
  AND category IS NOT NULL
  AND length(category) BETWEEN 1 AND 100
  AND error_message IS NOT NULL
  AND length(error_message) BETWEEN 1 AND 2000
  AND (url IS NULL OR length(url) <= 2000)
  AND (user_agent IS NULL OR length(user_agent) <= 1000)
);

DROP POLICY IF EXISTS "No one can update error logs" ON public.error_logs;
CREATE POLICY "No one can update error logs"
ON public.error_logs FOR UPDATE TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "No one can delete error logs" ON public.error_logs;
CREATE POLICY "No one can delete error logs"
ON public.error_logs FOR DELETE TO anon, authenticated USING (false);


-- ---- A2. user_roles：完整防權限提升 ----
-- 既有 prevent_self_role_change 只擋 UPDATE 自己角色；
-- 新增 BEFORE INSERT/UPDATE 統一驗證，避免：
--   (a) 自己給自己 INSERT 任何角色
--   (b) 非 super_admin 建立/變更 super_admin 角色
--   (c) hotel_admin 把自己或他人提升為 super_admin

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_super_admin boolean := false;
BEGIN
  -- service_role / 無 auth context（migration、trigger from edge function service role）放行
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_caller AND role = 'super_admin'::app_role
  ) INTO v_is_super_admin;

  -- (a) 任何人不得替自己新增/修改角色
  IF NEW.user_id = v_caller THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Cannot grant a role to yourself';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Cannot modify your own role';
    END IF;
  END IF;

  -- (b)(c) 只有 super_admin 能建立或修改成 super_admin 角色
  IF NEW.role = 'super_admin'::app_role AND NOT v_is_super_admin THEN
    RAISE EXCEPTION 'Only super_admin can grant super_admin role';
  END IF;

  -- (UPDATE) 不允許把既有非 super_admin 紀錄的角色「升級」成 super_admin（除非操作者本身是 super_admin，已在上方擋下）
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_role_escalation_trg ON public.user_roles;
CREATE TRIGGER prevent_role_escalation_trg
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.prevent_role_escalation();
