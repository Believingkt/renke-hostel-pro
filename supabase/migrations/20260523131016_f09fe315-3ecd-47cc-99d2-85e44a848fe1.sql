CREATE TABLE public.franchise_projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.franchise_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "franchise_manager and admin can manage"
ON public.franchise_projects
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'super_admin', 'franchise_manager')
  )
);

CREATE POLICY "franchise role can read"
ON public.franchise_projects
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'super_admin', 'franchise_manager', 'franchise')
  )
);

CREATE TRIGGER update_franchise_projects_updated_at
BEFORE UPDATE ON public.franchise_projects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();