-- 允許 team admin 建立「無帳號成員」（user_id 必須為 NULL）
CREATE POLICY "team_profiles_insert_admin_noaccount"
ON public.team_member_profiles
FOR INSERT
TO authenticated
WITH CHECK (
  user_id IS NULL
  AND (
    user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR user_has_team_role(auth.uid(), 'admin'::app_role)
  )
);

-- 允許 team admin 刪除無帳號成員（user_id IS NULL）
CREATE POLICY "team_profiles_delete_admin_noaccount"
ON public.team_member_profiles
FOR DELETE
TO authenticated
USING (
  user_id IS NULL
  AND (
    user_has_team_role(auth.uid(), 'super_admin'::app_role)
    OR user_has_team_role(auth.uid(), 'admin'::app_role)
  )
);