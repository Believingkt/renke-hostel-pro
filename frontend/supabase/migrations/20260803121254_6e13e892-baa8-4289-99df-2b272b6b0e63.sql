CREATE TABLE public.franchise_ragic_unit_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name text NOT NULL UNIQUE,
  ragic_unit_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.franchise_ragic_unit_mapping TO authenticated;
GRANT ALL ON public.franchise_ragic_unit_mapping TO service_role;

ALTER TABLE public.franchise_ragic_unit_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "franchise ragic mapping manage"
ON public.franchise_ragic_unit_mapping
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin'::app_role, 'hotel_admin'::app_role, 'franchise_manager'::app_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('super_admin'::app_role, 'hotel_admin'::app_role, 'franchise_manager'::app_role)
  )
);

CREATE TRIGGER update_franchise_ragic_unit_mapping_updated_at
BEFORE UPDATE ON public.franchise_ragic_unit_mapping
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.franchise_ragic_unit_mapping (project_name, ragic_unit_name)
VALUES ('森山寫照第一期', '特許加盟_森山寫照')
ON CONFLICT (project_name) DO NOTHING;