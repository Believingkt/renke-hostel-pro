
CREATE TABLE public.accommodation_order_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  name text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accommodation_order_sources TO authenticated;
GRANT ALL ON public.accommodation_order_sources TO service_role;

ALTER TABLE public.accommodation_order_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read order sources"
  ON public.accommodation_order_sources
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert order sources"
  ON public.accommodation_order_sources
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('hotel_admin'::app_role, 'super_admin'::app_role)
    )
  );

CREATE POLICY "Admins can update order sources"
  ON public.accommodation_order_sources
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('hotel_admin'::app_role, 'super_admin'::app_role)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('hotel_admin'::app_role, 'super_admin'::app_role)
    )
  );

CREATE POLICY "Admins can delete order sources"
  ON public.accommodation_order_sources
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('hotel_admin'::app_role, 'super_admin'::app_role)
    )
  );

CREATE INDEX idx_accommodation_order_sources_acc
  ON public.accommodation_order_sources(accommodation_id, display_order);

INSERT INTO public.accommodation_order_sources (accommodation_id, name, display_order) VALUES
  ('4ee31aca-5641-4d05-80e2-1c67626be83d', '人客多Kol', 1),
  ('4ee31aca-5641-4d05-80e2-1c67626be83d', '人客多代訂', 2),
  ('4ee31aca-5641-4d05-80e2-1c67626be83d', '電話訂房', 3),
  ('4ee31aca-5641-4d05-80e2-1c67626be83d', '一般訂房', 4),
  ('4ee31aca-5641-4d05-80e2-1c67626be83d', '業主代訂', 5),
  ('4ee31aca-5641-4d05-80e2-1c67626be83d', '[SHALOM]台灣旅圖', 6),
  ('4ee31aca-5641-4d05-80e2-1c67626be83d', '[CM] Booking.com', 7),
  ('4ee31aca-5641-4d05-80e2-1c67626be83d', '[CM] Agoda', 8),
  ('4ee31aca-5641-4d05-80e2-1c67626be83d', '票卷訂房', 9),
  ('4ee31aca-5641-4d05-80e2-1c67626be83d', '公務維修', 10);
