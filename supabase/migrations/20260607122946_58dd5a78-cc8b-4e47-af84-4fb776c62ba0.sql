
CREATE TABLE public.closer_commission_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id),
  closer_id uuid REFERENCES public.team_member_profiles(user_id),
  video_creator_id uuid REFERENCES public.team_member_profiles(user_id),
  final_price_snapshot numeric NOT NULL,
  closer_rate numeric,
  video_rate numeric,
  closer_commission_amount numeric DEFAULT 0,
  video_commission_amount numeric DEFAULT 0,
  snapshot_month text NOT NULL,
  created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.closer_commission_snapshots TO authenticated;
GRANT ALL ON public.closer_commission_snapshots TO service_role;

ALTER TABLE public.closer_commission_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read closer_commission_snapshots"
ON public.closer_commission_snapshots FOR SELECT
TO authenticated USING (true);

CREATE POLICY "admin can write closer_commission_snapshots"
ON public.closer_commission_snapshots FOR ALL
TO authenticated
USING (user_has_team_role(auth.uid(), 'super_admin') OR user_has_team_role(auth.uid(), 'hotel_admin'))
WITH CHECK (user_has_team_role(auth.uid(), 'super_admin') OR user_has_team_role(auth.uid(), 'hotel_admin'));

CREATE TABLE public.closer_commission_adjustments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_id uuid NOT NULL REFERENCES public.closer_commission_snapshots(id),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  closer_id uuid REFERENCES public.team_member_profiles(user_id),
  video_creator_id uuid REFERENCES public.team_member_profiles(user_id),
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('補發', '扣回')),
  closer_amount numeric DEFAULT 0,
  video_amount numeric DEFAULT 0,
  reason text,
  adjustment_month text NOT NULL,
  created_by uuid REFERENCES public.team_member_profiles(user_id),
  created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.closer_commission_adjustments TO authenticated;
GRANT ALL ON public.closer_commission_adjustments TO service_role;

ALTER TABLE public.closer_commission_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read closer_commission_adjustments"
ON public.closer_commission_adjustments FOR SELECT
TO authenticated USING (true);

CREATE POLICY "admin can write closer_commission_adjustments"
ON public.closer_commission_adjustments FOR ALL
TO authenticated
USING (user_has_team_role(auth.uid(), 'super_admin') OR user_has_team_role(auth.uid(), 'hotel_admin'))
WITH CHECK (user_has_team_role(auth.uid(), 'super_admin') OR user_has_team_role(auth.uid(), 'hotel_admin'));

CREATE INDEX idx_closer_commission_snapshots_order_id ON public.closer_commission_snapshots(order_id);
CREATE INDEX idx_closer_commission_snapshots_snapshot_month ON public.closer_commission_snapshots(snapshot_month);
CREATE INDEX idx_closer_commission_snapshots_closer_id ON public.closer_commission_snapshots(closer_id);
CREATE INDEX idx_closer_commission_adjustments_snapshot_id ON public.closer_commission_adjustments(snapshot_id);
CREATE INDEX idx_closer_commission_adjustments_adjustment_month ON public.closer_commission_adjustments(adjustment_month);
