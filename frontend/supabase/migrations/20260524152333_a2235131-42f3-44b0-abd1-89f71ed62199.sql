CREATE TABLE IF NOT EXISTS public.traffic_sources (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.booking_methods (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.traffic_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read traffic_sources"
ON public.traffic_sources FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert traffic_sources"
ON public.traffic_sources FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "admin can manage traffic_sources"
ON public.traffic_sources FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('hotel_admin'::public.app_role, 'super_admin'::public.app_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('hotel_admin'::public.app_role, 'super_admin'::public.app_role)
  )
);

CREATE POLICY "authenticated can read booking_methods"
ON public.booking_methods FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can insert booking_methods"
ON public.booking_methods FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "admin can manage booking_methods"
ON public.booking_methods FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('hotel_admin'::public.app_role, 'super_admin'::public.app_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role IN ('hotel_admin'::public.app_role, 'super_admin'::public.app_role)
  )
);

INSERT INTO public.traffic_sources (name, sort_order) VALUES
('貝瑞FB', 1), ('貝瑞IG', 2), ('人客多LINE@', 3),
('人客多IG', 4), ('人客多FB', 5), ('森山LINE@', 6),
('轉介紹', 7), ('Threads', 8), ('網站預訂', 9), ('票券平台', 10)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.booking_methods (name, sort_order) VALUES
('人客多代訂', 1), ('外移代訂', 2), ('森山代訂', 3),
('人客多票券', 4), ('網站預訂', 5), ('特殊價格', 6)
ON CONFLICT (name) DO NOTHING;