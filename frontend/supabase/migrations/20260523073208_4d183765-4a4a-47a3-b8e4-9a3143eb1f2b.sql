-- 1. Pending invites table
CREATE TABLE IF NOT EXISTS public.team_pending_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  display_name text,
  role app_role NOT NULL,
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, role)
);

CREATE INDEX IF NOT EXISTS idx_team_pending_invites_email_lower
  ON public.team_pending_invites (lower(email));

ALTER TABLE public.team_pending_invites ENABLE ROW LEVEL SECURITY;

-- helper: 是否為團隊管理者（全域 admin/super_admin/scout_manager）
CREATE OR REPLACE FUNCTION public.is_team_inviter(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND accommodation_id IS NULL
      AND role IN ('super_admin','admin','scout_manager')
  );
$$;

CREATE POLICY "Team inviters can view pending invites"
ON public.team_pending_invites
FOR SELECT
TO authenticated
USING (public.is_team_inviter(auth.uid()));

CREATE POLICY "Team inviters can create pending invites"
ON public.team_pending_invites
FOR INSERT
TO authenticated
WITH CHECK (public.is_team_inviter(auth.uid()));

CREATE POLICY "Team inviters can delete pending invites"
ON public.team_pending_invites
FOR DELETE
TO authenticated
USING (public.is_team_inviter(auth.uid()));

-- 2. Trigger: 新 auth user 註冊時，自動套用 pending 邀請
CREATE OR REPLACE FUNCTION public.apply_team_pending_invites()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_name text;
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  -- 取得任一筆 pending invite 的 display_name 作為 profile 名稱
  SELECT display_name INTO v_display_name
  FROM public.team_pending_invites
  WHERE lower(email) = lower(NEW.email)
  ORDER BY created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- 建立/更新 team profile
  INSERT INTO public.team_member_profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(v_display_name, split_part(NEW.email, '@', 1)))
  ON CONFLICT (user_id) DO NOTHING;

  -- 套用所有角色
  INSERT INTO public.user_roles (user_id, accommodation_id, role)
  SELECT NEW.id, NULL, pi.role
  FROM public.team_pending_invites pi
  WHERE lower(pi.email) = lower(NEW.email)
  ON CONFLICT DO NOTHING;

  -- 清除暫存
  DELETE FROM public.team_pending_invites
  WHERE lower(email) = lower(NEW.email);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_apply_team_invites ON auth.users;
CREATE TRIGGER on_auth_user_apply_team_invites
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.apply_team_pending_invites();