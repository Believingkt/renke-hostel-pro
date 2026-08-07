CREATE TABLE public.remarketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  segment jsonb NOT NULL DEFAULT '{"dimension":"preference","rules":[]}'::jsonb,
  channel text NOT NULL DEFAULT 'email',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommend_products uuid[] NOT NULL DEFAULT '{}'::uuid[],
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.remarketing_campaigns TO authenticated;
GRANT ALL ON public.remarketing_campaigns TO service_role;
ALTER TABLE public.remarketing_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage remarketing campaigns"
ON public.remarketing_campaigns FOR ALL TO authenticated
USING (
  is_admin_or_super() OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['owner'::app_role,'hotel_admin'::app_role,'super_admin'::app_role,'admin'::app_role])
  )
)
WITH CHECK (
  is_admin_or_super() OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['owner'::app_role,'hotel_admin'::app_role,'super_admin'::app_role,'admin'::app_role])
  )
);

CREATE TABLE public.remarketing_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.remarketing_campaigns(id) ON DELETE CASCADE,
  traveler_profile_id uuid NOT NULL REFERENCES public.traveler_profiles(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email',
  status text NOT NULL DEFAULT 'sent',
  recipient text,
  message_body text,
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX remarketing_sends_campaign_traveler_uidx
  ON public.remarketing_sends (campaign_id, traveler_profile_id);
CREATE INDEX remarketing_sends_campaign_idx ON public.remarketing_sends (campaign_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.remarketing_sends TO authenticated;
GRANT ALL ON public.remarketing_sends TO service_role;
ALTER TABLE public.remarketing_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage remarketing sends"
ON public.remarketing_sends FOR ALL TO authenticated
USING (
  is_admin_or_super() OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['owner'::app_role,'hotel_admin'::app_role,'super_admin'::app_role,'admin'::app_role])
  )
)
WITH CHECK (
  is_admin_or_super() OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['owner'::app_role,'hotel_admin'::app_role,'super_admin'::app_role,'admin'::app_role])
  )
);

CREATE TRIGGER update_remarketing_campaigns_updated_at
BEFORE UPDATE ON public.remarketing_campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();