-- 1) 讓 closer_manager 被視為團隊成員（多數讀取政策依賴此函式）
CREATE OR REPLACE FUNCTION public.user_has_any_team_role(_user_id uuid)
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
      AND role IN (
        'super_admin'::app_role,
        'admin'::app_role,
        'scout'::app_role,
        'scout_manager'::app_role,
        'closer'::app_role,
        'closer_manager'::app_role,
        'video'::app_role,
        'franchise'::app_role,
        'franchise_internal'::app_role,
        'franchise_external'::app_role,
        'franchise_manager'::app_role,
        'starlink'::app_role,
        'finance'::app_role,
        'am'::app_role,
        'owner'::app_role,
        'venue_manager'::app_role
      )
  );
$$;

-- 2) 業務角色（折扣碼檢視）納入 closer_manager
CREATE OR REPLACE FUNCTION public.is_sales_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('scout','scout_manager','closer','closer_manager','admin','super_admin')
  )
$$;

-- 3) 訂單補充資料：closer_manager 可讀取／更新（與 closer 同等，且可看管理範圍內的成交組訂單）
DROP POLICY IF EXISTS order_meta_select ON public.order_meta;
CREATE POLICY order_meta_select ON public.order_meta
FOR SELECT
USING (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'closer_manager'::app_role)
  OR filled_by = auth.uid()
  OR scout_id = auth.uid()
  OR closer_id = auth.uid()
  OR video_creator_id = auth.uid()
  OR (accommodation_id IS NOT NULL AND user_has_access_to_accommodation(auth.uid(), accommodation_id))
);

DROP POLICY IF EXISTS order_meta_update ON public.order_meta;
CREATE POLICY order_meta_update ON public.order_meta
FOR UPDATE
USING (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'closer_manager'::app_role)
  OR filled_by = auth.uid()
  OR closer_id = auth.uid()
  OR scout_id = auth.uid()
  OR video_creator_id = auth.uid()
  OR (accommodation_id IS NOT NULL AND user_has_access_to_accommodation(auth.uid(), accommodation_id))
);

-- 4) 抽成設定寫入權限與 closer 同等
DROP POLICY IF EXISTS commission_settings_write ON public.accommodation_commission_settings;
CREATE POLICY commission_settings_write ON public.accommodation_commission_settings
FOR ALL
USING (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'hotel_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'closer'::app_role)
  OR user_has_team_role(auth.uid(), 'closer_manager'::app_role)
)
WITH CHECK (
  user_has_team_role(auth.uid(), 'super_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'admin'::app_role)
  OR user_has_team_role(auth.uid(), 'hotel_admin'::app_role)
  OR user_has_team_role(auth.uid(), 'closer'::app_role)
  OR user_has_team_role(auth.uid(), 'closer_manager'::app_role)
);

-- 5) 團隊成員可查看其他人的成交組角色（供成員管理／分潤指派下拉）
DROP POLICY IF EXISTS "Team members can view others' global closer/scout roles" ON public.user_roles;
CREATE POLICY "Team members can view others' global closer/scout roles" ON public.user_roles
FOR SELECT
USING (
  accommodation_id IS NULL
  AND role = ANY (ARRAY['closer'::app_role, 'closer_manager'::app_role, 'scout'::app_role])
  AND EXISTS (SELECT 1 FROM public.team_member_profiles WHERE team_member_profiles.user_id = auth.uid())
);