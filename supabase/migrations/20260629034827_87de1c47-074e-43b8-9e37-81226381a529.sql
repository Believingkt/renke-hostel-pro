
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS template_id uuid NULL REFERENCES public.permission_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_template_id ON public.user_roles(template_id);

CREATE OR REPLACE FUNCTION public.apply_template_to_user(
  _user_id uuid,
  _accommodation_id uuid,
  _template_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tpl_perms jsonb;
  k text;
  v text;
BEGIN
  -- 權限檢查：只允許 super_admin 或該館 hotel_admin
  IF NOT (
    public.has_role(auth.uid(), 'super_admin')
    OR public.is_hotel_admin_of(auth.uid(), _accommodation_id)
  ) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT permissions INTO tpl_perms
  FROM public.permission_templates
  WHERE id = _template_id AND accommodation_id = _accommodation_id;

  IF tpl_perms IS NULL THEN
    RAISE EXCEPTION 'template not found';
  END IF;

  -- 清空該成員在此館的所有模組權限
  DELETE FROM public.staff_module_permissions
  WHERE user_id = _user_id AND accommodation_id = _accommodation_id;

  -- 依範本逐筆寫入
  FOR k, v IN SELECT * FROM jsonb_each_text(tpl_perms)
  LOOP
    INSERT INTO public.staff_module_permissions (user_id, accommodation_id, module_key, level)
    VALUES (_user_id, _accommodation_id, k, v)
    ON CONFLICT (user_id, accommodation_id, module_key)
    DO UPDATE SET level = EXCLUDED.level, updated_at = now();
  END LOOP;

  -- 更新 user_roles：role=staff、template_id=此範本
  UPDATE public.user_roles
  SET role = 'staff', template_id = _template_id
  WHERE user_id = _user_id AND accommodation_id = _accommodation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_template_to_user(uuid, uuid, uuid) TO authenticated;
