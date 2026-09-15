CREATE TABLE public.consulting_fee_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rate numeric NOT NULL,
  accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_consulting_fee_settings_lookup
  ON public.consulting_fee_settings (accommodation_id, effective_from DESC);

GRANT SELECT, INSERT ON public.consulting_fee_settings TO authenticated;
GRANT ALL ON public.consulting_fee_settings TO service_role;

ALTER TABLE public.consulting_fee_settings ENABLE ROW LEVEL SECURITY;

-- hotel_admin / super_admin / finance 皆可查看
CREATE POLICY "consulting_fee_settings_select"
  ON public.consulting_fee_settings
  FOR SELECT
  TO authenticated
  USING (
    public.user_has_any_team_role(auth.uid())
    AND (
      EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('hotel_admin','super_admin','finance'))
    )
  );

-- 只有 hotel_admin / super_admin 可新增
CREATE POLICY "consulting_fee_settings_insert"
  ON public.consulting_fee_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('hotel_admin','super_admin'))
  );

-- 初始預設費率
INSERT INTO public.consulting_fee_settings (rate, accommodation_id, effective_from, note)
VALUES (0.1, NULL, '2026-01-01', '全館通用預設值');
