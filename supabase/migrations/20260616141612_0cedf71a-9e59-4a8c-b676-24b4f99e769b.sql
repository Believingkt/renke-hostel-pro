
CREATE TABLE public.line_event_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.line_event_types TO authenticated;
GRANT ALL ON public.line_event_types TO service_role;

ALTER TABLE public.line_event_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "line_event_types admin read"
ON public.line_event_types
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'hotel_admin'::app_role])
));

CREATE POLICY "line_event_types admin write"
ON public.line_event_types
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'hotel_admin'::app_role])
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = ANY (ARRAY['super_admin'::app_role, 'hotel_admin'::app_role])
));

INSERT INTO public.line_event_types (code, label, description) VALUES
  ('daily_performance', '每日業績通報', '每日定時推播當日業績摘要'),
  ('franchise_performance', '特許加盟進度業績', '特許加盟分店業績與進度通報'),
  ('order_amount_changed', '訂單金額修改通知', '訂單金額被修改時通知'),
  ('kol_order', 'KOL/星探訂單通知', 'KOL 或星探帶來的訂單通知'),
  ('franchise_order', '特許加盟銷售訂單通知', '特許加盟分店成立訂單時通知')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.line_push_targets
  ADD COLUMN IF NOT EXISTS event_types text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS accommodation_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS custom_venue_names text[] NOT NULL DEFAULT '{}'::text[];
