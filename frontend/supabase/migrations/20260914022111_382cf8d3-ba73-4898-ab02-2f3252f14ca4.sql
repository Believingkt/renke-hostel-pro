CREATE TABLE public.accommodation_onboarding_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  confirmed_by uuid,
  confirmed_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accommodation_onboarding_steps_status_check
    CHECK (status IN ('pending', 'confirmed', 'not_applicable')),
  CONSTRAINT accommodation_onboarding_steps_unique UNIQUE (accommodation_id, step_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accommodation_onboarding_steps TO authenticated;
GRANT ALL ON public.accommodation_onboarding_steps TO service_role;

ALTER TABLE public.accommodation_onboarding_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_steps_select"
  ON public.accommodation_onboarding_steps FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(accommodation_id));

CREATE POLICY "onboarding_steps_insert"
  ON public.accommodation_onboarding_steps FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(accommodation_id));

CREATE POLICY "onboarding_steps_update"
  ON public.accommodation_onboarding_steps FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(accommodation_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_hotel_admin_of(accommodation_id));

CREATE POLICY "onboarding_steps_delete"
  ON public.accommodation_onboarding_steps FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_accommodation_onboarding_steps_updated_at
  BEFORE UPDATE ON public.accommodation_onboarding_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.accommodation_onboarding_steps IS
  '上架引導的「業主已確認」狀態紀錄。純 UI 引導用，不存訂房核心資料，不被訂單／計價／庫存／分潤讀取。';