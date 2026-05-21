CREATE TABLE public.starlink_plan_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_name text NOT NULL,
  price integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.starlink_plan_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "starlink_plan_select"
ON public.starlink_plan_settings
FOR SELECT
USING (true);

CREATE POLICY "starlink_plan_write"
ON public.starlink_plan_settings
FOR ALL
TO authenticated
USING (
  public.user_has_team_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  public.user_has_team_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.user_has_team_role(auth.uid(), 'admin'::public.app_role)
);

INSERT INTO public.starlink_plan_settings (plan_name, price) VALUES
  ('人氣啟動', 19800),
  ('計劃實現', 38850),
  ('總部方案', 93600);